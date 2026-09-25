# Paciente Virtual

Plataforma educacional para estudantes e professores de Medicina. O aluno
escolhe um caso clínico, conduz a investigação, formula hipóteses e recebe uma
pontuação pedagógica. O professor revisa o percurso, as evidências disponíveis
e as tentativas antes de registrar a devolutiva.

## Funcionalidades principais

- jornadas separadas para aluno, professor e administrador;
- casos clínicos de João e Marina, cada um com 18 perguntas e 22 exames;
- pontuação versionada, com penalidades para escolhas de baixo valor ou
  inadequadas;
- envio automático do percurso e do PDF para revisão docente;
- consulta da ordem das perguntas, exames, hipóteses e justificativas;
- devolutiva docente com pontos fortes, dificuldades e próximas orientações;
- cadastro institucional sujeito à aprovação administrativa;
- autoria manual e importação de casos clínicos em PDF, com contratos preparados
  para uma futura integração de IA.

## Estrutura do projeto

- `frontend/`: escolha de perfil, cadastro, logins e áreas dos três papéis;
- `backend/`: API C++20, SQLite, migrations, Argon2id e testes;
- `docs/`: arquitetura, pontuação, contratos de casos e relatório PDF;
- `tools/`: inicialização local e validação estrutural de casos;
- `images/`: imagens dos pacientes virtuais;
- `index.html`: entrada compatível para acesso pela raiz do projeto.

## Requisitos

- CMake 3.20 ou superior;
- compilador compatível com C++20;
- SQLite 3;
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
7. inicie a API novamente;
8. teste os três acessos.

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

O aluno autentica, escolhe João ou Marina, investiga o caso e registra hipótese
e justificativa. Perguntas e exames alteram a pontuação; escolhas além do
orçamento recomendado recebem penalidade progressiva. Ao finalizar, o relatório
v2 e o PDF são enviados automaticamente à API, com proteção contra duplicação.
O download manual permanece disponível como cópia pessoal.

### Professor

O professor consulta atendimentos autorizados, revisa a ordem das escolhas, as
tentativas, a pontuação, as justificativas e o PDF. Depois registra uma
devolutiva, podendo salvá-la como rascunho ou concluí-la. A importação manual de
relatórios legados permanece disponível.

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

## Limitações atuais

- O provedor real de IA e suas chaves ainda não estão configurados.
- A extração controlada de PDFs clínicos e o OCR aguardam esse provedor.
- A interface de autoria não deve simular geração clínica bem-sucedida.
- O servidor HTTP incluído atende ao desenvolvimento local; produção exige TLS,
  uma camada HTTP revisada, armazenamento protegido e políticas institucionais.
- FIWARE, MQTT e Edge Computing não estão implementados no produto atual.

## Documentação técnica

- [Arquitetura do backend C++20](docs/ARQUITETURA_BACKEND_CPP20.md)
- [Pontuação pedagógica](docs/PONTUACAO_PEDAGOGICA.md)
- [Relatório PDF versionado](docs/RELATORIO_PDF_VERSIONADO.md)
- [Geração e importação de casos](docs/GERACAO_E_IMPORTACAO_DE_CASOS.md)
- [OpenAPI](backend/openapi/openapi.yaml)
