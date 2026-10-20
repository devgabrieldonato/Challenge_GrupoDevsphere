# Validação local da IA no Windows

## Estado atual validado — 20/10/2026

Clone `C:\Users\vinic\Projetos\Challenge_GrupoDevsphere`, branch `NEXT_2026`.
Base Git da medição anterior à publicação: `ffb20eb9f4a580f0b8e16b9ff408541febd786a5`.
WSL2 ativo e Ubuntu 24.04.5 instalado em G:. Medições feitas antes do commit.
A publicação exclusiva de NEXT_2026 foi autorizada na etapa de documentação de
20/10; SHA/resultado final ficam no histórico Git e nos dois Notions após push.
Sem reset, merge ou alteração da main.

[Roteiro local macOS e Windows/WSL2](../README.md#executar-localmente-no-macos-e-windows):
preparo, configuração completa, contas/MFA, API, worker, interface e encerramento.

| Teste real v4 | Data | Resultado | Tempo total |
| --- | --- | --- | --- |
| RAG integrado WSL | 19/10/2026 | JSON válido, 18 perguntas/22 exames e Gemma real | 225,529 s |
| Textual WSL | 19/10/2026 | JSON válido, 18 perguntas/22 exames e Gemma real | 195,138 s |
| Textual Python Windows | 20/10/2026 | JSON válido, 18 perguntas/22 exames e Gemma real | 96,891 s |

O RAG real exerceu PDF→conversão→FTS/grant→Qwen→Gemma→validação. Conferiu hashes,
páginas e referências da fonte principal mais uma complementar. Após revogação,
a busca ocultou a fonte e o resultado derivado ficou restrito. Nenhum caso gerado pelos modelos foi
materializado, aprovado ou publicado. A fonte sintética da biblioteca foi
aprovada apenas para preparar o ensaio técnico de FTS, sem parecer clínico.

Perfil medido: Qwen3:8b/Gemma3:4b, contextos 8192/16384, saídas 6000/4096, lote 64,
timeout 900 s, temperatura 0,2, think=false, keep_alive=0; execução sequencial.
Digests, tokens, carga e duração de cada modelo estão no JSON de modelos.
Uso real CUDA/GPU confirmado pelos logs, ollama ps e NVIDIA-SMI. Sem OOM/timeout
nesses três fluxos v4. Não extrapolar para fontes maiores ou carga concorrente.

| Execução | Amostras | Pico RAM global usada (bytes) | Mínimo RAM disponível (bytes) | Pico total GPU (MiB) |
| --- | --- | --- | --- | --- |
| RAG WSL | 114 | 12725043200 | 2191720448 | 6817 |
| Textual WSL | 99 | 12675424256 | 2241339392 | 6797 |
| Textual Windows | 50 | 10753294336 | 4163469312 | 6742 |

RAM Windows/GPU são totais do sistema amostrados e incluem outros processos.
RAM Linux é da VM. size/size_vram são alocações informadas pelo provedor, outra
métrica; RSS ausente significa não medido. Monitores separados identificaram
modelos WSL e memória física Windows; não confundir o serviço Windows com o Linux.

As tentativas anteriores continuam preservadas: três críticas v1 truncadas,
três críticas v2 inválidas e RAG v3 inválido em 299,179 s. Aumentar tokens e pedir
concisão não resolveu sozinho. No v4, apenas a cópia do esquema enviada ao
Ollama perde o pattern sem âncoras; min/maxLength continuam no formato e o esquema
local integral continua rejeitando branco, excessos e campos inválidos, sem corte.
A leitura do [conversor llama.cppb11669](https://github.com/ggml-org/llama.cpp/blob/b11669/common/json-schema-to-grammar.cpp#L880-L895),
[fixado pelo Ollama 0.40.6](https://github.com/ollama/ollama/blob/v0.40.6/LLAMA_CPP_VERSION),
identificou prioridade de pattern e fallback irrestrito. A gramática interna do
binário não foi capturada. Crítica permanece resumo complementar não exaustivo,
com revisão humana item a item.

Correções verificadas: alvo SQLite compatível com CMake 3.20+, LF nos scripts Bash,
versão Tesseract com prefixo v e fonte OCR Windows; reenvio de cadastro após
corrigir senha; sete campos da devolutiva restaurados ao reabrir, rascunho
incompleto permitido, edição no mesmo ID, concluído somente leitura; três ações
consecutivas por Tab/Enter sem perder foco. Administrador consulta rascunho alheio
sem assumir autoria; aluno não vê rascunho. PUT/conclusão revalidam vínculo e
instituição (403), POST não sobrescreve autoria alheia/concluído (409), sem mutação.
Baselines dos defeitos e novas regressões foram preservados. OpenAPI atualizado.

Testes finais: CTest 2/2; worker Linux 61; Python Windows 53 selecionados (13,943 s); ferramentas 41 aprovados/1 skip opt-in, seguido do RAG real3/3 executado separadamente. Contrato estrutural6/6; PDF/OCR sintéticos reais; Chromium/Live Server e pontuação legada 9/9 passaram. Regressão ampla e focalizada da interface repetidas em 20/10 após a correção final de autoria.


Versões Linux: Python 3.12.3, GCC 13.3, CMake 3.28.3, SQLite 3.45.1, OpenSSL 3.0.13,
Tesseract 5.3.4 com por/eng, Poppler 24.02, Node 24.22.0, Chromium 151 e Ollama 0.40.6.
Windows preserva Python 3.12.1, driver 596.36, Ollama 0.40.6, Tesseract 5.5.3.20260724
por/eng e Poppler 26.07.0. Venv Linux separado em /home/pacientevirtual/.venvs;
build C++20 em /home/pacientevirtual/build/pacientevirtual/backend.
Pesos Windows reutilizados em /mnt/c/Users/vinic/.ollama/models, sem novo download
de modelos. Ollama Linux próprio usou loopback, NOPRUNE/NO_CLOUD e limites 1/1;
nenhuma rede espelhada, firewall, proteção Windows ou driver NVIDIA Linux alterado.

### Repetir neste computador

No PowerShell, com Ollama Windows já disponível, use o bloco completo da seção
[Benchmark real](VALIDACAO_IA_OUTRA_MAQUINA.md#benchmark-real). Ele configura o
perfil v4 e nome novo de relatório. Nenhum helper ignorado é necessário.

Para RAG, conferir antes se já existe Ollama Linux 11434; iniciar em outro terminal
PowerShell se ausente, usando o mesmo ambiente efetivamente testado:

```powershell
wsl -d PacienteVirtual-Ubuntu2404 -u pacientevirtual --exec /usr/bin/env -i HOME=/home/pacientevirtual PATH=/usr/local/bin:/usr/bin:/bin OLLAMA_HOST=127.0.0.1:11434 OLLAMA_MODELS=/mnt/c/Users/vinic/.ollama/models OLLAMA_NOPRUNE=1 OLLAMA_NO_CLOUD=1 OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_LOADED_MODELS=1 /home/pacientevirtual/deps/ollama-0.40.6/bin/ollama serve
```

Em outro PowerShell na raiz do clone:

```powershell
wsl -d PacienteVirtual-Ubuntu2404 -u pacientevirtual --exec /usr/bin/env DEVSPHERE_TEST_API_BIN=/home/pacientevirtual/build/pacientevirtual/backend/devsphere-api DEVSPHERE_TEST_REAL_AI=1 DEVSPHERE_OLLAMA_CRITIC_MAX_TOKENS=4096 /home/pacientevirtual/.venvs/pacientevirtual/bin/python -m unittest tools.tests.test_real_ai_pipeline -v
wsl -d PacienteVirtual-Ubuntu2404 -u pacientevirtual --exec /usr/bin/env DEVSPHERE_PYTHON=/home/pacientevirtual/.venvs/pacientevirtual/bin/python /usr/bin/ctest --test-dir /home/pacientevirtual/build/pacientevirtual/backend --output-on-failure
```

CTest/PDF exige DEVSPHERE_PYTHON explícito: tentativa sem esse ambiente falhou por
ReportLab ausente no Python de sistema; a repetição com o venv passou. As suítes
Python usam PYTHONPATH da raiz/worker/tests e DEVSPHERE_TEST_API_BIN/TEST_BINARY
apontando ao build acima. Rodar testes unitários com ambiente limpo, sem herdar
limites do benchmark. API/worker devem compartilhar banco/fontes explícitos em
ext4. start-local-api.sh usa repo/build, diferente do build /home testado; não
presumir esses caminhos iguais. Scripts Bash rodam dentro do WSL, não no PowerShell.

### Repetir as suítes completas sem inferência

Abra o shell Linux a partir do PowerShell:

```powershell
wsl -d PacienteVirtual-Ubuntu2404 -u pacientevirtual --exec /bin/bash --noprofile --norc
```

Dentro desse shell, configure o mesmo ambiente dos testes. Todos os bancos dos
ensaios são temporários; não configure o banco pessoal:

```bash
cd /mnt/c/Users/vinic/Projetos/Challenge_GrupoDevsphere
export PATH=/home/pacientevirtual/deps/node-v24.22.0-linux-x64/bin:/home/pacientevirtual/.venvs/pacientevirtual/bin:/usr/local/bin:/usr/bin:/bin
export DEVSPHERE_PYTHON=/home/pacientevirtual/.venvs/pacientevirtual/bin/python
export DEVSPHERE_TEST_API_BIN=/home/pacientevirtual/build/pacientevirtual/backend/devsphere-api
export DEVSPHERE_TEST_BINARY="$DEVSPHERE_TEST_API_BIN"
export PYTHONPATH="$PWD/worker/tests:$PWD"
export PLAYWRIGHT_MODULE=/mnt/c/Users/vinic/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright
export LIVE_SERVER_MODULE=/mnt/c/Users/vinic/.vscode/extensions/ritwickdey.liveserver-5.7.10/node_modules/live-server
# Os testes de orçamento conferem defaults; IA real é habilitada separadamente.
unset DEVSPHERE_TEST_REAL_AI DEVSPHERE_OLLAMA_URL DEVSPHERE_OLLAMA_CONTEXT DEVSPHERE_OLLAMA_CRITIC_CONTEXT DEVSPHERE_OLLAMA_MAX_TOKENS DEVSPHERE_OLLAMA_CRITIC_MAX_TOKENS DEVSPHERE_OLLAMA_BATCH DEVSPHERE_OLLAMA_TIMEOUT
cmake -S backend -B /home/pacientevirtual/build/pacientevirtual/backend -DBUILD_TESTING=ON
cmake --build /home/pacientevirtual/build/pacientevirtual/backend -j2
ctest --test-dir /home/pacientevirtual/build/pacientevirtual/backend --output-on-failure
"$DEVSPHERE_PYTHON" -W error::ResourceWarning -m unittest discover -s worker/tests -v
"$DEVSPHERE_PYTHON" -m unittest discover -s tools -p test_validate_clinical_case.py -v
"$DEVSPHERE_PYTHON" -m unittest discover -s tools/tests -v
node tools/tests/browser_next.cjs
node tools/tests/browser_pending_usability.cjs
node tools/tests/browser_live_server.cjs --guard-self-test
node tools/tests/browser_live_server.cjs
```

O teste Live Server exige8080/5501 livres e retorna77 quando indisponíveis;
isso não é aprovação. Não encerre serviços alheios para liberar as portas.
O RAG real deve rodar separadamente, com o Ollama Linux local disponível,
conforme comando PowerShell anterior.

### Arquivos alterados e estado Git

Snapshot histórico do working tree medido antes de publicar: a base remota
ffb20eb sozinha não contém os patches desta revisão. No inventário pré-documentação havia 27 caminhos modificados e 3 testes novos.
Esse é o estado histórico da medição, não uma declaração do estado Git após publicação.
Ambientes, modelos, relatórios e bancos permanecem fora do versionamento.
Hashes do código final constam no JSON de modelos.

| Grupo | Arquivos |
| --- | --- |
| Portabilidade | `.gitattributes`, `backend/CMakeLists.txt`, `backend/scripts/create-dev-users.sh`, `tools/check-local-ai.sh`, `tools/start-local-api.sh`, `tools/start-local-ollama.sh`, `tools/start-worker.sh` |
| Backend/contrato | `backend/src/database.cpp`, `backend/src/http_server.cpp`, `backend/openapi/openapi.yaml`, `tools/tests/test_next_http.py` |
| Interface | `frontend/pages/teacher-feedback.html`, `frontend/scripts/auth/register-page.js`, `frontend/scripts/services/feedback-service.js`, `frontend/scripts/student/clinical-session.js`, `frontend/scripts/teacher/feedback.js` |
| IA/diagnóstico | `worker/core.py`, `worker/doctor.py`, `worker/tests/test_doctor.py`, `worker/tests/test_local_ocr.py`, `worker/tests/test_ollama_protocol.py` |
| Novos testes | `tools/tests/browser_public_forms.cjs`, `tools/tests/browser_pending_usability.cjs`, `tools/tests/test_real_ai_pipeline.py` |
| Documentação | `README.md`, `backend/README.md`, `worker/README.md`, `docs/VALIDACAO_IA_OUTRA_MAQUINA.md`, `docs/MODELOS_LOCAIS_NEXT_2026.json`, `docs/PENDENCIAS_NEXT_2026.md` |

### Pendências que permanecem

Revisão clínica/pedagógica por versão, tags/rubrica, licenças e regras institucionais;
segurança independente e isolamento/infraestrutura de produção; fontes maiores,
repetibilidade ampla, carga e recuperação; acessibilidade assistiva/zoom/contraste,
navegadores adicionais e cenários adicionais de rede/sessão. Quotas/reserva em
bytes e reconciliação de órfãos não foram implementadas nesta tarefa. Sem base
institucional ou serviço permanente provisionado. Não há garantia de 100% de
usabilidade, homologação ou aprovação clínica automática.


### Conferência do roteiro local — 20/10/2026

READMEs raiz/backend/worker/tools atualizados com preparo macOS e PowerShell/WSL,
configuração explícita por terminal, contas sem senha no histórico, MFA privado,
Ollama loopback, API C++20, worker, interface, saúde/logs e encerramento.
Duas revisões independentes conferiram comandos e corrigiram isolamento das
variáveis dos unitários, seis testes estruturais, âncora do benchmark e limite
Linux do ensaio RAG (/proc). macOS revisado por leitura, sem novo reteste.

Validação adicional: 52 blocos Bash com sintaxe válida; links locais dos quatro
READMEs e JSON de modelos válidos; `pip check` Linux sem conflitos. Smoke com
SQLite sintético temporário passou migrations, `worker.run --check`, health e
HTML da API. Windows acessou o loopback WSL em 18087. Servidor próprio encerrado;
nenhuma inferência, conta pessoal ou alteração de firewall. Porta 18087 foi apenas
do ensaio; a inicialização normal permanece 8080. Isso não equivale a testar
manualmente todo navegador Windows. Relatório local ignorado:
`validation-reports/documentation-smoke-20261020-130724.json`.

A publicação desta revisão exige atualização e leitura de confirmação dos dois
Notions antes do commit; resultado e SHA são acrescentados lá após push/fetch.
Os resultados anteriores descrevem snapshots da validação e continuam históricos.

## Histórico das rodadas anteriores

## Continuação dos testes e WSL — 19/10/2026

A repetição expôs instabilidade: `next2026-v1` concluiu três de seis tentativas;
as outras três truncaram a crítica, inclusive com teto 2048 ou 4096. Aumentar o
teto sozinho não resolveu. Todos os relatórios foram preservados.

Contrato crítico limitado implementado (`next2026-v2`): até 12 alertas de 240
caracteres e dois resumos de 400, sem campos adicionais/vazios, com validação local
integral e sem recorte. É resumo complementar não exaustivo e exige revisão humana
item a item. Os 51 testes selecionados passaram em 11,879 s. As tentativas reais
abaixo mostram que a correção continua experimental, sem estabilidade comprovada.

| Prompt | Teto da crítica | Resultado | Tempo (s) | Relatório local |
| --- | --- | --- | --- | --- |
| next2026-v1 | 768 | generation_truncated | 269.328 | `validation-reports/benchmark-rtx3060.json` |
| next2026-v1 | 2048 | completo 18/22 | 140.422 | `validation-reports/benchmark-rtx3060-critic2048.json` |
| next2026-v1 | 2048 | generation_truncated | 148.719 | `validation-reports/benchmark-repeatability-20261019-1.json` |
| next2026-v1 | 2048 | completo 18/22 | 124.734 | `validation-reports/benchmark-repeatability-20261019-2.json` |
| next2026-v1 | 4096 | generation_truncated | 155.265 | `validation-reports/benchmark-critic4096-repeat-20261019-1.json` |
| next2026-v1 | 4096 | completo 18/22 | 126.641 | `validation-reports/benchmark-critic4096-repeat-20261019-2.json` |
| next2026-v2 | 4096 | invalid_critic | 111.422 | `validation-reports/benchmark-bounded-v2-20261019-1.json` |
| next2026-v2 | 4096 | invalid_critic | 141.437 | `validation-reports/benchmark-bounded-v2-20261019-2.json` |
| next2026-v2 | 4096 | invalid_critic | 109.594 | `validation-reports/benchmark-bounded-v2-diagnostic-20261019.json` |

Diagnóstico v2: Gemma concluiu 452 tokens sem truncar; um dos cinco alertas tinha 265 caracteres para limite 240, resumos com 377/320. Rejeição maxLength, sem campos extras/vazios. Não é falta de memória; ajustar concisão e repetir no retorno, sem recorte ou relaxamento silencioso.

Configuração v2: Qwen3:8b/Gemma3:4b, contextos 8192/16384, saídas 6000/4096,
batch 64, timeout 900 s, temperatura 0,2, think=false, execução sequencial.
Diagnóstico local registra apenas tipos, contagens, comprimentos e restrições,
nunca texto da fonte/caso/crítica. Sem OOM/timeout observado nessas rodadas.
RAM global, ocupação total NVIDIA e alocação do provedor são medidas distintas;
valores por execução estão no JSON de modelos. RSS Windows não medido.

Cadastro corrigido após reproduzir bloqueio pela validação nativa: 16 cenários
Chrome 155 (aluno/docente, 320/375/768/1280 px, corrigindo cada senha) passaram em
5,400 s, sem chamadas à API. Não comprova cadastro integrado. Seis testes do
contrato clínico e um de backup seguro passaram. Worker completo: 48 aprovações
e um erro de importação `resource`; auditoria de fontes: uma falha e cinco erros
POSIX/symlink no Windows. São falhas de execução, sem SKIP fictício ou alteração
de proteções. Guard Live Server passou; fluxo integrado ainda depende do Linux.

WSL2/Ubuntu e reinício autorizados. Runtime 3.0.3.0 e VirtualMachinePlatform
instalados; Ubuntu ainda não registrado por `HCS_E_SERVICE_NOT_AVAILABLE` antes
do reinício. Imagem oficial verificada já em G:. Sem rede espelhada, firewall
alterado ou porta exposta. Após reiniciar: registrar Ubuntu, preparar dependências
Linux, compilar C++20 e executar CTest, worker/tools, Live Server e o novo ensaio
opt-in `tools.tests.test_real_ai_pipeline`. Ele usa PDFs sintéticos, FTS/grants,
inferência real, rastreabilidade e revogação; foi preparado/revisado, não executado.

Não há garantia de 100% de usabilidade. Persistem estabilidade da crítica,
plataforma completa, acessibilidade/fluxos de erro e revisão clínica/institucional.
Naquela etapa, sem commit/push/merge. Nenhum caso gerado foi materializado, aprovado ou publicado.

Registro técnico de 19/10/2026. A primeira etapa executa somente Python/Ollama,
com a fonte inteiramente sintética `worker/fixtures/synthetic-benchmark.request.json`.
Não utiliza o banco pessoal, documentos clínicos reais nem a API C++20.

## Repositório e ambiente verificados

Clone: `C:\Users\vinic\Projetos\Challenge_GrupoDevsphere`, remoto
`https://github.com/devgabrieldonato/Challenge_GrupoDevsphere.git`, branch
`NEXT_2026`. O remoto consultado nesta rodada aponta para
`ffb20eb9f4a580f0b8e16b9ff408541febd786a5`; esse identificador é uma referência
da consulta, não uma instrução para reset. Consulte novamente antes de continuar.
Na preparação inicial ainda não havia autorização de commit/push. Em 20/10 o
usuário autorizou commit/push/fetch somente de NEXT_2026; merge/main continuam fora do escopo.

| Componente | Evidência desta máquina |
| --- | --- |
| Sistema | Windows 11 Pro 26H2, build 26300.9711 |
| CPU | AMD Ryzen 7 5700G, 16 threads |
| RAM física utilizável | 14.916.763.648 bytes; 2.727.272.448 bytes disponíveis na observação inicial |
| GPU | NVIDIA GeForce RTX 3060, 12.288 MiB de VRAM |
| Driver NVIDIA | 596.36 |
| Git | 2.46.2 |
| Python do ambiente | 3.12.1; o seletor padrão `py -3` aponta para 3.14 |
| Ollama | 0.40.6, instalação existente aproveitada, assinatura Ollama Inc. válida; endpoint local `http://127.0.0.1:11434` |
| Poppler | 26.07.0, já disponível no runtime Codex; não instalado novamente |
| Dependências Python | pypdf 6.21.1, pdfplumber 0.11.10, jsonschema 4.26.0, ReportLab 5.0.1 |

O inventário não comprova capacidade de geração. A disponibilidade de RAM varia
durante a execução. Modelos, digests e tamanhos efetivamente instalados devem ser
conferidos no doctor e em `MODELOS_LOCAIS_NEXT_2026.json` após a integração dos resultados.

## Preparar ou retomar no PowerShell

Para uma instalação nova, confira primeiro espaço livre, versões e instalações
existentes. Não sobrescreva uma pasta existente. O clone atual já foi preparado;
os comandos abaixo documentam a reprodução em uma pasta ainda inexistente.

```powershell
New-Item -ItemType Directory -Path "$HOME\Projetos" -Force | Out-Null
Set-Location "$HOME\Projetos"
git clone --branch NEXT_2026 --single-branch https://github.com/devgabrieldonato/Challenge_GrupoDevsphere.git
Set-Location .\Challenge_GrupoDevsphere
git remote -v
git branch --show-current
git status
git fetch origin NEXT_2026
git log -1 --oneline
git log -1 --oneline origin/NEXT_2026

# Usa a instalação compatível confirmada; não copia o ambiente do Mac.
& 'C:\Users\vinic\AppData\Local\Programs\Python\Python312\python.exe' -m venv .venv-worker
& .\.venv-worker\Scripts\python.exe -m pip install -r worker\requirements.txt
# ReportLab é necessário às fixtures de PDF textual e ao PDF oficial da plataforma.
& .\.venv-worker\Scripts\python.exe -m pip install reportlab

ollama --version
nvidia-smi
Get-PSDrive -PSProvider FileSystem
# Baixe somente modelos ausentes, depois de conferir espaço.
ollama pull qwen3:8b
ollama pull gemma3:4b
ollama list
& .\.venv-worker\Scripts\python.exe -m worker.doctor --json
```

Nesta sessão, um serviço próprio foi iniciado quando a API estava ausente,
com `OLLAMA_HOST=127.0.0.1:11434`, `OLLAMA_NUM_PARALLEL=1` e
`OLLAMA_MAX_LOADED_MODELS=1`. Uma tentativa posterior do aplicativo de usar a mesma
porta não criou segundo listener. Ao terminar, somente o serviço temporário criado
pelo teste foi encerrado; o aplicativo existente assumiu11434, com bind
127.0.0.1 e Ollama 0.40.6 confirmados. Os limites 1/1 acima são do perfil medido,
não configurações permanentes aplicadas ao usuário. Não ative outro serviço se o Ollama já atende a porta11434. Mantenha
o endpoint restrito a loopback, sem acesso pela rede. Não é necessário ativar o
venv nem alterar ExecutionPolicy. Tesseract/Poppler ausentes podem deixar o doctor
indisponível, embora o benchmark textual permaneça executável.

O doctor final retornou `status: available`, sem issues, com os dois modelos
instalados e nenhum residente. Foi corrigido o parser da versão Tesseract para
aceitar o prefixo `v` do Windows; a regressão falhou antes da correção e passou
depois. A RAM física continua `null` no doctor Windows e foi medida externamente.

Fontes de instalação/requisitos: [Ollama para Windows](https://docs.ollama.com/windows),
[GPUs compatíveis](https://docs.ollama.com/gpu),
[operação e memória do Ollama](https://docs.ollama.com/faq),
[diagnóstico do Ollama](https://docs.ollama.com/troubleshooting),
[Qwen3:8b](https://ollama.com/library/qwen3:8b) e
[Gemma3:4b](https://ollama.com/library/gemma3:4b).
Reutilize instalações compatíveis; não instale CUDA Toolkit sem necessidade demonstrada.

<a id="benchmark-real"></a>

## Geração completa e crítica sequencial

Os argumentos e limites foram conferidos no código atual. Não execute outra
inferência concorrente. O adaptador solicita `keep_alive=0` após cada chamada,
usa temperatura 0,2 e `think=false`; Qwen gera e Gemma recebe o caso completo
para avaliação complementar. A crítica não aprova nem publica o caso.

```powershell
Set-Location 'C:\Users\vinic\Projetos\Challenge_GrupoDevsphere'
$env:DEVSPHERE_OLLAMA_URL = 'http://127.0.0.1:11434'
$env:DEVSPHERE_GENERATOR_MODEL = 'qwen3:8b'
$env:DEVSPHERE_CRITIC_MODEL = 'gemma3:4b'
$env:DEVSPHERE_OLLAMA_CONTEXT = '8192'
$env:DEVSPHERE_OLLAMA_CRITIC_CONTEXT = '16384'
$env:DEVSPHERE_OLLAMA_MAX_TOKENS = '6000'
# Perfil next2026-v4: crítica real concluída no Windows e WSL; histórico v2 preservado abaixo.
$env:DEVSPHERE_OLLAMA_CRITIC_MAX_TOKENS = '4096'
$env:DEVSPHERE_OLLAMA_BATCH = '64'
$env:DEVSPHERE_OLLAMA_TIMEOUT = '900'
$report = "validation-reports\benchmark-v4-$(Get-Date -Format yyyyMMdd-HHmmss)-$([guid]::NewGuid().ToString('N')).json"
if (Test-Path -LiteralPath $report) { throw "Relatório já existe; escolha outro nome." }
& .\.venv-worker\Scripts\python.exe -m worker.benchmark --input worker\fixtures\synthetic-benchmark.request.json --report $report
Get-Content -LiteralPath $report

# Em outro PowerShell, durante a execução:
ollama ps
nvidia-smi
```

Antes de repetir, confira se o nome de relatório ainda não existe: o benchmark
sobrescreve uma saída existente. Um helper local ignorado,
`validation-reports/repeat-benchmark.ps1`, configura os parâmetros de cliente medidos
e cria nome novo por data/hora, recusando sobrescrita.
Para repetir manualmente, escolha outro nome de relatório, por exemplo
`validation-reports\benchmark-rtx3060-repeat.json`, preservando a primeira execução.
Confirme antes quais modelos/processos ainda consomem recursos. Ajustes decorrentes
de falha precisam registrar configuração e causa; a quantidade18/22 permanece obrigatória.

Primeira execução real: **falhou** em 269,328 s com `generation_truncated` na
crítica. Qwen concluiu 3981 tokens de saída e passou na validação; Gemma recebeu
3494 tokens de entrada, executou 768 de saída e atingiu o teto configurado. O
adaptador rejeitou o corte. Esses números intermediários vêm do log local do
executor; o relatório de falha não retém proveniência de chamadas anteriores.
Não houve OOM observado. Relatório preservado: `validation-reports/benchmark-rtx3060.json`.
A telemetria física obteve 135 amostras: pico global de RAM usada9.986.273.280 bytes,
mínimo disponível4.930.490.368 bytes e pico total da GPU7222 MiB.

Uma repetição completa foi iniciada alterando somente
`DEVSPHERE_OLLAMA_CRITIC_MAX_TOKENS=2048`, compatível com o código. A primeira
execução não preserva o caso gerado para retomar somente a crítica, por isso é
necessário refazer o fluxo com a mesma fixture. Relatório separado:
`validation-reports/benchmark-rtx3060-critic2048.json`. **Concluiu em 140,422 s**,
com JSON válido,40 itens/18 perguntas/22 exames e crítica Gemma real sem corte.
Qwen:110,012 s informados pelo executor,762 tokens de entrada/4308 de saída;
Gemma:30,011 s,3783 de entrada/519 de saída. Incluem carga dos modelos,14,810 s e
13,058 s respectivamente. O mesmo código validou campos obrigatórios,
dependências/evidências, hipóteses/desfecho e referências permitidas antes da crítica.
`clinicalValidation` permanece `pending_human_review`.

Nos dois estágios `ollama ps` indicou100% GPU; logs confirmaram37/37 camadas Qwen
como CUDA e35/35 Gemma. Na execução completa,71 amostras físicas com intervalo
máximo2,017 s registraram pico total da GPU7225 MiB (Qwen7225/Gemma5164 nas amostras
com cada modelo residente), utilização máxima97%, pico global de RAM usada
10.088.321.024 bytes e mínimo disponível4.828.442.624 bytes. São observações
amostradas do sistema, não consumo exclusivo dos modelos nem garantia de pico absoluto.
Ollama reportou alocação máxima6.091.995.873 bytes em size/size_vram; isso é uma
métrica distinta. RSS do cliente/processos ficou não medido (`null`).

Hashes conferidos: fixture JSON SHA256
`b41dc08037f286fe6e8d283b0ce8bf7d011563a73a56c210aaf8ce8c085846da`;
Markdown sintético SHA256
`b46ec62c24af0a2e768f008ea060ce05dd42c3fa55002063d33c50f16e7c436a`.
Referência permitida: `source:synthetic-benchmark#page:1`. O relatório sanitizado
não salva caso nem texto da crítica; a validação de referências ocorre no código.
Não houve acesso ao banco, aprovação, materialização ou publicação.
Uma execução completa passou; repetibilidade ampla, fontes maiores e RAG real
na plataforma completa permanecem pendentes.

O aceite técnico exige `status: completed`, JSON válido no contrato, exatamente18
perguntas e22 exames, IDs/dependências/evidências/desfecho válidos, referências
autorizadas e proveniência real dos dois modelos. Resposta truncada, sem conclusão
do protocolo, modelo inesperado ou JSON inválido são falhas. Repetir uma execução
bem-sucedida permite avaliar estabilidade em outra rodada; não foi feito ensaio estatístico.

## Métricas e testes locais

No Python nativo Windows, o doctor não mede RAM por seu caminho POSIX e pode
registrar `physicalMemoryBytes: null`. O benchmark tolera ausência de `resource`;
RSS do cliente e soma RSS Ollama podem ficar `null`. Isso significa **não medido**,
nunca consumo zero. `size`/`size_vram` de `/api/ps` são alocações informadas pelo
executor e não medições físicas independentes.

Nesta rodada foi preparado monitor local ignorado pelo Git, em
`validation-reports/monitor-benchmark.ps1`. Ele coleta RAM física por
`GlobalMemoryStatusEx`, telemetria NVIDIA por `nvidia-smi` e inventário local
do Ollama. Integre seus resultados separadamente, incluindo intervalo e limitações
de amostragem. As consultas podem alongar o intervalo; conferir timestamps.
A VRAM observada é o total ocupado na GPU, incluindo desktop e outros processos;
RAM usada é global do sistema. Picos entre amostras podem ser perdidos. Não versionar monitor,
relatórios brutos, logs sensíveis, modelos, ambientes ou documentos privados.

Foram executados 48 testes independentes do daemon POSIX, incluindo4 de PDF textual
sintético e1 OCR real de imagem sintética, com aprovação em 11,293 s. Esses testes verificam software e extração; os provedores
falsos usados nos testes unitários não substituem o benchmark real.

```powershell
$env:PYTHONPATH = "$PWD\worker\tests"
& .\.venv-worker\Scripts\python.exe -m unittest worker.tests.test_generation worker.tests.test_ollama_protocol worker.tests.test_page_budget worker.tests.test_benchmark_metrics worker.tests.test_doctor worker.tests.test_pdf_validation worker.tests.test_local_ocr -v
```

PDF digitalizado/OCR: **passou** com Tesseract 5.5.3.20260724, idiomas `por`/`eng`
e Poppler 26.07.0. O teste real preservou37.2,100 mg/dL, referência à página1 e aviso
para revisão humana. Os4 testes de PDF textual exercitaram seleção física,
seleção vazia, proteção por senha, arquivo falso e limite de 101 páginas. A fonte
Arial do Windows foi acrescentada ao teste para evitar SKIP indevido.
Extração e OCR não representam interpretação nem aprovação clínica.

Tesseract foi instalado para o usuário em
`C:\Users\vinic\AppData\Local\Programs\Tesseract-OCR`, com instalador da release5.5.3
indicada pelo projeto oficial. SHA256 do instalador conferiu com o digest do asset
GitHub: `bee9e3434bd94fd65387d9be28cd467a41f61b1275383b55b0f59a1331270ae4`.
A verificação Authenticode retornou certificado fora de validade; a procedência
foi conferida pelo hash da release oficial. Nenhuma proteção Windows foi desativada.
Tesseract e o diretório Poppler existente foram acrescentados ao PATH do usuário
preservando as entradas anteriores. Abra um PowerShell novo para herdá-los.

```powershell
# Instalação executada nesta máquina, em destino previamente inexistente:
# $taskInstaller aponta para o arquivo oficial já baixado/verificado.
Start-Process -FilePath $taskInstaller -ArgumentList '/S','/CurrentUser',"/D=$env:LOCALAPPDATA\Programs\Tesseract-OCR" -WindowStyle Hidden -Wait
tesseract --version
tesseract --list-langs
pdftoppm -v
```

Poppler já foi localizado em
`C:\Users\vinic\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe`.
Seu diretório precisa constar no PATH da sessão de teste. Para Tesseract, foram
consultadas a [documentação do projeto](https://tesseract-ocr.github.io/tessdoc/Installation.html)
e a [distribuição Windows UB Mannheim](https://github.com/UB-Mannheim/tesseract/wiki).

## Plataforma completa e pendências humanas

O benchmark não exige compilar a API C++20. A plataforma completa ainda não foi
validada no Windows nativo: `worker.run` importa `resource` e usa limites/sinais
POSIX; o backend possui sockets POSIX e subprocessos com `fork`/`waitpid`.
Os scripts `.sh` não são comandos PowerShell. Não anunciar compatibilidade nativa
com base no benchmark. A instalação de WSL2/Ubuntu foi autorizada pelo usuário nesta rodada. O runtime
WSL 3.0.3.0 e kernel 6.18.54.1-1 foram instalados; VirtualMachinePlatform está
habilitado, mas o hypervisor ainda não iniciou e o Windows indica reinicialização
pendente. A distribuição Ubuntu ainda não está instalada: a tentativa retornou
`HCS_E_SERVICE_NOT_AVAILABLE`. Não confundir runtime instalado com plataforma pronta.

O próximo passo autorizado para a plataforma completa, após salvar os trabalhos e reiniciar, é
preparar uma distribuição WSL2/Linux com compilador C++20, CMake, SQLite e ambiente
Python próprios; compilar/testar o backend e criar somente base sintética isolada.
API, daemon e Ollama devem então ser validados nesse ambiente com endpoint local,
incluindo acesso à GPU e comportamento de rede. O Python/venv Windows não deve ser
reutilizado no Linux. Não presumir que loopback entre WSL e host funcione sem
verificação; não ampliar bind para contornar isso. Consulte a
[instalação oficial do WSL](https://learn.microsoft.com/en-us/windows/wsl/install).
A imagem oficial Ubuntu 24.04.5 foi baixada e conferida pelo SHA256 do manifesto
Microsoft: `bb415d824822c4b878125729af451a5d18fb13d1cf5cbed9a7393ad64ac6039e`.
Está em `G:\WSL\ubuntu-24.04.5-wsl-amd64.wsl`, com 388.975.696 bytes;
a distribuição será criada em G: para preservar espaço em C:. Após reiniciar,
conferir estado/lista antes de repetir, sem sobrescrever distribuição existente:

```powershell
& 'C:\Program Files\WSL\wsl.exe' --status
& 'C:\Program Files\WSL\wsl.exe' --list --verbose
& 'C:\Program Files\WSL\wsl.exe' --install --from-file G:\WSL\ubuntu-24.04.5-wsl-amd64.wsl --name PacienteVirtual-Ubuntu2404 --location G:\WSL\PacienteVirtual-Ubuntu2404 --no-launch
```

Nenhuma configuração de rede espelhada foi aplicada, nem firewall/proteção alterado.
O acesso WSL ao Ollama Windows em loopback não foi validado. Se necessário, usar
Ollama Linux restrito ao loopback, reutilizando os pesos existentes sem download
ou inferência concorrente; confirmar suporte à GPU antes dos testes. A preparação
Linux e os testes completos permanecem pendentes; instalação não comprova usabilidade.

Continuam pendentes revisão médica/pedagógica identificável por versão, fidelidade
das fontes, hipóteses/desfecho/pontuação, classificação e risco de pistas, licenças
e regras institucionais, segurança independente e isolamento/operação final.
Concordância Qwen/Gemma e validação estrutural não resolvem essas pendências.
Nenhum caso deve ser aprovado ou publicado automaticamente.

## Histórico resumido do M1/8 GB

No Mac com Ollama0.40.5, Qwen3:8b respondeu JSON técnico curto com contexto4096
em 18,736 s no perfil experimental isolado. O caso completo com contexto8192 falhou
com `kIOGPUCommandBufferCallbackErrorOutOfMemory`; `provider_incomplete` rejeitou
a resposta em 15,832 s e Gemma não foi alcançado. Isso não comprova falha universal
dos modelos nem sucesso no Windows. O teste curto Gemma anterior também não
representa avaliação do caso completo. As evidências históricas permanecem em
`MODELOS_LOCAIS_NEXT_2026.json`.
