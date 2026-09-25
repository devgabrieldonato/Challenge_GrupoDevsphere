# Conversor de casos clínicos para Markdown

Aplicação Python para o Challenge FIAP. Professores e alunos podem enviar um PDF ou DOCX pelo navegador, converter o conteúdo textual e baixar um arquivo `.md` em UTF-8. Esta entrega é um protótipo local, sem cadastro de usuários ou armazenamento permanente.

O projeto não interpreta, resume ou corrige informações clínicas. A conferência do texto convertido com o original faz parte do uso, especialmente para números, unidades e tabelas.

## Comece aqui

Instale Python 3.11 ou superior e abra um terminal **dentro da pasta deste projeto**. Não é necessária chave de API, conta em nuvem ou banco de dados.

### Windows (PowerShell)

```powershell
py -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m streamlit run app.py
```

Os comandos usam o Python do ambiente virtual diretamente; não é necessário alterar a política de execução do PowerShell.

### macOS e Linux

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m streamlit run app.py
```

Acesse `http://localhost:8501`. Para encerrar, pressione `Ctrl+C` no terminal. A configuração incluída restringe o acesso à máquina local. Execute a aplicação a partir da pasta do projeto para carregar `.streamlit/config.toml`.

## Como utilizar

1. Prepare um caso fictício ou previamente desidentificado em PDF ou DOCX.
2. Selecione o documento no campo de upload.
3. Clique em **Converter para Markdown**.
4. Leia os avisos e confira o código Markdown exibido com o documento original.
5. Clique em **Baixar arquivo .md**.
6. Use **Limpar sessão** ao terminar. A ação remove as referências da sessão; não promete apagamento seguro da memória nem exclui downloads do computador.

O upload aceita um arquivo por vez, de até 10 MiB (10.485.760 bytes). PDFs podem ter até 100 páginas. O resultado só aparece após conversão bem-sucedida. Ao trocar o arquivo, o resultado anterior é removido.

## O que é convertido

| Entrada | Comportamento |
| --- | --- |
| PDF com texto | Extrai texto e organiza o resultado por página |
| PDF sem texto em algumas páginas | Gera resultado parcial, identifica páginas sem texto e avisa |
| PDF totalmente sem texto | Informa a necessidade de OCR quando digitalizado |
| DOCX | Mantém a ordem dos parágrafos e tabelas do corpo principal |
| Títulos do DOCX | Converte estilos Title e Heading 1–9 para títulos Markdown (até nível 6) |
| Listas do DOCX | Reconhece estilos List Bullet e List Number; simplifica a estrutura |
| Tabelas do DOCX | Gera tabela Markdown, usando a primeira linha como cabeçalho |

Exemplo de saída de um DOCX com estilos de título:

```markdown
# Caso fictício

## Histórico

Texto do caso para demonstração acadêmica.

| Campo | Valor |
| --- | --- |
| Identificador | DEMO001 |
```

Caracteres de Markdown presentes no texto são escapados para preservar seu significado literal. Tabelas usam a extensão de Markdown com barras verticais, compatível com GitHub; nem todo leitor de Markdown suporta tabelas. Quebras internas das células usam `<br>`.

## Limitações conhecidas

- Não executa OCR. PDFs digitalizados precisam passar por uma ferramenta de OCR antes do upload. Texto extraído de uma camada OCR existente também exige revisão.
- Não converte imagens, gráficos, fórmulas ou anexos. Uma página com texto e imagem pode perder a informação da imagem sem que isso seja detectado individualmente.
- PDFs não preservam automaticamente títulos, tabelas, colunas ou ordem visual de leitura. Cada página recebe um título gerado pelo conversor.
- No DOCX, não preserva negrito, itálico, destinos de hyperlinks, cabeçalhos, rodapés, notas, caixas de texto ou controle de alterações. Listas personalizadas, aninhamento e numeração podem ser perdidos.
- Células mescladas podem repetir texto. A primeira linha de toda tabela é tratada como cabeçalho mesmo quando o original não tem cabeçalho.
- PDFs criptografados e arquivos `.doc`, `.docm` ou protegidos não são suportados.
- Não há anonimização, autenticação, histórico, edição do resultado ou identificação de professor/aluno.

## Organização do código

```text
app.py                   Interface: upload, mensagens, resultado e download
converter.py             Validação e conversão, sem depender do Streamlit
requirements.txt         Dependências com faixas de versões
requirements-lock.txt    Versões exatas usadas na validação desta entrega
.streamlit/config.toml   Limite de upload, acesso local e tema
tests/                  Testes de conversão e interface
docs/ARQUITETURA.md      Decisões técnicas, fluxo e evolução
docs/VALIDACAO.md        Procedimentos e evidências dos testes
```

Veja [a arquitetura](docs/ARQUITETURA.md) para entender cada etapa. As funções principais têm docstrings em português, anotações de tipos e comentários sobre decisões que não são óbvias.

## Testar

Após instalar as dependências, execute na pasta do projeto:

```bash
python -m unittest discover -s tests -v
```

Substitua `python` pelo caminho do Python do ambiente virtual usado na instalação. Os testes usam a biblioteca padrão `unittest`; não exigem pytest nem documentos reais. Consulte [a validação](docs/VALIDACAO.md) para os cenários e verificações manuais.

Para reproduzir as versões usadas nesta entrega, instale `requirements-lock.txt` em um ambiente virtual novo. O arquivo fixa também dependências transitivas; disponibilidade de pacotes pode variar entre versões de Python e sistemas operacionais.

## Problemas comuns

| Problema | Solução |
| --- | --- |
| `No module named streamlit` | Instale as dependências com o mesmo Python usado para iniciar o app |
| PDF sem texto extraível | Confira se o texto é selecionável e aplique OCR quando necessário |
| Arquivo inválido | Abra no aplicativo original e exporte novamente como PDF/DOCX |
| Porta ocupada | Acrescente `--server.port 8502` ao comando de execução |
| Instalação falha | Verifique a conexão e tente em Python 3.11 ou superior com ambiente virtual novo |

## Dados e implantação futura

Os uploads são processados na memória do processo Python. O código não os salva em disco, não registra seu conteúdo e não chama serviços de conversão externos. Em uma implantação remota, os arquivos são enviados ao servidor onde o app estiver rodando. A telemetria de uso do Streamlit está desativada na configuração fornecida.

Para esta demonstração, use dados fictícios ou já desidentificados. Não há garantia de anonimização nem de conformidade regulatória. Antes de uso institucional com documentos reais, o projeto precisa de autenticação, controle de acesso, política de retenção e avaliação de proteção de dados. Uploads públicos também precisam de processamento isolado, cotas, limites de CPU/memória e tempo de execução: as validações atuais não tornam parsers imunes a arquivos maliciosos.

## Referências oficiais

- [Streamlit: upload de arquivos](https://docs.streamlit.io/develop/api-reference/widgets/st.file_uploader)
- [Streamlit: download de arquivos](https://docs.streamlit.io/develop/api-reference/widgets/st.download_button)
- [pypdf: extração de texto e limitações](https://pypdf.readthedocs.io/en/stable/user/extract-text.html)
- [python-docx: documento e ordem dos elementos](https://python-docx.readthedocs.io/en/latest/api/document.html)
