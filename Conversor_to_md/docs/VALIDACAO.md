# Validação da entrega

## Ambiente executado

Em 23/09/2026, foram executados **17 testes, todos aprovados**, em macOS ARM64 com Python 3.14.6, Streamlit 1.64.0, pypdf 6.19.0 e python-docx 1.2.0. As versões transitivas estão em `requirements-lock.txt`.

Comando, usando o Python do ambiente virtual:

```bash
python -m unittest discover -s tests -v
```

## Cobertura

Os 13 testes de conversão verificam títulos e ordem de tabelas/parágrafos, acentos, listas, DOCX vazio, caracteres de Markdown/HTML, extração de PDF, conversão parcial, PDF sem texto, criptografia, quantidade de páginas, entradas inválidas, limite de bytes, ZIP que não é DOCX e limite de descompactação (alguns cenários compartilham o mesmo teste).

Os quatro testes da interface verificam estado inicial, botão de conversão com PDF sintético, mensagem de erro para upload inválido, apresentação de resultado e limpeza da sessão.

O upload é simulado nos testes da interface com `unittest.mock`; a execução da interface usa `streamlit.testing.v1.AppTest`. Não foi realizado teste ponta a ponta do seletor de arquivos e do download em navegador real. Windows e Linux não foram executados nesta entrega.

Os documentos dos testes são gerados em memória, sem pacientes ou arquivos externos. Mensagens `missing ScriptRunContext` do executor de testes e `EOF marker not found` do caso propositalmente corrompido são esperadas e não significam falha quando a suíte termina com `OK`.

## Roteiro manual para a apresentação

1. Inicie a aplicação seguindo o README.
2. Em um editor Word, crie um caso fictício com título, parágrafos e tabela simples; salve como DOCX.
3. Faça upload e confira a ordem do conteúdo, acentos e tabela.
4. Baixe o `.md`, abra em um editor de texto e confira o conteúdo e a extensão.
5. Exporte o mesmo documento como PDF e repita. A saída será organizada por páginas.
6. Teste um PDF digitalizado sem camada de texto: o sistema deve orientar sobre OCR.
7. Troque o documento selecionado: a saída anterior deve desaparecer.
8. Clique em limpar sessão e confirme que upload e saída foram removidos da interface.

## Limites da evidência

Testes com documentos sintéticos não comprovam fidelidade em todos os documentos reais nem segurança em uma implantação pública. Layouts com várias colunas, digitalizações e tabelas mescladas precisam de uma amostra representativa e comparação humana. A lista de limitações do README faz parte dos critérios de uso desta versão.
