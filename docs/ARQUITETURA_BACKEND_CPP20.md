# Arquitetura da API C++20 — NEXT_2026

## Autoridade e limites entre componentes

O backend C++20 mantém autenticação, autorização, regras pedagógicas e SQLite.
O navegador apresenta dados autorizados; não decide papel, proprietário, nota,
publicação ou conteúdo oficial do relatório. Editar o DOM não modifica o servidor.
Requisições feitas diretamente à API estão sujeitas às mesmas verificações.

A camada Python é auxiliar: conversão, OCR, geração e PDF oficial têm contratos
específicos. O worker de documentos funciona em processo separado para não
bloquear o atendimento enquanto aguarda extração ou inferência. Ele não aprova
nem publica casos.

Os contratos estão no [OpenAPI](../backend/openapi/openapi.yaml), nos schemas em
`docs/schemas/` e no [README do worker](../worker/README.md).

## Organização

| Componente | Responsabilidade |
| --- | --- |
| `http_server.cpp` | Rotas, sessão, origem, cabeçalho anti-CSRF, limites e arquivos públicos |
| `database.cpp` | Persistência acadêmica, submissões, devolutivas e PDF oficial |
| `next_database.cpp` | Casos dinâmicos, sessões, autorização por instituição e curadoria versionada |
| `pipeline_api.cpp` | Uploads, fontes, acesso, trabalhos e busca autorizada |
| `privileged_mfa.cpp` | TOTP e recuperação de acesso privilegiado |
| `official_pdf.cpp` e renderizador Python | Documento oficial derivado do histórico validado |
| `worker/` | Fila persistente, extração, OCR, RAG e adaptador Ollama |
| `frontend/` | HTML, CSS e JavaScript de apresentação, sem catálogo completo de respostas |

Use os nomes de arquivos como referências, não como módulos independentes de
implantação. O ponto de entrada do servidor continua sendo `backend/src/main.cpp`.

## Conteúdo e versões

João e Marina são carregados de `backend/seeds/legacy-cases.json`, fora da raiz
pública. A inserção é idempotente e preserva versões existentes. O estado legado
publicado não representa nova aprovação clínica: a classificação pedagógica
permanece pendente de revisão humana.

Novos casos possuem conteúdo restrito, metadados públicos e versões. O catálogo
público não entrega respostas antecipadas, desfecho ou regras de correção. Uma
sessão fixa `case_version_id`; publicar uma versão posterior não muda a sessão.

A área/especialidade organiza a curadoria. Disciplina é vínculo curricular
opcional. Habilitação docente e atribuição de revisão são capacidades explícitas,
separadas do acesso administrativo técnico. Alterar conteúdo cria outra versão
em rascunho e não herda aprovação.

## Fluxo autoritativo do atendimento

1. `POST /clinical-sessions` cria uma sessão para o usuário autenticado e fixa a versão.
2. `POST /clinical-sessions/{id}/actions` valida existência, dependências, repetição e estado.
3. A API persiste a ação aceita, sua ordem e pontuação, liberando somente a resposta correspondente.
4. `POST /clinical-sessions/{id}/hypotheses` registra a justificativa e as evidências naquele momento.
5. A conclusão informa `clinicalSessionId`, relatório v2, PDF pessoal e protocolo idempotente em `POST /submissions`.
6. O servidor reconcilia o conteúdo com sua sessão, recalcula valores e gera o PDF oficial.
7. Submissão, etapas, tentativas, pontuação, documento e vínculo da conclusão são persistidos transacionalmente.
8. Reenvio idêntico recupera o registro; conteúdo divergente no mesmo protocolo gera conflito.

Somente aluno ou administrador pode concluir. Simulações administrativas usam
identidade técnica, registram o administrador autor e recebem `isTest: true`.
Não assumem a identidade de um aluno real.

O documento oficial é um BLOB no SQLite. O renderizador Python/ReportLab recebe
somente os dados já validados. Se estiver indisponível, a conclusão falha de
forma explícita, permitindo reenvio; não registra sucesso com documento ausente.
Veja [Relatório PDF](RELATORIO_PDF_VERSIONADO.md).

## Devolutivas e notificações

O atendimento concluído é imutável. A avaliação docente permanece em entidade
separada. Docentes autorizados podem salvar rascunhos e concluir a devolutiva.
O aluno consulta apenas versões concluídas dos próprios atendimentos, com todos
os campos. Conclusão gera notificação interna, com estado de leitura.

O portal consulta o estado ao abrir ou atualizar. Não existe promessa de push em
tempo real. A interface distingue feedback automático e avaliação docente.
Veja [Portais NEXT_2026](PORTAIS_NEXT_2026.md).

## PDFs, geração e biblioteca

O servidor valida e armazena documentos em diretório privado. A fila SQLite
registra proprietário, operação, estado, tentativas, idempotência e resultado.
O worker reclama trabalhos transacionalmente e usa subprocessos com limites.

A sequência é PDF → extração/OCR → Markdown conferível → geração Qwen → crítica
Gemma → validação estrutural → rascunho → revisão docente → publicação.

Fontes aprovadas e autorizadas podem alimentar RAG. A autorização é aplicada
antes da recuperação e reconferida em operações longas. Proveniência registra
fonte, hash, páginas e modelos. A recuperação não treina automaticamente um
modelo. Saídas de IA não são fontes aprovadas por consequência da geração.

## Autorização, origens e arquivos estáticos

As verificações consideram papel, instituição, propriedade, turma/atividade,
habilitação, atribuição e estado da versão. A identidade vem da sessão.
Administradores técnicos não recebem aprovação clínica por serem administradores.

Mutações exigem `X-PV-Request: 1`. O cabeçalho auxilia a defesa contra CSRF, mas
não autentica o usuário. O preflight aceita os cabeçalhos necessários, incluindo
`Content-Type`, `Idempotency-Key` e `X-PV-Request`, somente para origens autorizadas.
Cookies de sessão não ficam no armazenamento JavaScript.

Em desenvolvimento, a aplicação usa `8080`; o Live Server serve `frontend/` na
`5501` e chama a API com credenciais. Use o mesmo hostname nas duas portas.
Produção exige HTTPS, origem explícita e camada HTTP apropriada.

A API confina arquivos estáticos a `frontend/` e verifica caminho canônico.
O Live Server também deve usar essa raiz. Banco, seeds, fontes, backups e
configurações não devem estar acessíveis pelo servidor de arquivos.

## Persistência e operação

SQLite usa chaves estrangeiras, WAL, timeout e migrations incrementais. Migrations
NEXT adicionam sessões, curadoria, fila, MFA, fontes, linhagem, índice e escopo
institucional. Não são sementes de usuários e não substituem o banco pessoal.

Backups devem usar uma captura consistente da base, com cifragem e recuperação
testada. Logs não devem conter senha, cookie, chave MFA, relatório integral ou
texto clínico. Auditoria referencia identificadores e transições necessárias.

Uma futura migração para PostgreSQL deve preservar idempotência, versões,
autorização, chaves estrangeiras e imutabilidade; não é exigência desta etapa.

## Histórico e limitações

Na versão anterior, o navegador possuía catálogo e motor de pontuação locais, e
a geração respondia sem provedor configurado. Esses caminhos não são a autoridade
NEXT: fixtures legadas foram movidas para `backend/tests/legacy-assets/`.
Relatórios antigos continuam registros históricos; novos atendimentos exigem
sessão autoritativa.

A implementação local do adaptador Ollama não comprova geração clínica real.
Ollama e modelos estavam ausentes na validação; OCR depende de Poppler/Tesseract.
O subprocesso do worker não é uma sandbox completa. Homologação clínica,
benchmark, infraestrutura e avaliação independente de segurança continuam
pendências. Consulte [Segurança NEXT_2026](SEGURANCA_NEXT_2026.md).

Atualização após a rodada inicial: Ollama, Qwen3:8b e Gemma3:4b estão instalados. Gemma passou em JSON curto; Qwen apresentou timeouts. Geração completa permanece pendente. Veja [resultados dos modelos](MODELOS_LOCAIS_NEXT_2026.json) e o README do worker.
