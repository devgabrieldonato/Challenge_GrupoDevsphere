# Validação do Live Server real — NEXT_2026

## Objetivo e limites

O teste opcional `tools/tests/browser_live_server.cjs` carrega o módulo **real da extensão Live Server instalada** e serve somente `frontend/` em `http://127.0.0.1:5501`. Uma API C++20 própria usa a porta `8080` e um SQLite temporário com conta sintética e senha aleatória. O teste não usa interceptação de rede, `page.route`, proxy ou substituição do cliente da aplicação.

Isso complementa `browser_next.cjs`, cujo cenário de origem `5501` utiliza roteamento de teste. Comprova a comunicação HTTP do módulo da extensão; não automatiza o clique no botão “Go Live” nem a interface do VSCode. É um ensaio local, não uma homologação de produção.

## Proteção dos serviços e dados pessoais

Antes de criar banco ou processos, o teste tenta reservar **ambas** as portas `8080` e `5501` em `127.0.0.1`. Se alguma estiver ocupada ou indisponível, retorna `SKIP` com código **77**, sem enviar requisições ao serviço existente, reiniciar serviços ou tentar outra porta. O autoteste da guarda usa somente portas efêmeras próprias.

Não execute simultaneamente outro inicializador nas mesmas portas: a reserva precisa ser liberada para os dois processos filhos assumirem os endereços. Se um filho falhar, o teste aborta. A limpeza encerra somente os processos criados por esta execução e remove somente seu diretório temporário. Não acessa o SQLite pessoal, não instala dependências e não inicia worker, inferência ou downloads.

O ambiente da API é construído explicitamente para desenvolvimento. Caminhos de banco e configurações de produção herdados do terminal não são reutilizados. As credenciais sintéticas ficam somente na memória e no ambiente do processo próprio, sem impressão no terminal.

## Como executar

Pré-requisitos: API compilada com migrations e seed atuais, Node.js, Playwright e Chromium/Chrome disponíveis, além da extensão Live Server instalada. Não é necessário manter uma API pessoal aberta; isso fará o cenário ser ignorado por segurança.

```bash
node tools/tests/browser_live_server.cjs --guard-self-test
DEVSPHERE_TEST_BINARY=/caminho/absoluto/devsphere-api \
  node tools/tests/browser_live_server.cjs
```

Configurações opcionais:

- `DEVSPHERE_TEST_BINARY`: binário da API; padrão `build/backend/devsphere-api`.
- `LIVE_SERVER_MODULE`: diretório do módulo instalado; padrão `~/.vscode/extensions/ritwickdey.liveserver-5.7.10/node_modules/live-server`.
- `PLAYWRIGHT_MODULE`: caminho absoluto do módulo Playwright quando não resolvido pelo Node.
- `CHROME_PATH`: executável do navegador; no macOS, usa Chrome instalado se disponível.
- `DEVSPHERE_PYTHON`: interpretador disponível para componentes auxiliares da API. Este cenário não solicita geração de PDF.

Códigos de saída: **0** passou; **1** falha de execução ou asserção; **77** cenário não executado por indisponibilidade das portas. `SKIP` não representa sucesso funcional.

## Evidências verificadas

1. O HTML contém a injeção específica do Live Server real.
2. Login de aluno pela interface e carregamento do catálogo João/Marina.
3. Criação de atendimento e aceitação de uma pergunta pelo servidor.
4. Chamadas reais `5501 → 8080`, respostas CORS com origem exata e `Access-Control-Allow-Credentials: true`.
5. Cookie HttpOnly e consulta autenticada a `/auth/session` no navegador.
6. Fechamento da página e reabertura na mesma sessão do navegador, sem reiniciar API ou banco.
7. Recuperação do mesmo atendimento com a ação persistida após reabrir, além de recarga do catálogo.
8. Ausência de erros JavaScript de execução.

Não cobre neste cenário: finalização/PDF, professor/curadoria, OCR/modelos ou fechamento completo do navegador. Esses fluxos têm testes próprios; não extrapolar esta evidência.

## Execução registrada em 16/10/2026

A guarda passou em teste sintético de conflito e liberação de reserva parcial. O cenário funcional passou com o módulo `ritwickdey.liveserver-5.7.10`, Chrome instalado e API temporária compilada. As portas estavam livres e não foi necessário interromper serviço pessoal. Consulte a saída do teste para confirmar uma nova execução; o estado das portas pode mudar.
