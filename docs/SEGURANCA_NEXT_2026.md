# Segurança e governança — NEXT_2026

## Escopo e limites

Referência: OWASP ASVS 5.0.0, com nível 2 proposto como base de avaliação.
Esta implementação não constitui certificação, pentest independente ou aprovação
institucional. A matriz abaixo é uma seleção de requisitos pertinentes, não o
catálogo completo. Requisitos não mapeados continuam pendentes de análise.

O navegador é controlável pelo usuário. Alterações de HTML, CSS, JavaScript,
armazenamento local ou requests não podem conceder permissão, definir a nota
oficial, alterar propriedade ou aprovar um caso. Bloquear F12 não é um controle.

## Autorização

A sessão determina identidade e papel. O servidor verifica propriedade,
atribuição, área habilitada, instituição e estado da versão em cada operação.
Administração técnica não equivale a aprovação clínica. Para curadoria, exige-se
professor habilitado e atribuído. A política padrão impede autoaprovação.

| Recurso | Aluno | Professor | Administrador |
| --- | --- | --- | --- |
| Casos publicados | Praticar | Consultar catálogo | Simular prática |
| Atendimento | Próprio | Atribuído para revisão | Administração/teste |
| PDF e devolutiva | Próprio; devolutiva concluída | Vínculo autorizado | Administração autorizada |
| Fonte PDF | Própria ou grant | Própria ou grant | Administração operacional |
| Aprovar fonte | Não | Área habilitada e acesso | Não pelo papel técnico |
| Contribuição | Própria | Própria ou atribuída | Gestão operacional |
| Aprovação clínica | Não | Área e atribuição | Não pelo papel técnico |
| Habilitar/atribuir revisão | Não | Não | Sim, respeitando instituição |

A mesma matriz deve ser revisada quando o modelo institucional evoluir. Uma
capacidade nova exige regra explícita e teste negativo antes da liberação.

## MFA privilegiado

Em produção (`DEVSPHERE_ENV=production`), contas `teacher` e `admin` exigem
senha e TOTP ou código de recuperação. Em desenvolvimento, MFA também é exigido
se a conta tiver uma semente configurada. O segundo fator é informado no login.

As sementes não ficam no SQLite nem no Git. O serviço recebe variáveis por
identificador de usuário:

- `DEVSPHERE_MFA_SECRET_<ID>`: semente individual Base32 de pelo menos 20 bytes;
- `DEVSPHERE_MFA_RECOVERY_<ID>`: hashes SHA-256 separados por vírgula.

O banco guarda contador para impedir replay, códigos de recuperação consumidos
e vínculo de MFA com o token de sessão. Sessões privilegiadas antigas sem essa
verificação não são aceitas em produção.

O provisionamento operacional exige conferir a identidade do titular. Exemplo:

```bash
python3 tools/provision_mfa.py \
  --database backend/data/devsphere.db \
  --email docente@dominio-oficial.example \
  --env-output /caminho/privado/docente.env \
  --recovery-output /caminho/privado/entrega-ao-titular.txt
```

Os destinos devem ser novos e fora do repositório. O arquivo de entrega contém
segredo de cadastro e recuperação e deve ser entregue por canal seguro. Não o
envie ao Notion, chat de grupo, Git ou logs. Carregue as variáveis no processo da
API por gerenciador de segredos ou ambiente protegido. Descarte a cópia de entrega
segundo o procedimento institucional. Recuperação consome um código uma vez;
rotação/reprovisionamento deve revogar sessões e verificar identidade fora de
canais comprometidos. Não há cadastro público de MFA privilegiado.

TOTP reduz ataques por senha, mas não é resistente a todo phishing. Adoção de
SSO/passkeys e processo institucional de recuperação continuam a homologar.

## Sessões e requisições

Cookies usam HttpOnly, SameSite=Strict e Secure em produção. As operações que
alteram estado exigem `X-PV-Request: 1`; esse header não é credencial. Ele impede
formulários simples de outra origem em conjunto com CORS restrito e validação
de origem. Toda chamada continua exigindo autorização por sessão/recurso.

`POST /api/v1/auth/revoke-sessions` revoga todas as sessões do titular.
O limite de login atual é por IP/e-mail em memória; ambiente distribuído exige
coordenação persistente e proteção adicional contra abuso global.

## Dados e documentos

Gabarito e catálogo completo ficam no backend. A API entrega respostas somente
após aceitar a ação, e o servidor registra sequência e pontuação. O PDF oficial
é reconstruído no servidor com o histórico validado; o PDF enviado pelo navegador
não é autoridade sobre o documento armazenado.

Fontes PDF ficam em área privada com nome aleatório, controles de acesso e
limites. Parser/OCR e geração são trabalhos de fila. O isolamento por subprocesso
não substitui sandbox do sistema operacional. Antes de processar PDFs hostis em
produção, executar o parser com usuário dedicado, volumes mínimos, limites e
bloqueio de rede no SO. A IA não tem acesso a SQL, shell ou publicação.

Markdown é apresentado como texto. Fontes RAG precisam estar aprovadas e com
permissão; grants são reavaliados após inferência. Casos não aprovados não entram
como fontes automaticamente. Declaração de desidentificação não é anonimização.

## Backup e recuperação

Instale `tools/requirements-security.txt` no ambiente Python privado. A ferramenta
usa a API backup do SQLite para snapshot consistente com WAL, AES-GCM para
cifragem/autenticação e scrypt para derivação de chave. A senha é solicitada no
terminal ou fornecida por `DEVSPHERE_BACKUP_PASSWORD` em ambiente protegido.

```bash
python3 tools/secure_backup.py backup \
  backend/data/devsphere.db /caminho/privado/backup.pvb
python3 tools/secure_backup.py restore \
  /caminho/privado/backup.pvb /caminho/privado/restaurado.db
```

A restauração sempre usa destino novo. Para colocar uma base restaurada em uso,
pare API/worker, confira integridade, preserve a base anterior e configure o novo
caminho. Não sobrescreva SQLite ativo. Guarde chave e backup separadamente.
Hash de senha não cifra PDFs nem o arquivo SQLite: proteger disco, permissões,
retenção, exclusão e chaves também é obrigatório.

## Matriz de verificação selecionada

| Referência/tema | Aplicação | Implementação/evidência | Responsável | Estado e pendência |
| --- | --- | --- | --- | --- |
| ASVS V1.2.4, SQL parametrizado | API e fila | Statements vinculados; testes de acesso HTTP | Backend | Implementado em rotas novas; revisão independente pendente |
| ASVS V1.2.5, comandos SO | OCR e PDF | Argumentos fixos sem shell; subprocessos | Worker/backend | Implementado; sandbox SO pendente |
| ASVS V1.3.5, conteúdo scriptável | Markdown e IA | textContent; sem HTML bruto em prévias | Frontend | Testar cada nova superfície |
| ASVS V2.2.2, validação em camada confiável | Escolhas, nota e publicação | Sessões/ações/versões no SQLite; testes negativos | Backend | Implementado; homologação clínica separada |
| ASVS V2.1.3, limites documentados | Upload/fila/geração | 10 MiB, 100 páginas, 3 jobs ativos, timeout/lease | Backend/worker | Limites locais; carga real pendente |
| Autorização por objeto | Dados acadêmicos | A/B, docente não atribuído, grants e instituição | Backend/segurança | Testes automatizados; auditoria independente pendente |
| MFA/replay/recuperação | Contas privilegiadas | RFC6238, contador e código consumido | Coordenação/operação | Testes isolados; cadastro institucional pendente |
| Sessão/revogação | API | Cookie, expiração, revogação e MFA vinculado | Backend | Testes isolados; SSO e operação pendentes |
| Cifragem e recuperação | SQLite | secure_backup.py + teste de restauração/corrupção | Operação | Ferramenta testada; rotina e custódia pendentes |
| TLS e confinamento | Implantação | Exemplo Caddy e estáticos confinados | Operação | Configuração exemplo; não implantada |
| Isolamento de PDF | Produção | Processo com limites | Operação | Contêiner/sandbox e revisão independente bloqueiam liberação |
| Regras clínicas e privacidade | Conteúdo e fontes | Estados de revisão, fontes/páginas e logs mínimos | Docentes/instituição | Homologação, retenção e validação de fontes pendentes |

Fonte oficial: https://github.com/OWASP/ASVS/tree/v5.0.0/5.0
A seleção acima não demonstra conformidade integral ao nível 2.

## Bloqueios de produção

- Revisão de segurança independente e correção das falhas impeditivas.
- Configuração real de HTTPS, rede, usuário do serviço e segredos.
- Sandbox do parser e teste com documentos hostis em ambiente autorizado.
- Cadastro individual privilegiado, MFA e processo de recuperação homologado.
- Política institucional de fontes, retenção e desidentificação.
- Revisão clínica das regras de pontuação e novos casos.
- Teste de carga, observabilidade, restauração operacional e resposta a incidentes.

## Resposta a incidente

Conter o acesso, revogar sessões, preservar evidências mínimas protegidas,
corrigir/rotacionar o segredo atingido e restaurar somente de cópia verificada.
Definir responsáveis e canais institucionais antes de produção. Não registrar
senhas, tokens, PDFs ou prompts clínicos completos em logs técnicos.

## Backup antes de migrations — NEXT_2026

Ao iniciar, a API verifica se há migrations pendentes. Para banco existente,
cria antes um snapshot pela API SQLite, incluindo os dados do WAL, no diretório
`backups` ao lado do banco. Sem mudança de esquema, não repete o snapshot.
Em desenvolvimento, a cópia sem cifra recebe permissões 0600 em diretório 0700.
Configure `DEVSPHERE_BACKUP_PASSWORD` (mínimo 16 caracteres, via ambiente protegido)
e `DEVSPHERE_PYTHON` com `cryptography` para gerar `.pvb` cifrado. Produção bloqueia
migrations sem esse segredo ou se o backup falhar. Não coloque a senha no Git.
`DEVSPHERE_BACKUP_TOOL` permite indicar o caminho absoluto de `tools/secure_backup.py`.
Restauração exige destino novo; consulte `docs/SEGURANCA_NEXT_2026.md` na raiz do projeto.

## Revogação, suplência e fontes — evidência adicional

A área habilitada é consultada em cada leitura/edição/revisão atribuída; removê-la
não depende de logout para bloquear novas requisições. Contas inativas também
não ganham acesso por atribuição. A autoria própria é vínculo distinto. GETs
administrativos listam habilitações e atribuições atuais. Trocar revisor exige
motivo e registra revisor anterior/novo na auditoria, sem apagar pareceres. Não
há substituição automática nem política institucional presumida.

Grants de documentos têm revogação administrativa auditada. Proprietário/admin
consultam grants e versões dependentes; destinatário de grant não recebe essa
listagem. Lista/detalhe de trabalhos ocultam resultados quando fontes primárias
ou suplementares deixam de estar autorizadas. Materialização revalida acesso,
estado e hash; versões/histórico não são apagados por uma revogação. Proprietários
das fontes secundárias também ganham registro de exposição ao material do caso.

Testes C++ e HTTP direto verificam revogação e vínculos, inclusive respostas de
trabalhos já concluídos. Chrome verifica os controles da interface. Isso amplia
a cobertura local; não é avaliação integral de todas as combinações da matriz.

Consulta de leitura confirmou repositório PUBLIC; evidência em
[AUDITORIA_PENDENCIAS_NEXT_2026.json](AUDITORIA_PENDENCIAS_NEXT_2026.json).
Nenhuma permissão externa foi alterada. Conteúdo já publicado continua consultável,
inclusive gabaritos legados em histórico. Pendências e responsáveis em
[PENDENCIAS_NEXT_2026.md](PENDENCIAS_NEXT_2026.md).

## Quota persistente e retirada de fonte — segunda rodada

O teto de concorrência não impedia abuso por criação/cancelamento repetidos. Agora
criações de conversão/geração e retentativas manuais aceitas compartilham quota por
usuário/janela, em transação. Cancelamento não remove consumo e replay idempotente
não conta novamente. Defaults12/3600s; configuração inválida falha fechada. A quota
não é política acadêmica homologada e não substitui limites globais de infraestrutura.

Retirar uma fonte bloqueia consulta/Markdown/PDF e listagem para destinatários de
grants, mesmo que o grant histórico continue registrado. Titular/admin da instituição
mantêm acesso operacional/histórico; não há exclusão automática nem promessa de apagar
cópias previamente recebidas. Busca/RAG e resultados derivados continuam sujeitos à
revalidação. Retenção e eventual retirada de casos publicados dependentes exigem
política institucional.

Evidências: HTTP23/23 com criar/cancelar/replay/retry e consulta após retirada;
worker51/51, incluindo PDFs falsos/protegidos, limite de páginas, protocolo de
conclusão do provedor e inventário local sem redirecionamento/proxy. CTest2/2 e
Chrome passaram. Esses testes ampliam cobertura local, não representam pentest ou
avaliação de carga completa. Sandbox SO e revisão independente seguem pendentes.

## Capacidade compartilhada e consistência de upload — terceira rodada

Tetos de12 pendentes/instituição e24 globais, configuráveis, impedem saturação da
fila por muitos usuários que individualmente respeitam a quota. São verificados
na transação de criação/retry, depois do replay idempotente. Contam queued/running;
recurso com cancelamento solicitado permanece ocupado até o worker encerrar.
Testes cruzam instituições e usuários e verificam retry/replay nos tetos.

Arquivo de upload usa criação exclusiva com O_NOFOLLOW/O_CLOEXEC e0600, escrita
completa e fsync. Falhas de arquivo/insert/auditoria fazem cleanup do arquivo novo
e rollback. Testes injetam falhas no SQLite e diretório inválido; nenhum registro
ou arquivo novo remanescente foi observado. Limites de100 documentos são verificados
na mesma transação. Não há atomicidade garantida FS+SQLite contra queda abrupta;
reconciliação de órfãos, quota em bytes e reserva de disco continuam necessárias.

Teste Live Server REAL confirmou5501→8080/CORS/cookies em base sintética, sem proxy.
Guardas abortam se portas ocupadas e cleanup encerra apenas filhos próprios.
Evidência complementar, sem extrapolar para produção: LIVE_SERVER_VALIDACAO.md.

Modelos continuam restritos a loopback. Perfil experimental em11435 não altera o
aplicativo11434, não repassa ambiente da API e bloqueia porta ocupada. O teste
completo registrou OutOfMemory Metal e resposta parcial foi recusada. Runtime foi
encerrado; nenhum resultado entrou na biblioteca/catálogo. Benchmark não é teste
de robustez clínica nem homologação de isolamento do sistema operacional.

## Complemento operacional — auditoria somente leitura

A ferramenta de armazenamento e6 testes sintéticos foram integrados e passaram.
Conexão SQLite readonly, hashes limitados em blocos, confinamento por descritores
sem seguir links, saída sanitizada e relatório novo0600 sem sobrescrita. Detecta
órfãos/ausências/divergências e bytes observados; não modifica dados nem executa
cleanup. A execução operacional precisa de snapshot/janela coerente; quotas de
bytes, reserva de disco e remediação continuam pendentes. Nenhuma base pessoal
foi auditada. Veja AUDITORIA_ARMAZENAMENTO.md.

Totais finais desta rodada:35 testes de ferramentas passaram (29 da integração
+6 da auditoria),55 worker passaram, CTest2/2 e cenário Live Server real passaram.
UTF-8, contratos, sintaxe e diff também conferidos. Benchmark nativo sem resource
foi simulado em regressão; não é teste real no Windows. Código/modelos continuam
sem geração integral validada no M1/8GB e aguardam teste na outra máquina.


## Complemento — apresentação protegida em 23/10/2026

Inferência exige opt-in exato em API, worker e adaptador. Migration 015 adiciona heartbeat técnico, recibos mínimos de exclusão e revisão monotônica da extração. Prévia autorizada tem validade de 120s e usa a configuração do worker. Retirados ficam filtrados; purga é desabilitada por padrão e bloqueada por histórico/vínculos. Não houve homologação de retenção. Checkpoints e watchdog foram exercitados somente com processos leves. Consulte [modo protegido, contratos e limites](MODO_APRESENTACAO_MAC.md).
