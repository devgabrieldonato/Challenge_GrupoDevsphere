# API C++20 do Paciente Virtual

A API mantém autenticação, regras pedagógicas, dados acadêmicos, PDFs e
etapas de revisão fora do navegador. O SQLite permanece no backend.

Volte para a [visão geral do projeto](../README.md).

## Requisitos

- CMake 3.20 ou superior;
- compilador compatível com C++20;
- SQLite 3;
- macOS Security/CommonCrypto ou OpenSSL em outras plataformas.

Argon2id está vendorizado em `backend/vendor/argon2`, com licença e referência
do código-fonte preservadas.

## Banco de dados local

O banco de desenvolvimento é `backend/data/devsphere.db`. Cada clone ou pasta
do projeto possui sua própria base. Migrations criam o schema, mas não criam
contas. Portanto, credenciais existentes em outra cópia não funcionarão até que
sejam criadas também nesta base.

Apagar o banco remove todos os dados locais, incluindo usuários, sessões,
atividades, submissões, PDFs, pontuações e feedbacks. Pare a API antes de
remover ou substituir `devsphere.db`, `devsphere.db-wal` ou
`devsphere.db-shm`. Esses arquivos não devem ser versionados.

Na abertura, a classe de banco ativa chaves estrangeiras, timeout de espera e
WAL. As migrations são aplicadas em ordem e dentro de transações.

## Compilar e testar

Execute na raiz do repositório:

```bash
cmake -S backend -B build/backend -DBUILD_TESTING=ON
cmake --build build/backend
ctest --test-dir build/backend --output-on-failure
```

A configuração prepara o build, a compilação produz a API e os testes, e o
`ctest` verifica o núcleo do backend. Compile antes de utilizar diretamente
`build/backend/devsphere-api`.

## Domínio institucional de desenvolvimento

O domínio local é `devsphere.local`. Autorize-o antes de aceitar solicitações
públicas de cadastro:

```bash
DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
build/backend/devsphere-api --allow-domain devsphere.local
```

O domínio e os e-mails abaixo servem somente ao desenvolvimento. Substitua-os
pelos valores oficiais quando as regras institucionais forem homologadas.

## Contas locais de teste

| Perfil | E-mail | Papel |
| --- | --- | --- |
| Administrador | `admin@devsphere.local` | `admin` |
| Aluno | `aluno.teste@devsphere.local` | `student` |
| Professor | `professor.teste@devsphere.local` | `teacher` |

O administrador pode usar as áreas de administração, aluno e professor para
testes. O backend determina seu papel por `admin_accounts`; escolher outro
formulário não altera esse papel. Aluno e professor não recebem acesso
administrativo.

As contas só existem na base em que forem criadas. Senhas devem entrar pelo
ambiente, nunca por código, argumentos, arquivos de documentação ou Git.

## Recriar banco e contas locais

Use este procedimento depois de criar um clone, iniciar outra pasta ou apagar o
banco. Pare a API antes de substituir arquivos SQLite.

### 1. Compilar

```bash
cmake -S backend -B build/backend -DBUILD_TESTING=ON
cmake --build build/backend
```

### 2. Aplicar migrations

```bash
DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
build/backend/devsphere-api --migrate
```

### 3. Autorizar o domínio

```bash
DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
build/backend/devsphere-api --allow-domain devsphere.local
```

### 4. Criar o administrador

Defina a senha apenas no ambiente:

```bash
export DEVSPHERE_SEED_PASSWORD='defina-uma-senha-local-segura'

DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
build/backend/devsphere-api --create-admin \
  'Administrador local' \
  admin@devsphere.local \
  admin@devsphere.local
```

O último argumento é o endereço local de notificação administrativa.

### 5. Criar o aluno

Redefina a variável se desejar uma senha diferente:

```bash
export DEVSPHERE_SEED_PASSWORD='defina-a-senha-local-do-aluno'

DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
build/backend/devsphere-api --create-user \
  'Aluno de teste' \
  aluno.teste@devsphere.local \
  student
```

### 6. Criar o professor

```bash
export DEVSPHERE_SEED_PASSWORD='defina-a-senha-local-do-professor'

DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
build/backend/devsphere-api --create-user \
  'Professor de teste' \
  professor.teste@devsphere.local \
  teacher
```

### 7. Limpar a variável e iniciar

```bash
unset DEVSPHERE_SEED_PASSWORD
./tools/start-local-api.sh
```

Cada criação usa o valor atual de `DEVSPHERE_SEED_PASSWORD`. Contas criadas pelo
binário ficam ativas imediatamente. Contas solicitadas pelo navegador nascem
pendentes e seguem o fluxo de aprovação administrativa.

## Fluxo de cadastro institucional

1. Aluno ou professor envia nome, e-mail institucional e senha.
2. A conta permanece inativa e a solicitação aparece no painel administrativo.
3. Uma notificação é registrada em `email_outbox` para o endereço administrativo.
4. O administrador confirma o vínculo e aprova ou recusa o pedido.
5. A aprovação ativa a conta; decisão e notificação permanecem auditáveis.

O MVP ainda não envia e-mails externamente. Um provedor institucional futuro
deverá consumir a caixa de saída. Até lá, o painel é o canal de aprovação.

## Iniciar a API

### Automaticamente pelo VS Code

A tarefa `Devsphere: API local (8080)`, em `.vscode/tasks.json`, pode iniciar ao
abrir a pasta. Confie no projeto e permita tarefas automáticas. Ela compila
quando necessário, aplica migrations, usa o banco local e consulta o health
check antes de criar um processo. Se a porta `8080` já responder, a tarefa não
inicia uma segunda API.

Para execução manual pelo VS Code, selecione **Terminal → Executar Tarefa... →
Devsphere: API local (8080)**.

### Pelo inicializador

```bash
./tools/start-local-api.sh
```

O script resolve caminhos absolutos, configura o CMake no primeiro uso, compila
e inicia a API com banco, migrations e frontend corretos.

### Diretamente pelo binário

```bash
DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
DEVSPHERE_FRONTEND_DIR=frontend \
DEVSPHERE_HOST=127.0.0.1 \
DEVSPHERE_PORT=8080 \
build/backend/devsphere-api
```

A API está pronta quando o terminal mostrar:

```text
Devsphere API em http://127.0.0.1:8080
```

## Modos de acesso

### Backend servindo a aplicação

Abra `http://127.0.0.1:8080`. A mesma origem entrega o frontend e atende as
rotas `/api/v1`; o Live Server não é necessário.

### Live Server servindo o frontend

Mantenha ambos ativos:

- Live Server: `http://127.0.0.1:5501`;
- API: `http://127.0.0.1:8080`.

O Live Server só fornece arquivos estáticos. Use o mesmo hostname nas duas
portas para preservar o cookie `SameSite=Strict`: `127.0.0.1` com
`127.0.0.1`, ou `localhost` com `localhost`.

## Variáveis de ambiente

- `DEVSPHERE_DB_PATH`: caminho do SQLite;
- `DEVSPHERE_MIGRATIONS_DIR`: diretório das migrations;
- `DEVSPHERE_FRONTEND_DIR`: diretório servido pela API;
- `DEVSPHERE_HOST`: endereço de escuta;
- `DEVSPHERE_PORT`: porta HTTP;
- `DEVSPHERE_ENV=production`: ativa atributos destinados à produção;
- `DEVSPHERE_ALLOWED_ORIGINS`: origens permitidas, separadas por vírgula;
- `DEVSPHERE_SEED_PASSWORD`: senha usada apenas pelos comandos de criação.

Em desenvolvimento, a API aceita `http://127.0.0.1:5501` e
`http://localhost:5501`. Produção deve usar HTTPS, origem explícita e uma camada
HTTP revisada.

## Solução de problemas

### `Failed to fetch`

Esse erro normalmente significa que o Live Server respondeu na `5501`, mas a
API não está ativa na `8080`. Verifique:

```bash
curl http://127.0.0.1:8080/api/v1/health
```

Resposta esperada:

```json
{"status":"ok"}
```

Se não houver conexão, execute `./tools/start-local-api.sh` ou a tarefa
`Devsphere: API local (8080)` e atualize a página.

- `Failed to fetch`: falha de comunicação com a API;
- `E-mail ou senha inválidos`: conta ausente nesse banco ou senha incorreta;
- `Conta pendente`: cadastro ainda não aprovado;
- `Acesso não autorizado`: sessão sem permissão para a operação.

## Escopo técnico implementado

A API aplica migrations, autentica usuários, cria sessões em cookie `HttpOnly`
e `SameSite=Strict`, limita tentativas de login e aplica controle de acesso por
papel. Professores consultam atendimentos sob sua responsabilidade; alunos
acessam os próprios dados; administradores podem produzir testes identificados.

### Finalização automática e PDF

`POST /api/v1/submissions` recebe `multipart/form-data` com
`clientSubmissionId`, `report`, `pdf` e `activityId` opcional. O relatório usa o
schema v2 em `docs/schemas/submission-report.schema.json`. Reenvio do mesmo
conteúdo retorna a submissão existente; conteúdo divergente com a mesma chave
gera conflito.

O backend recalcula a pontuação, compara o JSON incorporado no PDF com o
relatório, valida o documento e persiste tudo na mesma transação. O PDF é
limitado a 20 MiB.

`GET /api/v1/submissions/{id}/pdf` entrega o documento ao aluno proprietário,
professor responsável ou administrador. A importação manual em
`POST /api/v1/submissions/import-pdf` permanece para relatórios legados ou
externos.

## Segurança

Senhas são armazenadas somente como hashes Argon2id com salt. Tokens de sessão
são aleatórios, persistidos por hash e enviados em cookies `HttpOnly`. O
navegador não promove usuários nem define a identidade acadêmica da submissão.

Submissões, etapas, tentativas e eventos de pontuação preservam auditoria e
imutabilidade. Não versione bancos, PDFs clínicos locais, chaves ou credenciais.

## Limitações

- O envio externo de e-mail ainda não possui provedor.
- Rotas de geração clínica respondem `501 ai_not_configured` até a integração de
  um provedor revisado.
- Extração controlada de texto e OCR de PDFs clínicos ainda não estão ativas.
- FIWARE, MQTT e Edge Computing não fazem parte da implementação atual.
- O servidor HTTP embutido é adequado ao desenvolvimento. Produção exige TLS,
  limites de upload, logs estruturados e armazenamento protegido.

## Referências

- [Arquitetura do backend](../docs/ARQUITETURA_BACKEND_CPP20.md)
- [Pontuação pedagógica](../docs/PONTUACAO_PEDAGOGICA.md)
- [Relatório PDF versionado](../docs/RELATORIO_PDF_VERSIONADO.md)
- [Geração e importação de casos](../docs/GERACAO_E_IMPORTACAO_DE_CASOS.md)
- [Contrato OpenAPI](openapi/openapi.yaml)
