# Limites de armazenamento de fontes

## Escopo e decisões técnicas

O backend C++20 controla os bytes dos PDFs privados em `source_documents`, por proprietário e por instituição. Fontes retiradas continuam consumindo a quota: ocultar/arquivar não libera disco. Contas administrativas seguem os mesmos limites de armazenamento; o papel técnico não autoriza ultrapassá-los.

Os valores abaixo são padrões técnicos de desenvolvimento do MVP, sem homologação institucional. Não definem prazo de retenção. Banco SQLite, relatórios PDF gerados, Markdown, logs, backups, arquivos em quarentena e outras aplicações também ocupam disco, mas não integram a quota de PDFs-fonte por usuário. A reserva do sistema de arquivos detecta o espaço disponível para o processo, considerando esses consumidores; não equivale a limite total da aplicação.

| Variável do processo da API | Padrão | Regra |
| --- | --- | --- |
| `DEVSPHERE_STORAGE_USER_BYTES` | 209715200 (200 MiB) | Soma dos PDFs da conta |
| `DEVSPHERE_STORAGE_INSTITUTION_BYTES` | 1073741824 (1 GiB) | Soma dos PDFs de todas as contas da instituição |
| `DEVSPHERE_STORAGE_MIN_FREE_BYTES` | 536870912 (512 MiB) | Espaço mínimo a preservar após receber o PDF |

Somente inteiros decimais positivos de até 1 TiB são aceitos. Valor vazio, negativo, zero, não numérico ou acima do teto bloqueia o envio com `503 invalid_storage_configuration`. Não há parâmetro do navegador que altere esses limites. O tamanho recebido é medido pelo servidor, nunca aceito do formulário. O limite existente de 10 MiB por PDF permanece.

A configuração só vale no processo que a recebeu. Mudanças operacionais exigem iniciar a API com as variáveis desejadas; alterar um terminal diferente não reconfigura um servidor já ativo.

## Transação e concorrência

`requireStorageAdmission(db, userId, incomingBytes, root)` deve ser executado **depois de `BEGIN IMMEDIATE`, antes de criar o arquivo**. A mesma transação cobre conferência dos legados, contagem, admissão, `INSERT` do PDF e auditoria. O registro novo recebe `byte_size` medido a partir do payload real. Não commitar a reserva separadamente.

SQLite serializa as admissões entre processos que utilizem a mesma base. A soma inclui fontes retiradas e usuários da mesma instituição, com consultas parametrizadas. Ao falhar o upload, o chamador deve executar rollback, inclusive das medições dos legados. A proteção não coordena dois bancos independentes nem promete reservar fisicamente o espaço contra outras aplicações. Falhas reais de escrita continuam sendo tratadas pelo guard do upload e pela reconciliação.

Antes do envio, `fstatvfs` verifica o espaço disponível ao processo no diretório privado. Exige `availableBytes >= minFreeBytes + incomingBytes`, evitando estouro aritmético por comparação de diferenças. A medição é uma observação no momento da admissão, não uma garantia contra consumo concorrente externo.

## Legados e migration 017

`017_storage_bytes.sql` adiciona `byte_size`, inicialmente `NULL` para fontes antigas. A migration não abre arquivos e não atribui zero a tamanhos desconhecidos. O procedimento de backup consistente e a sequência normal de migrations continuam obrigatórios.

Na próxima admissão, somente legados da instituição do usuário são conferidos. A conferência exige:

- Identificador interno válido e caminho esperado `<diretório privado>/<id>.pdf`.
- Componentes de diretório sem symlink; somente aliases fixos `/var` e `/tmp` do macOS são normalizados para `/private`.
- Arquivo regular, sem symlink, com exatamente um hardlink e até 10 MiB.
- Leitura limitada ao tamanho esperado e SHA-256 igual ao digest registrado.
- Identidade, tamanho e tempos com nanossegundos estáveis antes/depois, além da conferência do nome no diretório após a leitura.

O arquivo não é modificado. Só `byte_size` é atualizado na transação. Arquivo ausente, corrompido, fora da raiz ou ambíguo produz `503 storage_accounting_required`, preservando registro e arquivo. Outra instituição não é varrida nem tem seu conteúdo revelado.

Para limitar trabalho síncrono, a conferência aceita no máximo **128 legados e 64 MiB de bytes lidos por admissão**, além do teto técnico de 10.000 fontes da instituição para o diagnóstico. Se exceder, bloqueia em vez de ignorar fontes. O rollback não deixa atualização parcial. Nesse caso é necessária manutenção administrativa auditada e em lotes, após reconciliação dos arquivos; este helper não implementa uma ferramenta de manutenção que force ou fabrique tamanhos. Não preencher SQL manualmente por estimativa.

## Diagnóstico seguro

`storageSnapshot` é somente de leitura e retorna `availableBytes`, `userUsedBytes`, `institutionUsedBytes`, `unknownSizes` e `limits` (`userBytes`, `institutionBytes`, `minFreeBytes`). Os totais incluem somente tamanhos conhecidos. Quando `unknownSizes > 0`, devem ser apresentados como **contagem parcial pendente de conferência**, nunca como consumo completo ou espaço garantidamente disponível para a conta.

O endpoint que chamar esse helper deve autenticar e autorizar o usuário. Detalhes institucionais/operacionais devem ficar restritos à administração. O helper não retorna caminhos, nomes de documentos, IDs de terceiros, segredos nem o ambiente completo.

## Erros públicos

| HTTP | Código | Ação |
| --- | --- | --- |
| 429 | `storage_user_limit` | Conta atingiu o limite de PDFs-fonte |
| 429 | `storage_institution_limit` | Instituição atingiu o limite compartilhado |
| 507 | `storage_disk_reserve` | Disco não comporta o envio preservando a reserva |
| 503 | `storage_accounting_required` | Reconciliar arquivo legado ou executar manutenção em lotes |
| 503 | `storage_unavailable` | Conferência segura indisponível; não ignorar a proteção |
| 503 | `invalid_storage_configuration` | Corrigir configuração operacional fora do navegador |
| 503 | `storage_transaction_required` | Falha de integração: ausência de transação de escrita |
| 400 | `invalid_pdf_size` | Tamanho ausente ou superior ao limite de 10 MiB |

## Testes leves e reproduzíveis

Após compilar a API, execute na raiz do projeto:

```sh
DEVSPHERE_TEST_API_BIN=/private/tmp/pv-protected-build/devsphere-api \
  .venv-worker/bin/python -W error::ResourceWarning -m unittest discover \
  -s tools/tests -p test_storage_limits.py -v
```

Os dez testes utilizam SQLite temporário, PDFs pequenos e o helper C++ real: limites/configuração, consumo por proprietário/instituição, retirados, medida de legado íntegro e rollback, corrupção/ausência/links/traversal, isolamento institucional, reserva de disco, exigência de transação/tamanho, concorrência, migration preservando `NULL` e limite do lote de legados.

O teste de pouco espaço eleva a reserva acima do espaço livre observado; **não cria arquivo enorme nem enche o disco**. Não altera a base pessoal, não carrega modelos e não simula um valor de espaço disponível dentro do código de produção.

Evidência local em 23/10/2026: build C++20 e dez testes aprovados no Mac. A verificação de quota não representa teste independente de segurança, política institucional homologada ou validação clínica.
