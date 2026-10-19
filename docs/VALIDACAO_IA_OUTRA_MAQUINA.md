# Validação da IA em outra máquina

## Estado e objetivo

O usuário informou Windows,16GB de RAM e MSI NVIDIA RTX3060 com12GB de VRAM.
O processador e a versão exata do Windows não foram informados; isso não impede
preparar o teste inicial de IA. Hardware, driver e execução ainda precisam ser
verificados no destino. Não há acesso remoto configurado para o agente operar
essa máquina. O desenvolvimento pode continuar no Mac; este PC será usado para
validação dos modelos, sem transferir a base pessoal.

O objetivo é comprovar geração real com Qwen3:8b e crítica sequencial Gemma3:4b,
com18 perguntas/22 exames, JSON válido e fontes rastreáveis. Não basta instalar
os modelos ou obter uma resposta curta. Não há contratação de serviço pago.

## Transferência e privacidade

Use o código da branch NEXT_2026 com as alterações atuais. Como não houve commit
nem push, clonar a versão remota não inclui automaticamente este trabalho. Não
faça push/merge apenas para transferir os testes sem autorização.

Se utilizar um pacote de fontes sem `.git`, extraia em uma pasta nova para testes,
sem sobrescrever uma cópia existente ou a branch main. O manifesto do pacote indica
a origem NEXT_2026; o pacote não cria um histórico Git nem configura uma branch no
destino. Commits/push continuam exigindo a autorização própria do projeto.

Transfira somente fontes, documentação e arquivos públicos necessários. Não copie
`.git`, `.env`, segredos, bancos/backup pessoais, `backend/data`, modelos Ollama,
ambientes `.venv*`, logs ou saídas clínicas privadas. Recrie dependências e bases
sintéticas no destino. Nenhuma credencial institucional é necessária ao benchmark.

## Preparação independente do sistema

1. Instale/abra Ollama localmente e confira o hardware/espaço antes de baixar
   Qwen3:8b e Gemma3:4b nessa máquina. O download não é feito pelos testes.
2. Prepare Python e os requisitos de `worker/requirements.txt` em ambiente privado,
   conforme o README. O executável Python desse ambiente será usado abaixo.
3. Execute `python -m worker.doctor --json` na raiz com esse interpretador. No
   macOS/Linux, o wrapper `./tools/check-local-ai.sh` é uma alternativa.
4. O doctor também confere OCR; Tesseract por+eng e Poppler são necessários para
   PDFs digitalizados. O benchmark abaixo recebe Markdown sintético já paginado
   e não exercita OCR, banco, autenticação ou envio de arquivos.
5. Mantenha o Ollama em loopback; o worker não aceita um endereço remoto. Para
   testar a plataforma inteira, API/worker/Ollama precisam executar no destino.

Os comandos usam `python` como nome genérico: substitua pelo interpretador do
ambiente, por exemplo `.venv-worker/bin/python` no macOS/Linux ou
`.venv-worker\Scripts\python.exe` no Windows. O roteiro específico de PowerShell está na seção abaixo.

## Windows com RTX3060 — passo a passo no PowerShell

A RTX3060 consta na [lista oficial de GPUs compatíveis](https://docs.ollama.com/gpu).
É uma candidata adequada para estes modelos em sequência;12GB de VRAM não são
comprovação de geração integral. Segundo os [requisitos Windows do Ollama](https://docs.ollama.com/windows),
verifique Windows10 22H2 ou posterior e driver NVIDIA551.61 ou posterior.
Não é preciso instalar CUDA Toolkit para o benchmark padrão do aplicativo.

### 1. Transferir os fontes

Baixe o pacote de fontes preparado no Mac e copie para o Windows por um meio
próprio (por exemplo, pendrive). Ele contém a aplicação e os testes, mas exclui
banco, segredos, ambientes Python e modelos. Extraia em uma pasta nova, por exemplo:

```powershell
Set-Location "C:\Projetos\Devsphere_NEXT_2026_validacao"
```

Ajuste esse caminho para a pasta extraída que contém `README.md`, `worker` e
`backend`. Não é necessário programar no Windows. Como as mudanças ainda não
foram commitadas/enviadas, baixar o GitHub pode trazer uma versão anterior;
o pacote de fontes atual preserva esse trabalho sem fazer push. Ele não possui
`.git` e não deve substituir uma cópia de trabalho existente.

### 2. Instalar dependências no PC

Instale [Python3 (64bits)](https://www.python.org/downloads/windows/) versão3.11+
e [Ollama para Windows](https://ollama.com/download/windows). Abra o aplicativo
Ollama e um PowerShell novo depois da instalação. Atualize o driver NVIDIA quando
necessário; confira o reconhecimento da GPU:

```powershell
nvidia-smi
ollama --version
```

`nvidia-smi` deve identificar a RTX3060 e sua memória. Se o comando não existir ou
a placa não aparecer, corrija a instalação do driver antes de concluir que o
modelo está usando GPU. O armazenamento precisa comportar app, dependências e
modelos; os artefatos instalados no Mac somaram cerca de8,6GB apenas de pesos.
Não transfira `.venv-worker` do Mac: crie um ambiente próprio no Windows.

### 3. Preparar Python e baixar os modelos

Na raiz extraída:

```powershell
py -3 -m venv .venv-worker
& .\.venv-worker\Scripts\python.exe -m pip install -r worker\requirements.txt

ollama pull qwen3:8b
ollama pull gemma3:4b
ollama list
```

Os comandos de download são executados por você no PC, após conferir espaço.
Se `py` não estiver disponível mas `python --version` indicar Python3.11+, use
`python -m venv .venv-worker`. Não é preciso ativar o ambiente nem alterar a
ExecutionPolicy do PowerShell: chamamos o interpretador diretamente.

Para inventário completo:

```powershell
& .\.venv-worker\Scripts\python.exe -m worker.doctor --json
```

O doctor também exige OCR; pode retornar indisponível por falta de Tesseract ou
Poppler mesmo quando o Ollama/modelos estão presentes. Isso não impede o benchmark
abaixo, que usa Markdown sintético e não processa PDF. OCR será preparado depois
para os testes completos de importação.

### 4. Executar o benchmark inicial

Estes são parâmetros iniciais de teste, sujeitos a medição no PC. Gen e crítica
são sequenciais; o adaptador pede descarregamento após cada resposta. Feche outras
execuções de modelos para não disputar VRAM. Não use o perfil experimental do
Mac/porta11435 como requisito deste teste; aqui o aplicativo padrão usa11434.

```powershell
$env:DEVSPHERE_OLLAMA_URL = "http://127.0.0.1:11434"
$env:DEVSPHERE_GENERATOR_MODEL = "qwen3:8b"
$env:DEVSPHERE_CRITIC_MODEL = "gemma3:4b"
$env:DEVSPHERE_OLLAMA_CONTEXT = "8192"
$env:DEVSPHERE_OLLAMA_CRITIC_CONTEXT = "16384"
$env:DEVSPHERE_OLLAMA_MAX_TOKENS = "6000"
$env:DEVSPHERE_OLLAMA_CRITIC_MAX_TOKENS = "768"
$env:DEVSPHERE_OLLAMA_BATCH = "64"
$env:DEVSPHERE_OLLAMA_TIMEOUT = "900"

& .\.venv-worker\Scripts\python.exe -m worker.benchmark --input worker\fixtures\synthetic-benchmark.request.json --report validation-reports\benchmark-rtx3060.json
Get-Content .\validation-reports\benchmark-rtx3060.json
```

Enquanto o benchmark estiver em execução, em outro PowerShell:

```powershell
ollama ps
```

Confira se o modelo ativo está usando GPU. O relatório, e não a mera instalação,
precisa mostrar `status: completed`,18 perguntas e22 exames. Falhas também geram
relatório com código/mensagem; não representam sucesso. `resource` não existe no
Python nativo Windows, então RSS do cliente pode aparecer como null; o benchmark
continua registrando alocação reportada pelo Ollama quando disponível.

### 5. Retornar a evidência

Envie somente o relatório técnico `benchmark-rtx3060.json` para análise.
Não é necessário copiar seu banco ou enviar logs completos/fontes clínicas.
O teste ainda não foi executado no PC: comandos revisados e regressões locais
não substituem a execução real no Windows. Validação clínica continua pendente.

### Usar o PC para IA não transfere o desenvolvimento

A primeira etapa testa apenas geração/crítica localmente no Windows; não exige
compilar a API C++20. A plataforma completa não foi portada para Windows nativo.
Os scripts `.sh` e o worker POSIX não devem ser executados como se fossem comandos
PowerShell. Se formos rodar toda a plataforma nesse PC, precisaremos preparar um
ambiente Linux/WSL compatível e validar também rede/GPU.

O Mac atualmente só aceita Ollama em loopback. Ele **não passará a usar a RTX3060
automaticamente** por estarem na mesma rede. Execução distribuída exigirá adaptação
separada, com autenticação e proteção de rede; não exponha a porta11434 publicamente.
Por enquanto, o resultado do PC será usado para validar os modelos enquanto a
programação continua no Mac.

## Benchmark reproduzível

Na raiz, usando o interpretador preparado:

```text
python -m worker.benchmark --input worker/fixtures/synthetic-benchmark.request.json --report caminho-privado/benchmark.json
```

A entrada foi marcada como inteiramente sintética para teste. Não é caso aprovado,
fonte real nem material publicado no catálogo. O relatório contém estado, contagens,
tempos, modelos/configuração e medidas de memória, sem texto da fonte/caso.

Antes de executar, configure limites compatíveis com o equipamento:

- `DEVSPHERE_OLLAMA_CONTEXT`: contexto do gerador; padrão8192.
- `DEVSPHERE_OLLAMA_MAX_TOKENS`: reserva de saída; padrão6000.
- `DEVSPHERE_OLLAMA_CRITIC_CONTEXT`: contexto da crítica; se ausente, herda o gerador.
  A crítica recebe o caso completo e as fontes; pode precisar de contexto maior.
- `DEVSPHERE_OLLAMA_CRITIC_MAX_TOKENS`: saída da crítica; padrão768.
- `DEVSPHERE_OLLAMA_BATCH`: padrão64;16 foi usado no experimento do M1.
- `DEVSPHERE_OLLAMA_TIMEOUT`:1–900 segundos por chamada; padrão600.

Não aumente reservas indiscriminadamente. Não execute outros benchmarks/modelos
em paralelo. Contexto pequeno que serve um JSON curto não comporta o caso completo.
Não substitua os modelos nem diminua18/22 para apresentar o teste como concluído.

## Critérios e devolução dos resultados

- Exigir `status: completed`,18 perguntas,22 exames e validação estrutural.
- Conferir digest/versão dos modelos e configurações, tempo por etapa, tokens e
  medidas de memória. RSS e `size/size_vram` reportados pelo executor são medidas
  distintas; `null` significa que a medição não foi obtida.
- Repetir depois de uma execução bem-sucedida para avaliar estabilidade; só então
  testar o fluxo completo de PDF na plataforma com base sintética isolada.
- Compartilhar apenas o relatório técnico necessário, sem PDFs privados, fontes,
  tokens, senhas, logs completos ou dados de pacientes.
- Revisão médica/pedagógica continua necessária; o benchmark não a substitui.

## O que já foi medido no M1/8GB

No perfil isolado q8_0/Flash Attention/uma execução/margem128MiB, o Qwen respondeu
JSON curto no contexto4096 em18,74s com37/37 camadas na GPU. No teste de caso completo
em8192, o log registrou `kIOGPUCommandBufferCallbackErrorOutOfMemory`; o adaptador
rejeitou `provider_incomplete` e nenhum caso foi aceito/publicado. Crítica Gemma
não foi alcançada nessa tentativa. O processo experimental foi encerrado.

O script opcional `tools/start-local-ollama.sh` reproduz somente esse perfil de
executor em outra porta (11435); não altera o aplicativo instalado, não baixa
modelos e recusa porta ocupada. **Ele não é uma correção validada para geração
integral no M1/8GB.** O aplicativo11434 e o worker padrão permanecem independentes.
Configurar `DEVSPHERE_OLLAMA_URL=http://127.0.0.1:11435` é uma escolha explícita no
terminal de teste, somente com o perfil executando. Não deixar duas inferências
concorrentes nos dois serviços.

Parâmetros de cache e concorrência: [FAQ oficial do Ollama](https://docs.ollama.com/faq).
Reduzir memória de cache pode alterar resultados e exige nova avaliação de qualidade.
Não foram alterados pesos/variantes dos modelos adotados para o projeto.

O benchmark pode registrar RSS do cliente como null em sistemas sem o módulo
`resource`, como Python nativo do Windows; há regressão simulando essa ausência.
Isso não representa teste real no Windows. O backend C++20/worker de produção
não foi portado nem homologado para Windows nativo nesta tarefa; a orientação do
ambiente completo depende do sistema informado.
