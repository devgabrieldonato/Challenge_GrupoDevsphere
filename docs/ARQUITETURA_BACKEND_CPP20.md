# Arquitetura preparada para a API C++20

## Limite entre navegador e servidor

O navegador acessa somente a API HTTP. Credenciais, banco, extração de PDF e provedores de IA permanecem no servidor. Cookies de sessão devem ser `HttpOnly`, `SameSite=Lax` e `Secure` em produção. O papel do usuário é lido da sessão persistida e nunca aceito como autoridade a partir do corpo enviado pelo navegador.

O contrato HTTP está em `backend/openapi/openapi.yaml`. A abstração da futura integração de IA está em `backend/include/ai/AIClinicalCaseService.hpp`. Não há chamada real de IA nem chave no repositório.

## Módulos propostos

- `auth`: login, logout, sessão, limitação de tentativas e autorização por papel.
- `cases`: casos versionados, itens, hipóteses, revisão e publicação.
- `submissions`: percurso imutável, tentativas e importação do relatório PDF.
- `feedback`: rascunho e conclusão da devolutiva, sempre separada do percurso.
- `ai`: geração assistida, extração controlada e registro de alertas.
- `documents`: quarentena, validação e retenção do PDF original.
- `audit`: autoria, transições de estado e ações administrativas.

## Persistência e evolução SQLite → PostgreSQL

SQLite atende ao MVP local. A camada de repositórios deve usar transações, parâmetros vinculados e tipos da aplicação, sem SQL dentro dos controladores HTTP. Isso permite trocar o adaptador de persistência quando houver acesso concorrente de turmas.

Para facilitar a migração:

1. Use identificadores UUID gerados pela aplicação, datas ISO 8601 em UTC e valores booleanos representados pela camada de acesso.
2. Não dependa de `rowid`, pragmas ou funções exclusivas do SQLite na regra de negócio.
3. Mantenha migrations incrementais e registre a versão aplicada.
4. Crie restrições, chaves estrangeiras e índices equivalentes nos dois bancos.
5. Execute uma exportação consistente, importe em PostgreSQL, compare contagens e chaves, e faça a troca durante uma janela sem gravações.
6. Após a migração, valide autenticação, autorizações, versões de casos e imutabilidade dos atendimentos antes de liberar escrita.

## Entidades e regras de integridade

As entidades previstas são `users`, `classes`, `class_enrollments`, `clinical_cases`, `case_versions`, `case_items`, `case_hypotheses`, `activities`, `activity_assignments`, `submissions`, `submission_steps`, `diagnostic_attempts`, `teacher_feedback`, `uploaded_documents`, `ai_generation_jobs` e `audit_logs`.

- Uma versão publicada de caso é imutável. Edições geram nova versão.
- Um atendimento enviado é imutável; correções docentes ficam em `teacher_feedback`.
- Cada tentativa guarda a sequência de evidências disponível naquele instante.
- Publicação exige revisão humana aprovada e confirmação explícita da responsabilidade clínica.
- O professor acessa apenas turmas e atividades autorizadas; o aluno acessa somente seus dados.

## Estados de revisão

`draft` → `awaiting_human_review` → `approved` → `published`

De `awaiting_human_review`, o professor pode seguir para `changes_requested` ou `rejected`. Um caso gerado por IA nunca transita diretamente para `published`. Toda transição registra autor, horário, origem, versão do prompt, modelo, alertas e documento associado.

## Segurança de autenticação

Senhas são armazenadas somente com Argon2id ou bcrypt e salt individual. E-mails são normalizados e únicos. O login usa mensagem genérica para credenciais inválidas, limitação progressiva de tentativas e rotação da sessão após autenticação. Tokens sensíveis não são gravados em `localStorage`.

## Observabilidade e privacidade

Logs técnicos não devem conter senhas, cookies, texto clínico completo nem chaves. O registro de auditoria referencia artefatos por ID e inclui o mínimo necessário para rastrear autoria e estado. Políticas de retenção e acesso ao PDF original precisam ser definidas antes do uso com dados pessoais reais.
