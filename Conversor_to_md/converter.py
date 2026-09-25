"""Conversão local de documentos para Markdown, independente da interface.

Contrato público: convert_document(nome, bytes) -> ConversionResult.
Falhas previsíveis são apresentadas como ConversionError, sem expor conteúdo.
Não salva uploads, não utiliza IA e não realiza chamadas de rede.
"""
from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath
import re
from zipfile import BadZipFile, ZipFile

from docx import Document
from docx.table import Table
from pypdf import PdfReader

MAX_BYTES = 10 * 1024 * 1024
MAX_PAGES = 100
MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
MAX_ZIP_ENTRIES = 2000


class ConversionError(ValueError):
    """Erro de entrada que pode ser mostrado diretamente ao usuário."""


@dataclass(frozen=True)
class ConversionResult:
    """Resultado em UTF-8 lógico; a interface codifica o texto no download."""

    markdown: str
    filename: str
    warnings: tuple[str, ...]


def escape_markdown(text: str) -> str:
    """Protege caracteres literais, inclusive HTML e imagens/links externos.

    A estrutura Markdown é acrescentada pelo conversor, não pelo documento.
    Isso evita interpretar texto clínico como marcação ou carregar URLs dele.
    """
    text = text.replace('\x00', '').replace('\r\n', '\n').replace('\r', '\n')
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return re.sub(r'([\\`*_{}\[\]()#+.!|~\-])', r'\\\1', text)


def _validate_docx(data: bytes) -> None:
    """Confere o contêiner ZIP antes de descompactar o documento em memória."""
    try:
        with ZipFile(BytesIO(data)) as archive:
            members = archive.infolist()
            if len(members) > MAX_ZIP_ENTRIES:
                raise ConversionError('DOCX contém arquivos internos demais.')
            if sum(item.file_size for item in members) > MAX_UNCOMPRESSED_BYTES:
                raise ConversionError('DOCX excede 50 MiB de conteúdo descompactado.')
            if any(item.flag_bits & 1 for item in members):
                raise ConversionError('DOCX protegido não é suportado.')
            if not {'[Content_Types].xml', 'word/document.xml'} <= set(archive.namelist()):
                raise ConversionError('O arquivo não é um DOCX válido.')
    except BadZipFile as exc:
        raise ConversionError('DOCX inválido ou corrompido.') from exc


def _table_markdown(table: Table) -> str:
    """Converte tabela simples; a primeira linha torna-se o cabeçalho."""
    rows = [
        [escape_markdown(cell.text.strip()).replace('\n', '<br>') for cell in row.cells]
        for row in table.rows
    ]
    if not rows or not any(any(cell for cell in row) for row in rows):
        return ''
    width = max(map(len, rows))
    rows = [row + [''] * (width - len(row)) for row in rows]
    lines = ['| ' + ' | '.join(row) + ' |' for row in rows]
    lines.insert(1, '| ' + ' | '.join(['---'] * width) + ' |')
    return '\n'.join(lines)


def _docx_markdown(data: bytes) -> tuple[str, list[str]]:
    """Percorre parágrafos e tabelas na ordem original do corpo do Word."""
    _validate_docx(data)
    document = Document(BytesIO(data))
    blocks: list[str] = []
    warnings = [
        'DOCX: revise a saída. Imagens, caixas de texto, notas, cabeçalhos, '
        'rodapés e revisões não são convertidos. Listas são simplificadas; '
        'negrito, itálico e destinos de hyperlinks não são preservados.'
    ]
    for block in document.iter_inner_content():
        if isinstance(block, Table):
            rendered = _table_markdown(block)
            if rendered:
                blocks.append(rendered)
            warnings.append('Tabelas: a primeira linha foi usada como cabeçalho; células mescladas exigem revisão.')
            continue
        text = escape_markdown(block.text.strip())
        if not text:
            continue
        style = block.style.name if block.style is not None else ''
        heading = re.fullmatch(r'(?:Heading|Título) ([1-9])', style, re.IGNORECASE)
        if heading:
            text = '#' * min(int(heading.group(1)), 6) + ' ' + text
        elif style.lower() in {'title', 'título'}:
            text = '# ' + text
        elif style.startswith('List Bullet'):
            text = '- ' + text
        elif style.startswith('List Number'):
            text = '1. ' + text
        blocks.append(text)
    return '\n\n'.join(blocks), list(dict.fromkeys(warnings))


def _pdf_markdown(data: bytes) -> tuple[str, list[str]]:
    """Extrai texto por página; não infere títulos nem executa OCR."""
    if not data.startswith(b'%PDF-'):
        raise ConversionError('O conteúdo do arquivo não corresponde a um PDF.')
    reader = PdfReader(BytesIO(data))
    if reader.is_encrypted:
        raise ConversionError('PDF protegido por senha não é suportado. Envie uma cópia desbloqueada.')
    if len(reader.pages) > MAX_PAGES:
        raise ConversionError(f'O PDF deve ter no máximo {MAX_PAGES} páginas.')
    blocks = []
    empty_pages = []
    for number, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or '').strip()
        if text:
            blocks.append(f'## Página {number}\n\n{escape_markdown(text)}')
        else:
            empty_pages.append(str(number))
            blocks.append(f'## Página {number}\n\n[Sem texto extraível nesta página.]')
    if not reader.pages or len(empty_pages) == len(reader.pages):
        raise ConversionError('PDF sem texto extraível. Se for digitalizado, aplique OCR antes de enviar.')
    warnings = ['PDF: revise a ordem de leitura, tabelas, símbolos e valores. Imagens não são convertidas; não há OCR.']
    if empty_pages:
        warnings.append('Conversão parcial: páginas sem texto extraível: ' + ', '.join(empty_pages) + '.')
    return '\n\n'.join(blocks), warnings


def convert_document(filename: str, data: bytes) -> ConversionResult:
    """Valida e converte um PDF/DOCX de até 10 MiB.

    Args:
        filename: Nome original; usado apenas para extensão e nome do download.
        data: Conteúdo binário do upload, processado em memória.
    Returns:
        Texto Markdown, nome seguro do download e alertas de fidelidade.
    Raises:
        ConversionError: Tipo, tamanho, estrutura ou conteúdo não suportados.

    Limites reduzem uso acidental de recursos; não constituem isolamento contra
    arquivos hostis. Execução pública requer limites de CPU/memória e isolamento.
    """
    basename = PurePosixPath(filename.replace('\\', '/')).name
    extension = PurePosixPath(basename).suffix.lower()
    if extension not in {'.pdf', '.docx'}:
        raise ConversionError('Formato não suportado. Envie PDF ou DOCX.')
    if not data:
        raise ConversionError('O arquivo está vazio.')
    if len(data) > MAX_BYTES:
        raise ConversionError('O arquivo excede o limite de 10 MiB.')
    try:
        text, warnings = _pdf_markdown(data) if extension == '.pdf' else _docx_markdown(data)
    except ConversionError:
        raise
    except Exception as exc:
        # A fronteira do parser traduz erros de bibliotecas sem mostrar dados.
        # Não registrar a exceção: mensagens de parser podem conter conteúdo.
        raise ConversionError('Não foi possível ler o arquivo. Verifique se está íntegro e no formato correto.') from exc
    if not text.strip():
        raise ConversionError('O documento não contém texto convertível no corpo principal.')
    stem = re.sub(r'[^\w-]+', '_', PurePosixPath(basename).stem).strip('_')[:100] or 'documento'
    return ConversionResult(text.strip() + '\n', stem + '.md', tuple(warnings))
