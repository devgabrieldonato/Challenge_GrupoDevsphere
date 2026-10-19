# Worker local — NEXT_2026

Processo auxiliar real e assíncrono para PDF, OCR, geração e busca de fontes. Não tem autoridade para aprovar ou publicar casos. O servidor C++20 autentica, autoriza e cria trabalhos; o worker acompanha a fila SQLite em processo separado.

## Preparação

Na raiz do projeto, crie um ambiente Python 3.11+ e instale dependências:

```bash
python3 -m venv .venv-worker
.venv-worker/bin/python -m pip install -r worker/requirements.txt
```

PDF textual utiliza pdfplumber, sobre pdfminer. Reaproveitamos do `Conversor_to_md` as regras de limite, validação por assinatura e referências por página, mas não importamos a interface Streamlit nem a dependência DOCX no processo do servidor. Tabelas são preservadas separadamente quando reconhecidas; sua ordem e fidelidade exigem revisão. PDFs escaneados requerem Poppler (`pdftoppm`) e Tesseract com idiomas `por+eng`. Documentos sem OCR disponível falham de forma recuperável; não produzem casos vazios.

Ollama deve estar instalado separadamente. Configure os modelos locais, sem API paga:

```bash
export DEVSPHERE_GENERATOR_MODEL=qwen3:8b
export DEVSPHERE_CRITIC_MODEL=gemma3:4b
export DEVSPHERE_OLLAMA_URL=http://127.0.0.1:11434
```

Os modelos não são baixados automaticamente. Confira licença e capacidade antes de instalar. Hardware encontrado nesta etapa: Apple M1, 8 GiB de RAM, aproximadamente 32 GiB livres. `gemma3:4b` é a variante inicial para crítica sequencial; `keep_alive=0` descarrega cada modelo após uso. Qwen3:8b com contexto suficiente para 40 itens pode pressionar a memória; benchmarking real é pendente. Não confundir implementação do cliente com comprovação de qualidade clínica ou desempenho.

## Inicialização

Execute as migrations pelo backend (incluindo `008_pipeline.sql`), inicie a API e mantenha o daemon em outro terminal:

```bash
.venv-worker/bin/python -m worker.run \
  --db backend/data/devsphere.db \
  --storage backend/data/sources
```

`--once` processa no máximo uma tarefa. O diretório de fontes é privado e deve corresponder ao armazenamento configurado na API. Não iniciar com banco inexistente.

## Contrato SQLite com C++20

O servidor cria `source_documents` com identificador aleatório, `owner_id` da sessão, caminho interno, nome original, SHA-256 e declarações de autorização/desidentificação. Somente `storage_path` controlado pelo backend é lido. O conteúdo real precisa iniciar com `%PDF-`; limite de 10 MiB e 100 páginas.

`worker_jobs` recebe `id`, `owner_id`, `document_id`, `operation` (`convert` ou `generate`), `idempotency_key` e `request_json`. Campos aceitos em `request_json`:

```json
{"pages":[1,2],"instructions":"Criar exercício fictício","query":"tema para buscar fontes aprovadas"}
```

O worker ignora caminhos, modelos, papel e conteúdo clínico recebidos diretamente nesse JSON. O backend deve conferir posse/grants, limites por usuário, tamanho das instruções, nonce de idempotência e permissões antes de inserir. `pages` usa números físicos de página começando em 1. Conversão atualiza Markdown, páginas e alertas somente se a fonte ainda estiver em `uploaded`.

Estados: `queued`, `running`, `completed`, `failed`, `cancelled`. O claim usa transação `BEGIN IMMEDIATE`; lease de 1900 segundos; timeout de 1800; expiração do trabalho após 24 horas; retentativas no máximo 3, por padrão 2, com atraso. Geração e crítica são sequenciais. `cancel_requested=1` permite cancelamento; subprocesso e filhos são encerrados. Falhas retornam código, mensagem pública e `retryable`, sem incluir conteúdo do PDF ou exceções do parser.

Saída da conversão em `result_json`: `markdown`, `pages`, `warnings`, `sourceHash`. Saída da geração: `case` no schema 1.0, `contribution` adaptada para `Database::saveContribution`, `criticReview` e `provenance`. `case.status` é sempre `awaiting_human_review`; nunca `approved`. O backend deve materializar uma versão em rascunho por ação autorizada e idempotente. O worker não escreve `case_versions` nem permite publicação.

A geração valida JSON Schema e `tools/validate_clinical_case.py`, exige 18 perguntas e 22 exames, e adapta scoring a priority +5, relevant +3, complementary +1, low_value -8 e inappropriate -12. Fonte de pontuação/versão definitiva continua no backend. Validade estrutural não equivale a validade médica.

Qwen gera; Gemma revisa coerência, fidelidade e risco de tags revelarem resposta. Ausência do crítico gera falha explícita, sem alegar revisão concluída. Ambos recebem somente dados sem autoridade de execução. Proveniência registra modelos, duração, versão de prompt e fontes; referências sintéticas precisam estar em `assumptions` e ser conferidas pelo docente.

## Biblioteca e RAG

Somente documentos `approved`, com declarações válidas e acesso por propriedade ou `document_grants`, são recuperados. O daemon sincroniza o índice antes de cada claim e após mudanças de Markdown/estado; a fonte retirada é excluída das consultas imediatamente mesmo antes de reindexar. A edição deve preservar cabeçalhos `## Página N`; texto sem paginação não recebe referência inventada. FTS5 usa parâmetros e tokens escapados, não executa consultas enviadas pelo usuário. Os trechos retornam documento, hash e página. Não existe treinamento automático nem inclusão de resultados não aprovados no acervo. Grants e estado das fontes são reconferidos antes de persistir resultado após inferência longa.

## Limites de isolamento

Cada trabalho roda em subprocesso sem credenciais do backend e sem conexão SQLite. Conversão bloqueia sockets Python e executa OCR com lista fixa de argumentos e timeouts; nunca utiliza shell. Há limites de CPU, arquivos, descritores e, em Linux, espaço de endereçamento. Esse mecanismo **não é sandbox de segurança completa**: o processo ainda possui o usuário do sistema operacional. Produção requer usuário dedicado, montagem somente dos arquivos necessários, política de rede e contêiner/sandbox do SO. Não expor worker ou Ollama na rede pública.

A entrada deve estar autorizada e previamente desidentificada. O código não garante anonimização. Salve Markdown como texto; não renderize HTML bruto gerado por fonte ou modelo.

## Testes

```bash
python3 -m unittest discover -s worker/tests -v
```

Fixtures de testes são sintéticas, bancos temporários e provedores falsos existem somente nos testes. Conversão real pode ser testada com o Python que contenha as dependências. Geração real requer Ollama e modelos; não há fallback silencioso para exemplos.

## Benchmark real

```bash
.venv-worker/bin/python -m worker.benchmark --input /caminho/privado/request.json --report /caminho/privado/benchmark.json
```

A entrada contém `markdown`, `sourceId`, `sourceHash`, `allowedReferences` (por exemplo `source:id#page:1`) e, opcionalmente, `instructions`. O relatório guarda tempo, contagem de itens, validação estrutural, modelos, RSS do cliente e soma aproximada do RSS dos processos Ollama. A soma pode contar páginas compartilhadas e perder picos; não mede VRAM. Se o serviço não estiver ativo, sai com erro e registra `provider_unavailable`; não gera caso fictício de teste. Não versionar documentos usados no benchmark nem relatórios com dados identificáveis.

## Dependências verificadas em 16/10/2026

Tesseract e Poppler foram encontrados no macOS com idiomas `por` e `eng`.
O teste `worker/tests/test_local_ocr.py` converteu um PDF composto somente por
imagem e preservou os valores `37.2`, `100 mg/dL`, referência à página e aviso de
revisão. Isso verifica o pipeline técnico em fixture sintética, sem certificar
fidelidade de qualquer documento clínico futuro. Ollama/modelos estavam pendentes naquele teste inicial; consulte o estado
atual ao final deste documento.

Licenças e versões devem acompanhar o artefato realmente instalado: execute
`ollama show qwen3:8b --license` e `ollama show gemma3:4b --license`, registre o
digest retornado por `/api/tags` e preserve os termos com a configuração da
implantação. Referências oficiais: [Qwen3](https://github.com/QwenLM/Qwen3),
[Gemma](https://ai.google.dev/gemma/terms) e [Ollama](https://github.com/ollama/ollama).
A seleção de modelo não autoriza uso de PDFs protegidos nem substitui revisão
institucional de licenças para distribuição/comercialização.

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

## Seleção de páginas e orçamento da inferência

A geração seleciona somente cabeçalhos físicos `## Página N` presentes nas
referências confiáveis da conversão. `pages: []` significa todas as páginas;
seleção explícita limita o conteúdo principal e as referências permitidas.
Páginas inexistentes/inventadas ou conteúdo sem paginação são rejeitados. Não há
corte silencioso de páginas ou inclusão de páginas excluídas via RAG da própria fonte.
Trechos suplementares autorizados entram inteiros se couberem; omissões ficam
registradas com motivo na proveniência. O hash original continua sendo usado
para detectar alterações da fonte na materialização.

Além das variáveis anteriores:

- `DEVSPHERE_SOURCE_MAX_BYTES=6000`: orçamento do texto de referência.
- `DEVSPHERE_OLLAMA_CRITIC_MAX_TOKENS=768`: reserva de saída da crítica, separada
  da geração, cujo limite padrão continua6000 tokens.

A estimativa operacional de contexto usa bytes UTF-8/3 e margem por mensagem.
Ela não substitui o tokenizer do modelo e não comprova ajuste ideal de contexto.
Se o orçamento não comportar prompt e saída, `select_fewer_pages` solicita seleção
menor antes da chamada ao modelo; não inventa resultado nem retorna caso vazio.
Reduza páginas ou ajuste limites após medição; não aumente reservas de memória
indiscriminadamente. Timeout e `generation_truncated` permanecem falhas recuperáveis.

26 testes worker passaram, incluindo páginas, orçamento, proveniência e OCR.
Geração real completa e crítica sobre caso integral continuam pendentes no
hardware atual. Veja ../docs/PENDENCIAS_NEXT_2026.md.

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
