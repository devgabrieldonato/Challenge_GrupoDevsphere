# Validação estrutural de casos

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
