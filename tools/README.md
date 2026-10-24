# Validação estrutural de casos

> **Modo local protegido:** inferência desabilitada por padrão. Para executar e apresentar no Mac, siga o [roteiro protegido](../docs/MODO_APRESENTACAO_MAC.md). Conversão e orçamento não carregam Qwen/Gemma. Geração integral permanece pendente no Windows.

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


Execute:

```bash
python3 tools/validate_clinical_case.py caminho/do/caso.json
python3 -m unittest discover -s tools -p 'test_*.py'
```

O validador verifica quantidades, campos dos itens, IDs, pais, ciclos, evidências prioritárias, hipóteses e referências. Ele não substitui a revisão clínica do professor.

## Auditorias de acessibilidade

`tests/browser_accessibility.cjs` usa Chrome Windows real, API C++20 no WSL e
contas/banco temporários. Executa axe, teclado, layout, árvore AX e Lighthouse.
`tests/browser_web_developer.cjs` exercita a extensão oficial instalada em
Chromium Linux descartável, incluindo zoom real e leitura sem CSS.

[Comandos completos, versões e limites](../docs/ACESSIBILIDADE_NEXT_2026.md#reproduzir-neste-computador).
Os relatórios são locais/ignorados. Web Developer não possui nota própria e
pontuação Lighthouse não substitui teste real com leitor de tela.

## Operação, armazenamento e acessibilidade — etapa de 23/10/2026

O modo local protegido continua com `DEVSPHERE_INFERENCE_ENABLED=0`; nenhum modelo precisa ser carregado para estas funções.

- **Administração → Operação e recuperação:** mostra fila, heartbeat, falhas recorrentes, espaço disponível e alertas com ações sugeridas. Atualização manual ou a cada 30 segundos enquanto a página estiver visível; não executa reparos automaticamente. Endpoint autenticado e restrito a administrador: `GET /api/v1/operations`, com escopo institucional.
- **Limites de PDFs-fonte:** padrões configuráveis no processo da API: `DEVSPHERE_STORAGE_USER_BYTES=209715200`, `DEVSPHERE_STORAGE_INSTITUTION_BYTES=1073741824` e `DEVSPHERE_STORAGE_MIN_FREE_BYTES=536870912`. São 200 MiB/conta, 1 GiB/instituição e reserva de 512 MiB. PDFs retirados continuam contando. Não representa quota de todo o banco, relatórios, logs ou backups. Veja [limites, erros e legados](../docs/LIMITES_ARMAZENAMENTO.md).
- **Reconciliação após queda:** plano somente leitura, manutenção com API/worker parados e aplicação explícita para quarentena/restauração por hash. Não apagar órfãos automaticamente nem reconstruir um PDF a partir de Markdown. Veja [procedimento de reconciliação](../docs/RECONCILIACAO_ARQUIVOS.md).
- **PDF oficial:** novos relatórios possuem idioma, título, marcadores e estrutura lógica real para leitura assistiva. O Python da API precisa de **ReportLab e pypdf**; pypdf já consta em `worker/requirements.txt`. PDFs antigos não são reescritos. Veja [Safari, VoiceOver e PDF](../docs/ACESSIBILIDADE_SAFARI_PDF.md).

A migration incremental `017_storage_bytes.sql` preserva fontes antigas com tamanho desconhecido (`NULL`). A admissão seguinte confere caminho/hash/arquivo antes de preencher bytes; fonte ausente/divergente bloqueia novos envios da instituição em vez de ser ignorada. O diagnóstico de leitura não altera essa contabilidade. Migrations devem seguir o backup consistente já documentado.

Safari nativo foi identificado, mas sua sessão de automação está bloqueada pela preferência de automação remota desativada, que não foi alterada. Jornadas Safari e leitura real com VoiceOver permanecem pendentes humanas; estrutura PDF/árvore automática não certifica PDF/UA.

As variáveis acima valem apenas no terminal/processo que as recebeu. Preserve o modo protegido ao reiniciar a API e mantenha banco/raiz de fontes coerentes com o worker. Encerramento: Ctrl+C no terminal original; não mate processos por nome. Os guias vinculados explicam manutenção e recuperação, sem apagar dados locais.

Roteiro do painel, alertas, inicialização e recuperação: [Operação e recuperação](../docs/OPERACAO_E_RECUPERACAO.md).
