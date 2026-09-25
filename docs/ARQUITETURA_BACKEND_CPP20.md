# Arquitetura da API C++20

## Limite entre navegador e servidor

O navegador acessa somente a API HTTP. Credenciais, banco, documentos e regras autoritativas permanecem no servidor. O papel e a identidade são obtidos do cookie de sessão; campos enviados pelo cliente nunca concedem acesso.

O contrato HTTP está em `backend/openapi/openapi.yaml`. O schema do atendimento atual está em `docs/schemas/submission-report.schema.json`.

## Módulos

- `auth`: login, logout, sessão, limitação de tentativas e autorização por papel;
- `cases`: casos e versões clínicas;
- `scoring`: regras versionadas e recálculo da pontuação;
- `submissions`: conclusão idempotente, percurso, tentativas e relatório v2;
- `documents`: validação, hash, armazenamento e acesso protegido ao PDF;
- `feedback`: devolutiva separada do atendimento imutável;
- `ai`: contratos de geração assistida ainda sem provedor real;
- `audit`: autoria e ações administrativas.

## Fluxo de conclusão

1. O frontend congela um retrato da tentativa e cria `clientSubmissionId`.
2. O PDF e o JSON v2 são enviados juntos em `POST /api/v1/submissions`.
3. O backend identifica o usuário pela sessão, valida o relatório e recalcula a pontuação.
4. A gravação do atendimento, dos passos, das tentativas, da pontuação e do documento ocorre na mesma transação.
5. A mesma chave e o mesmo conteúdo recuperam a submissão anterior; a mesma chave com conteúdo diferente gera `409 idempotency_conflict`.
6. O PDF fica disponível apenas pela rota autorizada da submissão.

A API aceita aluno ou administrador nessa conclusão e recusa professor. Uma simulação administrativa usa aluno técnico, guarda o administrador como autor e recebe `isTest: true`.

O backend armazena o PDF como BLOB. Essa escolha mantém documento e registros na mesma transação e evita referências a arquivos ausentes.

## CORS e desenvolvimento local

A aplicação completa usa `http://127.0.0.1:8080` ou `http://localhost:8080`. Com Live Server, o frontend usa a porta `5501` e chama a API na porta `8080` com `credentials: "include"`.

Em desenvolvimento, a API permite explicitamente:

- `http://127.0.0.1:5501`;
- `http://localhost:5501`.

O preflight da submissão aceita `Content-Type` e `Idempotency-Key`. A resposta inclui `Access-Control-Allow-Credentials: true` e reflete somente uma origem autorizada. Durante uma sessão, mantenha o mesmo host (`localhost` ou `127.0.0.1`) para que o cookie seja enviado corretamente.

Produção exige HTTPS, origens explícitas em `DEVSPHERE_ALLOWED_ORIGINS`, limites de upload, logs estruturados e uma camada HTTP revisada.

## Persistência e evolução SQLite → PostgreSQL

SQLite atende ao MVP local. A camada de banco usa parâmetros vinculados, transações e migrations incrementais. Uma evolução para PostgreSQL deve preservar chaves únicas de idempotência, chaves estrangeiras, hashes dos documentos e imutabilidade dos atendimentos.

Um atendimento concluído é imutável. A devolutiva do professor permanece em entidade separada. Relatórios v1 importados continuam legíveis e não recebem pontuação retroativa.

## Autorização do professor

O aluno consulta os próprios registros. O professor consulta somente submissões em que seja o revisor responsável ou que estejam ligadas às suas atividades. O administrador possui visão global para administração e testes. A API responde `404` para uma submissão ou PDF sem vínculo autorizado.

## Observabilidade e privacidade

Logs técnicos não devem conter senha, cookie, PDF, relatório completo ou texto clínico livre. Auditoria referencia artefatos por identificador e registra somente o necessário para rastrear autoria e estado.

## Limites atuais

- A classificação dos itens e os valores de pontuação aguardam homologação clínica humana.
- O provedor real de IA, OCR e extração clínica de PDFs não está configurado.
- O servidor HTTP embutido é destinado ao desenvolvimento local.
- A política institucional de retenção dos PDFs deve ser definida antes do uso com dados pessoais reais.
