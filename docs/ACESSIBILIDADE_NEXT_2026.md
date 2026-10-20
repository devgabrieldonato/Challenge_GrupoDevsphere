# Acessibilidade e temas — NEXT_2026

Registro técnico de 20/10/2026. Evolução posterior à publicação `ef802ac`,
com commit/push na NEXT_2026 autorizados pelo usuário após os testes. Somente dados e contas
sintéticos nos ensaios. Nenhuma inferência nova de IA.

## Comportamento entregue

- Botão **Tema escuro** em todas as 17 páginas e na entrada de compatibilidade da
  raiz; Tab para alcançar e Espaço/Enter para alternar. `aria-pressed` informa
  o estado ao leitor de tela, mantendo o nome do controle estável.
- Na primeira visita, segue `prefers-color-scheme`. Depois da escolha, guarda
  somente `pacientevirtual.theme` (`light`/`dark`) no localStorage desta origem.
  A preferência acompanha a navegação e sincroniza abas. Sem armazenamento
  disponível, a troca continua funcionando na página atual.
- Script próprio carregado antes do CSS; sem serviço externo ou dependência npm
  para usar o tema. CSS usa tokens para texto, superfícies, bordas, estados,
  perguntas/exames e links. Mantém legendas e textos além das cores.
- Foco visível, distinguindo o filtro selecionado do filtro focado; quebra de
  navegação e conteúdo longo; 43 tamanhos tipográficos passaram de px para rem.
  Respeita movimento reduzido, cores forçadas e impressão em paleta clara.
- Skip link chega ao conteúdo também no atendimento. Iniciar caso leva o foco
  ao título da investigação; ações anunciam um status curto sem reler todo o mapa.
- Prévia de documento tem nome acessível, Tab contido no diálogo, Escape e retorno
  ao acionador. A regressão reproduziu a perda de foco causada pelo botão
  temporariamente desabilitado e motivou a correção explícita.
- Campos dinâmicos de documentos têm rótulos visíveis persistentes. Busca anuncia
  o resultado. Atualização dos cartões preserva contexto sem roubar foco de quem
  já navegou para outro controle. Erro de MFA direciona ao campo de código.
- Dicas de domínio/senha associadas aos campos. Rótulo do PDF fica junto ao input
  correspondente. Retirado aria-label redundante de div genérica da marca.

## Evidências e limites

### Lighthouse no Chrome Windows

Lighthouse **13.5.0**, Chrome **155.0.8059.85**, categoria **accessibility**,
perfil desktop 1280×900, perfis temporários e sessões sintéticas próprias.
Auditoria mantém o armazenamento para não trocar a sessão autenticada por login;
confere a URL final e a propriedade do listener antes de cada ensaio.

| Página representativa | Claro | Escuro |
| --- | --- | --- |
| Escolha de perfil | 100/100 | 100/100 |
| Histórico do aluno | 100/100 | 100/100 |
| Painel do professor | 100/100 | 100/100 |
| Painel do administrador | 100/100 | 100/100 |

Os oito relatórios JSON/HTML originais estão em
`validation-reports/accessibility-1792516923221-6f26b632/`. Essa rodada ainda
registrou falha de retorno do diálogo e uma asserção prematura do evento de tema
SO. A primeira foi corrigida no produto; a segunda passou a aguardar o evento.
A rodada completa final está registrada abaixo, preservando esse histórico.

Lighthouse não tem categoria própria de usabilidade. Performance, SEO e boas
práticas não foram pontuados nesta etapa. A pontuação de acessibilidade cobre
regras automáticas; [verificações manuais não entram na nota](https://developer.chrome.com/docs/lighthouse/accessibility/scoring/).
Não representa certificação WCAG nem garantia de uso com toda tecnologia assistiva.

### Axe, teclado e layout

Axe-core **4.14.0**, regras WCAG 2 A/AA, 2.1 A/AA e 2.2 AA. A rodada completa
`validation-reports/accessibility-1792526922524-6248a2cb/summary.json` passou
**36 cenários**, com **zero violações** e **130 verificações sem falha**:
17 páginas em claro/escuro, mais investigação iniciada e documento modal aberto.
As páginas autenticadas foram realmente acessadas com os três papéis.

Cobertura: reflow 320/640 px, fontes rem a 200%, skip link, login por Tab/teclas,
seleção/início do caso, foco após ação, árvore de acessibilidade Chrome (marco
main, nome/estado do botão, diálogo nomeado), região viva, Tab/Shift+Tab no modal,
Escape/retorno, preferência do SO e troca com armazenamento bloqueado.

Resultados `incomplete` do axe são preservados, sem contá-los como aprovação.
Essa rodada identificou marca com aria-label sem role e status sobre o fundo
pontilhado do mapa; o atributo redundante foi retirado e o status reposicionado
fora da decoração. A revisão independente também pediu a distinção do foco no
filtro ativo. A rodada final verifica essas alterações.

A regressão existente `browser_next.cjs` passou após os primeiros ajustes:
login, atendimento, hipótese/PDF/submissão, histórico, devolutiva, XSS, notificações,
curadoria, permissões e editor de 40 itens, sem erros de execução observados.
Ela é teste funcional complementar, não auditoria completa de acessibilidade.

### Web Developer e zoom real

Extensão oficial **Web Developer 3.0.1** já instalada. Seu código foi carregado em
**Chromium 151 Linux** com perfil descartável, conforme o
[fluxo de extensões do Playwright](https://playwright.dev/docs/chrome-extensions).
Nenhuma alteração do perfil Chrome pessoal ou instalação de extensão nova.
Funções oficiais executadas por `chrome.scripting`, sem automatizar a barra do
navegador: contorno de títulos, detalhes de formulários, atributos alt e desativação
real dos estilos em index e dois cadastros. Conteúdo e rótulos permaneceram acessíveis.
Essas páginas não têm imagens de conteúdo; ausência de alt nelas não comprova
cobertura das ilustrações do atendimento, verificadas nas auditorias do aplicativo.

Zoom real por `chrome.tabs.setZoom`: **200% e 400%**, nos dois temas e três páginas,
**12 combinações**, sem rolagem horizontal global; viewport efetivo 640/320 px e
DPR 2/4 confirmados. Botão de tema operável por teclado sem perder foco.
Relatório: `validation-reports/web-developer-1792516833486.json`.
A primeira comparação de zoom 4 encontrou 3.9999999999999996; corrigida a tolerância
numérica do teste, sem relaxar o critério de reflow.

Web Developer é uma [barra de ferramentas de inspeção](https://github.com/chrispederick/web-developer/blob/main/readme.md),
**não atribui nota 0–100**. Não foi usado WAVE nem outro validador externo.
A automação nativa Windows foi interrompida por não conseguir determinar a URL do
Chrome com segurança; nenhuma tentativa de contornar essa interface foi feita.
Os ensaios programáticos acima usaram perfis próprios e URLs locais conhecidas.

### Leitor de tela real

Narrador Windows disponível, mas a fala não foi validada automaticamente. O usuário
aceitou testar a página pública com Narrador; **relato ainda aguardado**. A árvore
AX e os testes de teclado não serão apresentados como se fossem uma sessão ouvida
com leitor real. NVDA, JAWS e VoiceOver ainda não testados nesta rodada.

Roteiro manual, sem dados pessoais: abrir a página inicial; ativar Narrador com
Windows+Ctrl+Enter; Tab até Tema escuro; Espaço para alternar; conferir nome e estado
anunciados; alcançar os três acessos; confirmar rótulos e erros do formulário;
no atendimento, conferir foco/anúncio após ação e o diálogo com Escape/retorno.
[Comandos oficiais do Narrador](https://support.microsoft.com/pt-br/accessibility/windows/narrator/appendix-b-narrator-keyboard-commands-and-touch-gestures).
Registrar navegador/leitor/versão, passos, resultado e limitações; nunca senha/MFA.

## Rodada final consolidada

Relatório final: `validation-reports/accessibility-1792527108790-e0438ca5/summary.json`.
**36 cenários axe, zero violações, zero incomplete e 139 verificações aprovadas**;
**oito Lighthouse 100/100**, sem erros nem auditorias reprovadas nessas páginas.
Inclui as correções finais do diálogo, marca, status e filtro ativo. JSON/HTML de
cada Lighthouse estão nessa mesma pasta e continuam fora do versionamento.
Os relatórios anteriores acima são histórico; não somar seus cenários aos finais.

Oito pontuações representam quatro páginas nos dois temas, não todas as rotas
possíveis do sistema. A matriz axe cobre 17 páginas e dois estados adicionais;
um cenário automático sem erro não equivale a aprovação humana de cada tarefa.
O ensaio de zoom real é separado (três páginas públicas/12 combinações).
Relato real do Narrador permanece aguardado; não foi deduzido das notas.

## Reproduzir neste computador

Na raiz do clone, PowerShell. Node **22.19+**, Chrome, WSL2 e o build/venv Linux
conforme o README principal. As dependências de auditoria são opcionais para
executar o produto e ficam em `.local/`, ignorado pelo Git:

```powershell
Set-Location 'C:\Users\vinic\Projetos\Challenge_GrupoDevsphere'
& 'C:\Program Files\nodejs\npm.cmd' install --prefix .local\a11y-runtime --no-audit --no-fund --ignore-scripts --save-exact lighthouse@13.5.0 axe-core@4.14.0
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:PLAYWRIGHT_MODULE = "$HOME\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright"
$env:DEVSPHERE_WSL_DISTRO = 'PacienteVirtual-Ubuntu2404'
$env:DEVSPHERE_WSL_USER = 'pacientevirtual'
$env:DEVSPHERE_WSL_REPO = '/mnt/c/Users/vinic/Projetos/Challenge_GrupoDevsphere'
$env:DEVSPHERE_LINUX_PYTHON = '/home/pacientevirtual/.venvs/pacientevirtual/bin/python'
$env:DEVSPHERE_TEST_API_BIN = '/home/pacientevirtual/build/pacientevirtual/backend/devsphere-api'
& 'C:\Program Files\nodejs\node.exe' tools\tests\browser_accessibility.cjs
```

O Playwright **1.62.1** existente foi reutilizado. Em ambiente sem esse pacote,
instale `playwright@1.62.1` no mesmo prefixo local e aponte PLAYWRIGHT_MODULE para
`$PWD\.local\a11y-runtime\node_modules\playwright`. Não precisa baixar outro Chrome
para esse harness Windows. Os caminhos acima são deste PC, ajuste-os em outro.

Cada execução gera uma pasta nova. `--skip-lighthouse` executa a matriz axe/layout;
`--states-and-lighthouse` verifica estados e Lighthouse sem repetir toda a matriz.
Banco, contas, TOTP e PDF são temporários; senha por stdin, sem segredo em argv.
Se 8087 estiver ocupada, o teste recusa; não encerra o serviço existente.
`BROWSER_TEST_PORT` permite escolher outra porta livre. Sem no-sandbox ou remoção
de proteção do navegador. A limpeza limita-se a filhos e diretórios próprios.

Web Developer, **PowerShell chamando Node Linux** (somente extensão oficial instalada):

```powershell
wsl -d PacienteVirtual-Ubuntu2404 -u pacientevirtual --exec /usr/bin/env PLAYWRIGHT_MODULE=/mnt/c/Users/vinic/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright WEB_DEVELOPER_EXTENSION='/mnt/c/Users/vinic/AppData/Local/Google/Chrome/User Data/Default/Extensions/bfbameneiokkgbdmiekhjnmfkcnldhhm/3.0.1_0' /home/pacientevirtual/deps/node-v24.22.0-linux-x64/bin/node tools/tests/browser_web_developer.cjs
```

Exige Chromium Linux já preparado para o Playwright. Não baixa a extensão nem
substitui seu perfil. O teste serve somente frontend em porta aleatória loopback,
valida origem/aba e encerra seus recursos. Não envia conteúdo a site externo.
Os dois novos harnesses foram executados neste Windows/WSL; não declarar reteste
macOS. Para verificar manualmente no Mac, usar a API local e Chrome/VoiceOver,
registrando seus resultados separadamente.

## Pendências específicas

- Receber relato do Narrador; ampliar com usuários de tecnologia assistiva,
  VoiceOver/NVDA e tarefas completas de todos os papéis.
- Testar outros navegadores e combinações de sistema/dispositivo; validar com
  pessoas com baixa visão e diferentes necessidades cognitivas/motoras.
- Inspecionar acessibilidade do PDF exportado como artefato próprio; texto extraído
  corretamente não prova documento PDF marcado/acessível.
- Notas automáticas não encerram avaliação manual de ordem de leitura, clareza dos
  textos, conteúdo alternativo e adequação dos anúncios durante o uso prolongado.

## Repaginação institucional — 20/10/2026

Framework: Bootstrap Grid 5.3.8 local (colunas/gutters/utilitários, sem Reboot ou
JavaScript Bootstrap); Bootstrap Icons 1.13.2 para sol/lua e setas. Licenças e
origens em `../frontend/vendor/README.md`. Logos fornecidos pelo usuário copiados
byte a byte para `../frontend/assets/brand/`, sem recoloração ou alteração de
transparência. A composição é HTML/CSS; fundo branco discreto preserva o azul da
marca também no tema escuro. Identidade: FIAP + Faculdade Moinhos de Vento —
Paciente Virtual. Estilos próprios em institutional.css, carregados por último.

As 18 entradas têm um rodapé institucional com o texto exato solicitado em 2026.
O aviso contextual do atendimento foi preservado como parágrafo. Tema agora é
acionado por ícone decorativo sol/lua, com nome acessível estável e aria-pressed.
A grade, tipografia, espaçamento, cartões, login e investigação foram refinados
mantendo IDs, navegação, permissões e fluxos existentes.

Nova rodada após a repaginação:

- `validation-reports/accessibility-1792528999762-11e42fa2/summary.json`:
  36 cenários axe, zero violações, zero incomplete, 175 verificações aprovadas e
  oito Lighthouse accessibility 100/100 (quatro páginas nos dois temas).
- As verificações adicionais conferem carregamento/proporção dos logos, presença
  do rodapé exato, h1 único, nome/estado e ícone do tema em cada cenário.
- `validation-reports/web-developer-1792529168877.json`: três páginas com funções
  oficiais Web Developer e 12 combinações de zoom real 200%/400% aprovadas.
- Regressão integrada `browser_next.cjs` passou novamente, incluindo atendimento,
  PDF, devolutiva, administração, curadoria e editor de 40 itens. Sem IA real nova.
- Conferência estática das 18 entradas: IDs/ARIA/labels/caminhos, dois logos, h1 e
  footer únicos. Capturas desktop/celular, claro/escuro, inspecionadas visualmente;
  em `validation-reports/identity-*.png`, locais e ignoradas.

Resultados anteriores permanecem como histórico. Esta rodada não valida fala de
leitor de tela nem outras categorias Lighthouse; pendências manuais continuam.
Alterações locais na NEXT_2026, sem novo commit/push nesta etapa.

## Simplificação do cabeçalho — 20/10/2026

A pedido do usuário, as 18 entradas passam a mostrar apenas as marcas e
Paciente Virtual ampliado ao lado, sem o subtítulo das instituições nem o texto
Laboratório de raciocínio clínico. O painel branco e sua borda foram removidos.
No tema escuro, as marcas são apresentadas em branco por filtro CSS; os arquivos
PNG originais permanecem intactos. Os nomes das instituições continuam nos textos
alternativos e o h1 de cada página foi preservado. Na impressão, não há filtro.

Capturas desktop/celular nos dois temas foram inspecionadas. A rodada
validation-reports/web-developer-1792530508198.json aprovou as três páginas e
as 12 combinações de zoom real 200%/400%, sem rolagem horizontal.

Regressão posterior ao ajuste: validation-reports/accessibility-1792530480853-12e9c3ea/summary.json, com 36 cenários axe sem violações, 175 verificações sem falhas e oito auditorias Lighthouse de acessibilidade com 100/100. Leitor de tela real continua como verificação manual pendente. git diff --check aprovado; sem commit ou push nesta etapa.

Revisão pré-commit independente: nenhum bloqueador ou arquivo privado identificado. Ajustado o contêiner do h1 do atendimento para div e explicitada a restauração do tema entre fatores no teste Web Developer. Novo ensaio validation-reports/web-developer-1792530904588.json passou nas três páginas e 12 combinações, com asserção do tema real. Sintaxe JavaScript e diff conferidos. READMEs/macOS/Windows preservados e documentação atualizada antes do commit autorizado.
