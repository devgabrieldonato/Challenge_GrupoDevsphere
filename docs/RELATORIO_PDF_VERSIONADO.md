# Contrato do relatório acadêmico em PDF

O PDF continua legível por pessoas, mas deve carregar um payload estruturado versionado para permitir a reconstrução fiel do percurso. A API aceita somente `reportType: "clinical-case-submission"` e versões compatíveis com `docs/schemas/submission-report.schema.json`.

## Regras

- O relatório guarda `caseId`, `caseVersion`, `studentId`, `activityId`, `exportedAt`, percurso e tentativas.
- Cada passo mantém ordem, horário, tipo, resposta mostrada, classificação pedagógica e comentário.
- Cada tentativa mantém a hipótese, justificativa e IDs das evidências disponíveis naquele momento.
- O percurso importado permanece imutável; a devolutiva é outra entidade.
- A representação estruturada deve ser embutida pelo gerador do sistema como anexo de dados com nome e tipo conhecidos ou outro mecanismo padronizado definido pelo backend.
- O importador não confia em texto visual extraído para reconstruir o atendimento. Ele valida o payload, sua versão e sua associação ao PDF.
- Uma evolução futura deve assinar o payload no servidor. Até isso existir, a interface deve identificar relatórios importados como não assinados.

## Validação do arquivo

Extensão e MIME são apenas sinais iniciais. O servidor também valida `%PDF-`, limites, estrutura interna e presença do payload reconhecido. Conteúdo ativo nunca é executado. O original e seu SHA-256 são preservados para auditoria.
