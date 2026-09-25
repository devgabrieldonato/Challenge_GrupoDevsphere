# Geração assistida e importação de casos

## Entrada manual estruturada

O professor informa dados clínicos e pedagógicos no formulário. O servidor valida os campos obrigatórios e envia um objeto estruturado ao serviço de IA. A resposta deve obedecer ao esquema `docs/schemas/clinical-case.schema.json` e permanecer como `draft`.

O resultado esperado contém exatamente 18 perguntas e 22 exames, 40 itens no total, IDs únicos, relações válidas e sem ciclos, hipóteses, evidências prioritárias, feedback e referências. O validador estrutural não confirma correção médica.

Antes da publicação, a interface deve apresentar cada informação ao professor, incluindo suposições e dados ausentes. Alterações ficam registradas. A aprovação exige confirmação explícita de revisão clínica.

## Entrada a partir de PDF

1. Receber o arquivo em área temporária sem permissão de execução.
2. Validar nome final `.pdf`, MIME permitido, assinatura `%PDF-`, tamanho máximo configurado e limite de páginas.
3. Rejeitar arquivo vazio, criptografado sem senha, corrompido ou com conteúdo ativo incompatível.
4. Remover ou ignorar JavaScript, ações automáticas, anexos e URLs durante o processamento.
5. Preservar o original, calcular hash SHA-256 e registrar autor e horário.
6. Extrair texto com processo isolado, limite de CPU, memória e tempo.
7. Se não houver texto suficiente, retornar `requires_ocr`; OCR não deve ser simulado.
8. Converter o texto extraído em Markdown intermediário e preservá-lo como artefato versionado.
9. Separar fatos clínicos, instruções pedagógicas e referências; listar ambiguidades e lacunas.
10. Gerar a proposta no esquema versionado e executar a validação estrutural.
11. Manter como rascunho até revisão e aprovação humanas.

O sistema não deve completar silenciosamente dados clínicos ausentes. Toda inferência aparece na lista de suposições.

## Estados do trabalho de geração

- `queued`: recebido e aguardando processamento.
- `validating_source`: validando entrada ou PDF.
- `extracting`: extraindo texto em ambiente controlado.
- `requires_ocr`: documento sem texto suficiente.
- `generating`: produzindo proposta estruturada.
- `validation_failed`: proposta fora do contrato.
- `awaiting_human_review`: disponível para revisão do professor.
- `changes_requested`: professor solicitou correções.
- `approved`: revisão clínica confirmada.
- `rejected`: proposta descartada.
- `failed`: falha técnica com mensagem rastreável.

## Auditoria mínima

Cada operação registra solicitante, horário, tipo, versão do prompt, identificador do modelo, documento de origem, hash do artefato, resultado estruturado, avisos, lacunas e estado de revisão. Chaves e conteúdo sensível não aparecem em logs técnicos.
