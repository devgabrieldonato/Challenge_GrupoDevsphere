# Design system

Os papéis de cor vêm de `frontend/styles/tokens.css` (Sprint 3) e foram mantidos em `web/src/index.css` como CSS variables. `web/tailwind.config.js` expõe esses tokens como classes (`bg-surface`, `text-muted`, `border-line`, `bg-primary`...). Trocar o tema muda só as variáveis.

## Tipografia
Inter, com fallback para fontes do sistema. `h1` de 1,5 a 2,25 rem conforme a tela; `h2` e `h3` seguem a mesma escala.

## Cores
Marca `#c70f4c`, primária `#2447b7`, texto `#15283e`. Estados: sucesso, aviso, perigo e informação, cada um com cor de texto e fundo. Perguntas usam roxo e exames usam verde-água. Há versão para tema escuro. Os pares de texto e fundo foram escolhidos para manter contraste mínimo AA.

## Componentes
`.btn`, `.btn-primary`, `.btn-danger`, `.card`, `.field`, `.label`, `.badge`, `.eyebrow` (em `index.css`) e `AsyncState`, `TextField`, `Layout`, `ProtectedRoute` (em `src/components`).

## Espaçamento e responsividade
Escala do Tailwind (4 px). Contêiner de até 1180 px. Alvos de toque de pelo menos 44 px. Grades de 1 coluna no celular, 2 no tablet e 3 no desktop. Tabelas largas rolam dentro do próprio contêiner.

## Estados de interface
Foco visível (3 px), desabilitado, carregando (spinner + `role="status"`), erro (`role="alert"` + tentar novamente), vazio (mensagem + ação) e sucesso.

## Acessibilidade
Link para pular ao conteúdo, foco levado ao `main` a cada troca de rota, labels ligados aos campos, erros ligados por `aria-describedby`, ícones decorativos com `aria-hidden`, tema escuro e respeito a `color-scheme`.
