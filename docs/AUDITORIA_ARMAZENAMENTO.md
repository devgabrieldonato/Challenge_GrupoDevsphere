# Auditoria de armazenamento de fontes — somente leitura

A ferramenta `tools/audit_source_storage.py` ajuda a identificar inconsistências
entre SQLite e PDFs após falhas de operação. Não exclui, repara, indexa ou altera
registros; não substitui backup, autorização, política de retenção ou quota de disco.
Nesta etapa foi executada apenas com bases/documentos sintéticos.

## Execução

Em macOS/Linux, com Python3.11+ e apenas biblioteca padrão:

```text
python3 tools/audit_source_storage.py --db /caminho/snapshot-consistente.db --storage /caminho/raiz-privada --report /caminho/novo-relatorio.json
```

Use uma janela sem gravações da API/worker, ou snapshot coerente do banco e dos
arquivos. O caminho de armazenamento precisa corresponder aos registros do banco;
levantar apenas um snapshot SQLite não congela os PDFs. Não pare serviços sem
coordenar a operação. Uma execução concorrente pode apontar arquivos mudando;
não interprete esse resultado como autorização de limpeza.

A conexão SQLite utiliza `mode=ro`/`query_only`. As leituras de arquivos ficam
ancoradas na raiz privada com descritores e `NOFOLLOW`; links e referências fora
da raiz não são seguidos. A ferramenta usa APIs POSIX; não foi homologada em
Windows nativo. Execute em ambiente compatível para auditoria de operação.

## O que confere

- Registros cujos arquivos estão ausentes ou fora da raiz privada.
- Arquivos sem registro, identificados de forma opaca.
- SHA-256 diferente do registro, leitura bloqueada ou mudança durante o hash.
- Links simbólicos/hardlinks e tipos de arquivo inesperados.
- Quantidades e bytes observados globalmente e por ID interno de proprietário.

Não lê nomes originais, Markdown ou texto clínico. O relatório não traz caminhos
externos nem conteúdo PDF. Ainda é informação operacional: guarde-o em local
privado, sem publicar relatórios reais no Notion ou no Git.

## Limites e resultados

Defaults:10MiB por arquivo,256MiB de hash por execução,10mil documentos,10mil
arquivos,20mil entradas e profundidade32. Opções `--max-documents`, `--max-files`,
`--max-entries` e `--max-hash-bytes` permitem ajuste dentro de tetos finitos.
Ultrapassar orçamento deixa `complete: false`; não significa auditoria limpa.

- Código0: consistente no escopo observado.
- Código1: achados ou orçamento insuficiente para concluir.
- Código2: configuração/schema/execução/relatório indisponível.

Sem `--report`, imprime JSON no terminal. Com a opção, cria um arquivo novo0600
fora da raiz auditada; recusa sobrescrever arquivo existente. Não cria base vazia
se o caminho SQLite estiver errado. Bytes observados são uso lógico de fontes,
não medição completa do disco nem uma quota imposta ao upload. Fontes retiradas
continuam existindo e são contabilizadas enquanto os arquivos forem preservados.

## Tratamento dos achados

Revise com o operador responsável e a política institucional. Arquivo órfão pode
resultar de queda abrupta; registro ausente pode indicar falha de restauração.
Preserve evidências e backup antes de qualquer ação separada. Esta auditoria continua somente de leitura. Quotas de bytes e piso de disco foram
adicionados à admissão da API; a reconciliação explícita possui ferramenta separada.
Não há cleanup automático. Consulte os guias abaixo.

Seis testes sintéticos verificaram consistência, integridade, caminhos/links,
limites, códigos de saída, relatório privado e preservação de banco/arquivos.


## Complemento — apresentação protegida em 23/10/2026

Inferência exige opt-in exato em API, worker e adaptador. Migration 015 adiciona heartbeat técnico, recibos mínimos de exclusão e revisão monotônica da extração. Prévia autorizada tem validade de 120s e usa a configuração do worker. Retirados ficam filtrados; purga é desabilitada por padrão e bloqueada por histórico/vínculos. Não houve homologação de retenção. Checkpoints e watchdog foram exercitados somente com processos leves. Consulte [modo protegido, contratos e limites](MODO_APRESENTACAO_MAC.md).

## Atualização operacional — 23/10/2026

A detecção desta ferramenta não muda arquivos. A etapa posterior agora pode usar [reconciliação com plano/manutenção/aplicação explícita](RECONCILIACAO_ARQUIVOS.md), incluindo quarentena sem descarte e restauração de cópia com hash exato. [Quotas de PDFs-fonte e reserva de disco](LIMITES_ARMAZENAMENTO.md) são aplicadas pelo backend; tamanhos legados desconhecidos não são contados como zero. A ausência de política de retenção não autoriza expirar a quarentena.
