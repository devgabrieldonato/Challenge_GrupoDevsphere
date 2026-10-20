# API C++20 do Paciente Virtual

## Execução macOS e Windows/WSL2

Siga o [roteiro completo dos dois sistemas](../README.md#executar-localmente-no-macos-e-windows)
antes dos exemplos de referência deste componente: dependências, configuração
por terminal, banco/fontes, contas/MFA, Ollama, inicialização, saúde e encerramento.
Os blocos Bash executam no macOS ou Ubuntu/WSL2; não são comandos PowerShell.

| Componente | macOS | Windows/WSL2 neste PC |
| --- | --- | --- |
| Python | `repo/.venv-worker/bin/python` | `/home/pacientevirtual/.venvs/pacientevirtual/bin/python` |
| API C++20 | `repo/build/backend/devsphere-api` | `/home/pacientevirtual/build/pacientevirtual/backend/devsphere-api` |
| Banco/fontes | `repo/backend/data` e `sources` | `/home/pacientevirtual/.local/share/pacientevirtual` e `sources` |

Carregue `source .local/ambiente-local.sh` em Bash na raiz do clone, conforme o
roteiro. Para compilar/testar: `cmake --build "$PV_BUILD" -j 2` e
`ctest --test-dir "$PV_BUILD" --output-on-failure`, com `DEVSPHERE_PYTHON` explícito.
API: `"$PV_API"`; worker: `"$DEVSPHERE_PYTHON" -m worker.run --db "$DEVSPHERE_DB_PATH" --storage "$DEVSPHERE_SOURCE_DIR"`.
Interface/saúde: `http://127.0.0.1:8080` e `/api/v1/health`. Ctrl+C nos próprios
terminais encerra os processos. MFA é carregado apenas no terminal da API.

Benchmark Windows nativo usa `repo/.venv-worker/Scripts/python.exe`, Ollama
Windows e [comandos PowerShell completos](../docs/VALIDACAO_IA_OUTRA_MAQUINA.md#benchmark-real).
Esse benchmark não executa o daemon POSIX nem demonstra backend C++ nativo Windows.
macOS foi revisado por leitura; a rodada atual executou testes no Windows/WSL.
O M1/8 GB teve OOM real; não atribuir a ele os êxitos da RTX 3060.

Os exemplos posteriores com `build/backend` e `.venv-worker/bin/python` são
referência macOS/Ubuntu com build no clone; no WSL deste PC use os caminhos acima.


A API mantém autenticação, regras pedagógicas, dados acadêmicos, PDFs e
etapas de revisão fora do navegador. O SQLite permanece no backend.

Volte para a [visão geral do projeto](../README.md).

## Requisitos

- CMake 3.20 ou superior;
- compilador compatível com C++20;
- SQLite 3;
- Python 3.11+ e ReportLab para gerar o PDF oficial;
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
export DEVSPHERE_PYTHON="$PWD/.venv-worker/bin/python"
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

Prefira a sequência do roteiro principal acima, incluindo leitura silenciosa da
senha e provisionamento MFA; sem MFA professor/admin não conseguem autenticar.
As etapas abaixo são referência do CLI, com caminhos do build no clone.

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
export DEVSPHERE_SEED_PASSWORD="$("$DEVSPHERE_PYTHON" -c 'import getpass; print(getpass.getpass("Senha local: "))')"

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
export DEVSPHERE_SEED_PASSWORD="$("$DEVSPHERE_PYTHON" -c 'import getpass; print(getpass.getpass("Senha local: "))')"

DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
build/backend/devsphere-api --create-user \
  'Aluno de teste' \
  aluno.teste@devsphere.local \
  student
```

### 6. Criar o professor

```bash
export DEVSPHERE_SEED_PASSWORD="$("$DEVSPHERE_PYTHON" -c 'import getpass; print(getpass.getpass("Senha local: "))')"

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
# Arquivos provisionados conforme roteiro principal; não criar novamente se existentes.
source "$HOME/.config/pacientevirtual/admin-mfa.env"
source "$HOME/.config/pacientevirtual/professor-mfa.env"
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
- `DEVSPHERE_SEED_PASSWORD`: senha usada apenas pelos comandos de criação;
- `DEVSPHERE_CASE_SEED`: JSON privado com os casos legados (padrão ao lado das migrations);
- `DEVSPHERE_SOURCE_DIR`: diretório privado de PDFs, compartilhado somente com o worker;
- `DEVSPHERE_PYTHON`: interpretador com ReportLab e dependências necessárias;
- `DEVSPHERE_PDF_RENDERER`: caminho de `tools/render_official_report.py`;
- variáveis de MFA e segurança: consulte [Segurança NEXT_2026](../docs/SEGURANCA_NEXT_2026.md);
- variáveis do Ollama e modelos: consulte [Worker](../worker/README.md).

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

O relatório deve informar `clinicalSessionId`. O backend confere o histórico,
a identidade e a versão contra a sessão persistida. O documento oficial é gerado
no servidor a partir desses dados, com `tools/render_official_report.py` e ReportLab.
O PDF recebido do navegador não pode alterar o conteúdo oficial. O upload continua
limitado a 20 MiB. Detalhes do contrato estão no OpenAPI e na documentação de PDF.

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

## Contratos NEXT_2026

- `GET /cases`: catálogo público autorizado, com versões e metadados sem desfecho.
- `POST /clinical-sessions`: inicia um atendimento com a versão fixada.
- `POST /clinical-sessions/{id}/actions`: aceita uma escolha, libera sua resposta e calcula pontos.
- `POST /clinical-sessions/{id}/hypotheses`: registra hipótese e justificativa no estado atual.
- `GET /students/{id}/feedback`: aluno recebe somente devolutivas concluídas próprias.
- `GET /notifications` e `POST /notifications/{id}/read`: avisos internos do proprietário.
- `/contributions` e `/case-versions/{id}/review`: autoria, novas versões e curadoria.
- `/admin/reviewer-areas` e `/admin/review-assignments`: habilitação e atribuição explícitas.
- `/documents` e `/jobs`: upload autorizado e processamento assíncrono.
- `POST /library/search`: consulta de fontes aprovadas com autorização antes da recuperação.

As operações mutáveis exigem `X-PV-Request: 1`, além da sessão e das autorizações.
O cliente oficial já envia o cabeçalho. Ele auxilia a proteção contra CSRF e não
substitui autenticação. Requisições diretas estão sujeitas às mesmas regras.

Instale dependências e inicie o processo auxiliar conforme o [README do worker](../worker/README.md).
Para os PDFs oficiais, o interpretador definido em `DEVSPHERE_PYTHON` precisa ter
`reportlab`. Para backup cifrado e ferramentas MFA, instale
`tools/requirements-security.txt`. Não aplique os procedimentos de teste ao banco pessoal.

## Limitações

- Envio externo de e-mail ainda não possui provedor.
- Ollama, Qwen3:8b e Gemma3:4b exigem instalação local; a integração não equivale
  a geração real validada, qualidade clínica aprovada ou benchmark concluído.
- OCR depende de Poppler/Tesseract e seus idiomas; ausência gera falha recuperável.
- A migração preserva João e Marina sem conferir uma nova aprovação clínica.
- Não há autorização institucional para anunciar provas certificadas ou produção hospitalar.
- FIWARE, MQTT e Edge Computing não foram implementados nesta evolução.
- Produção requer HTTPS, isolamento do worker, segredos externos, recuperação testada,
  avaliação independente e resolução dos bloqueios da matriz de segurança.

## Referências

- [Portais NEXT_2026](../docs/PORTAIS_NEXT_2026.md)
- [Segurança NEXT_2026](../docs/SEGURANCA_NEXT_2026.md)
- [Worker local](../worker/README.md)

- [Arquitetura do backend](../docs/ARQUITETURA_BACKEND_CPP20.md)
- [Pontuação pedagógica](../docs/PONTUACAO_PEDAGOGICA.md)
- [Relatório PDF versionado](../docs/RELATORIO_PDF_VERSIONADO.md)
- [Geração e importação de casos](../docs/GERACAO_E_IMPORTACAO_DE_CASOS.md)
- [Contrato OpenAPI](openapi/openapi.yaml)

## Backup antes de migrations — NEXT_2026

Ao iniciar, a API verifica se há migrations pendentes. Para banco existente,
cria antes um snapshot pela API SQLite, incluindo os dados do WAL, no diretório
`backups` ao lado do banco. Sem mudança de esquema, não repete o snapshot.
Em desenvolvimento, a cópia sem cifra recebe permissões 0600 em diretório 0700.
Configure `DEVSPHERE_BACKUP_PASSWORD` (mínimo 16 caracteres, via ambiente protegido)
e `DEVSPHERE_PYTHON` com `cryptography` para gerar `.pvb` cifrado. Produção bloqueia
migrations sem esse segredo ou se o backup falhar. Não coloque a senha no Git.
`DEVSPHERE_BACKUP_TOOL` permite indicar o caminho absoluto de `tools/secure_backup.py`.
Restauração exige destino novo; consulte `docs/SEGURANCA_NEXT_2026.md` na raiz do projeto.

## Instalar OCR e conferir as dependências locais

No macOS com Homebrew, OCR de páginas digitalizadas requer:

```bash
brew install tesseract tesseract-lang poppler
tesseract --list-langs
pdftoppm -v
```

A lista deve conter `por` e `eng`. PDFs textuais usam as dependências Python.
Instale Ollama pelo site oficial, abra o aplicativo e confira `ollama --version`
e `curl http://127.0.0.1:11434/api/tags`. Os modelos não são baixados automaticamente.
Consulte `worker/README.md` na raiz para configuração e benchmark real.

Antes dos testes C++ que geram relatórios, exporte `DEVSPHERE_PYTHON` apontando
para o Python do ambiente com ReportLab; o Python padrão da máquina pode não ter
essa dependência. Testes HTTP e navegador criam suas próprias bases temporárias.

Resultado técnico e limites: [Evidências da integração NEXT_2026](../docs/ENTREGA_NEXT_2026.md).

## Estado dos modelos locais — 16/10/2026

Ollama 0.40.5 instalado manualmente e API local ativa. `qwen3:8b` (5,2 GB) e
`gemma3:4b` (3,4 GB) foram baixados, verificados pelo Ollama e listados pela API.
O CLI pode ser chamado pelo caminho `/Applications/Ollama.app/Contents/Resources/ollama`,
mesmo sem o comando no PATH. Mantenha o aplicativo aberto.

O Gemma respondeu ao teste JSON real em aproximadamente 17 segundos. Qwen teve
timeouts em testes reais, inclusive com contexto de 4096 e CPU; não foi concluída
a geração integral de 18 perguntas e 22 exames. A tentativa de contexto16384
ocupou aproximadamente7,9GB no M1/8GB e causou pressão de memória. A causa exata
dos timeouts ainda não foi isolada; não há comprovação de funcionamento integral
ou adequação clínica. Não foi substituído nenhum modelo por simulação.

O ambiente `.venv-worker` foi preparado localmente, é ignorado no Git e precisa
ser recriado em outra máquina conforme a preparação acima. Os scripts de API e
worker agora o preferem automaticamente; `DEVSPHERE_PYTHON` explícito prevalece.
O worker continua sendo iniciado separadamente: `./tools/start-worker.sh` na raiz.

Limites do adaptador são configuráveis (valores iniciais, ainda sujeitos a benchmark):

- `DEVSPHERE_OLLAMA_CONTEXT=8192`;
- `DEVSPHERE_OLLAMA_MAX_TOKENS=6000` (menor que o contexto);
- `DEVSPHERE_OLLAMA_BATCH=64`.

Esses limites menores reduzem reserva de memória; não significam que a geração
completa foi validada no equipamento. Aumente-os somente após medir recursos.
Timeout retorna erro recuperável e saída cortada é rejeitada; não há sucesso com
caso incompleto. Hashes e resultados técnicos estão em
`docs/MODELOS_LOCAIS_NEXT_2026.json`, a partir da raiz do projeto.

## Worker: erro `no such table: source_documents`

Esse erro significa que o worker abriu uma base anterior às migrations da fila,
ou que API e worker estão usando caminhos diferentes. Ativar o ambiente Python
não cria tabelas. O backend C++20 aplica migrations; o worker não altera o schema.

Na raiz do projeto, com a API parada, atualize explicitamente a base correta:

```bash
export DEVSPHERE_DB_PATH="$PWD/backend/data/devsphere.db"
./tools/start-local-api.sh --migrate
./tools/start-local-api.sh
```

O modo `--migrate` compila o backend, usa o backup pré-migration quando necessário
e encerra sem abrir servidor. Se uma API já responder na porta, solicita que ela
seja encerrada no terminal original antes da atualização. A inicialização normal
também aplica migrations, desde que execute o binário novo; um health positivo de
uma instância antiga não comprova versão nem caminho do banco.

Em outro terminal, novamente na raiz do projeto:

```bash
export DEVSPHERE_DB_PATH="$PWD/backend/data/devsphere.db"
./tools/start-worker.sh --check
./tools/start-worker.sh
```

`--check` valida as tabelas e colunas necessárias sem indexar fontes nem consumir
a fila. O worker informa o caminho do banco e só começa após essa verificação.
Um caminho inexistente nunca cria base vazia. Não execute o binário C++ diretamente
na raiz sem configurar o banco: seu default de CLI é `data/devsphere.db`, diferente
do caminho canônico utilizado pelos scripts (`backend/data/devsphere.db`). Não
apague nem misture bancos para corrigir esse problema.

Verificação em16/10/2026: banco local atualizado de001–005 para001–014 com snapshot
SQLite consistente; registros anteriores comparados por hash e preservados;
apenas as tabelas de casos antes vazias receberam João e Marina. Integridade `ok`;
worker `--check` passou sem processar trabalhos.

## Continuação das pendências — 16/10/2026

O painel administrativo agora lista habilitações e atribuições, permite revogar
uma área e substituir revisor com motivo auditado. A revogação impede acesso pela
atribuição, edição e decisão de revisão; autoria própria continua sendo vínculo
separado. Decisões históricas não são apagadas. A política de suplência institucional
continua pendente.

A área de contribuições permite ao proprietário/admin consultar destinatários de
uma fonte e versões dependentes. O admin pode conceder/revogar grants com motivo.
Resultados de geração deixam de ser entregues quando uma fonte necessária perde
a autorização, inclusive se o trabalho já estava concluído. Isso não apaga o
histórico nem substitui a política de retenção e revisão de casos derivados.

O editor oferece a [rubrica opcional de dificuldade](../docs/RUBRICA_DIFICULDADE.md),
com confirmação explícita e justificativa de divergência. Nenhum nível clínico
foi atribuído automaticamente a João ou Marina. O mapa completo está em
[Pendências NEXT](../docs/PENDENCIAS_NEXT_2026.md).

Para carregar estas alterações, pare as instâncias antigas nos respectivos
terminais e execute novamente os scripts de API e worker. Não é necessária nova
migration além da014. Não apague a base nem rode duas APIs concorrentes no mesmo
banco. A instalação sozinha não comprova geração: o histórico do M1 apresentou timeout.
Os testes completos Windows/WSL e os limites atuais estão na validação de 20/10/2026.

## Diagnóstico local e limites de processamento

Na raiz do repositório, confira as dependências antes de processar PDFs:

```bash
./tools/check-local-ai.sh
# Inventário estruturado, sem conteúdo clínico:
./tools/check-local-ai.sh --json --timeout 3
```

O diagnóstico consulta somente inventário do Ollama, modelos instalados/em memória,
Tesseract, idiomas `por+eng`, Poppler e recursos básicos da máquina. Não inicia
serviços, não baixa modelos, não acessa SQLite e não executa inferência. Retorno0
significa dependências encontradas; não significa geração validada. Falta de
componente retorna código não zero e orientações legíveis. Prefere `.venv-worker`;
`DEVSPHERE_PYTHON` explícito prevalece. A API8080 e o worker continuam precisando
ser iniciados separadamente, conforme os comandos acima.

A fila aceita por padrão **12 solicitações por usuário por hora**, somando conversão,
geração e retentativas manuais aceitas. Cancelar, concluir ou falhar não devolve
quota. Repetir a mesma solicitação idempotente retorna o trabalho anterior sem
consumir novamente. Tentativas automáticas continuam limitadas pelo próprio job;
não se confundem com uma nova solicitação manual. A concorrência por usuário
continua limitada a3 trabalhos pendentes. Configuração do backend:

- `DEVSPHERE_JOB_REQUEST_LIMIT=12`: inteiro entre1 e120;
- `DEVSPHERE_JOB_WINDOW_SECONDS=3600`: inteiro entre60 e86400.

Configuração inválida bloqueia novas solicitações com erro503; quota atingida
retorna429. Esses são limites técnicos conservadores do MVP, sujeitos a revisão
institucional. A contagem persiste no SQLite em trabalhos e eventos de retry;
reiniciar a API ou cancelar repetidamente não reinicia a janela.

A conversão agora interpreta seleção opcional vazia de páginas como todas as
páginas, igual ao que a interface envia. PDFs protegidos, falsos ou acima do limite
são rejeitados sem substituir documentos existentes.

### Histórico do Qwen no M1 — 16/10/2026

Nesta rodada, Qwen3:8b respondeu JSON técnico curto em27,84s com contexto512,
mas excedeu60s no contexto4096 usado como mínimo pelo worker. Os modelos foram
descarregados após os diagnósticos. Esse avanço comprova apenas execução curta;
ainda não há geração integral18/22 verificada. Não reduza o contexto de produção
para512: esse teste não comporta o contrato do caso clínico.

`DEVSPHERE_OLLAMA_TIMEOUT=600` configura o tempo da chamada do worker (inteiro1–900).
Não aumenta memória nem garante conclusão. O adaptador rejeita falta de conclusão,
modelo inesperado, JSON inválido e saída cortada; registra tokens e tempos de carga,
prompt e avaliação quando disponíveis, sem registrar texto clínico.

## Fila compartilhada, uploads e Live Server — terceira rodada

Os limites de3 pendentes por usuário e12 solicitações/h continuam. A API também
limita trabalhos `queued`/`running` compartilhados entre usuários:

- `DEVSPHERE_JOB_INSTITUTION_PENDING_LIMIT=12` (inteiro1–120);
- `DEVSPHERE_JOB_GLOBAL_PENDING_LIMIT=24` (inteiro1–1000).

Criação e retry verificam esses tetos na mesma transação; reenvio idempotente é
resolvido antes. Excesso retorna429 `institution_queue_full`/`global_queue_full`.
Cancelamento de um processo ainda em execução não libera capacidade antes de seu
encerramento. São defaults técnicos conservadores, não políticas homologadas.

Uploads são criados exclusivamente com permissão0600. Registro e auditoria são
transacionais; falhas tratáveis removem o arquivo novo e desfazem alterações.
Isso não torna SQLite e filesystem uma única transação contra desligamento abrupto:
reconciliação de órfãos, quota em bytes e reserva de disco continuam pendentes.

O teste com o **módulo real da extensão Live Server** passou em5501→8080 sem proxy:
login, CORS, HttpOnly, catálogo, ação e persistência ao reabrir a página. As duas
portas precisam estar livres; se ocupadas, o teste não acessa serviços existentes
e retorna SKIP77. Detalhes: `docs/LIVE_SERVER_VALIDACAO.md` (na raiz do projeto).
Não automatiza o botão “Go Live” do VS Code nem o fechamento completo do navegador.

### Geração local: resultado e próximo equipamento

Um perfil experimental isolado permitiu JSON curto Qwen em4096/18,74s, mas a
tentativa de caso completo em8192 registrou **falta de memória da GPU**. Nenhum
resultado parcial foi aceito; Gemma não foi alcançado. O aplicativo Ollama instalado
não foi reconfigurado nem reiniciado. Os pesos dos modelos não mudaram.

No registro histórico de 16/10/2026, o PC Windows com16GB/RTX3060 ainda não
havia sido testado. Os testes reais concluídos em 19–20/10 estão na seção final;
roteiro e entrada sintética estão em `docs/VALIDACAO_IA_OUTRA_MAQUINA.md` e
`worker/fixtures/synthetic-benchmark.request.json`. A instalação não prova capacidade.

A crítica pode ter contexto separado por `DEVSPHERE_OLLAMA_CRITIC_CONTEXT`; se
omitido, herda o contexto do gerador. Benchmark distingue RSS e alocação reportada
por `/api/ps`; ausência de amostra é `null`. No M1 a geração completa ficou
pendente; a validação Windows/WSL está registrada ao final. Revisão clínica
permanece pendente, mesmo com testes de software aprovados.

## Auditoria de armazenamento

A ferramenta `tools/audit_source_storage.py` compara registros e PDFs somente em
leitura, identificando ausências, órfãos, divergências de hash e caminhos/links
inválidos. Não apaga nem repara fontes. Veja `docs/AUDITORIA_ARMAZENAMENTO.md` na
raiz do projeto para execução com snapshot/janela coerente, limites e códigos.
Não foi executada sobre a base pessoal nesta implementação.

## Teste da IA no PC Windows

Windows + WSL2/Ubuntu 24.04.5 preparado, preservando o backend C++20. Perfil v4
Qwen3:8b + Gemma3:4b concluiu18 perguntas/22 exames: RAG 225,529 s, textual WSL
195,138 s e textual Windows96,891 s. Falhas anteriores preservadas.
Passaram CTest 2/2, workerLinux 61, PythonWindows 53 selecionados,
ferramentas 41+1skip opt-in e RAG real 3/3 separado. Interface/LiveServer
passaram após correções de rascunho, autoria e teclado. Sem publicação de casos,
aprovação clínica ou homologação de 100% de usabilidade. Comandos/versões/métricas e
pendências em `docs/VALIDACAO_IA_OUTRA_MAQUINA.md`.
