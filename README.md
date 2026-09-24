# Paciente Virtual

Plataforma educacional com jornadas separadas para estudantes e professores de
Medicina. João e Marina continuam disponíveis no atendimento do aluno, com 18
perguntas, 22 exames, pontuação pedagógica e entrega automática do percurso em
PDF para revisão docente.

## Estrutura

- `frontend/`: escolha de perfil, cadastro, logins e áreas de aluno, professor e administrador.
- `backend/`: API C++20, SQLite, migrations, Argon2id e testes.
- `docs/`: arquitetura, contratos de casos, importação e relatório versionado.
- `tools/`: validador estrutural de casos gerados.
- `images/`: imagens mantidas pela versão anterior da aplicação.
- `index.html`: entrada compatível para quem abre a raiz diretamente.

## Iniciar

Siga [backend/README.md](backend/README.md) para compilar a API, criar usuários
locais por variável de ambiente e iniciar o servidor. A aplicação completa deve
ser aberta pelo endereço da API; abrir páginas por `file://` não oferece
autenticação ou persistência.

## Usar com Live Server na porta 5501

O Live Server pode servir o frontend durante o desenvolvimento, mas a API C++
precisa continuar ativa na porta `8080`. Abra a raiz do projeto pelo Live
Server em `http://127.0.0.1:5501/`. O cliente detecta essa origem e envia as
requisições para `http://127.0.0.1:8080/api/v1`, incluindo o cookie de sessão.

A API aceita CORS local somente de `http://127.0.0.1:5501` e
`http://localhost:5501`. Outras origens continuam bloqueadas. Em produção,
configure `DEVSPHERE_ALLOWED_ORIGINS` com a origem HTTPS real e use um servidor
web apropriado no lugar do Live Server.

## Jornadas

O aluno escolhe seu perfil, autentica, seleciona João ou Marina, investiga o
caso e registra hipótese e justificativa. Perguntas e exames alteram uma
pontuação pedagógica versionada; escolhas além do orçamento recomendado recebem
penalidade progressiva. Consulte [docs/PONTUACAO_PEDAGOGICA.md](docs/PONTUACAO_PEDAGOGICA.md).

Ao finalizar, o navegador envia automaticamente o relatório v2 e o PDF para a
API. O mesmo protocolo é reutilizado quando há retry, evitando duplicação. O
download manual continua disponível como cópia pessoal. O contrato está em
[docs/RELATORIO_PDF_VERSIONADO.md](docs/RELATORIO_PDF_VERSIONADO.md).

O professor autentica em uma área separada, consulta os atendimentos
autorizados, revisa a ordem das escolhas, as tentativas, a pontuação e o PDF,
salva ou conclui a devolutiva e pode exportá-la. A importação manual permanece
como recurso para relatórios legados. Há formulários para autoria manual e envio
de casos em PDF. A geração clínica real permanece bloqueada até a configuração
de um provedor de IA no backend e sempre exige revisão humana.

## Cadastro e validação institucional

Alunos e professores solicitam acesso com e-mail de um domínio previamente
autorizado. A conta nasce inativa e só pode entrar depois da decisão de um
administrador institucional. O painel administrativo registra aprovações,
recusas e notificações em uma caixa de saída auditável. O envio externo de
e-mail será conectado depois por um provedor próprio da instituição.

A conta administrativa local também pode abrir as jornadas do aluno e do
professor para testes funcionais. Ela é criada somente por comando no backend;
o navegador não possui rota para promover usuários.

## Segurança e dados

Credenciais não são armazenadas em XML, CSV, JSON nem no navegador. O SQLite
guarda somente hashes Argon2id com salt. Tokens de sessão ficam em cookie
`HttpOnly`; o papel é obtido da sessão no backend. Professores só acessam
submissões sob sua responsabilidade, alunos acessam os próprios registros e o
administrador pode produzir simulações marcadas como teste. A API recalcula a
pontuação e ignora a identidade informada pelo navegador.

As migrations modelam usuários, turmas, versões de casos, atividades,
submissões imutáveis, tentativas, devolutivas, documentos, trabalhos de IA e
auditoria. A separação entre interface, serviços e banco permite migrar o
SQLite para PostgreSQL sem conectar o navegador diretamente ao banco.

## Limites atuais

- O provedor real de IA e suas chaves não fazem parte do frontend.
- A extração controlada de PDFs clínicos e o OCR aguardam a implementação
  do provedor documentado.
- O servidor HTTP próprio atende ao desenvolvimento local; produção requer uma
  camada HTTP/TLS endurecida.

