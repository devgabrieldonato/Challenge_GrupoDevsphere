# Integração NEXT_2026 na main — 25/10/2026

## Escopo e referências

Integração autorizada pelo usuário, incluindo commit de merge, push exclusivo da
`main` e fetch de conferência. Base da `main`:
`a101c31057b61c553d8ad7c3878ad2a50c3fd702`. Origem:
`d0aa896ae9efd0149ffd0196f05f418f3a68b8ef` (`NEXT_2026`).

O fetch inicial confirmou ambas as branches sincronizadas. A `main` era ancestral
da origem: nove commits novos e nenhum commit exclusivo da `main`. A integração
foi preparada com `--no-ff --no-commit` em worktree isolado, sem conflitos textuais
e sem selecionar globalmente `ours`/`theirs`. O commit de merge preserva as duas
linhas do histórico; a branch de origem não é movida para o merge.

O resultado da publicação e seu SHA ficam no histórico Git e nas duas notas do
Notion após conferência remota. Para inspecionar as referências no clone:

```bash
git log -1 --format='%H %P %s' main
git rev-list --left-right --count main...origin/main
git merge-base --is-ancestor NEXT_2026 main
```

## Evoluções preservadas

- Backend C++20, SQLite e migrations incrementais `001` a `017`.
- Casos versionados, João/Marina, imagens e legendas por paciente; conteúdo público
  separado do gabarito e das fontes restritas.
- Atendimento, dependências, ordem e pontuação no servidor; hipóteses, PDF
  automático, histórico e novas tentativas.
- Revisão docente, rascunho restrito, devolutiva concluída e notificações ao aluno.
- Upload, extração/OCR limitado, Markdown, orçamento e diagnóstico do worker.
- Arquivamento/restauração de trabalhos; retirada e exclusão conservadora de fontes.
- Quotas de PDFs-fonte, reserva de disco, alertas operacionais, reconciliação
  explícita por plano/quarentena e restauração por hash.
- Estrutura lógica do PDF e navegação acessível, sem certificação PDF/UA.
- Inferência bloqueada por padrão na API, fila/worker e adaptador. Não basta
  alterar um botão ou payload para habilitar os modelos.

Não foram alterados modelos, dependências, regras clínicas ou a política de
inferência. Além da integração, foram atualizadas instruções e acrescentado um
teste de migração a partir do esquema da `main` antiga.

## Revisão por agentes

| Responsável | Trabalho e evidência |
| --- | --- |
| Backend | Revisão de migrations, backup, autorização, curadoria e confinamento dos estáticos. Novo teste preserva dados de 24 tabelas acadêmicas da base sintética antiga. |
| Frontend | Jornadas Chrome, imagens decodificadas, PDF/devolutiva, modo protegido, formulários, arquivamento e operação. Nenhuma edição de produto necessária. |
| Documentação | Seis READMEs próprios, comandos, UTF-8, links, dependências do PDF e separação entre histórico Windows e estado integrado. |
| Coordenador | Merge, compilação, regressões integradas, contratos, revisão do diff e arquivos privados, relatório e acompanhamento no Notion. |

## Verificações executadas nesta integração

Mac M1/8 GB, build separado e bancos/documentos sintéticos. Os serviços pessoais
em `8080` e `5501` não foram encerrados. Não houve geração ou carregamento de modelos.

| Verificação | Resultado e alcance |
| --- | --- |
| Compilação C++20 | Aprovada, `-j 2`; alvo SQLite compatível com CMake 3.20 emite aviso de depreciação no CMake mais recente, sem erro de compilação. |
| CTest | 2/2 aprovados; MFA, núcleo e PDF usando Python explícito. |
| Worker | 85/85 aprovados em 11,867 s, com `ResourceWarning` tratado como erro. Provedores simulados somente nos testes. |
| Ferramentas | 123 executados em 78,490 s: 120 aprovados e 3 testes de IA real não executados por opt-in. |
| Contrato estrutural de caso | 6/6 aprovados: quantidades, IDs, dependências, ciclos e referências. Não constitui revisão clínica. |
| Migração/backup | 4 testes incluídos na suíte de ferramentas: `001–005` → `017`, projeção dos valores antigos em 24 tabelas, backup anterior, WAL, integridade e chaves estrangeiras; reaplicação sem novo backup. |
| Jornadas Chrome | João/Marina, imagem visível com `naturalWidth > 0`, legenda, investigação/pontuação, PDF, histórico, rascunho privado, devolutiva concluída e notificações aprovados. Editor de 40 itens e permissões também verificados. |
| Interface protegida | Aprovada; geração direta recusada com `403 inference_disabled`, campos preservados e prévia invalidada. Heartbeat e orçamento deste ensaio usam fixtures HTTP identificadas; login/upload/bloqueio usam API real sintética. |
| Arquivamento/operação | Cancelamento, confirmação, ocultação, restauração, reutilização do documento e alertas operacionais aprovados com API real e base descartável. |
| Formulários públicos | 16 cenários Chrome entre 320 e 1280 px, correção de senha e envio por teclado; sem transbordamento. |
| Sintaxe/contratos | 25 JavaScripts válidos; HTML em UTF-8/PT-BR; três JSON Schemas válidos; OpenAPI 3.1 com 49 caminhos e referências locais resolvidas. Leitura YAML feita pelo Ruby disponível; não foi instalado validador adicional nem executada certificação OpenAPI. |
| API/Live Server existentes | Health da API e página `5501` com HTTP 200; preflight com origem `http://127.0.0.1:5501` e credenciais permitido. Worker com heartbeat recente, inferência falsa e fila sem trabalhos ativos na conferência. |

Total das suítes CTest/Python: **213 testes aprovados e 3 não executados**.
Os testes de migração estão incluídos nesse total; cenários de navegador são
relatados separadamente, sem somá-los artificialmente.

### Limites das evidências

- O teste completo com a extensão Live Server nas portas reais `8080/5501`
  retornou **SKIP 77**, pois essas portas pertenciam aos serviços pessoais. Sua
  guarda passou, sem encerrar processos alheios. A origem `5501` do teste de
  jornadas usa proxy sintético explícito; não substitui o ensaio real da extensão.
- Leitura de saúde/CORS dos serviços existentes não é teste de login com contas
  pessoais. Cookies e jornadas foram exercitados nas APIs sintéticas isoladas.
- Os relatos positivos do usuário sobre VoiceOver no Safari e Chrome são de
  24/10 e foram preservados; não houve nova rodada humana após este merge.
  Cenários específicos do PDF e revisão assistiva adicional continuam sujeitos
  a confirmação humana; automação remota do Safari não foi habilitada.
- Testes de watchdog/baixo espaço usam fixtures. A mensagem `low_memory_headroom`
  de um teste vem de leitura simulada, sem provocar pressão real no Mac.
- Registros históricos de êxito Windows não validam automaticamente este snapshot.
  A validação real Qwen3:8b + Gemma3:4b continua pendente em Windows/WSL2.
- Os ensaios não substituem revisão clínica, auditoria independente ou homologação.

## Reproduzir os testes leves

Na raiz do mesmo clone, com `.venv-worker` já preparado conforme o README:

```bash
export DEVSPHERE_PYTHON="$PWD/.venv-worker/bin/python"
cmake -S backend -B build/backend -DBUILD_TESTING=ON
cmake --build build/backend -j 2
DEVSPHERE_INFERENCE_ENABLED=0 ctest --test-dir build/backend --output-on-failure
DEVSPHERE_INFERENCE_ENABLED=0 "$DEVSPHERE_PYTHON" -W error::ResourceWarning -m unittest discover -s worker/tests
(
  # Só o ambiente dos testes: fixtures de fila não iniciam modelos reais.
  unset DEVSPHERE_INFERENCE_ENABLED
  export DEVSPHERE_TEST_API_BIN="$PWD/build/backend/devsphere-api"
  export DEVSPHERE_TEST_REAL_AI=0
  "$DEVSPHERE_PYTHON" -W error::ResourceWarning -m unittest discover -s tools/tests
  "$DEVSPHERE_PYTHON" -m unittest discover -s tools -p test_validate_clinical_case.py
)
```

Não herde limites experimentais de benchmark. Comandos de navegador e respectivos
requisitos estão em [ferramentas](../tools/README.md) e nos testes `tools/tests/`.
Não instale outro navegador nem interrompa serviços para liberar portas sem
identificar sua origem.

## Executar e apresentar no Mac

No primeiro terminal, na raiz do clone existente:

```bash
export DEVSPHERE_ENV=development
export DEVSPHERE_INFERENCE_ENABLED=0
export DEVSPHERE_DB_PATH="$PWD/backend/data/devsphere.db"
export DEVSPHERE_SOURCE_DIR="$PWD/backend/data/sources"
export DEVSPHERE_PYTHON="$PWD/.venv-worker/bin/python"
./tools/start-local-api.sh
```

Se já houver API saudável, o inicializador informa isso e sai; saúde não comprova
versão ou banco. Para aplicar código novo, encerre apenas a API identificada no
terminal original e inicie-a novamente. Não execute migrations paralelas a ela.

Para conversão e orçamento, em outro terminal na mesma raiz, **somente se não
houver worker desse ambiente ativo**, repita os cinco `export` acima e execute:

```bash
./tools/start-worker.sh
```

Use `http://127.0.0.1:8080` ou Live Server em `http://127.0.0.1:5501`, mantendo a
API ativa. Sirva somente `frontend/`, conforme `.vscode/settings.json`. Faça login
na interface; não copie bancos ou credenciais entre máquinas. A criação de contas
locais é documentada no [README principal](../README.md).

Roteiro: atendimento → finalizar/PDF → revisão docente → devolutiva ao aluno →
contribuições → Markdown → orçamento → aviso de geração bloqueada. Não apresentar
um rascunho manual como resultado gerado por IA. Encerramento: Ctrl+C apenas nos
terminais dos serviços iniciados por você. Variáveis valem por terminal/processo;
não modificam globalmente o Ollama ou os modelos.

## Pendências e preservação

Continuam pendentes: teste integral e repetibilidade dos modelos no Windows/WSL2;
revisão clínica de versões, dificuldade/tags/rubrica; políticas institucionais de
revisão, uso e retenção das fontes; identidades/MFA de produção; licenças,
segurança independente e infraestrutura/homologação de produção.

Não houve migration sobre a base pessoal nesta integração. Bancos, fontes, WAL,
backups, ambientes e relatórios privados ficaram fora do commit. Relatórios de
navegador foram salvos somente em diretórios temporários locais; podem expirar e
devem ser recriados com os comandos dos testes. A reconciliação não foi aplicada
às fontes pessoais. Não se declara ausência absoluta de erros ou segurança total.

Notas acompanhadas, sem mudança de compartilhamento:
[planejamento](https://app.notion.com/p/3fa223c1e64d812d81a2ec4e8fcb2b7d) e
[segurança](https://app.notion.com/p/3fa223c1e64d81ed9064fabdd9443394).
