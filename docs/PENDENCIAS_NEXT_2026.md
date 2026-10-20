# Pendências e execução — NEXT_2026

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

### Evolução de acessibilidade — 20/10/2026

Tema escuro compartilhado, contraste/foco e reflow implementados. Lighthouse
atingiu 100/100 nas oito combinações representativas; axe, teclado, zoom real e
funções oficiais do Web Developer foram ampliados com dados sintéticos.
Relato do Narrador aceito pelo usuário ainda aguardado; testes em outros leitores
reais, navegadores e acessibilidade do PDF exportado permanecem pendentes.
Ver [escopo e evidências](ACESSIBILIDADE_NEXT_2026.md). Não interpretar a lista
histórica abaixo como ausência de todos esses avanços, nem as notas como certificação.

### Identidade institucional — 20/10/2026

Repaginação local com Bootstrap Grid 5.3.8 e Bootstrap Icons 1.13.2, logos originais
FIAP/Faculdade Moinhos de Vento, rodapé solicitado nas 18 entradas e temas mantidos.
Nova auditoria: 36 cenários, 175 checks, zero violações e oito Lighthouse 100/100;
Web Developer/zoom real e regressão funcional passaram. Ver seção final de
[acessibilidade e evidências](ACESSIBILIDADE_NEXT_2026.md). Cabeçalho final transparente,
com Paciente Virtual ampliado e marcas brancas via CSS no tema escuro.

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

## Atualização Windows — 19/10/2026

Clone remoto `NEXT_2026`, commit `ffb20eb9f4a580f0b8e16b9ff408541febd786a5`
confirmado sem atualização posterior na consulta. O pacote inicial sem Git foi preservado.
O histórico abaixo refere-se às rodadas anteriores no Mac.

- Concluído: ambiente Windows/Python 3.12.1/Ollama 0.40.6/driver 596.36 verificado;
  Qwen3:8b e Gemma3:4b instalados com digests confirmados, idênticos ao histórico.
- Concluído: geração integral real sintética com JSON/contrato/referências válidos,
  18 perguntas/22 exames e crítica Gemma sequencial em 140,422 s. O teto inicial 768
  truncou a crítica em 269,328 s; relatório preservado. Somente o teto da crítica
  mudou para 2048 na execução completa. Sem OOM/timeout observado nesses dois testes.
- Medido: 71 amostras; pico total da GPU 7225 MiB, pico RAM global 10.088.321.024 bytes,
  mínimo disponível 4.828.442.624 bytes. Alocação Ollama 6.091.995.873 bytes é medida
  distinta. RSS cliente/processos Windows não medido. Esses valores incluem sistema/outros processos.
- Concluído: Tesseract 5.5.3.20260724 por+eng e Poppler 26.07.0; PDF textual e OCR
  reais sintéticos passaram. Correções de portabilidade no teste Arial e no parser
  da versão Tesseract com prefixo v; 48 testes aprovados em 11,293 s. Doctor disponível.
- Mantido: sem banco pessoal, fontes reais, materialização, aprovação ou publicação;
  sem commit/push/merge. Relatórios, telemetria e ambientes ignorados pelo Git.
- Pendente: repetibilidade ampla, fontes maiores e RAG real integrado; plataforma
  completa C++20/daemon POSIX neste PC. WSL2/Ubuntu autorizado; runtime 3.0.3.0
  instalado, VirtualMachinePlatform habilitado, reinicialização pendente. Ubuntu
  ainda não instalado (`HCS_E_SERVICE_NOT_AVAILABLE` antes de reiniciar).
  Não presumir rede/GPU/sandbox prontas.
- Pendente: revisão clínica/docente por versão, dificuldade/tags/rubrica,
  licenças e regras institucionais, segurança independente, sandbox e infraestrutura.

Detalhes/reprodução: [validação Windows](VALIDACAO_IA_OUTRA_MAQUINA.md) e
[modelos/medidas](MODELOS_LOCAIS_NEXT_2026.json). A primeira execução completa
bem-sucedida não constitui validação clínica ou homologação da plataforma.

## Histórico — 16/10/2026

Conciliação do código com as duas páginas do Notion em 16/10/2026. Este registro
separa evidência técnica local, avaliação humana e configuração externa. Nenhum
agente pode declarar aprovação clínica, auditoria independente ou homologação.

## Concluído nesta rodada

| Entrega | Evidência | Responsável técnico |
| --- | --- | --- |
| Habilitar/revogar docentes por área, listar atribuições e substituir revisor com motivo | C++ core, HTTP direto e painel Chrome; decisões anteriores preservadas | Agente backend + coordenador |
| Revogar grants de fontes, consultar destinatários e casos dependentes | HTTP e Chrome; consulta restrita ao proprietário/admin; mutação administrativa auditada | Coordenador |
| Redigir resultados de geração quando fontes deixam de ser autorizadas | HTTP verifica `result: null` e `resultAccess: revoked` em lista/detalhe após revogação/retirada | Coordenador |
| Registrar exposição dos proprietários das fontes secundárias | Teste C++ de materialização e histórico | Agente backend |
| Selecionar páginas reais antes da inferência e respeitar orçamento de fontes/contexto | 26 testes worker, incluindo seleção vazia, página inexistente/inventada, fontes suplementares e limites | Agente worker + coordenador |
| Rubrica opcional versionada com confirmação e divergência justificada | C++ + Chrome; detalhes em RUBRICA_DIFICULDADE.md | Agentes frontend/backend + coordenador |
| Conferir visibilidade e metadados locais de licenças | AUDITORIA_PENDENCIAS_NEXT_2026.json; consulta somente de leitura | Coordenador |

Não houve migration nova nesta rodada, nem acesso de testes à base pessoal.
Os patches dos agentes backend/worker foram revisados e integrados pelo coordenador;
o frontend foi integrado e testado em conjunto. Os testes usam documentos e usuários
sintéticos, inclusive resultados artificiais explicitamente limitados às fixtures.

## Fila priorizada para continuar

| Prioridade / pendência | Próxima ação verificável | Responsável / dependência | Critério de conclusão |
| --- | --- | --- | --- |
| P1 — Qwen3:8b com timeout | Isolar carga/recursos e executar primeiro resposta curta, depois caso integral em equipamento adequado, sem outra inferência concorrente | Equipe técnica; M1/8GB atual apresentou pressão de memória/timeouts | 18/22 integrais, JSON válido, referências válidas; medir tempo/memória/falhas, sem cortes |
| P1 — crítica Gemma e RAG real completos | Após geração viável, executar crítica sequencial e geração usando trechos autorizados selecionados | Modelos/hardware e fontes sintéticas | Proveniência auditável e recuperação de falhas comprovadas; concordância de modelos não aprova caso |
| P1 — avaliação clínica | Docente compara fonte, valores/unidades, hipóteses, desfecho, pontuação e conteúdo sintético acrescentado | Docente habilitado e atribuído | Parecer identificável por versão; correções antes da aprovação/publicação |
| P1 — dificuldades e tags reais | Revisar João/Marina, público/pré-requisitos e combinação de título/resumo/tags/duração | Docentes e coordenação pedagógica | Rubrica confirmada sem antecipar diagnóstico; não preencher automaticamente |
| P1 — segurança independente | Exercitar matriz completa de objetos/estados, PDFs hostis, prompt injection e abusos em homologação autorizada | Avaliador independente e ambiente isolado | Evidências por requisito ASVS aplicável e correção de falhas impeditivas |
| P1 — isolamento operacional | Usuário dedicado, sandbox SO, limites/rede/mounts, HTTPS e HTTP de produção | Infraestrutura aprovada | Processador e inferência sem acesso desnecessário; verificação de confinamento no ambiente final |
| P1 — governança | Aprovar revisores/suplência/segunda revisão, autoaprovação, uso de fontes, retenção/descarte e identidades individuais/MFA | Instituição | Política registrada e refletida na configuração; sem presumir regras homologadas |
| P1 — repositório público | Deliberar visibilidade, colaboradores/2FA e proteção da main antes de avaliação formal com conteúdo restrito | Proprietário do GitHub e instituição | Configuração externa autorizada e verificada; nenhuma alteração externa nesta tarefa |
| P2 — adequação de licenças | Revisar termos do Gemma, licença Qwen e permissão de cada documento para o uso final | Responsáveis legais/institucionais | Autorização de uso documentada; hash da licença não equivale a aprovação jurídica |
| P2 — calibração e operação | Medir tentativas e esforço docente, carga controlada, monitoramento e recuperação no ambiente final | Equipe pedagógica e operacional | Métricas reproduzíveis, sem dados sensíveis em logs; testar restauração e resposta a incidentes |

## Estado dos modelos

Ollama, Qwen3:8b e Gemma3:4b já estão instalados. Tesseract/Poppler e OCR real de
PDF sintético passaram. Gemma respondeu JSON curto; Qwen teve timeout, inclusive
em teste curto. Não há geração integral real aprovada nem avaliação clínica.
Instalar novamente os mesmos componentes não resolve por si só esse bloqueio.
Não executar inferência pesada durante outras tarefas sem controlar recursos.

Os limites operacionais do prompt usam estimativa de bytes, não o tokenizer do
modelo: reduzem excessos previsíveis, mas não garantem ausência de truncamento.
A saída cortada continua sendo rejeitada. Ver worker/README.md e os registros em
MODELOS_LOCAIS_NEXT_2026.json.

## Repositório e confidencialidade

A consulta autenticada de leitura confirmou o repositório
`devgabrieldonato/Challenge_GrupoDevsphere` como **PUBLIC**. Não alteramos visibilidade,
permissões ou regras. Conteúdo já publicado e histórico podem ser copiados; mover
gabaritos para o backend não torna secretos os casos legados publicados no Git.
Não usar esses casos como prova de gabarito desconhecido. Casos futuros restritos
não devem ser versionados em repositório público; essa política depende da instituição.

## Testes desta rodada

- CMake compilou; CTest: 2/2 alvos passaram.
- tools/tests: 20/20 passaram (HTTP, backup e inicialização).
- worker/tests: 26/26 passaram, incluindo OCR sintético real.
- Chrome: atendimento/PDF/devolutiva, origem5501 por proxy de teste, versões,
  rubrica, painel de habilitação/revogação e grants passaram; zero erro JavaScript.
- A extensão Live Server não foi automatizada; a origem foi exercitada pelo proxy.
- Geração integral, validação médica e segurança independente permanecem pendentes.

Comandos reproduzíveis: ENTREGA_NEXT_2026.md. Para aplicar o código localmente,
encerre os processos antigos nos seus terminais e reinicie API e worker pelos
scripts documentados no README; um health positivo não comprova binário atualizado.

## Segunda rodada — resultado verificado

- Agente backend: quota persistente por usuário/janela para criação e retry manual;
  transações e replay idempotente sem novo consumo; sem migration. Coordenador
  integrou e executou os testes HTTP reais com banco sintético.
- Agente de apoio aos portais: inventário `tools/check-local-ai.sh`/`worker.doctor`,
  com13 testes de transporte seguro e dependências. Somente leitura, sem inferência.
- Coordenador: conversão corrigida para `pages: []`, validação de conclusão/modelo
  do Ollama, erros legíveis, timeout configurável, métricas e testes de PDFs/protocolo;
  retirada de fonte bloqueia grantees preservando titular/admin e histórico.
- Testes: CTest 2/2; tools23/23; worker51/51 com ResourceWarning como erro; Chrome
  passou sem erros JavaScript. Base pessoal não acessada; sem migration nova.
- O diagnóstico real encontrou Ollama0.40.5, Qwen/Gemma instalados, Tesseract5.5.3
  por+eng e Poppler26.10.0. Nenhum modelo ficou carregado ao fim.

**Atualização do bloqueio Qwen:** teste real curto com contexto512 passou em27,84s
(9 tokens); contexto4096 do worker voltou a exceder60s. A causa exata não foi isolada;
não há evidência de geração integral. A contagem aproximada de RSS do primeiro probe
não foi obtida e está registrada como indisponível, sem inferir memória zero.
Dados técnicos em MODELOS_LOCAIS_NEXT_2026.json. Não iniciar teste de caso completo
pesado nem declarar hardware suficiente com base nessa resposta curta.

Próxima ação: medir execução sustentada no contexto necessário, controlar pressão
de memória e avaliar hardware de demonstração. Reduzir contexto para512 não resolve
o contrato de40 itens. Validação clínica, adequação de licenças, isolamento SO,
ASVS independente, regras institucionais e Live Server real (além do proxy de teste)
continuam pendentes. Os itens concluídos acima não removem esses bloqueios.

## Terceira rodada — estado atual

- Backend: limites pendentes por instituição/global e consistência de upload em
  falhas tratáveis; testes cruzados, transacionais e com injeção de erro passaram.
- Frontend/testes: módulo real Live Server com API temporária sem proxy passou,
  incluindo reabertura da página na mesma sessão. Portas existentes são preservadas.
- Coordenador: contexto separado da crítica, métricas de memória distinguíveis,
  perfil experimental isolado e teste real de geração; entrada sintética e roteiro
  para outra máquina. Sem migration/commit/push ou uso da base pessoal.
- Resultados atuais: tools29/29, worker54/54 (ResourceWarning como erro), CTest 2/2
  e Live Server real passaram. Guardas de portas também passaram.

**Bloqueio agora demonstrado:** perfil q8_0/Flash Attention/uma execução passou JSON
curto4096 em18,736s; ao gerar caso em8192, ocorreu
`kIOGPUCommandBufferCallbackErrorOutOfMemory`. API respondeu sem conclusão;
`provider_incomplete` rejeitou o resultado em15,832s. Gemma não foi alcançado.
Não generalizar esse resultado para todas as configurações/máquinas, nem declarar
que a resposta curta resolve o contrato inteiro. Processos experimentais encerrados.

O usuário confirmou outra máquina disponível. Sistema/RAM/CPU/GPU aguardam resposta;
não há acesso remoto configurado. Próximo passo: preparar dependências e reproduzir
benchmark completo no destino conforme VALIDACAO_IA_OUTRA_MAQUINA.md. A antiga nota
“causa exata não isolada” corresponde aos timeouts anteriores; a falta de memória
está demonstrada nesta tentativa específica, não como diagnóstico universal.

Pendências independentes remanescentes: quotas de armazenamento em bytes/reserva
de disco e reconciliação de órfãos após queda abrupta; monitoramento operacional;
sandbox SO e avaliação independente de segurança. Dependências humanas/institucionais
anteriores continuam abertas. Live Server real está verificado nos limites descritos;
a UI do VS Code/fechamento completo do navegador não foram automatizados.

## Complemento operacional — auditoria somente leitura

A ferramenta de armazenamento e6 testes sintéticos foram integrados e passaram.
Conexão SQLite readonly, hashes limitados em blocos, confinamento por descritores
sem seguir links, saída sanitizada e relatório novo0600 sem sobrescrita. Detecta
órfãos/ausências/divergências e bytes observados; não modifica dados nem executa
cleanup. A execução operacional precisa de snapshot/janela coerente; quotas de
bytes, reserva de disco e remediação continuam pendentes. Nenhuma base pessoal
foi auditada. Veja AUDITORIA_ARMAZENAMENTO.md.

Totais finais desta rodada:35 testes de ferramentas passaram (29 da integração
+6 da auditoria),55 worker passaram, CTest 2/2 e cenário Live Server real passaram.
UTF-8, contratos, sintaxe e diff também conferidos. Benchmark nativo sem resource
foi simulado em regressão; não é teste real no Windows. Código/modelos continuam
sem geração integral validada no M1/8GB e aguardam teste na outra máquina.
