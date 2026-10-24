# Operação e recuperação sem inferência — NEXT_2026

Estado: 24/10/2026. Roteiro local para desenvolvimento/apresentação. Não configura serviço de produção, envia e-mails, instala componentes ou carrega modelos.

## Painel e contrato

Abra **Administração → Operação e recuperação**. O painel consulta `GET /api/v1/operations`, exclusivo de administrador autenticado. Usuários aluno/docente recebem 403; sem sessão, 401. Agrega somente os trabalhos e PDFs da instituição da sessão; não aceita instituição, proprietário ou limiar vindos do navegador. Espaço livre é medido no volume privado compartilhado, não é uma quota de outra instituição.

A atualização é manual ou a cada 30 segundos enquanto a página estiver visível. O botão fica protegido contra cliques simultâneos. Erro mantém as medições anteriores identificadas como possivelmente desatualizadas. Anúncios assistivos são repetidos apenas quando muda o estado significativo. O painel não cancela, reenvia, repara ou remove recursos.

O resultado inclui horário Unix, estado do worker (`alive`, `stale`, `absent`), contagens de fila/execução, maior espera, leases expirados, falhas recentes, consumo conhecido de PDFs, reserva e alertas com ação sugerida. Métrica ausente é `null`, nunca zero. Havendo legado de tamanho desconhecido, o total institucional é apresentado como não medido; bytes conhecidos são parciais. Consulta não altera `byte_size`.

## Configuração operacional

| Variável da API | Padrão | Significado |
| --- | --- | --- |
| `DEVSPHERE_QUEUE_ALERT_SECONDS` | 120 | Espera a partir da qual a fila pede conferência; mínimo 30, máximo 86400 |
| `DEVSPHERE_FAILURE_WINDOW_SECONDS` | 3600 | Janela de falhas; mínimo 60, máximo 86400 |
| `DEVSPHERE_FAILURE_ALERT_COUNT` | 3 | Quantidade que sinaliza recorrência; mínimo 1, máximo 1000 |
| `DEVSPHERE_STORAGE_USER_BYTES` | 209715200 | Quota de PDFs-fonte da conta |
| `DEVSPHERE_STORAGE_INSTITUTION_BYTES` | 1073741824 | Quota de PDFs-fonte da instituição |
| `DEVSPHERE_STORAGE_MIN_FREE_BYTES` | 536870912 | Piso de espaço livre no volume privado |

Valores são padrões técnicos, não regras acadêmicas/institucionais homologadas. Configuração inválida bloqueia em vez de silenciar a proteção. Variáveis valem no terminal/processo iniciado; alterá-las em outro terminal não reconfigura uma API já ativa. Veja [escopo das quotas](LIMITES_ARMAZENAMENTO.md).

Heartbeat vem do processo real do worker, não da API: até 30 segundos, com tolerância futura de 5. Sinal antigo/ausente gera alerta se houver trabalho pendente. Espera acima do limiar não comprova processo travado, e lease expirado não prova falta de memória. Falhas `inference_disabled` esperadas no modo protegido não contam como recorrência; falhas reais são contadas mesmo se o cartão foi removido da lista.

## Resposta a cada alerta

| Código | Procedimento seguro |
| --- | --- |
| `worker_unavailable` | Conferir terminal, saúde, caminho da base e última atividade; reutilizar instância existente. Se ausente, iniciar uma única instância protegida. |
| `queue_wait_exceeded` | Conferir capacidade, heartbeat e estados; não repetir o pedido automaticamente. |
| `expired_job_lease` | Identificar serviço antigo e encerrar somente a instância conhecida pelo terminal original. O worker normal recupera lease expirado respeitando prazo, cancelamento e tentativas; não editar SQL para zerá-los. |
| `recurring_failures` | Conferir códigos no histórico autorizado e trecho necessário do log; distinguir configuração/contexto determinísticos de falha transitória. Não divulgar conteúdo clínico ou segredos. |
| `low_disk_space` / `storage_disk_reserve` | Suspender novos envios, conferir capacidade/backups e planejar manutenção; não apagar fontes para liberar espaço sem política. |
| `storage_accounting_required` | Conferir legados por auditoria/reconciliação. Não preencher zero nem fabricar tamanhos por SQL. O upload pode completar a contabilidade apenas de arquivos íntegros, em lote limitado. |
| `storage_unavailable` / `invalid_storage_configuration` | Conferir raiz privada, permissões e configuração do processo; não contornar a proteção pelo navegador. |
| `institution_storage_limit` | Rever capacidade configurada com responsáveis; arquivo retirado ou trabalho arquivado ainda pode ocupar bytes. |

O histórico pode manter um alerta de falhas até o fim da janela. Isso não significa que a recuperação falhou nem autoriza apagar registros para limpar o painel. Não há entrega externa de alertas nem monitor permanente nesta etapa; com a página fechada não há polling do navegador.

## Inicialização e encerramento no Mac

Antes de iniciar, confirme se API/worker já existem. Não execute um segundo worker na mesma base. A API deve estar atualizada e ter aplicado migrations com backup antes do worker.

Terminal da API, na raiz do projeto:

```bash
export DEVSPHERE_INFERENCE_ENABLED=0
export DEVSPHERE_ALLOW_SOURCE_PURGE=0
export DEVSPHERE_ENV=development
export DEVSPHERE_DB_PATH="$PWD/backend/data/devsphere.db"
export DEVSPHERE_PYTHON="$PWD/.venv-worker/bin/python"
./tools/start-local-api.sh
```

Terminal do worker, na mesma raiz:

```bash
export DEVSPHERE_INFERENCE_ENABLED=0
export DEVSPHERE_ALLOW_SOURCE_PURGE=0
export DEVSPHERE_ENV=development
export DEVSPHERE_DB_PATH="$PWD/backend/data/devsphere.db"
./tools/start-worker.sh
```

Health: `http://127.0.0.1:8080/api/v1/health`. Interface pela API 8080 ou Live Server 5501, que continua dependendo da API. Cookies/sessão e permissões são preservados. Encerre com Ctrl+C nos terminais originais; não mate processos indiscriminadamente.

## Exercícios de recuperação verificados

Todos usam bases e documentos sintéticos isolados:

- Worker ausente, fila antiga, lease expirado e falhas recorrentes produzem avisos sem expor payloads.
- `claim` real recupera lease expirado e incrementa tentativa; uma segunda chamada não toma o lease novo ainda válido. Nenhum trabalho retornado foi executado por modelo.
- Limite de disco é exercitado elevando o piso configurado acima do espaço disponível, sem criar arquivo enorme nem causar pressão real.
- Quota é conferida no helper e no HTTP: bytes do payload prevalecem sobre campos adulterados, retirados continuam contando, duas contas compartilham a quota institucional e falha faz rollback.
- Quarentena/restauração após interrupção seguem o diário privado e não removem conteúdo ou alteram histórico. Veja [reconciliação](RECONCILIACAO_ARQUIVOS.md).
- [Backup cifrado](SEGURANCA_NEXT_2026.md) restaura para destino novo; nunca sobrescrever SQLite ativo. [Checkpoints do medidor](MODO_APRESENTACAO_MAC.md) são ensaiados apenas com processos leves.

Esses ensaios não constituem teste de carga, pentest independente, garantia contra toda queda ou validação médica. Testes integrais Qwen3/Gemma3 continuam exclusivos do Windows e não foram executados no M1.
