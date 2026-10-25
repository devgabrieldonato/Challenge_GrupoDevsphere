# Paciente Virtual

> **Modo local protegido:** inferência desabilitada por padrão. Para executar e apresentar no Mac, siga o [roteiro protegido](docs/MODO_APRESENTACAO_MAC.md). Conversão e orçamento não carregam Qwen/Gemma. Geração integral permanece pendente no Windows.

## Estado atual — 24/10/2026

- API C++20/SQLite em 8080 e frontend pelo Live Server em 5501; o Live Server continua dependendo da API.
- Modo protegido no Mac: conversão/OCR limitado e orçamento disponíveis, inferência desabilitada. Geração integral Qwen3/Gemma3 fica para reteste no Windows/WSL2; exige habilitação operacional explícita nesse ambiente. Não habilitar no M1.
- Reconciliação com plano/quarentena/restauração por hash, quotas de PDFs-fonte, reserva de disco e painel administrativo já implementados. Não há descarte automático.
- Retornos manuais positivos do usuário sobre VoiceOver no Safari e Chrome. Novo PDF oficial tem estrutura lógica testada, sem declaração de conformidade PDF/UA.
- Última regressão técnica: 118 ferramentas + 85 worker + 2 CTest aprovados; três testes de IA real não executados. Bancos, ambientes e relatórios privados permanecem fora do Git.

Guias atuais: [execução protegida](docs/MODO_APRESENTACAO_MAC.md), [operação e recuperação](docs/OPERACAO_E_RECUPERACAO.md) e [acessibilidade](docs/ACESSIBILIDADE_SAFARI_PDF.md). Registros datados anteriores preservam evidências históricas; não atribuir os benchmarks Windows ao Mac.

Plataforma educacional para estudantes e professores de Medicina. O aluno
escolhe um caso clínico, conduz a investigação, formula hipóteses e recebe uma
pontuação pedagógica. O professor revisa o percurso, as evidências disponíveis
e as tentativas antes de registrar a devolutiva.

## Estado atual da NEXT_2026

Windows + WSL2/Ubuntu 24.04.5 preparado, preservando o backend C++20. Perfil v4
Qwen3:8b + Gemma3:4b concluiu 18 perguntas/22 exames: RAG 225,529 s, textual WSL
195,138 s e textual Windows 96,891 s. Falhas anteriores preservadas.
Passaram CTest 2/2, worker Linux 61, Python Windows 53 selecionados,
ferramentas 41 + 1 skip opt-in e RAG real 3/3 separado. Interface/LiveServer
passaram após correções de rascunho, autoria e teclado. Sem publicação de casos,
aprovação clínica ou homologação de 100% de usabilidade. Comandos/versões/métricas e
pendências em `docs/VALIDACAO_IA_OUTRA_MAQUINA.md`.

Consulte [pendências e evidências](docs/PENDENCIAS_NEXT_2026.md),
[Live Server real](docs/LIVE_SERVER_VALIDACAO.md) e
[validação da IA na outra máquina](docs/VALIDACAO_IA_OUTRA_MAQUINA.md).

## Identidade visual e CSS

Cabeçalho com as marcas originais **FIAP + Faculdade Moinhos de Vento — Paciente
Virtual**, paleta institucional azul e rosa discreto, tipografia e espaçamentos
revisados. As 18 entradas, incluindo a compatibilidade da raiz, compartilham o
rodapé institucional de 2026. O cabeçalho mostra somente as marcas e o nome
Paciente Virtual ampliado ao lado, sem painel branco. No tema escuro, as marcas
são exibidas em branco por CSS; os PNGs originais permanecem intactos.

A grade responsiva usa **Bootstrap Grid 5.3.8** e o controle de tema usa ícones
**Bootstrap Icons 1.13.2** (sol/lua). Arquivos e licenças ficam em
`frontend/vendor/`, sem CDN ou instalação npm para iniciar o produto. O restante
dos estilos é específico da aplicação em `frontend/styles/institutional.css`,
carregado depois das folhas existentes. Logos em `frontend/assets/brand/`,
preservando os arquivos fornecidos. Confira [fontes e versões](frontend/vendor/README.md).

## Acessibilidade e tema escuro

Use **Tema escuro** no cabeçalho de qualquer página. O botão funciona com Tab e
Espaço/Enter, informa seu estado e salva somente a preferência visual nesta origem;
sem escolha anterior, acompanha o tema do sistema. Estilos incluem foco visível,
reflow, contraste, movimento reduzido e impressão clara. Não exige instalar npm
para usar a plataforma.

Auditorias reais: Lighthouse 100/100 em oito combinações de páginas/temas;
axe em 17 páginas e estados adicionais; Web Developer e zoom real 200%/400%.
Escopo, relatórios e comandos históricos estão em [Acessibilidade NEXT_2026](docs/ACESSIBILIDADE_NEXT_2026.md).
Os retornos manuais positivos de VoiceOver no Safari e Chrome, em 24/10, estão em
[Safari, VoiceOver e PDF](docs/ACESSIBILIDADE_SAFARI_PDF.md).

## Executar localmente no macOS e Windows

Este é o roteiro operacional principal, conferido com o estado de 24/10/2026. Os exemplos
Bash abaixo executam no macOS ou **dentro do Ubuntu/WSL2**, nunca diretamente no
PowerShell. O backend continua C++20/POSIX. Windows nativo executa o benchmark
Python/Ollama; a plataforma completa neste PC foi testada no WSL2.

| Ambiente | Python/venv | Build da API | Evidência |
| --- | --- | --- | --- |
| macOS, Bash | `.venv-worker/bin/python` | `build/backend` | Fluxos leves/API/worker e testes sem modelos verificados em 23–24/10; VoiceOver manual informado pelo usuário |
| Windows, PowerShell | `.venv-worker\Scripts\python.exe` | Não usado no benchmark | Python 3.12.1, benchmark completo v4 em 96,891 s |
| Ubuntu 24.04 no WSL2, Bash | `$HOME/.venvs/pacientevirtual/bin/python` | `$HOME/build/pacientevirtual/backend` | Python 3.12.3, CTest/HTTP/interface/PDF/OCR/RAG reais |

Não copie venvs, bancos, sessões ou credenciais entre sistemas. O M1/8 GB teve
OOM real na geração completa em 8192; os êxitos da RTX 3060 não comprovam que esse
Mac suporta o mesmo perfil. A configuração experimental 11435/q8_0/Flash Attention
não substitui o perfil medido abaixo. Ver [evidências e histórico](docs/VALIDACAO_IA_OUTRA_MAQUINA.md).

### 1. Preparar macOS

No Terminal, entre em `bash` para os blocos deste roteiro. Confira antes de instalar:

```bash
bash
sw_vers
uname -m
df -h .
xcode-select -p
git --version
cmake --version
python3.12 --version
ollama --version
```

Reutilize dependências compatíveis. Se faltarem ferramentas Apple, execute
`xcode-select --install` e conclua o instalador. Com [Homebrew](https://brew.sh/)
já instalado, instale apenas o que estiver ausente:

```bash
brew install cmake sqlite python@3.12 poppler tesseract tesseract-lang
```

CMake 3.20+, C++20 e SQLite são requisitos; no Mac o backend usa
Security/CommonCrypto. [Python 3.12](https://formulae.brew.sh/formula/python@3.12)
é a versão escolhida para este roteiro. O [Ollama oficial para macOS](https://docs.ollama.com/macos)
requer macOS 14+ atualmente: instale o aplicativo oficial em `/Applications`
se ausente. Seu CLI é configurado pelo aplicativo. Não instale um segundo serviço.

Clone somente se a pasta não existir; numa pasta existente confira remoto,
branch e alterações, sem sobrescrever ou fazer pull sobre trabalho local:

```bash
mkdir -p "$HOME/Projetos"
cd "$HOME/Projetos"
git clone --branch NEXT_2026 --single-branch https://github.com/devgabrieldonato/Challenge_GrupoDevsphere.git
cd Challenge_GrupoDevsphere
git remote -v
git branch --show-current
git status
# Somente se ainda não houver ambiente compatível:
"$(brew --prefix python@3.12)/bin/python3.12" -m venv .venv-worker
.venv-worker/bin/python -m pip install -r worker/requirements.txt
.venv-worker/bin/python -m pip install -r tools/requirements-security.txt reportlab
.venv-worker/bin/python -m pip check
```

ReportLab produz o PDF oficial; as dependências de segurança permitem os testes
e backup cifrado. Não dependem da ativação do ambiente.

### 2. Preparar Windows/WSL2

**PowerShell:** inventário e abertura da distribuição existente neste PC:

```powershell
wsl --version
wsl --status
wsl --list --verbose
Get-PSDrive -PSProvider FileSystem
nvidia-smi
Set-Location 'C:\Users\vinic\Projetos\Challenge_GrupoDevsphere'
git remote -v
git branch --show-current
git status
wsl -d PacienteVirtual-Ubuntu2404 -u pacientevirtual --exec bash --noprofile --norc
```

A instalação já concluída usa WSL 3.0.3, Ubuntu 24.04.5 em
`G:\WSL\PacienteVirtual-Ubuntu2404`, usuário `pacientevirtual`. Não reinstale.
Em **outro PC sem WSL**, siga a [instalação oficial Microsoft](https://learn.microsoft.com/en-us/windows/wsl/install):
PowerShell administrador, `wsl --list --online`, depois
`wsl --install -d Ubuntu-24.04`, reinício se solicitado e criação do usuário Linux.
Essa instalação usa normalmente o nome `Ubuntu-24.04`; substitua o nome e usuário
nos comandos deste PC. Não desative proteções nem instale driver NVIDIA Linux:
o WSL utiliza o driver NVIDIA do Windows.

Se faltarem dependências no Ubuntu, instale-as uma vez por administração. Neste PC
o usuário dedicado não tem sudo sem senha: use **PowerShell**, sem mudar essa política:

```powershell
wsl -d PacienteVirtual-Ubuntu2404 -u root --exec apt-get update
wsl -d PacienteVirtual-Ubuntu2404 -u root --exec apt-get install -y build-essential cmake libsqlite3-dev libssl-dev python3-venv poppler-utils tesseract-ocr tesseract-ocr-por tesseract-ocr-eng
```

**Bash no Ubuntu**, no clone compartilhado; substitua o caminho se usar outro usuário:

```bash
cd /mnt/c/Users/vinic/Projetos/Challenge_GrupoDevsphere
# Somente numa instalação nova; não recriar o venv existente deste PC.
python3 -m venv "$HOME/.venvs/pacientevirtual"
"$HOME/.venvs/pacientevirtual/bin/python" -m pip install -r worker/requirements.txt
"$HOME/.venvs/pacientevirtual/bin/python" -m pip install -r tools/requirements-security.txt reportlab
"$HOME/.venvs/pacientevirtual/bin/python" -m pip check
```

`C:\Users\vinic\Projetos\Challenge_GrupoDevsphere` e `/mnt/c/Users/vinic/Projetos/Challenge_GrupoDevsphere`
são o mesmo código. Build, venv e dados Linux ficam em `/home/pacientevirtual`
(ext4); executáveis Windows e Linux não são intercambiáveis. Não execute Git
simultaneamente pelos dois sistemas durante stage/commit.

### 3. Configuração explícita para macOS e Ubuntu

Na **raiz do clone**, em **Bash**, crie este arquivo local somente se ainda não
existir (`test` recusa sobrescrita). Ele não contém senhas e `.local/` é ignorado:

```bash
mkdir -p .local
test ! -e .local/ambiente-local.sh && cat > .local/ambiente-local.sh <<'SH'
# Caminhos próprios do sistema; carregar por source em Bash na raiz do clone.
export PV_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "$(uname -s)" in
  Darwin)
    export DEVSPHERE_PYTHON="$PV_REPO/.venv-worker/bin/python"
    export PV_BUILD="$PV_REPO/build/backend"
    export PV_DATA="$PV_REPO/backend/data"
    ;;
  Linux)
    export DEVSPHERE_PYTHON="$HOME/.venvs/pacientevirtual/bin/python"
    export PV_BUILD="$HOME/build/pacientevirtual/backend"
    export PV_DATA="$HOME/.local/share/pacientevirtual"
    ;;
  *) printf 'Use macOS ou Ubuntu/WSL2 neste roteiro.\n' >&2; return 1 ;;
esac
export PV_API="$PV_BUILD/devsphere-api"
export DEVSPHERE_DB_PATH="$PV_DATA/devsphere.db"
export DEVSPHERE_SOURCE_DIR="$PV_DATA/sources"
export DEVSPHERE_MIGRATIONS_DIR="$PV_REPO/backend/migrations"
export DEVSPHERE_FRONTEND_DIR="$PV_REPO/frontend"
export DEVSPHERE_CASE_SEED="$PV_REPO/backend/seeds/legacy-cases.json"
export DEVSPHERE_PDF_RENDERER="$PV_REPO/tools/render_official_report.py"
export DEVSPHERE_BACKUP_TOOL="$PV_REPO/tools/secure_backup.py"
export DEVSPHERE_HOST=127.0.0.1
export DEVSPHERE_PORT=8080
export DEVSPHERE_ENV=development
export DEVSPHERE_OLLAMA_URL=http://127.0.0.1:11434
export DEVSPHERE_GENERATOR_MODEL=qwen3:8b
export DEVSPHERE_CRITIC_MODEL=gemma3:4b
export DEVSPHERE_OLLAMA_CONTEXT=8192
export DEVSPHERE_OLLAMA_CRITIC_CONTEXT=16384
export DEVSPHERE_OLLAMA_MAX_TOKENS=6000
export DEVSPHERE_OLLAMA_CRITIC_MAX_TOKENS=4096
export DEVSPHERE_OLLAMA_BATCH=64
export DEVSPHERE_OLLAMA_TIMEOUT=900
umask 077
SH
source .local/ambiente-local.sh
mkdir -p "$PV_DATA" "$DEVSPHERE_SOURCE_DIR"
```

Em **cada novo terminal de API/worker/testes**, entre na raiz do mesmo clone,
use Bash e execute `source .local/ambiente-local.sh`. Não rode comandos seguintes
com variáveis vazias. Arquivo existente deve ser conferido manualmente: não
substitua banco/fontes já usados. Este roteiro adota banco Linux separado do
banco Windows e do Mac; migrations não apagam o banco nem criam contas.

Compile e valide no terminal configurado:

```bash
if [ "$(uname -s)" = Darwin ]; then
  cmake -S backend -B "$PV_BUILD" -DBUILD_TESTING=ON -DCMAKE_PREFIX_PATH="$(brew --prefix sqlite)"
else
  cmake -S backend -B "$PV_BUILD" -DBUILD_TESTING=ON
fi
cmake --build "$PV_BUILD" -j 2
ctest --test-dir "$PV_BUILD" --output-on-failure
"$DEVSPHERE_PYTHON" -m pip check
tesseract --list-langs
pdftoppm -v
```

Confirme `por` e `eng`. `DEVSPHERE_PYTHON` também é necessário no CTest/renderer:
a tentativa com Python de sistema sem ReportLab falhou; o venv explícito passou.
`tools/start-local-api.sh` fixa `repo/build/backend`; por isso o roteiro abaixo
usa o binário absoluto `$PV_API`, compatível com o build em `/home` do WSL.

### 4. Banco, contas locais e MFA

Com a API parada, no terminal configurado:

```bash
"$PV_API" --migrate
"$PV_API" --allow-domain devsphere.local
# Senhas lidas sem eco, apenas no ambiente do processo filho; nunca em argv/history.
set +x
criar_conta_local() {
  local -x DEVSPHERE_SEED_PASSWORD=''
  IFS= read -r -s -p 'Senha local (mínimo 12 caracteres): ' DEVSPHERE_SEED_PASSWORD || return
  printf '\n'
  "$PV_API" "$@"
}
criar_conta_local --create-admin 'Administrador local' admin@devsphere.local admin@devsphere.local
criar_conta_local --create-user 'Aluno de teste' aluno.teste@devsphere.local student
criar_conta_local --create-user 'Professor de teste' professor.teste@devsphere.local teacher
unset -f criar_conta_local
```

Crie somente contas ausentes, com senhas próprias e sem dados pessoais. Contas CLI
ficam ativas; cadastro público exige aprovação. Não exclua o banco para recuperar
login. Não use `--help`: o binário não implementa essa opção. A senha tem mínimo
de 12 caracteres e limite de 1024 bytes no backend.

**MFA para administrador e professor.** Em produção é obrigatório. Em desenvolvimento,
o backend solicita o segundo fator quando o MFA daquela conta está carregado
no processo da API. Este roteiro o provisiona também no ambiente local. A regra
é do backend, independente do macOS/Windows e do uso de Live Server.
Provisione uma vez, com arquivos novos
fora do repositório, sem imprimir ou anexar seu conteúdo a logs/Notion/Git:

```bash
"$DEVSPHERE_PYTHON" tools/provision_mfa.py --database "$DEVSPHERE_DB_PATH" --email admin@devsphere.local --env-output "$HOME/.config/pacientevirtual/admin-mfa.env" --recovery-output "$HOME/.config/pacientevirtual/admin-recuperacao.txt"
"$DEVSPHERE_PYTHON" tools/provision_mfa.py --database "$DEVSPHERE_DB_PATH" --email professor.teste@devsphere.local --env-output "$HOME/.config/pacientevirtual/professor-mfa.env" --recovery-output "$HOME/.config/pacientevirtual/professor-recuperacao.txt"
```

Abra os arquivos de recuperação **privadamente**, cadastre a URI TOTP no seu
autenticador e guarde os códigos. A ferramenta recusa destinos existentes e
arquivos dentro do clone. Se já provisionado, reutilize os arquivos corretos para
os IDs deste banco; não provisione de novo sem procedimento de rotação.

#### Desenvolvimento local sem autenticador (opcional)

Para testes locais no macOS ou no Bash do Ubuntu/WSL, use esta alternativa ao
terminal API com MFA. Entre na raiz do clone e pare somente a instância anterior
antes de reiniciar. A conta e a senha continuam obrigatórias. Os arquivos privados
de MFA são preservados; nenhum deles deve ser versionado.

```bash
source .local/ambiente-local.sh
# Recusa este modo fora do ambiente de desenvolvimento.
if [[ "${DEVSPHERE_ENV:-}" == development ]]; then
  # Retira MFA somente do ambiente deste processo, mesmo se herdado do terminal.
  for name in ${!DEVSPHERE_MFA_@}; do unset "$name"; done
  "$PV_API"
else
  printf 'Modo sem autenticador permitido somente em development.\n' >&2
fi
```

Não carregue os arquivos admin-mfa.env/professor-mfa.env nessa alternativa.
Em produção, o backend continua exigindo MFA de professor/admin; este bloco não
altera essa regra. Live Server serve a interface e não determina a autenticação.

### 5. Ollama e modelos

Confira espaço antes de downloads (os dois pesos instalados somam cerca de
8,58 GB decimais, além de caches/build/ambientes). No Mac, abra `open -a Ollama`
se o aplicativo não estiver aberto; consulte primeiro a API e `ollama list`.
No WSL deste PC já existe o binário oficial 0.40.6 em
`$HOME/deps/ollama-0.40.6/bin/ollama`. Para instalação Linux nova, siga a
[documentação oficial](https://docs.ollama.com/linux); seu instalador pode criar
um serviço. Verifique se esse serviço já ocupa 11434 antes de executar `serve`.
Não misture seus modelos/diretório com outro serviço em execução.

**Bash, terminal Ollama no WSL deste PC:** conferir primeiro. Windows e WSL têm
serviços distintos; o cliente Linux consulta o loopback Linux, sem expor a API:

```bash
export PATH="$HOME/deps/ollama-0.40.6/bin:$PATH"
curl --fail --silent --show-error http://127.0.0.1:11434/api/tags
```

Somente se a API Linux estiver ausente e nenhuma instância estiver iniciando,
execute em primeiro plano, num terminal próprio:

```bash
export OLLAMA_HOST=127.0.0.1:11434
export OLLAMA_MODELS=/mnt/c/Users/vinic/.ollama/models
export OLLAMA_NOPRUNE=1
export OLLAMA_NO_CLOUD=1
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=1
ollama serve
```

Esse compartilhamento reutiliza **pesos**, não processos/venvs. Neste PC os modelos
já existem: não baixe novamente. Não modifique/prune simultaneamente pelos dois
serviços. Em instalação nova com outro usuário/diretório, configure seu caminho
real ou use o armazenamento padrão privado do Ollama. No Mac o aplicativo usa
`~/.ollama`; o bloco WSL acima não se aplica.

Em outro terminal com o CLI correto, no Mac ou Linux:

```bash
ollama --version
ollama list
# Apenas modelos ausentes, após conferir espaço:
ollama pull qwen3:8b
ollama pull gemma3:4b
```

No terminal configurado da raiz: `"$DEVSPHERE_PYTHON" -m worker.doctor --json`.
Doctor é inventário, não comprovação de geração. O cliente executa Qwen e Gemma
em sequência, `keep_alive=0`, `think=false`, temperatura 0,2. Não iniciar geração
concorrente nem tratar concordância como aprovação clínica.

### 6. Iniciar API, worker e interface

**Terminal API, Bash na raiz:** carregar configuração e MFA só neste terminal,
antes de iniciar. Nenhum desses arquivos privados deve ser versionado:

```bash
source .local/ambiente-local.sh
source "$HOME/.config/pacientevirtual/admin-mfa.env"
source "$HOME/.config/pacientevirtual/professor-mfa.env"
"$PV_API"
```

Se 8080 já estiver ocupada, identifique sua instância e configuração antes de
prosseguir; não encerre processos desconhecidos. Um health antigo não comprova
que o código recompilado está em execução.

**Terminal worker, Bash na mesma raiz:**

```bash
source .local/ambiente-local.sh
"$DEVSPHERE_PYTHON" -m worker.run --db "$DEVSPHERE_DB_PATH" --storage "$DEVSPHERE_SOURCE_DIR" --check
"$DEVSPHERE_PYTHON" -m worker.run --db "$DEVSPHERE_DB_PATH" --storage "$DEVSPHERE_SOURCE_DIR"
```

`--check` valida o schema e encerra; a segunda linha consome a fila. API e worker
precisam dos mesmos caminhos de banco/fontes. O daemon usa POSIX/resource e não
foi portado para Python Windows nativo.

**Verificar no Bash:**

```bash
curl --fail --silent --show-error http://127.0.0.1:8080/api/v1/health
curl --fail --silent --show-error http://127.0.0.1:11434/api/tags
ollama ps
# WSL/RTX, durante inferência real:
nvidia-smi
```

Interface: `http://127.0.0.1:8080`, servida pela própria API, sem build Node ou
Live Server obrigatório. No Mac: `open http://127.0.0.1:8080`. No Windows,
**PowerShell**: `Invoke-RestMethod http://127.0.0.1:8080/api/v1/health` e
`Start-Process 'http://127.0.0.1:8080'`. O WSL normalmente encaminha localhost;
se falhar, diagnostique a configuração sem expor bind/rede/firewall. Os testes
Chromium desta rodada executaram dentro do Linux, não comprovam todo navegador Windows.

Live Server é opcional: na extensão existente, use porta 5501 e mesmo hostname
`127.0.0.1`; mantenha API em 8080. [Teste real e configuração](docs/LIVE_SERVER_VALIDACAO.md).
Não sirva bancos/arquivos privados na raiz pública. API serve apenas `frontend/`.

API e worker escrevem logs nos seus terminais. Para captura local opcional,
redirecione para arquivo privado sob `$PV_DATA`, nunca para Git/Notion. Logs do
Ollama Mac: `~/.ollama/logs/server.log`; Windows: `%LOCALAPPDATA%\Ollama\server.log`;
Ollama Linux em primeiro plano escreve no seu terminal. Não cole logs contendo
fontes, sessões, MFA ou senhas. Para encerrar, use **Ctrl+C em cada terminal que
você iniciou** (worker, API e `ollama serve` Linux próprio). Feche o aplicativo
Ollama somente se desejar; não mate processos alheios nem use `wsl --shutdown`
para encerrar apenas este projeto.

### 7. Repetir testes e benchmark

No Bash configurado, use um ambiente novo/limpo para testes unitários, sem
herdar limites de geração de outros experimentos. O teste RAG real é opt-in:

```bash
export DEVSPHERE_TEST_API_BIN="$PV_API"
# Subshell: remove somente limites experimentais para conferir defaults dos testes.
(
  unset DEVSPHERE_TEST_REAL_AI DEVSPHERE_OLLAMA_URL DEVSPHERE_OLLAMA_CONTEXT DEVSPHERE_OLLAMA_CRITIC_CONTEXT DEVSPHERE_OLLAMA_MAX_TOKENS DEVSPHERE_OLLAMA_CRITIC_MAX_TOKENS DEVSPHERE_OLLAMA_BATCH DEVSPHERE_OLLAMA_TIMEOUT DEVSPHERE_SOURCE_MAX_BYTES
  export PYTHONPATH="$PWD/worker/tests:$PWD"
  ctest --test-dir "$PV_BUILD" --output-on-failure
  "$DEVSPHERE_PYTHON" -W error::ResourceWarning -m unittest discover -s worker/tests -v
  "$DEVSPHERE_PYTHON" -m unittest discover -s tools -p test_validate_clinical_case.py -v
  "$DEVSPHERE_PYTHON" -m unittest discover -s tools/tests -p 'test_*.py' -v
)
# Somente Linux/WSL, caro: usa /proc para conferir listener e posse do processo.
# O perfil de geração do shell principal permanece carregado após o subshell.
DEVSPHERE_TEST_REAL_AI=1 "$DEVSPHERE_PYTHON" -m unittest tools.tests.test_real_ai_pipeline -v
```

Os testes usam bases/fontes sintéticas temporárias, não a base pessoal. O ensaio RAG Linux executa duas guardas de listener e um fluxo real, sem
aprovar/publicar caso. As guardas usam /proc; não são um teste RAG executável
no macOS, onde ficam ignoradas por esse motivo.
Para o benchmark **Windows nativo**, inclusive preparação do venv 3.12 e bloco
PowerShell completo sem helpers locais, consulte
[benchmark PowerShell](docs/VALIDACAO_IA_OUTRA_MAQUINA.md#benchmark-real).
A fonte obrigatória é `worker/fixtures/synthetic-benchmark.request.json`.
Preserve relatórios usando nomes novos. PDFs textual/escaneado sintéticos são
cobertos pelas suítes; extração/OCR não equivalem a interpretação clínica.

Os benchmarks integrais de 19–20/10 foram executados no Windows/WSL. No Mac,
as rodadas de 23–24/10 verificaram fluxos leves e testes sem modelos. Quotas de
PDFs-fonte, piso de disco e reconciliação explícita já estão implementados. Ainda
faltam reteste integral dos modelos no Windows com as alterações atuais, estabilidade
ampla/carga/fontes maiores, cobertura assistiva ampliada, revisão clínica/pedagógica,
regras institucionais/licenças, isolamento e segurança independente de produção.
Nenhum caso deve ser aprovado/publicado automaticamente.

## Referência dos componentes e modos alternativos

Os exemplos Bash nas seções abaixo pressupõem macOS/Ubuntu, build em
`repo/build/backend` e banco `backend/data`. No WSL deste PC, siga o roteiro
acima com build/banco em `/home` e não misture os dois conjuntos de caminhos.

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
export DEVSPHERE_PYTHON="$PWD/.venv-worker/bin/python"
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
7. provisione/carregue o MFA de administrador e professor conforme o roteiro acima;
8. inicie a API novamente;
9. teste os três acessos.

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

- Histórico do M1: Gemma respondeu JSON curto e Qwen apresentou timeouts.
  Windows/WSL concluiu geração e crítica reais; fontes maiores, estabilidade
  ampla e desempenho de produção continuam pendentes.
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
geração e retentativas manuais aceitas. Prévias têm quota própria de 30/hora,
incluindo retries da categoria; não consomem a quota de geração. Cancelar, concluir
ou falhar não devolve quota. Repetir a mesma solicitação idempotente retorna o trabalho anterior sem
consumir novamente. Tentativas automáticas continuam limitadas pelo próprio job;
não se confundem com uma nova solicitação manual. A concorrência por usuário
continua limitada a3 trabalhos pendentes. Configuração do backend:

- `DEVSPHERE_JOB_REQUEST_LIMIT=12`: conversão/geração, inteiro entre1 e120;
- `DEVSPHERE_BUDGET_REQUEST_LIMIT=30`: prévias sem inferência, inteiro entre1 e120;
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
as correções posteriores acrescentaram reconciliação explícita, quotas de PDFs-fonte
e reserva de disco. Não há descarte automático nem transação única FS+SQLite.
Consulte o estado atual e os procedimentos vinculados acima.

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
Qwen3:8b + Gemma3:4b concluiu 18 perguntas/22 exames: RAG 225,529 s, textual WSL
195,138 s e textual Windows 96,891 s. Falhas anteriores preservadas.
Passaram CTest 2/2, worker Linux 61, Python Windows 53 selecionados,
ferramentas 41 + 1 skip opt-in e RAG real 3/3 separado. Interface/LiveServer
passaram após correções de rascunho, autoria e teclado. Sem publicação de casos,
aprovação clínica ou homologação de 100% de usabilidade. Comandos/versões/métricas e
pendências em `docs/VALIDACAO_IA_OUTRA_MAQUINA.md`.


## Validação M1 de 22/10/2026

Extração sem duplicação e orçamento compartilhado implementados. O teste real interrompeu-se com travamento e reinício relatados pelo usuário; geração local integral não indicada para apresentação neste Mac. Nenhum caso completo foi salvo. Consulte [evidências, limites e decisão C](docs/VALIDACAO_MAC_M1.md). Não repetir geração pesada automaticamente.

**Próximo teste: Windows/RTX 3060 — pendente para estas correções.** Validar extração, orçamento, geração Qwen3:8b, crítica Gemma3:4b e rascunho pela interface, medindo tempo e memória. Resultados Windows anteriores não validam automaticamente esta revisão.

## Remover trabalhos da listagem

Na página **Contribuições → Trabalhos de processamento**, use **Remover da lista** em um trabalho concluído, cancelado ou com falha. A confirmação explica o alcance: o PDF, o Markdown, o resultado, rascunhos e histórico são preservados. Use o filtro **Removidos da lista** e **Restaurar na lista** para recuperar a exibição. O filtro padrão mostra somente visíveis; **Todos** reúne os registros retornados. A listagem mantém o limite de 100 registros e prioriza os visíveis.

Um trabalho na fila ou em execução deve ser cancelado antes: clique em **Cancelar**, atualize e aguarde o estado **Cancelado** (ou outro estado terminal). Solicitação de cancelamento não é confirmação de encerramento. Arquivar não interrompe o worker. Se não gostou do resultado, remova o trabalho encerrado e faça uma **nova solicitação no cartão do documento**; a conversão/geração continua sujeita a permissões, quotas e à política operacional. No Mac protegido, geração real continua bloqueada.

O backend usa `POST /api/v1/jobs/{id}/archive` e `/restore`, exclusivamente para o titular, sem privilégio especial de administrador sobre trabalhos alheios. A migration `016_job_archive.sql` adiciona `archived_at`; não apaga registros ou arquivos. Transições são transacionais, auditadas e idempotentes. Retentativa de arquivado retorna `409 job_archived`; trabalho ativo retorna `409 job_active`. Arquivar não reinicia tentativas, renova prazos nem devolve quota. Exclusão física de documentos e retirada de contribuições são operações distintas.

## Operação, armazenamento e acessibilidade — etapa de 23/10/2026

O modo local protegido continua com `DEVSPHERE_INFERENCE_ENABLED=0`; nenhum modelo precisa ser carregado para estas funções.

- **Administração → Operação e recuperação:** mostra fila, heartbeat, falhas recorrentes, espaço disponível e alertas com ações sugeridas. Atualização manual ou a cada 30 segundos enquanto a página estiver visível; não executa reparos automaticamente. Endpoint autenticado e restrito a administrador: `GET /api/v1/operations`, com escopo institucional.
- **Limites de PDFs-fonte:** padrões configuráveis no processo da API: `DEVSPHERE_STORAGE_USER_BYTES=209715200`, `DEVSPHERE_STORAGE_INSTITUTION_BYTES=1073741824` e `DEVSPHERE_STORAGE_MIN_FREE_BYTES=536870912`. São 200 MiB/conta, 1 GiB/instituição e reserva de 512 MiB. PDFs retirados continuam contando. Não representa quota de todo o banco, relatórios, logs ou backups. Veja [limites, erros e legados](docs/LIMITES_ARMAZENAMENTO.md).
- **Reconciliação após queda:** plano somente leitura, manutenção com API/worker parados e aplicação explícita para quarentena/restauração por hash. Não apagar órfãos automaticamente nem reconstruir um PDF a partir de Markdown. Veja [procedimento de reconciliação](docs/RECONCILIACAO_ARQUIVOS.md).
- **PDF oficial:** novos relatórios possuem idioma, título, marcadores e estrutura lógica real para leitura assistiva. O Python da API precisa de **ReportLab e pypdf**; pypdf já consta em `worker/requirements.txt`. PDFs antigos não são reescritos. Veja [Safari, VoiceOver e PDF](docs/ACESSIBILIDADE_SAFARI_PDF.md).

A migration incremental `017_storage_bytes.sql` preserva fontes antigas com tamanho desconhecido (`NULL`). A admissão seguinte confere caminho/hash/arquivo antes de preencher bytes; fonte ausente/divergente bloqueia novos envios da instituição em vez de ser ignorada. O diagnóstico de leitura não altera essa contabilidade. Migrations devem seguir o backup consistente já documentado.

O usuário confirmou funcionamento correto do VoiceOver no Safari e no Google Chrome do Mac em 24/10/2026. São relatos manuais positivos, sem enumeração de cenários ou certificação PDF/UA. A automação remota do SafariDriver continua desativada; essa limitação é separada da navegação manual e nenhuma preferência foi alterada pelo agente.

As variáveis acima valem apenas no terminal/processo que as recebeu. Preserve o modo protegido ao reiniciar a API e mantenha banco/raiz de fontes coerentes com o worker. Encerramento: Ctrl+C no terminal original; não mate processos por nome. Os guias vinculados explicam manutenção e recuperação, sem apagar dados locais.

Roteiro do painel, alertas, inicialização e recuperação: [Operação e recuperação](docs/OPERACAO_E_RECUPERACAO.md).

## Correção das ilustrações — 25/10/2026

O catálogo `GET /api/v1/cases` agora inclui o campo público `image`, com os mesmos caminhos das ilustrações de João e Marina já informados pelo detalhe público. A tela inicia o atendimento pelos dados desse catálogo; sem o campo, ocultava a figura apesar de os PNGs estarem disponíveis. Casos sem ilustração continuam com `null`. A legenda acompanha o paciente selecionado. Não houve mudança nos PNGs ou no conteúdo clínico.

Regressão: o teste HTTP novo reproduziu a ausência nas duas entradas antes da correção e passou depois. Chrome verificou imagem visível e decodificada de João na origem da API e Marina em origem 5501 com proxy isolado de teste, além das jornadas/PDF/devolutiva; CTest 2/2 passou. Os arquivos reais responderam HTTP 200 tanto em 8080 quanto no Live Server 5501. Nenhuma inferência ou alteração de dados pessoais.
