# Arquitetura e decisões técnicas

## Objetivo e escopo

O sistema transforma conteúdo textual em Markdown para posterior uso acadêmico. A aplicação não atribui diagnósticos nem modifica condutas: os parsers extraem texto e a camada de conversão acrescenta marcação estrutural. O papel de professor ou aluno não altera o fluxo nesta versão.

## Fluxo de execução

```text
Navegador → upload em memória → validação de extensão e tamanho
                              ↓
                    seleção do parser PDF ou DOCX
                              ↓
               validação de estrutura e extração do texto
                              ↓
               escape de caracteres e estrutura Markdown
                              ↓
               resultado na sessão → visualização → download
```

1. `app.py` recebe um `UploadedFile` do Streamlit. A interface restringe as extensões; o conversor repete a validação para funcionar também fora da interface.
2. `convert_document(filename, data)` valida extensão, conteúdo vazio e tamanho. O nome original nunca é usado como caminho de gravação.
3. `_pdf_markdown` confere a assinatura, rejeita criptografia, limita páginas e chama `extract_text` por página. Páginas sem texto são identificadas na saída; ausência total de texto gera erro.
4. `_validate_docx` verifica o ZIP, entradas essenciais, número de membros e tamanho declarado descompactado. `_docx_markdown` usa `iter_inner_content` para manter tabelas e parágrafos na ordem original.
5. `escape_markdown` neutraliza marcação presente no texto. A interface usa um bloco de código para mostrar a saída sem interpretar o HTML enviado ou carregar imagens remotas.
6. `ConversionResult` reúne Markdown, nome seguro e avisos. O download codifica a string em UTF-8.
7. Exceções de bibliotecas são traduzidas em mensagens genéricas. Não se mostra o traceback nem se registra a exceção na interface; isso também evita expor trechos de documentos nas mensagens do próprio código. Bibliotecas podem emitir mensagens diagnósticas próprias, por isso logs do servidor não devem ser publicados.

## Contrato de uso sem interface

```python
from pathlib import Path
from converter import ConversionError, convert_document

source = Path("caso_ficticio.docx")
try:
    result = convert_document(source.name, source.read_bytes())
    # Gravação opcional feita por quem utiliza a biblioteca; o app não faz isso.
    Path(result.filename).write_text(result.markdown, encoding="utf-8")
    for warning in result.warnings:
        print(warning)
except ConversionError as error:
    print(error)
```

Esse exemplo permite integrar a função futuramente a uma API, fila de processamento ou portal. O chamador deve tratar avisos como parte do resultado, sem assumir equivalência integral com o documento.

## Por que estas bibliotecas

- **Streamlit:** permite construir um protótipo de upload/download em Python, sem uma aplicação JavaScript separada.
- **pypdf:** extrai texto de PDFs; não adiciona dependência de um serviço externo ou OCR.
- **python-docx:** dá acesso ao corpo do documento Word e às tabelas.
- **unittest:** testes automáticos sem dependência adicional de framework.

As versões aceitas estão em `requirements.txt`. O arquivo de versões exatas registra o ambiente validado, não uma promessa de compatibilidade com todas as plataformas futuras.

## Estado e recursos

O resultado fica em `st.session_state`, sem cache global de documentos. Trocar o upload invalida o resultado; limpar a sessão remove o estado e recria a interface. O processo pode manter buffers até sua liberação normal; não existe apagamento seguro de memória.

Os limites são 10 MiB por arquivo, 100 páginas por PDF, 2.000 entradas ZIP e 50 MiB de tamanho descompactado declarado por DOCX. São barreiras de uso básico. Um PDF pequeno pode conter streams muito grandes; não existe limite de expansão de streams, tempo ou memória neste protótipo.

## Evolução sugerida

1. Adicionar OCR como etapa opcional, mantendo indicação das páginas processadas e revisão humana.
2. Melhorar tabelas, listas aninhadas e formatação de DOCX com testes de documentos representativos.
3. Acrescentar autenticação institucional e autorização antes de publicar o upload.
4. Processar arquivos em trabalhadores isolados, com tempo máximo, memória limitada e fila.
5. Definir política explícita de persistência, remoção, acesso e auditoria caso seja necessário manter documentos.

Cada evolução deve manter o contrato de conversão e seus avisos claros. Não incluir IA generativa para completar lacunas clínicas automaticamente.
