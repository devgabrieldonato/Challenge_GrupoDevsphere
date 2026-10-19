# Paciente Virtual

Plataforma educacional para estudantes e professores de Medicina. O aluno
escolhe um caso clínico, conduz a investigação, formula hipóteses e recebe uma
pontuação pedagógica. O professor revisa o percurso, as evidências disponíveis
e as tentativas antes de registrar a devolutiva.

## Estado atual da NEXT_2026

API, atendimento, PDF/devolutiva, conversão/OCR e Live Server real têm testes locais
aprovados. **Geração integral com Qwen/Gemma continua bloqueada no M1/8GB:** o último
teste completo registrou falta de memória da GPU. Resposta curta bem-sucedida não
comprova geração de18 perguntas/22 exames. A validação na outra máquina e a revisão
clínica permanecem pendentes.

Consulte [pendências e evidências](docs/PENDENCIAS_NEXT_2026.md),
[Live Server real](docs/LIVE_SERVER_VALIDACAO.md) e
[validação da IA na outra máquina](docs/VALIDACAO_IA_OUTRA_MAQUINA.md).

## Funcionalidades principais

- jornadas separadas para aluno, professor e administrador;
- casos clínicos de João e Marina, cada um com 18 perguntas e 22 exames;
- pontuação versionada, com penalidades para escolhas de baixo valor ou
  inadequadas;
- envio automático do percurso e do PDF para revisão docente;
- consulta da ordem das perguntas, exames, hipóteses e justificativas;
- devolutiva docente com pontos fortes, dificuldades e próximas orientações;
- cadastro institucional sujeito à aprovação administrativa;
- catálogo dinâmico e versões de casos, sem respostas antecipadas no navegador;
- histórico do aluno, devolutivas concluídas e notificações com estado de leitura;
- contribuições em PDF por aluno e professor, conversão e fila assíncrona;
- geração local integrada ao Ollama (Qwen3:8b e Gemma3:4b), dependente da instalação dos modelos;
- curadoria por área, atribuição de revisor e aprovação separada da publicação;
- dificuldade, público-alvo e tags públicas revisadas para evitar pistas diagnósticas.

## Estrutura do projeto

- `frontend/`: escolha de perfil, cadastro, logins e áreas dos três papéis;
- `backend/`: API C++20, SQLite, migrations, Argon2id e testes;
- `docs/`: arquitetura, pontuação, contratos de casos e relatório PDF;
- `tools/`: inicialização local e validação estrutural de casos;
- `frontend/assets/images/`: imagens dos pacientes virtuais;
- `backend/seeds/`: conteúdo clínico legado privado, lido pelo servidor;
- `worker/`: extração, OCR e integração local de IA, em processo separado;
- `deploy/`: exemplos de operação e isolamento para homologação;
- `index.html`: entrada compatível para acesso pela raiz do projeto.

## Requisitos

- CMake 3.20 ou superior;
- compilador compatível com C++20;
- SQLite 3;
- Python 3.11+ e ReportLab para o PDF oficial;
- dependências do worker para conversão e geração (veja abaixo);
- extensão Live Server, somente quando esse modo de execução for utilizado.

Os detalhes de compilação, variáveis e comandos administrativos estão no
[README do backend](backend/README.md).

## Banco SQLite local

O desenvolvimento utiliza `backend/data/devsphere.db`. Cada pasta, cópia ou
clone possui seu próprio arquivo SQLite: dados não são compartilhados
automaticamente entre branches em diretórios diferentes, computadores ou
clones. Por isso, uma cópia nova pode não reconhecer contas criadas em outra.

As migrations criam tabelas, índices, triggers e demais estruturas, mas não
criam as contas de teste. Excluir o banco remove usuários, sessões, cadastros,
turmas, atividades, submissões, PDFs, pontuações, feedbacks e os outros dados
locais. `devsphere.db-wal` e `devsphere.db-shm` também pertencem ao SQLite; pare
a API antes de remover ou substituir qualquer um desses arquivos.

O banco e seus arquivos auxiliares não devem ser versionados no Git.

## Compilar e testar

Na raiz do repositório:

```bash
cmake -S backend -B build/backend -DBUILD_TESTING=ON
cmake --build build/backend
ctest --test-dir build/backend --output-on-failure
```

O primeiro comando configura o projeto, o segundo compila a API e os testes e o
terceiro executa a suíte do backend. Compile antes de chamar diretamente
`build/backend/devsphere-api`.

## Domínio de desenvolvimento

O domínio institucional local é `devsphere.local`. Ele precisa ser autorizado
antes que solicitações públicas com esse domínio sejam aceitas:

```bash
DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
build/backend/devsphere-api --allow-domain devsphere.local
```

Esse domínio serve apenas ao desenvolvimento. Ele deverá ser substituído pelo
domínio oficial quando as regras institucionais forem homologadas.

## Contas de teste locais

| Perfil | E-mail | Papel efetivo | Acesso |
| --- | --- | --- | --- |
| Administrador | `admin@devsphere.local` | `admin` | Administração, aluno e professor |
| Aluno | `aluno.teste@devsphere.local` | `student` | Jornada do aluno |
| Professor | `professor.teste@devsphere.local` | `teacher` | Jornada do professor |

Essas contas só existem no banco em que forem criadas. Elas não acompanham o
clone e não são inseridas por migrations. As senhas são definidas localmente por
`DEVSPHERE_SEED_PASSWORD` e nunca devem ser gravadas em README, scripts, JSON,
XML, CSV, código-fonte ou Git. Remova a variável depois do uso.

O backend determina o papel `admin`, independentemente do formulário escolhido.
Durante testes, o administrador pode entrar pelas páginas de administrador,
aluno ou professor sem alterar seu papel persistido. Alunos e professores
comuns não recebem acesso administrativo.

## Recriar o ambiente local

Use este fluxo quando o banco for apagado, o projeto for clonado em outro
computador, uma nova cópia for criada ou as contas locais não existirem:

1. pare a API;
2. compile o backend;
3. aplique as migrations;
4. autorize `devsphere.local`;
5. crie administrador, aluno e professor;
6. remova a variável de senha;
7. inicie a API novamente;
8. teste os três acessos.

Os comandos completos, sem senhas reais, estão em
[Recriar banco e contas locais](backend/README.md#recriar-banco-e-contas-locais).
Contas criadas pelo binário ficam ativas imediatamente. Contas solicitadas pelos
formulários públicos continuam dependendo da aprovação administrativa.

## Iniciar a API

Há três formas suportadas.

### Inicialização automática pelo VS Code

A tarefa `Devsphere: API local (8080)`, definida em `.vscode/tasks.json`, pode
ser executada ao abrir a pasta. Confie na pasta e permita tarefas automáticas
quando o VS Code solicitar. A tarefa compila quando necessário, aplica
migrations, usa `backend/data/devsphere.db` e não cria outra instância quando o
health check da porta `8080` já responde.

Se ela estiver desativada, use **Terminal → Executar Tarefa... → Devsphere: API
local (8080)**.

### Inicialização manual pelo script

```bash
./tools/start-local-api.sh
```

O script resolve os caminhos a partir da raiz, configura e compila o backend
quando necessário e inicia a API com o banco e as migrations locais.

### Inicialização manual pelo binário

```bash
DEVSPHERE_DB_PATH=backend/data/devsphere.db \
DEVSPHERE_MIGRATIONS_DIR=backend/migrations \
DEVSPHERE_FRONTEND_DIR=frontend \
DEVSPHERE_HOST=127.0.0.1 \
DEVSPHERE_PORT=8080 \
build/backend/devsphere-api
```

A mensagem abaixo confirma a inicialização:

```text
Devsphere API em http://127.0.0.1:8080
```

## Modos de execução

### Aplicação servida pela API — porta 8080

Inicie a API e acesse `http://127.0.0.1:8080`. Nesse modo, o backend C++20
entrega o frontend e atende a API; o Live Server não é necessário. Banco,
sessões e autenticação permanecem no backend.

### Frontend pelo Live Server — porta 5501

O Live Server entrega somente HTML, CSS, JavaScript, imagens e outros arquivos
estáticos. Ele não substitui o backend. Os dois serviços devem permanecer
ativos:

- frontend: `http://127.0.0.1:5501`;
- API: `http://127.0.0.1:8080`.

O frontend detecta a porta `5501` e envia as requisições para a `8080`. Fechar o
terminal ou encerrar a tarefa pode desligar a API; iniciar apenas o Live Server
não oferece login, cadastro, persistência ou submissões.

Use o mesmo hostname nas duas portas. Combine `127.0.0.1` com `127.0.0.1` ou
`localhost` com `localhost`; misturar os dois pode impedir o envio do cookie de
sessão.

## Jornadas

### Aluno

O aluno autentica, escolhe um caso publicado no catálogo, investiga e registra hipótese
e justificativa. João e Marina foram preservados como versões legadas, com classificação
pedagógica pendente de revisão docente. Perguntas e exames alteram a pontuação; escolhas além do
orçamento recomendado recebem penalidade progressiva. Ao finalizar, o relatório
v2 e o PDF são enviados automaticamente à API, com proteção contra duplicação.
O download manual permanece disponível como cópia pessoal. A pontuação e as ações
oficiais são aceitas e persistidas pelo servidor. O portal permite consultar os
próprios atendimentos, receber devolutivas concluídas e enviar PDFs para contribuições.
Recomeçar cria uma nova sessão e preserva o histórico anterior.

### Professor

O professor consulta atendimentos autorizados, revisa a ordem das escolhas, as
tentativas, a pontuação, as justificativas e o PDF. Depois registra uma
devolutiva, podendo salvá-la como rascunho ou concluí-la. A importação manual de
relatórios legados permanece disponível. A área de contribuições reúne documentos,
Markdown, trabalhos e rascunhos. O revisor deve estar habilitado na área e ter
atribuição para decidir sobre a versão; acesso administrativo técnico não substitui
habilitação clínica.

### Administrador

O administrador analisa solicitações institucionais, aprova ou recusa cadastros
e consulta a caixa de saída auditável. Para testes funcionais, também pode abrir
as jornadas do aluno e do professor.

## Cadastro e validação institucional

Aluno e professor solicitam acesso com e-mail de um domínio autorizado. A conta
nasce inativa e só pode entrar após decisão administrativa. Aprovações, recusas
e notificações ficam auditadas. O envio externo de e-mail ainda depende de um
provedor institucional futuro.

O navegador nunca concede o papel administrativo. Administradores são criados
somente por comando no backend.

## Solução de problemas

### Erro `Failed to fetch`

**Sintoma:** a página abre pelo Live Server, mas login, cadastro ou outra ação
mostra `Failed to fetch`.

**Causa principal:** o frontend está disponível na porta `5501`, mas a API não
está ativa na `8080`. Trata-se de falha de comunicação, não necessariamente de
credencial.

Confira o health check:

```bash
curl http://127.0.0.1:8080/api/v1/health
```

A resposta esperada é:

```json
{"status":"ok"}
```

Se não houver conexão, inicie a API:

```bash
./tools/start-local-api.sh
```

Ou use **Terminal → Executar Tarefa... → Devsphere: API local (8080)**. Depois,
atualize a página.

Mensagens diferentes indicam outras situações:

- `Failed to fetch`: a API não foi alcançada;
- `E-mail ou senha inválidos`: a API respondeu, mas a conta não existe nesse
  banco ou a senha está incorreta;
- `Conta pendente`: o cadastro ainda aguarda aprovação;
- `Acesso não autorizado`: o papel autenticado não permite aquela ação.

## Segurança e dados

Credenciais não são armazenadas em XML, CSV, JSON nem no navegador. O SQLite
guarda hashes Argon2id com salt. Tokens ficam em cookie `HttpOnly`; o backend
obtém o papel da sessão e recalcula a pontuação sem confiar na identidade
informada pelo navegador.

Submissões, etapas e tentativas são auditáveis e imutáveis. Professores acessam
somente atendimentos autorizados, alunos consultam os próprios registros e
execuções administrativas são identificadas como testes.

## PDF oficial, worker e modelos locais

Prepare as dependências em ambiente Python separado, sem versionar o ambiente:

```bash
python3 -m venv .venv-worker
.venv-worker/bin/python -m pip install -r worker/requirements.txt -r tools/requirements-security.txt reportlab
export DEVSPHERE_PYTHON="$PWD/.venv-worker/bin/python"
./tools/start-local-api.sh
```

A API utiliza Python/ReportLab para gerar o PDF oficial a partir do histórico
validado. O PDF gerado no navegador é uma cópia; conteúdo enviado pelo aluno não
é a fonte da nota nem do documento oficial.

Em outro terminal, usando o mesmo banco e diretório de fontes:

```bash
export DEVSPHERE_PYTHON="$PWD/.venv-worker/bin/python"
./tools/start-worker.sh
```

Também existe a tarefa manual `Devsphere: worker local` no VS Code; confira o nome
exato em `.vscode/tasks.json`. O worker não é iniciado automaticamente antes da
preparação das dependências. A API pode atender login e investigação enquanto o
worker está desligado; trabalhos permanecem na fila.

Ollama e os modelos precisam ser instalados separadamente. A configuração inicial
é `qwen3:8b` para geração e `gemma3:4b` para crítica sequencial. O código não baixa
modelos automaticamente e não usa API paga. PDFs digitalizados exigem Poppler e
Tesseract com os idiomas configurados. Veja os requisitos e limites no
[README do worker](worker/README.md).

## Limitações e bloqueios de produção

- Modelos foram instalados e identificados. Gemma passou em teste JSON curto; Qwen
  apresentou timeouts. Geração completa e desempenho permanecem pendentes.
- Conversão textual pode funcionar com dependências Python; OCR exige ferramentas
  externas. Não há fallback que invente resultados quando estiverem ausentes.
- A validade clínica, a classificação de dificuldade e o risco de pistas exigem
  aprovação docente. Os agentes não conferem aprovação médica.
- O isolamento do worker em subprocesso não é uma sandbox completa. A publicação
  depende de isolamento do sistema operacional, infraestrutura e revisão independente.
- O servidor HTTP incluído é de desenvolvimento; produção exige HTTPS, operação
  protegida, MFA privilegiado configurado e critérios institucionais homologados.
- Envio externo de e-mail, FIWARE, MQTT e Edge Computing não foram adicionados nesta etapa.
- Segurança não é absoluta e não houve certificação ASVS nem homologação hospitalar.

## Documentação técnica

- [Portais e demonstração NEXT_2026](docs/PORTAIS_NEXT_2026.md)
- [Segurança NEXT_2026 e pendências de liberação](docs/SEGURANCA_NEXT_2026.md)
- [Worker, OCR e modelos locais](worker/README.md)

- [Arquitetura do backend C++20](docs/ARQUITETURA_BACKEND_CPP20.md)
- [Pontuação pedagógica](docs/PONTUACAO_PEDAGOGICA.md)
- [Relatório PDF versionado](docs/RELATORIO_PDF_VERSIONADO.md)
- [Geração e importação de casos](docs/GERACAO_E_IMPORTACAO_DE_CASOS.md)
- [OpenAPI](backend/openapi/openapi.yaml)

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

Resultado técnico e limites: [Evidências da integração NEXT_2026](docs/ENTREGA_NEXT_2026.md).

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

O editor oferece a [rubrica opcional de dificuldade](docs/RUBRICA_DIFICULDADE.md),
com confirmação explícita e justificativa de divergência. Nenhum nível clínico
foi atribuído automaticamente a João ou Marina. O mapa completo está em
[Pendências NEXT](docs/PENDENCIAS_NEXT_2026.md).

Para carregar estas alterações, pare as instâncias antigas nos respectivos
terminais e execute novamente os scripts de API e worker. Não é necessária nova
migration além da014. Não apague a base nem rode duas APIs concorrentes no mesmo
banco. Modelos instalados não significam geração integral validada: Qwen ainda
apresentou timeout; detalhes e bloqueios estão no mapa de pendências.

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

### Situação real do Qwen

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

O usuário informou um PC Windows com16GB RAM e RTX3060/12GB VRAM; o teste nesse
destino ainda não foi executado. Roteiro e entrada sintética
estão em `docs/VALIDACAO_IA_OUTRA_MAQUINA.md` e
`worker/fixtures/synthetic-benchmark.request.json`. A instalação não prova capacidade.

A crítica pode ter contexto separado por `DEVSPHERE_OLLAMA_CRITIC_CONTEXT`; se
omitido, herda o contexto do gerador. Benchmark distingue RSS e alocação reportada
por `/api/ps`; ausência de amostra é `null`. Geração completa e revisão clínica
continuam pendentes, mesmo com testes de software aprovados.

## Auditoria de armazenamento

A ferramenta `tools/audit_source_storage.py` compara registros e PDFs somente em
leitura, identificando ausências, órfãos, divergências de hash e caminhos/links
inválidos. Não apaga nem repara fontes. Veja `docs/AUDITORIA_ARMAZENAMENTO.md` na
raiz do projeto para execução com snapshot/janela coerente, limites e códigos.
Não foi executada sobre a base pessoal nesta implementação.

## Teste da IA no PC Windows

Para continuar programando no Mac e testar Qwen/Gemma no PC Windows com RTX3060,
consulte `docs/VALIDACAO_IA_OUTRA_MAQUINA.md` na raiz. O roteiro PowerShell usa
fontes atuais e Python/Ollama locais, sem copiar o banco pessoal. Não requer API
C++20 nessa primeira etapa. A execução real nesse equipamento segue pendente.
