# Evolução da Sprint 3 para a Sprint 4

| Tema | Sprint 3 | Sprint 4 |
| --- | --- | --- |
| Interface | Páginas HTML separadas + JS puro | Aplicação React com componentes reutilizáveis |
| Estilo | CSS próprio + grid do Bootstrap | Tailwind CSS com tokens em CSS variables |
| Navegação | `route-guard.js` em cada página | React Router + `ProtectedRoute` |
| Dados | API C++ local (porta 8080) | API mockada no navegador, publicável na Vercel |
| Estados de tela | Mensagens avulsas | Hook `useApi` com carregando, sucesso, vazio e erro |
| Acessibilidade | Link "ir para o conteúdo", tema escuro, foco visível | Mantidos + foco movido ao conteúdo a cada rota, tabela com `scope`/`caption`, `aria-live` nas anotações |
| Responsividade | 3 breakpoints principais | Mobile-first (`sm`, `md`, `lg`, `xl`) em todas as telas |
| Testes | Testes do backend e do worker | + testes do frontend (rotas privadas, hook, API mockada) |
| Imagens | PNG de 2 MB cada | WebP de cerca de 40 KB |

## Fluxos que continuam iguais
Escolha de perfil, login por perfil, cadastro pendente de validação, atendimento clínico (perguntas, exames, hipótese), feedback pedagógico, histórico do aluno, devolutiva do professor e aprovação de cadastros pelo administrador.

## Fora do escopo da versão publicada
Importação de PDF, geração de casos com IA local, MFA e curadoria continuam apenas no back-end e no frontend da Sprint 3.

## Limitações conhecidas
A API mockada guarda contas, sessão e dados dos casos (incluindo o gabarito) no navegador. Serve para demonstração com dados fictícios, não como controle de acesso. Detalhes no README.
