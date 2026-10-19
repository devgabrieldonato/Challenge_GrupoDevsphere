# Pendências e execução — NEXT_2026

Conciliação do código com as duas páginas do Notion em 16/10/2026. Este registro
separa evidência técnica local, avaliação humana e configuração externa. Nenhum
agente pode declarar aprovação clínica, auditoria independente ou homologação.

## Concluído nesta rodada

| Entrega | Evidência | Responsável técnico |
| --- | --- | --- |
| Habilitar/revogar docentes por área, listar atribuições e substituir revisor com motivo | C++ core, HTTP direto e painel Chrome; decisões anteriores preservadas | Agente backend + coordenador |
| Revogar grants de fontes, consultar destinatários e casos dependentes | HTTP e Chrome; consulta restrita ao proprietário/admin; mutação administrativa auditada | Coordenador |
| Redigir resultados de geração quando fontes deixam de ser autorizadas | HTTP verifica `result: null` e `resultAccess: revoked` em lista/detalhe após revogação/retirada | Coordenador |
| Registrar exposição dos proprietários das fontes secundárias | Teste C++ de materialização e histórico | Agente backend |
| Selecionar páginas reais antes da inferência e respeitar orçamento de fontes/contexto | 26 testes worker, incluindo seleção vazia, página inexistente/inventada, fontes suplementares e limites | Agente worker + coordenador |
| Rubrica opcional versionada com confirmação e divergência justificada | C++ + Chrome; detalhes em RUBRICA_DIFICULDADE.md | Agentes frontend/backend + coordenador |
| Conferir visibilidade e metadados locais de licenças | AUDITORIA_PENDENCIAS_NEXT_2026.json; consulta somente de leitura | Coordenador |

Não houve migration nova nesta rodada, nem acesso de testes à base pessoal.
Os patches dos agentes backend/worker foram revisados e integrados pelo coordenador;
o frontend foi integrado e testado em conjunto. Os testes usam documentos e usuários
sintéticos, inclusive resultados artificiais explicitamente limitados às fixtures.

## Fila priorizada para continuar

| Prioridade / pendência | Próxima ação verificável | Responsável / dependência | Critério de conclusão |
| --- | --- | --- | --- |
| P1 — Qwen3:8b com timeout | Isolar carga/recursos e executar primeiro resposta curta, depois caso integral em equipamento adequado, sem outra inferência concorrente | Equipe técnica; M1/8GB atual apresentou pressão de memória/timeouts | 18/22 integrais, JSON válido, referências válidas; medir tempo/memória/falhas, sem cortes |
| P1 — crítica Gemma e RAG real completos | Após geração viável, executar crítica sequencial e geração usando trechos autorizados selecionados | Modelos/hardware e fontes sintéticas | Proveniência auditável e recuperação de falhas comprovadas; concordância de modelos não aprova caso |
| P1 — avaliação clínica | Docente compara fonte, valores/unidades, hipóteses, desfecho, pontuação e conteúdo sintético acrescentado | Docente habilitado e atribuído | Parecer identificável por versão; correções antes da aprovação/publicação |
| P1 — dificuldades e tags reais | Revisar João/Marina, público/pré-requisitos e combinação de título/resumo/tags/duração | Docentes e coordenação pedagógica | Rubrica confirmada sem antecipar diagnóstico; não preencher automaticamente |
| P1 — segurança independente | Exercitar matriz completa de objetos/estados, PDFs hostis, prompt injection e abusos em homologação autorizada | Avaliador independente e ambiente isolado | Evidências por requisito ASVS aplicável e correção de falhas impeditivas |
| P1 — isolamento operacional | Usuário dedicado, sandbox SO, limites/rede/mounts, HTTPS e HTTP de produção | Infraestrutura aprovada | Processador e inferência sem acesso desnecessário; verificação de confinamento no ambiente final |
| P1 — governança | Aprovar revisores/suplência/segunda revisão, autoaprovação, uso de fontes, retenção/descarte e identidades individuais/MFA | Instituição | Política registrada e refletida na configuração; sem presumir regras homologadas |
| P1 — repositório público | Deliberar visibilidade, colaboradores/2FA e proteção da main antes de avaliação formal com conteúdo restrito | Proprietário do GitHub e instituição | Configuração externa autorizada e verificada; nenhuma alteração externa nesta tarefa |
| P2 — adequação de licenças | Revisar termos do Gemma, licença Qwen e permissão de cada documento para o uso final | Responsáveis legais/institucionais | Autorização de uso documentada; hash da licença não equivale a aprovação jurídica |
| P2 — calibração e operação | Medir tentativas e esforço docente, carga controlada, monitoramento e recuperação no ambiente final | Equipe pedagógica e operacional | Métricas reproduzíveis, sem dados sensíveis em logs; testar restauração e resposta a incidentes |

## Estado dos modelos

Ollama, Qwen3:8b e Gemma3:4b já estão instalados. Tesseract/Poppler e OCR real de
PDF sintético passaram. Gemma respondeu JSON curto; Qwen teve timeout, inclusive
em teste curto. Não há geração integral real aprovada nem avaliação clínica.
Instalar novamente os mesmos componentes não resolve por si só esse bloqueio.
Não executar inferência pesada durante outras tarefas sem controlar recursos.

Os limites operacionais do prompt usam estimativa de bytes, não o tokenizer do
modelo: reduzem excessos previsíveis, mas não garantem ausência de truncamento.
A saída cortada continua sendo rejeitada. Ver worker/README.md e os registros em
MODELOS_LOCAIS_NEXT_2026.json.

## Repositório e confidencialidade

A consulta autenticada de leitura confirmou o repositório
`devgabrieldonato/Challenge_GrupoDevsphere` como **PUBLIC**. Não alteramos visibilidade,
permissões ou regras. Conteúdo já publicado e histórico podem ser copiados; mover
gabaritos para o backend não torna secretos os casos legados publicados no Git.
Não usar esses casos como prova de gabarito desconhecido. Casos futuros restritos
não devem ser versionados em repositório público; essa política depende da instituição.

## Testes desta rodada

- CMake compilou; CTest: 2/2 alvos passaram.
- tools/tests: 20/20 passaram (HTTP, backup e inicialização).
- worker/tests: 26/26 passaram, incluindo OCR sintético real.
- Chrome: atendimento/PDF/devolutiva, origem5501 por proxy de teste, versões,
  rubrica, painel de habilitação/revogação e grants passaram; zero erro JavaScript.
- A extensão Live Server não foi automatizada; a origem foi exercitada pelo proxy.
- Geração integral, validação médica e segurança independente permanecem pendentes.

Comandos reproduzíveis: ENTREGA_NEXT_2026.md. Para aplicar o código localmente,
encerre os processos antigos nos seus terminais e reinicie API e worker pelos
scripts documentados no README; um health positivo não comprova binário atualizado.

## Segunda rodada — resultado verificado

- Agente backend: quota persistente por usuário/janela para criação e retry manual;
  transações e replay idempotente sem novo consumo; sem migration. Coordenador
  integrou e executou os testes HTTP reais com banco sintético.
- Agente de apoio aos portais: inventário `tools/check-local-ai.sh`/`worker.doctor`,
  com13 testes de transporte seguro e dependências. Somente leitura, sem inferência.
- Coordenador: conversão corrigida para `pages: []`, validação de conclusão/modelo
  do Ollama, erros legíveis, timeout configurável, métricas e testes de PDFs/protocolo;
  retirada de fonte bloqueia grantees preservando titular/admin e histórico.
- Testes: CTest2/2; tools23/23; worker51/51 com ResourceWarning como erro; Chrome
  passou sem erros JavaScript. Base pessoal não acessada; sem migration nova.
- O diagnóstico real encontrou Ollama0.40.5, Qwen/Gemma instalados, Tesseract5.5.3
  por+eng e Poppler26.10.0. Nenhum modelo ficou carregado ao fim.

**Atualização do bloqueio Qwen:** teste real curto com contexto512 passou em27,84s
(9 tokens); contexto4096 do worker voltou a exceder60s. A causa exata não foi isolada;
não há evidência de geração integral. A contagem aproximada de RSS do primeiro probe
não foi obtida e está registrada como indisponível, sem inferir memória zero.
Dados técnicos em MODELOS_LOCAIS_NEXT_2026.json. Não iniciar teste de caso completo
pesado nem declarar hardware suficiente com base nessa resposta curta.

Próxima ação: medir execução sustentada no contexto necessário, controlar pressão
de memória e avaliar hardware de demonstração. Reduzir contexto para512 não resolve
o contrato de40 itens. Validação clínica, adequação de licenças, isolamento SO,
ASVS independente, regras institucionais e Live Server real (além do proxy de teste)
continuam pendentes. Os itens concluídos acima não removem esses bloqueios.

## Terceira rodada — estado atual

- Backend: limites pendentes por instituição/global e consistência de upload em
  falhas tratáveis; testes cruzados, transacionais e com injeção de erro passaram.
- Frontend/testes: módulo real Live Server com API temporária sem proxy passou,
  incluindo reabertura da página na mesma sessão. Portas existentes são preservadas.
- Coordenador: contexto separado da crítica, métricas de memória distinguíveis,
  perfil experimental isolado e teste real de geração; entrada sintética e roteiro
  para outra máquina. Sem migration/commit/push ou uso da base pessoal.
- Resultados atuais: tools29/29, worker54/54 (ResourceWarning como erro), CTest2/2
  e Live Server real passaram. Guardas de portas também passaram.

**Bloqueio agora demonstrado:** perfil q8_0/Flash Attention/uma execução passou JSON
curto4096 em18,736s; ao gerar caso em8192, ocorreu
`kIOGPUCommandBufferCallbackErrorOutOfMemory`. API respondeu sem conclusão;
`provider_incomplete` rejeitou o resultado em15,832s. Gemma não foi alcançado.
Não generalizar esse resultado para todas as configurações/máquinas, nem declarar
que a resposta curta resolve o contrato inteiro. Processos experimentais encerrados.

O usuário confirmou outra máquina disponível. Sistema/RAM/CPU/GPU aguardam resposta;
não há acesso remoto configurado. Próximo passo: preparar dependências e reproduzir
benchmark completo no destino conforme VALIDACAO_IA_OUTRA_MAQUINA.md. A antiga nota
“causa exata não isolada” corresponde aos timeouts anteriores; a falta de memória
está demonstrada nesta tentativa específica, não como diagnóstico universal.

Pendências independentes remanescentes: quotas de armazenamento em bytes/reserva
de disco e reconciliação de órfãos após queda abrupta; monitoramento operacional;
sandbox SO e avaliação independente de segurança. Dependências humanas/institucionais
anteriores continuam abertas. Live Server real está verificado nos limites descritos;
a UI do VS Code/fechamento completo do navegador não foram automatizados.

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
