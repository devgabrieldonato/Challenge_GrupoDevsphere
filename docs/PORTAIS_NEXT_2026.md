# Portais e demonstração — NEXT_2026

Esta etapa mantém HTML, CSS e JavaScript separados. O backend C++20 é a autoridade
sobre identidade, permissões, versão do caso, ações aceitas e pontuação.

## Navegação do aluno

A entrada é `frontend/pages/student-cases.html`. Pela API, abra
`http://127.0.0.1:8080/pages/student-cases.html`. No Live Server com a raiz
configurada em `frontend/`, use `http://127.0.0.1:5501/pages/student-cases.html`.

O catálogo vem de `GET /api/v1/cases`. Filtros utilizam título, resumo, habilidades,
tags públicas e dificuldade. Área clínica interna não é usada para revelar pistas
no filtro. João e Marina são versões legadas preservadas, com classificação
pendente de conferência docente.

Ao iniciar, a API fixa a versão e cria uma sessão. Clicar ou arrastar um bloco
solicita uma ação ao servidor; somente após aceite a resposta aparece no mapa.
As dependências e os pontos não são decididos pelo navegador. Reiniciar cria
outra sessão e mantém a anterior para auditoria.

A hipótese e a justificativa são registradas com as evidências existentes naquele
momento. A conclusão dispara o PDF e a submissão automaticamente. Falhas oferecem
reenvio com o mesmo protocolo. A API gera o PDF oficial do histórico validado;
a cópia criada no navegador não define nota, identidade ou conteúdo oficial.

`student-history.html` apresenta atendimentos próprios, download protegido do PDF,
notificações e os sete campos da devolutiva concluída. Rascunhos do professor
não são retornados ao aluno. Marcar uma notificação como lida persiste na API.
A atualização da página ou o botão Atualizar consulta o estado atual; não há
promessa de entrega em tempo real por WebSocket.

## Materiais e contribuições

`contributions.html` é compartilhada entre contas autenticadas, com operações
restritas no servidor. O aluno pode enviar fontes e solicitar geração, mas não
aprova nem publica um caso.

1. Informe área/especialidade interna e selecione um PDF.
2. Confirme autorização de uso e desidentificação prévia. A plataforma não garante anonimização.
3. Solicite conversão para Markdown; opcionalmente selecione páginas físicas.
4. Atualize a lista de trabalhos e abra a prévia textual da extração.
5. Confira avisos, tabelas, números e referências de página. O proprietário pode corrigir o Markdown.
6. Solicite geração, com objetivos e termo opcional para buscar referências aprovadas.
7. Quando o trabalho terminar, salve a proposta como contribuição em rascunho.
8. Encaminhe a versão à revisão docente.

A interface mostra estados reais da fila, mensagens de falha, cancelamento e
retentativa. O servidor decide se uma retentativa é permitida e respeita limites.
Não existe progresso percentual simulado nem geração fictícia quando o modelo
está desligado.

Documentos e Markdown são apresentados como texto, inclusive quando contêm HTML.
A correção da extração invalida sua aprovação anterior. Docente habilitado e com
acesso pode aprovar a fonte; administrador técnico pode conceder acesso explícito.
Retirar a fonte impede sua utilização nas buscas subsequentes conforme as regras
do backend. Aprovar uma fonte não aprova automaticamente nenhum exercício.

A busca de biblioteca apresenta apenas trechos aprovados e autorizados, com
identificador e página. RAG recupera referências; não treina o modelo.

## Curadoria docente

`teacher-cases.html` reúne o catálogo e as contribuições autorizadas.
`case-curation.html?id=IDENTIFICADOR_DA_VERSAO` carrega uma versão restrita.

O revisor compara conteúdo e fontes, confere público-alvo, dificuldade, rubrica,
título, resumo e tags. A declaração sobre ausência de pistas é explícita e não
substitui revisão clínica. Cada decisão registra parecer e identidade.

Salvar alterações gera uma nova versão em rascunho. O autor, revisor atribuído
e habilitado, ou administrador técnico da mesma instituição podem preparar essa
versão; isso não concede aprovação clínica. A aprovação da versão anterior não é herdada. Iniciar revisão, pedir ajustes, aprovar e publicar são operações
distintas; o backend exige habilitação, atribuição e estado apropriados.

A curadoria oferece formulário clínico guiado: paciente, queixa, hipóteses,
desfecho, objetivos e os quarenta itens. Cada item tem título, resposta,
justificativa, pertinência, dependência, classificação e pontos-base associados.
IDs e tipos são preservados. A classificação escolhe um dos valores pedagógicos
fixos; o revisor não precisa escrever JSON.

O JSON permanece opcional em uma seção avançada com aplicação explícita ao
formulário. Campos adicionais, fontes e proveniência são preservados ao salvar.
A autoria manual inicial técnica ainda pode utilizar JSON; o caminho por PDF
produz a proposta e permite sua revisão pelo formulário guiado.

O administrador habilita docentes por área e atribui versões no painel
`admin-dashboard.html`. A permissão administrativa técnica não concede competência
para validar clinicamente um caso. As políticas institucionais ainda precisam de
homologação.

## Login e MFA

Os formulários aceitam código de autenticador ou recuperação quando solicitado
pelo servidor. Em produção, acesso privilegiado depende da configuração exigida.
Veja [Segurança NEXT_2026](SEGURANCA_NEXT_2026.md). Não inclua chaves TOTP,
recuperação ou senhas no código e nos documentos compartilhados.

## Arquivos principais

- `frontend/scripts/student/clinical-session.js`: atendimento e relatório pessoal.
- `frontend/scripts/student/history.js`: histórico, notificações e devolutivas.
- `frontend/scripts/contributions/workspace.js`: documentos, fila e biblioteca.
- `frontend/scripts/cases/curation.js`: edição versionada e decisões de revisão.
- `frontend/scripts/services/clinical-session-service.js`: contrato de atendimento.
- `frontend/scripts/services/api-client.js`: cookies, erros e cabeçalho anti-CSRF.
- `frontend/styles/next-portals.css`: componentes adicionais dos portais.

Catálogos completos e regras legadas saíram da raiz pública do frontend. As
fixtures privadas estão em `backend/tests/legacy-assets/`; o conteúdo utilizado
pelo servidor está em `backend/seeds/legacy-cases.json`.

## Teste reprodutível de navegador

`tools/tests/browser_next.cjs` usa Playwright e Chrome/Chromium. Cria um banco
SQLite temporário e contas sintéticas com senha aleatória, inicia uma API isolada
e encerra o processo ao terminar. Não reinicia nem usa o serviço pessoal da porta
8080. Defina uma porta livre em `BROWSER_TEST_PORT` quando necessário.

Com Node, Playwright e navegador disponíveis:

```bash
DEVSPHERE_TEST_BINARY="$PWD/build/backend/devsphere-api" \
DEVSPHERE_PYTHON="$PWD/.venv-worker/bin/python" \
node tools/tests/browser_next.cjs
```

Se o pacote Playwright não estiver no caminho padrão, defina `PLAYWRIGHT_MODULE`
com seu caminho. `CHROME_PATH` permite indicar o executável do navegador.
Não há download automático de navegador no teste.

Verificações executadas em 16/10/2026, com Chrome local e banco temporário:

- login de aluno e professor;
- João carregado da API, escolha aceita e hipótese registrada;
- PDF e submissão automáticos;
- histórico com o atendimento;
- rascunho docente invisível ao aluno;
- devolutiva concluída com todos os campos;
- texto com HTML exibido sem execução;
- notificação marcada como lida;
- antiga URL pública de gabarito retornando 404;
- origem de navegador 5501, sessão e ação de Marina, com tráfego de API roteado para a instância de teste;
- formulário guiado com quarenta itens e associação entre classificação e pontos;
- edição criando outra versão, preservando campos avançados e a versão original;
- bloqueio de decisão quando existem alterações não salvas;
- administrador criando novo rascunho legado com título versionado, sem alterar o catálogo publicado;
- nenhum erro JavaScript de execução observado nesse percurso.

O teste da origem 5501 serve arquivos por interceptação do Playwright e encaminha
requisições para a API temporária. Isso verifica o comportamento do navegador
entre as duas origens, sem alegar que a extensão VS Code foi controlada pelo teste.

Esses testes não comprovam validade médica, geração real dos modelos, OCR completo,
resistência a todos os ataques nem prontidão para produção. As pendências estão no
[README do worker](../worker/README.md) e na [matriz de segurança](SEGURANCA_NEXT_2026.md).
