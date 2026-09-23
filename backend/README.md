# API C++20 do Paciente Virtual

Esta pasta contém a API local do MVP. O navegador acessa apenas HTTP; o SQLite
permanece no backend.

## Requisitos

- CMake 3.20 ou superior
- compilador com C++20
- SQLite 3
- macOS Security/CommonCrypto ou OpenSSL em outras plataformas

Argon2id está vendorizado em `vendor/argon2`, com licença e referência do
código-fonte preservadas.

## Compilar e testar

```bash
cmake -S backend -B build/backend -DBUILD_TESTING=ON
cmake --build build/backend
ctest --test-dir build/backend --output-on-failure
```

## Configurar acesso local

Nenhuma credencial fica no código. Defina a senha somente no ambiente. O
administrador é criado diretamente no servidor, pois o formulário público
nunca pode conceder esse papel:

```bash
export DEVSPHERE_SEED_PASSWORD='uma-senha-local-com-12-ou-mais-caracteres'
DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
build/backend/devsphere-api --create-admin \
  'Administrador local' admin@devsphere.local secretaria@instituicao.edu.br
unset DEVSPHERE_SEED_PASSWORD
```

Autorize os domínios que podem solicitar contas de aluno ou professor:

```bash
DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
build/backend/devsphere-api --allow-domain instituicao.edu.br
```

Contas acadêmicas de desenvolvimento também podem ser criadas diretamente:

```bash
export DEVSPHERE_SEED_PASSWORD='uma-senha-local-com-12-ou-mais-caracteres'
DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
build/backend/devsphere-api --create-user 'Aluno de teste' aluno@instituicao.edu.br student

DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
build/backend/devsphere-api --create-user 'Professor de teste' professor@instituicao.edu.br teacher
unset DEVSPHERE_SEED_PASSWORD
```

## Fluxo de cadastro institucional

1. Aluno ou professor envia nome, e-mail institucional e senha.
2. A conta permanece inativa e a solicitação aparece no painel administrativo.
3. Uma notificação é registrada em `email_outbox` para o endereço configurado
   na conta administrativa.
4. O administrador confirma o vínculo e aprova ou recusa o pedido.
5. Uma aprovação ativa a conta; a decisão e a notificação ficam auditáveis.

O MVP ainda não entrega e-mails externamente. Um provedor futuro deverá
consumir a caixa de saída. Até lá, o painel é o canal operacional de aprovação.

## Executar

A partir da raiz do repositório:

```bash
DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
DEVSPHERE_FRONTEND_DIR=frontend \
build/backend/devsphere-api
```

Abra `http://127.0.0.1:8080`.

Variáveis disponíveis: `DEVSPHERE_HOST`, `DEVSPHERE_PORT`,
`DEVSPHERE_ENV=production`, `DEVSPHERE_DB_PATH`,
`DEVSPHERE_MIGRATIONS_DIR`, `DEVSPHERE_FRONTEND_DIR` e
`DEVSPHERE_ALLOWED_ORIGINS`. Em desenvolvimento, as origens locais do Live
Server na porta 5501 já são aceitas. Em produção, informe uma lista separada
por vírgulas em `DEVSPHERE_ALLOWED_ORIGINS`, use HTTPS e ative
`DEVSPHERE_ENV=production`; a API então acrescenta `Secure` ao cookie.

## Escopo implementado

A API aplica migrations, autentica usuários, cria sessões em cookie
`HttpOnly` e `SameSite=Strict`, limita tentativas de login e aplica RBAC.
Professores consultam somente atendimentos associados às atividades que
ministram. O percurso enviado pelo aluno é imutável e a devolutiva fica em
entidade separada.

As rotas de geração por IA respondem `501 ai_not_configured` até um provedor
ser ligado a `AIClinicalCaseService`. A importação persistente do relatório PDF preserva o original e registra
auditoria. A extração de texto/OCR de casos clínicos e a publicação de novos
casos continuam como contratos documentados no OpenAPI; a interface identifica esses limites sem simular
sucesso clínico.

O servidor HTTP incluído é adequado para desenvolvimento local. Antes de
produção, coloque a aplicação atrás de um servidor HTTP revisado, TLS, limites
de upload, logs estruturados e armazenamento protegido de documentos.

