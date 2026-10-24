# Apresentação protegida no Mac — NEXT_2026

Atualização: 23/10/2026. O teste integral anterior no M1 foi interrompido com travamento e reinício relatados pelo usuário. A causa exata não foi confirmada. Esta etapa não executa Qwen3:8b ou Gemma3:4b e não promete eliminar todo risco operacional.

## Política efetiva

`DEVSPHERE_INFERENCE_ENABLED=0` é o padrão quando a variável está ausente. Somente o valor exato `1` habilita inferência. A API bloqueia novos pedidos e retries de geração com `403 inference_disabled`. O worker bloqueia trabalhos pendentes, a execução auxiliar e cada chamada ao adaptador, inclusive crítica. O navegador não pode habilitar a política pelo payload.

Conversão, OCR limitado, biblioteca autorizada, orçamento, atendimento, pontuação, PDF e devolutivas continuam disponíveis. Orçamento válido não habilita geração no modo protegido. A aplicação não inicia nem instala Ollama/modelos automaticamente.

As tarefas locais do VS Code fixam inferência em `0`. Os scripts de inicialização usam `0` quando não há valor explícito. Alterar a política exige configuração operacional e reinício coerente dos componentes; não há controle de habilitação para usuário comum na interface. Resultados Windows anteriores não validam automaticamente este diff.

## Iniciar no Mac

Na raiz correta, abra um terminal para a API:

```bash
cd "/Users/vini_araujo/Documents/GitHub/Challenge_GrupoDevsphere"
export DEVSPHERE_INFERENCE_ENABLED=0
export DEVSPHERE_ALLOW_SOURCE_PURGE=0
export DEVSPHERE_ENV=development
export DEVSPHERE_DB_PATH="$PWD/backend/data/devsphere.db"
export DEVSPHERE_PYTHON="$PWD/.venv-worker/bin/python"
./tools/start-local-api.sh
```

Em outro terminal, para conversão e orçamento:

```bash
cd "/Users/vini_araujo/Documents/GitHub/Challenge_GrupoDevsphere"
export DEVSPHERE_INFERENCE_ENABLED=0
export DEVSPHERE_ALLOW_SOURCE_PURGE=0
export DEVSPHERE_ENV=development
export DEVSPHERE_DB_PATH="$PWD/backend/data/devsphere.db"
./tools/start-worker.sh
```

Esses exports valem somente no respectivo terminal e processos filhos; não alteram o aplicativo Ollama globalmente. API e worker precisam apontar à mesma base. As migrations incrementais `015_worker_runtime.sql` e `016_job_archive.sql` pertencem à API e são aplicadas transacionalmente pelo migrador, com backup consistente antes de schema pendente. Não iniciar dois workers na mesma base. Confira fila e serviços antes de reiniciar.

Acesse `http://127.0.0.1:8080` ou o frontend pelo Live Server `http://127.0.0.1:5501`. O Live Server continua dependendo da API 8080. Health check: `http://127.0.0.1:8080/api/v1/health`. Login usa as contas locais já cadastradas; não recrie contas nem exponha credenciais para demonstrar.

Para encerrar, use Ctrl+C nos terminais que iniciaram os serviços. Não encerre processos por nome indiscriminadamente. Se já existir uma API, o script apenas verifica saúde; isso não confirma versão nem banco. Confira o diagnóstico após abrir a página.

## Diagnóstico e orçamento

`GET /api/v1/runtime` exige sessão. Retorna política da API e heartbeat do worker: `absent`, `alive` ou `stale`. O heartbeat é renovado pelo worker, inclusive durante filhos, com intervalo de até cinco segundos; a API considera válido até 30 segundos, com tolerância futura de cinco segundos. Detalhes permitidos da configuração ficam restritos ao administrador. O estado não é prova de RAM suficiente.

A prévia é solicitada com `operation: budget` na fila autenticada existente. Por compatibilidade do schema, a coluna operation registra `generate`, enquanto `request_json.operation=budget` distingue a prévia. Ela não executa modelos nem pode virar contribuição. O resultado inclui orçamento, `configHash`, `inputHash`, `diagnosedAt`, `validUntil` e política efetiva. Validade: 120 segundos. Mensagens e margens são compartilhadas com a geração; a crítica depende do caso completo e só pode ser orçada definitivamente depois.

Na execução real futura, `previewJobId` identifica a prévia concluída do mesmo proprietário/documento. O worker reconfere validade, entrada, hashes das fontes e configuração. Não confia no hash enviado pelo navegador. Limites configurados não são tokens reais reportados pelo modelo. Não houve inferência nesta validação.

A UI preserva páginas, orientações e consulta por documento em memória. Atualizar listas ou trocar filtros não apaga o formulário. Mudanças de entrada, revisão da extração, lista de fontes/permissões, configuração, worker ausente/desatualizado ou TTL invalidam a prévia. A revisão monotônica da extração evita manter uma prévia após duas alterações no mesmo segundo. Não existe persistência duradoura de texto clínico no navegador para esse formulário.

Prévia tem quota própria: padrão 30 solicitações por usuário/hora (`DEVSPHERE_BUDGET_REQUEST_LIMIT`); conversões/gerações mantêm 12 (`DEVSPHERE_JOB_REQUEST_LIMIT`). A janela usa `DEVSPHERE_JOB_WINDOW_SECONDS`, padrão 3600. Retentativas manuais aceitas contam na categoria correspondente; replay idempotente não conta novamente. A capacidade pendente global/institucional permanece compartilhada para evitar abuso. A prévia não consome uma tentativa de geração real.

## Materiais retirados e exclusão

O filtro padrão mostra ativos. Retirados continuam acessíveis no filtro próprio ou em Todos e aparecem como **Retirado**, sem sumir do histórico.

Somente titular ou administração da mesma instituição pode consultar elegibilidade ou excluir. `GET /documents/{id}/deletion-eligibility` explica impedimentos. Exclusão física é desabilitada por padrão. Ela só é operacionalmente habilitável em desenvolvimento com `DEVSPHERE_ALLOW_SOURCE_PURGE=1` e `DEVSPHERE_ENV=development`; isso não representa política institucional homologada. Não habilitar para os documentos pessoais da demonstração.

Qualquer histórico de processamento, versão, referência de contribuição, biblioteca, leitor/exposição ou grant impede exclusão. Não há cascata genérica de casos, atendimentos ou avaliações. Um material precisa estar retirado, sem vínculos, e passar pela conferência do arquivo interno. A interface consulta elegibilidade e pede confirmação antes da ação definitiva.

O backend move o arquivo para nome privado de quarentena, faz a transação e mantém recibo mínimo para idempotência. Erro transacional restaura o arquivo. Uma falha física após commit retorna `cleanupPending: true` e HTTP 202; reenvio consulta o recibo, sem alegar limpeza concluída. Não publica caminho de quarentena. Limpeza pendente requer manutenção administrativa e conferência de backup/auditoria; não existe purga automática de órfãos nesta entrega.

A retenção institucional permanece pendente. O comportamento conservador é filtrar/ocultar quando houver bloqueio; ocultação não significa exclusão. Os testes de exclusão usam apenas material sintético descartável, inclusive interposição de falha de unlink restrita ao processo filho de teste no macOS.

## Medição e recuperação, sem benchmark no Mac

`tools/measure_macos_job.py` continua observador: não inicia modelo nem modifica a fila. Agora grava um diário `RELATORIO.json.checkpoint.jsonl`, novo e privado (0600), com fsync por registro. Ignora trabalhos de prévia para acompanhar somente geração real futura. Amostras podem perder picos; RSS, alocação do executor, memória física e swap são medidas diferentes. Ausência é `null`.

Recuperação de diário interrompido, sem API, banco ou modelos:

```bash
.venv-worker/bin/python tools/measure_macos_job.py \
  --recover /caminho/privado/relatorio.json.checkpoint.jsonl \
  --report /caminho/privado/relatorio-recuperado.json
```

A recuperação preserva linhas completas e identifica interrupção/última linha truncada. Não inventa fim, pico ou duração que não tenha sido medido. Os arquivos finais não são sobrescritos.

`tools/guarded_process.py` é watchdog externo ao comando que ele próprio inicia. Usa limite de duração e limiar conservador de folga por leituras consecutivas; falta de leitura não é memória suficiente. Encerra apenas seu grupo de processos criado, com TERM e fallback KILL, registrando a razão. Não procura processos por nome, não encerra Ollama compartilhado e não cancela automaticamente trabalhos da aplicação. Não oferece proteção contra travamento do SO ou morte do próprio watchdog. Cancelamento de fila continua responsabilidade da aplicação/operador.

Exemplo seguro de teste leve, com relatório novo em diretório privado:

```bash
.venv-worker/bin/python tools/guarded_process.py \
  --timeout 2 --min-free-percent 0 \
  --report /private/tmp/watchdog-sintetico-novo.jsonl \
  -- .venv-worker/bin/python -c 'import time; time.sleep(5)'
```

Neste exemplo `0` desliga somente a leitura de folga para exercitar o limite temporal com um processo leve; não é configuração para inferência. Testes validam gravação abrupta, recuperação e encerramento de filho com sleep ou valores simulados, sem induzir pressão real.

## Roteiro de apresentação

1. Escolher perfil e entrar. Credenciais pessoais são preenchidas pelo titular.
2. Aluno seleciona João ou Marina e investiga, registrando escolhas, hipóteses e justificativas.
3. Concluir: servidor calcula pontuação e entrega PDF; histórico e nova tentativa preservam versão.
4. Docente autorizado confere percurso, PDF e tentativas; rascunho permanece privado.
5. Concluir devolutiva; aluno consulta notificação e avaliação completa.
6. Contribuições: enviar somente PDF autorizado e desidentificado/fictício, converter, conferir Markdown e páginas.
7. Preencher páginas e orientações, conferir orçamento; mostrar que a geração permanece bloqueada neste ambiente.
8. Mostrar filtro de retirados e motivos de impedimento da exclusão, sem apagar documentos reais.

Não apresentar um caso manual como geração de IA nem simular sucesso. Geração integral de José Almir permanece pendente no Windows/WSL2; revisão clínica é responsabilidade docente.

## Checklist Windows, executar somente depois

- [ ] Conferir este diff, dependências e recursos disponíveis.
- [ ] Habilitar inferência explicitamente na API e no worker em ambiente de teste isolado; renovar a prévia após mudar configuração.
- [ ] Começar Qwen 8.192/6.000, registrar contexto/saída/timeout do Gemma separadamente.
- [ ] Medir geração real, contrato 18/22, crítica completa, rascunho e repetibilidade sem comprometer estabilidade.
- [ ] Validar interrupção e recuperação sem assumir que a RTX 3060 garante sucesso.
- [ ] Conferir fontes, licenças e revisão clínica antes de aprovação/publicação.

O benchmark Python nativo não comprova sozinho a plataforma C++20 e o worker POSIX. Siga o roteiro WSL2 existente para o fluxo integrado. Não executar esse checklist no M1.

## Evidências desta entrega

Em 23/10/2026: worker 85/85; ferramentas 66 executados, 63 passaram e 3 de IA real não executados; CTest 2/2. Total 150 testes passaram. Chrome validou jornadas e PDF/devolutiva, interface protegida e Live Server real. O teste integrado API/worker processou PDF e orçamento com porta do provedor indisponível e inferência desligada. Falha de unlink pós-commit foi reproduzida somente em API descartável via fixture nativa; cleanupPending e idempotência passaram.

Na base pessoal, migration 015 aplicada com backup consistente e hashes das colunas anteriores: nenhuma diferença nas 44 tabelas comparadas, integrity_check ok e foreign_key_check vazio. API e worker ficaram ativos em modo protegido, sem fila pendente; Ollama não reportou modelos carregados na consulta final.

Agentes: backend implementou política, runtime, quotas, elegibilidade, purga e testes HTTP; worker implementou barreiras, heartbeat e validade; frontend implementou formulários, filtros, diagnóstico e regressão de UI. Coordenador integrou, adicionou checkpoints/watchdog e testes de recuperação/falha física/pipeline real leve, validou as jornadas, preservou o banco e atualizou contratos/documentação.

Limitações: watcher não cancela um provedor compartilhado nem recupera o sistema operacional; retenção não homologada; purga de material com qualquer histórico é bloqueada; teste de UI usa fixtures identificadas para variar heartbeat/orçamento, complementado por pipeline leve real; revisão clínica, pentest independente e testes integrais no Windows permanecem pendentes.

## Remover trabalhos da listagem

Na página **Contribuições → Trabalhos de processamento**, use **Remover da lista** em um trabalho concluído, cancelado ou com falha. A confirmação explica o alcance: o PDF, o Markdown, o resultado, rascunhos e histórico são preservados. Use o filtro **Removidos da lista** e **Restaurar na lista** para recuperar a exibição. O filtro padrão mostra somente visíveis; **Todos** reúne os registros retornados. A listagem mantém o limite de 100 registros e prioriza os visíveis.

Um trabalho na fila ou em execução deve ser cancelado antes: clique em **Cancelar**, atualize e aguarde o estado **Cancelado** (ou outro estado terminal). Solicitação de cancelamento não é confirmação de encerramento. Arquivar não interrompe o worker. Se não gostou do resultado, remova o trabalho encerrado e faça uma **nova solicitação no cartão do documento**; a conversão/geração continua sujeita a permissões, quotas e à política operacional. No Mac protegido, geração real continua bloqueada.

O backend usa `POST /api/v1/jobs/{id}/archive` e `/restore`, exclusivamente para o titular, sem privilégio especial de administrador sobre trabalhos alheios. A migration `016_job_archive.sql` adiciona `archived_at`; não apaga registros ou arquivos. Transições são transacionais, auditadas e idempotentes. Retentativa de arquivado retorna `409 job_archived`; trabalho ativo retorna `409 job_active`. Arquivar não reinicia tentativas, renova prazos nem devolve quota. Exclusão física de documentos e retirada de contribuições são operações distintas.

### Evidência da extensão de trabalhos — 23/10/2026

Sete testes HTTP novos de arquivar/restaurar passaram. Regressão de ferramentas: 73 executados, 70 aprovados e três de IA real não executados. CTest: 2/2. Chrome com API e base reais descartáveis validou cancelar, recusar/aceitar confirmação, persistência após recarga, filtros, restauração, formulário/Markdown preservados e nova solicitação. A regressão anterior da interface protegida também passou. Nenhum modelo executado; a mensagem de baixo limite no ensaio do watchdog vem de fixture simulada, não de pressão real.

Migration 016 aplicada à base local com backup consistente. Comparação das colunas anteriores das 50 tabelas de negócio conferidas sem diferenças, integridade válida e nenhuma violação de chave estrangeira. Nenhum trabalho pessoal removido automaticamente. API 8080 reiniciada exclusivamente para esta atualização; worker preservado e política de inferência desabilitada.

## Capacidade e revisão assistiva — 24/10/2026

API local já inclui migration 017 e painel Administração → Operação e recuperação. Quotas técnicas de PDFs-fonte e reserva mínima de disco podem bloquear envio com orientação segura; tamanhos legados NULL exigem conferência e não viram zero. Não apague conteúdo para limpar alertas. Veja [operação](OPERACAO_E_RECUPERACAO.md) e [reconciliação](RECONCILIACAO_ARQUIVOS.md).

Para leitura assistiva, use um novo PDF sintético: título/idioma/marcadores e estrutura lógica foram adicionados sem reescrever arquivos antigos. [Safari e VoiceOver](ACESSIBILIDADE_SAFARI_PDF.md) ainda requerem sua verificação manual; automação nativa não foi habilitada. A política de modelos continua desligada.
