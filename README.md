# Paciente Virtual — Sprint 4 (React + Tailwind)

Plataforma educacional em que alunos investigam pacientes fictícios (perguntas e exames), escolhem uma hipótese e recebem feedback; professores revisam cada atendimento e administradores validam cadastros.
A Sprint 4 é a versão final e evoluída do projeto da Sprint 3, agora em **React** e **Tailwind CSS**, publicada na **Vercel**.

- **GitHub:** https://github.com/devgabrieldonato/Challenge_GrupoDevsphere
- **Deploy na Vercel:** `COLE_AQUI_O_LINK_DA_VERCEL` (preencher após o deploy)

## Tecnologias utilizadas

- React 18 + Vite 5 (aplicação em `web/`)
- React Router 6 (rotas públicas e privadas)
- Tailwind CSS 3 (design system baseado em CSS variables, tema claro/escuro)
- Vitest + Testing Library (testes)
- Vercel (hospedagem)
- Sprint 3 (mantida em `backend/`, `worker/`, `tools/` e `frontend/`): C++20, SQLite, Python, Ollama

## Instalação das dependências

Requer Node.js 18 ou superior.

```bash
cd web
npm install
```

## Execução da aplicação

```bash
cd web
npm run dev        # desenvolvimento em http://localhost:5173
npm run build      # gera web/dist
npm run preview    # serve a versão de produção
npm test           # executa os testes
```

## Execução dos servidores (back-end)

A versão publicada **não depende de servidor**: a API é mockada no navegador (`web/src/services/mockApi.js`).
O back-end em C++/Python da Sprint 3 continua no repositório, mas não roda na Vercel. Para executá-lo localmente, siga [docs/README_TECNICO_SPRINT3.md](docs/README_TECNICO_SPRINT3.md).

## Rotas públicas e privadas

| Rota | Acesso | Descrição |
| --- | --- | --- |
| `/` | Pública | Escolha de perfil |
| `/login/:role` | Pública | Login (`student`, `teacher`, `admin`) |
| `/cadastro/:role` | Pública | Cadastro de aluno ou professor (fica pendente) |
| `/acesso-negado` | Pública | Aviso de permissão insuficiente |
| `/aluno/casos` | Privada · aluno | Lista de casos |
| `/aluno/casos/:caseId` | Privada · aluno | Atendimento clínico |
| `/aluno/historico` | Privada · aluno | Atendimentos e devolutivas |
| `/professor` | Privada · professor | Casos e revisão de atendimentos |
| `/admin` | Privada · admin | Aprovação e bloqueio de usuários |

A proteção está em `web/src/components/ProtectedRoute.jsx`: sem login o usuário vai para o login do perfil; com login e perfil errado vai para `/acesso-negado`. O administrador acessa todas as áreas.

## Origem e uso da API / dados mockados

- Os casos clínicos vêm de `web/src/data/cases.json` (cópia de `backend/seeds/legacy-cases.json`).
- `web/src/services/mockApi.js` simula login, cadastro, casos, atendimentos, devolutivas e usuários, com atraso de rede. Os dados ficam no `localStorage` do navegador.
- O hook `useApi` (`web/src/hooks/useApi.js`) trata os estados **carregando, sucesso, vazio e erro**, com botão "Tentar novamente".
- Para ver o estado de erro, adicione `?simularErro` ao endereço de uma tela (ex.: `/aluno/casos?simularErro`).

## Usuários e senhas para teste

Contas fictícias, válidas somente na API mockada:

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Administrador | `admin@devsphere.local` | `Admin@2026` |
| Aluno | `aluno.teste@devsphere.local` | `Aluno@2026` |
| Professor | `professor.teste@devsphere.local` | `Prof@2026` |
| Aluno pendente (login deve ser recusado) | `pendente@devsphere.local` | `Pendente@2026` |

## Limitações desta versão

A API é mockada e roda inteiramente no navegador. Por isso:

- contas, senhas, sessão e checagem de acesso ficam no cliente e **não protegem** nada contra inspeção ou alteração;
- os dados dos casos (incluindo hipótese correta e desfecho) são enviados ao navegador, então o gabarito pode ser lido por quem inspecionar o código;
- os registros (atendimentos, devolutivas, cadastros) ficam no `localStorage` de cada navegador e não são compartilhados entre usuários.

Isso é adequado para demonstração com dados fictícios, não para controle de acesso nem avaliação confiável. Em produção, autenticação, gabarito e registros ficariam no back-end (como na Sprint 3, em `backend/`).

## Deploy na Vercel

Depois do deploy, cole o link na seção de links no topo deste README. O `vercel.json` na raiz já define instalação, build (`web/`), pasta de saída (`web/dist`) e o redirecionamento das rotas para `index.html`. Basta importar o repositório na Vercel, sem alterar as configurações padrão.

## Estrutura

```
web/            aplicação React (Sprint 4)
  src/components, pages, hooks, context, services, data, test
backend/ worker/ tools/   back-end e ferramentas da Sprint 3
frontend/       interface em HTML/JS da Sprint 3 (referência)
legacy/         arquivos antigos da raiz
docs/           documentação (design system, evolução, validação, técnica)
```

## Documentação

- [Evolução da Sprint 3 para a Sprint 4](docs/EVOLUCAO_SPRINT4.md)
- [Design system e decisões visuais](docs/DESIGN_SYSTEM.md)
- [Validação com usuários](docs/VALIDACAO_COM_USUARIOS.md)

## Uso de Inteligência Artificial

Recursos de IA foram usados em duas frentes. No desenvolvimento, um assistente de IA (Claude) apoiou a análise do repositório contra os critérios da Sprint 4 e a migração do frontend para React e Tailwind, com revisão e testes feitos pela equipe. No produto da Sprint 3, o pipeline local de geração de casos clínicos usa modelos de linguagem executados via Ollama (Qwen3 e Gemma3), sempre sujeitos à validação docente. A versão publicada na Vercel não chama nenhum modelo de IA.
