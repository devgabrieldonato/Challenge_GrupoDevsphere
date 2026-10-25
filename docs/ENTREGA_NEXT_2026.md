# Evidências de integração — NEXT_2026

Registro técnico de 16/10/2026. Base Git `a101c31`; alterações exclusivamente em
`NEXT_2026`, sem commit, push, merge ou publicação. A base pessoal não foi
migrada nesta validação: os testes usam bancos, contas e PDFs sintéticos isolados.

## Escopo e evidência

| Frente do pedido | Implementação / evidência | Limite ou pendência |
| --- | --- | --- |
| 1–3. Fontes, branch e equipe | Notion consultado; auditoria do código; agentes backend, frontend e worker; integração pelo coordenador | Notas distinguem planejamento, testes e homologação |
| 4. Arquitetura | C++20/SQLite; migrations 006–014; worker separado; snapshot pré-migration com WAL | Backup de produção exige segredo e Python com cryptography |
| 5. Segurança | Sessão autoritativa, matriz, MFA, revogação, cabeçalho de mutação, CORS, arquivos privados; testes negativos | Matriz ASVS selecionada, não avaliação completa nem certificação; sandbox SO e revisão independente pendentes |
| 6. Devolutiva | Sete campos completos, rascunho restrito, notificações e histórico; teste Chrome | Regras acadêmicas institucionais ainda a homologar |
| 7. Casos dinâmicos | João e Marina em sementes privadas; terceiro caso por banco em teste; 18 perguntas/22 exames; versão preservada | Sementes mantêm publicação legada; não receberam nova aprovação médica |
| 8. Organização | Área, disciplina opcional, dificuldade, público, rubrica, tags e revisão da combinação | Classificação real de João/Marina e calibração requerem docentes |
| 9. PDFs | Upload autorizado de aluno/docente, páginas selecionadas, Markdown editável, texto/tabelas/OCR real | PDF de até 10 MiB/100 páginas; fidelidade de fontes futuras exige revisão |
| 10. Fila | Persistência, lease, cancelamento, expiração, limites, retentativas/idempotência | Estados técnicos separados dos estados da curadoria; operação/monitoramento de produção pendentes |
| 11. IA | Adaptador Ollama, Qwen3:8b e Gemma3:4b sequenciais, schema, referências, digest/configuração/proveniência | Modelos instalados; Gemma respondeu JSON curto. Qwen com timeouts; geração integral e fidelidade não aprovadas |
| 12. Curadoria | Área habilitada + atribuição + instituição; parecer, aprovação e publicação separadas; autoaprovação desabilitada | Política institucional de suplência/segunda revisão; validação clínica humana |
| 13. Biblioteca | Fontes aprovadas, grants, FTS5 local, retirada, hashes e vínculo aos derivados | Não é treinamento; retirada não apaga histórico. Política de retenção/exclusão requer instituição |
| 14. Portais | Catálogo, histórico, contribuições, fila, curadoria e administração; editor guiado preservando campos avançados | Autoria integral manual inicial mantém ferramenta técnica JSON opcional ao fluxo por PDF |
| 15. Operação | API8080, frontend5501, static confinado, health, scripts, Caddy exemplo, backup cifrado/restauração | Live Server e servidor incluído são desenvolvimento; nenhuma infraestrutura publicada |
| 16. Documentação | READMEs, arquitetura, pontuação/PDF, OpenAPI, schemas, segurança e Notion | Revisar continuamente com novas regras institucionais |
| 17–19. Testes e aceite | Resultados abaixo; diff check, UTF-8 e contratos | Sem aprovação clínica, pentest independente ou prontidão de produção |

## Rodada final executada

- CMake compilou API, core e testes com sucesso.
- CTest: 2/2 alvos (`mfa` e `core`) passaram, incluindo caso dinâmico e versão
  pedagógica, revisão/publicação, autorização e histórico.
- `tools/tests`: 15/15 testes passaram: integração HTTP real, isolamento por
  usuário/instituição, atividade não injetável, PDF oficial, sessão/replay MFA,
  revogação, origem, arquivos privados, fila, conversão textual, RAG, backup
  cifrado/restauração e reinício WAL no macOS.
- `worker/tests`: 13/13 passaram, incluindo OCR real de um PDF sintético de imagem.
  Valores `37.2`, `100 mg/dL`, referência de página e aviso humano preservados.
- Chrome/Playwright: atendimento João, PDF/submissão, histórico, devolutiva,
  rascunho restrito, HTML exibido como texto, notificação, Marina na origem5501,
  formulário guiado de 40 itens, nova versão, original preservado, extensão
  desconhecida preservada e rascunho administrativo do legado passaram.
  Nenhum erro JavaScript observado no percurso.
- A origem5501 foi exercitada por interceptação/proxy de teste com API isolada;
  a extensão Live Server do VS Code não foi automatizada.
- Benchmark real tentou conectar ao provedor local e registrou
  `provider_unavailable`, `retryable=true`; não gerou caso nem conteúdo vazio.
  Esse resultado verifica a falha recuperável, não o desempenho dos modelos.
- OpenAPI: YAML e referências internas válidos (43 caminhos); schemas JSON
  analisados; sintaxe JavaScript e shell verificada; `git diff --check` passou.

## Reproduzir

Prepare `.venv-worker` conforme o README da raiz e exporte:

```bash
export DEVSPHERE_PYTHON="$PWD/.venv-worker/bin/python"
cmake -S backend -B build/backend -DBUILD_TESTING=ON
cmake --build build/backend
ctest --test-dir build/backend --output-on-failure
DEVSPHERE_TEST_API_BIN="$PWD/build/backend/devsphere-api" "$DEVSPHERE_PYTHON" -m unittest discover -s tools/tests -v
"$DEVSPHERE_PYTHON" -m unittest discover -s worker/tests -v
DEVSPHERE_TEST_BINARY="$PWD/build/backend/devsphere-api" node tools/tests/browser_next.cjs
```

O teste de navegador requer Playwright e Chrome/Chromium; veja
[Portais NEXT](PORTAIS_NEXT_2026.md). OCR requer Tesseract (`por+eng`) e Poppler.
O Python precisa de ReportLab para os testes C++ que geram PDF. Não há download
automático de modelos, navegador ou dependências do sistema.

## Equipe e revisão

- Backend: migrations, sessões/ações, versões, curadoria, isolamento institucional,
  submissão e PDF oficial; testes de regras e integridade.
- Frontend: jornadas, devolutiva, editor guiado, contribuições e curadoria;
  READMEs/documentos e testes Chrome.
- Worker: conversão, fila, Ollama, schema, RAG, benchmark e testes; revisão cruzada
  encontrou falhas de atividade, importação e proveniência corrigidas na integração.
- Coordenador: integração, contratos, MFA, HTTP/arquivos, backup, exposição às
  fontes, versionamento de título/pontuação, testes finais e atualização do Notion.

## Bloqueios de liberação

Geração completa com modelos instalados; avaliação clínica/fidelidade de fontes;
classificação docente; revisão independente de segurança; isolamento do SO;
infraestrutura HTTPS/identidade/monitoramento; políticas de uso, retenção,
recuperação e licenças institucionais. Nenhum desses itens foi marcado como
homologado por agente. A matriz detalhada está em
[Segurança NEXT](SEGURANCA_NEXT_2026.md).

Atualização posterior: modelos instalados; testes reais e limites registrados em [Modelos locais](MODELOS_LOCAIS_NEXT_2026.json). A evidência anterior de provider_unavailable é histórica.

## Rodada de pendências — evidência mais recente

Os resultados anteriores são históricos. Nesta rodada: CTest2/2, tools20/20,
worker26/26 e Chrome passaram. Foram acrescentados testes de revogação de área,
substituição com motivo, grants revogáveis, resultados restritos após retirada de
fonte, exposição de proprietários de fontes secundárias, seleção de páginas reais,
orçamento de contexto e rubrica com divergência justificada. A origem5501 foi
exercitada por proxy, não pela extensão do VS Code.

Backend e worker receberam patches dos agentes, revisados e integrados pelo
coordenador; frontend entregou formulários/rubrica e integração de administração.
O coordenador concluiu controles HTTP/fontes, testes de integração, contratos,
documentação e conciliação do Notion. Não houve migration nova nem uso da base
pessoal nesta rodada. Sem commit, push ou merge.

[Mapa atualizado de pendências](PENDENCIAS_NEXT_2026.md) identifica os bloqueios
restantes e responsáveis. [Rubrica](RUBRICA_DIFICULDADE.md) documenta a proposta
versionada; [auditoria de leitura](AUDITORIA_PENDENCIAS_NEXT_2026.json) registra
visibilidade PUBLIC e metadados locais de licenças, sem alterar configuração externa.
Não foi comprovada geração real integral Qwen/Gemma, nem homologação clínica.

## Segunda rodada de pendências — verificação final

CTest2/2, tools23/23, worker51/51 e Chrome passaram. O worker foi executado com
ResourceWarning tratado como erro. Inventário real do novo diagnóstico confirmou
Ollama/modelos/OCR sem inferência e sem banco. HTTP cobre quota persistente após
cancelamentos, retry/replay e acesso negado ao grant após retirada; conversão real
usa o mesmo `pages: []` enviado pela tela. PDF falso/protegido e101 páginas têm
rejeição testada. Protocolo Ollama rejeita respostas sem conclusão/JSON válido ou
modelo esperado; crítica exige alertas textuais. Timeout e métricas documentados.

Qwen passou somente no probe técnico de contexto512 (27,84s/9tokens); no contexto4096,
timeout60s. Geração integral e revisão humana seguem pendentes. Não houve migration,
commit/push ou uso da base pessoal. READMEs e duas páginas Notion atualizados por
estado/evidência, sem marcar homologações como concluídas.

## Terceira rodada — última evidência

Compilação, CTest2/2, tools29/29 e worker54/54 passaram. Novo cenário Live Server
REAL em5501→8080 passou sem proxy/interceptação, com fixture temporária e limpeza
exclusiva de filhos próprios. Testes de capacidade institucional/global e upload
com falha injetada demonstram isolamento/rollback/cleanup normais. Não houve migration.

Agente backend entregou capacidade compartilhada e consistência do upload; agente
de frontend entregou teste real Live Server e documentação; coordenador integrou,
revisou e validou, além de investigar IA, separar contexto da crítica e melhorar
métricas de benchmark. READMEs/contratos/mapa/Notion acompanham evidências e bloqueios.

Qwen4096 curto passou em perfil isolado; caso completo8192 falhou com OutOfMemory
Metal em15,832s e foi rejeitado. Gemma não foi executado nessa tentativa. Outra
máquina foi informada pelo usuário; validação no destino e revisão clínica pendentes.
Nenhum conteúdo clínico sintético gerado foi aprovado/publicado por agente.

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
