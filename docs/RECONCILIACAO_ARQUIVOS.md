# Reconciliação segura de fontes PDF

## Finalidade e limites

`tools/audit_source_storage.py` continua sendo a auditoria somente de leitura.
`tools/reconcile_source_storage.py` acrescenta um procedimento operacional separado:
**plano sem mudanças → conferência humana → manutenção → aplicação explícita**.
Não é um coletor de lixo nem um botão de exclusão. Não altera linhas SQLite,
Markdown, aprovação, publicação, tentativas, atendimentos ou histórico.

A ferramenta aceita apenas arquivos internos da raiz de fontes com nome
`<identificador de 32 caracteres hexadecimais minúsculos>.pdf`, assinatura inicial
`%PDF-`, tamanho até 10 MiB e uma única ligação ao inode. Essa conferência não
valida o conteúdo clínico nem substitui a validação completa de PDFs no upload.

| Inconsistência | Ação possível |
| --- | --- |
| PDF interno sem documento nem dependência conhecida | Mover para quarentena privada, preservando os bytes. |
| Registro sem arquivo | Restaurar uma cópia fornecida explicitamente, com SHA-256 igual ao registrado. |
| Arquivo vinculado com hash divergente | Somente apontar para revisão manual; não mover, sobrescrever ou aceitar novo hash. |
| Nome original, subpasta, link, tipo inesperado ou referência ambígua | Somente apontar para revisão manual. |
| Cópia de restauração interrompida antes de estágio confirmado | Preservar estágio e backup, bloquear retomada automática para revisão manual. |

Uma fonte retirada continua sendo registro conhecido. Trabalhos antigos,
referências de versões, biblioteca, permissões e recibos de exclusão impedem
tratar um PDF referenciado como órfão. A busca de referências em versões é
conservadora: um identificador encontrado no JSON também impede automação.

## Antes de aplicar

1. Escolha a base e raiz de fontes corretas. Faça o backup consistente pelo
   procedimento de `tools/secure_backup.py`; não copie um SQLite ativo ignorando WAL.
2. Encerre **a API e todos os workers que utilizam essa base/raiz**, nos terminais
   em que foram iniciados. Não finalize processos desconhecidos indiscriminadamente.
3. Não deixe trabalhos `queued` ou `running`. Resolva-os pelo fluxo normal antes
   de iniciar manutenção; esta ferramenta não os cancela nem altera seus estados.
4. Aguarde o heartbeat do worker vencer: 35 segundos após a última atividade.
5. Suspenda também outros processos que gravam na raiz, sincronizadores e rotinas
   de manutenção. Confirme a janela operacional com o responsável pelo ambiente.

A aplicação mantém `BEGIN IMMEDIATE`, lock exclusivo no diário e uma reserva da
porta IPv4 local da API informada no plano. Fila ativa, heartbeat recente, banco
ocupado ou porta ocupada bloqueiam a operação. Esses controles **não descobrem
todos os serviços em portas diferentes, IPv6 ou outras máquinas e não bloqueiam
um escritor externo no sistema de arquivos**. A confirmação operacional continua
obrigatória; não se deve aplicar sob concorrência ou adulteração ativa da raiz.

## Criar e revisar um plano

Exemplo na raiz do projeto, usando diretório operacional ignorado pelo Git:

```bash
mkdir -m 700 -p .local/storage-maintenance
.venv-worker/bin/python tools/reconcile_source_storage.py plan \
  --db "$PWD/backend/data/devsphere.db" \
  --storage "$PWD/backend/data/sources" \
  --quarantine "$PWD/.local/storage-maintenance/quarantine" \
  --api-port 8080 \
  --plan "$PWD/.local/storage-maintenance/plano-001.json"
```

`plan` é a operação padrão, mas mantê-la explícita melhora a leitura. O único
arquivo criado nessa etapa é o plano solicitado, novo e com permissão `0600`.
A raiz de PDFs, o banco e os estados dos trabalhos permanecem intactos. A
quarentena ainda não é criada. Não use um destino já existente para o plano.

O resumo no terminal contém estado, hash do plano e contagens. O plano completo
contém caminhos operacionais e identificadores: examine-o localmente, não o
publique, envie ao Notion ou versione. Ele não inclui nomes originais do upload,
Markdown nem texto de PDFs; nomes inesperados encontrados na raiz recebem
identificadores opacos. Caminhos registrados inválidos ainda podem ser sensíveis
e permanecem somente no plano privado. O SHA-256 do plano detecta alterações acidentais,
**não é uma assinatura de autenticação contra um operador com acesso ao arquivo**.

### Incluir uma restauração explícita

Adicione ao comando anterior:

```bash
--restore "IDENTIFICADOR_INTERNO_32_HEX=/caminho/privado/copia-conferida.pdf"
```

Substitua o identificador pelo ID real do documento, sem nome de paciente. Pode
informar mais de um `--restore`, cada um com ID diferente. O destino precisa
estar ausente. O hash da cópia tem de ser exatamente igual ao do documento.
Se `source_documents.byte_size` já estiver preenchido, o tamanho também precisa
coincidir; valor desconhecido não é inventado pela ferramenta. A restauração
não modifica a contabilidade original nem contorna os limites do upload.
A cópia original, inclusive se estiver em backup privado ou quarentena anterior,
é preservada. PDFs inteiros não são recuperados de Markdown e não são fabricados.

## Aplicar e retomar

Depois de revisar o plano e cumprir a janela de manutenção:

```bash
.venv-worker/bin/python tools/reconcile_source_storage.py apply \
  --plan "$PWD/.local/storage-maintenance/plano-001.json" \
  --confirm-services-stopped
```

O `apply` usa apenas os caminhos salvos no plano; não aceita substituí-los por
novos parâmetros de banco ou fonte. Hash, identidade dos diretórios/banco,
registros e dependências, objetos/hash/tamanho dos PDFs e configuração da reserva
de disco são conferidos novamente. Mudanças relevantes bloqueiam o plano:
faça uma nova auditoria e gere outro plano, sem editar o anterior para forçá-lo.

A quarentena precisa estar fora da raiz de fontes e do frontend, no mesmo sistema
de arquivos da raiz, com permissão `0700` e pertencente ao usuário operacional.
A ferramenta usa descritores ancorados, `NOFOLLOW`, arquivos exclusivos e recusa
links simbólicos, ligações extras e colisões. Não sobrescreve destinos existentes.

A mesma variável do upload controla o piso de disco:
`DEVSPHERE_STORAGE_MIN_FREE_BYTES`, padrão `536870912` (512 MiB). Aceita inteiro
decimal positivo até 1 TiB, definido no terminal/processo, sem persistir globalmente.
O valor entra no plano e deve continuar igual no `apply`. A restauração confere
espaço disponível ao usuário maior ou igual ao piso **mais o tamanho da cópia**
imediatamente antes de criá-la. Um estágio completo confirmado é reaproveitado;
não se aloca outra cópia na retomada. A movimentação do órfão usa ligações no mesmo
sistema de arquivos e não copia o PDF. Metadados/diário ainda consomem espaço.
O piso é uma verificação operacional, não uma reserva física contra outros
aplicativos escrevendo no disco ao mesmo tempo.

### O que acontece em uma interrupção

Cada etapa importante é registrada em diário JSONL privado com hash encadeado e
`fsync`, antes e depois da publicação. Diretórios também são sincronizados.
A quarentena recebe um nome interno derivado do plano, nunca o nome enviado pelo usuário.

- Quarentena: publica uma ligação exclusiva ao mesmo objeto; só depois remove a
  ligação original verificada. O conteúdo permanece na quarentena.
- Restauração: copia para estágio privado `0600`, confere hash e sincroniza;
  publica sem sobrescrever o destino e remove somente a ligação temporária
  criada pela ferramenta. Backup e PDF final permanecem íntegros.
- Se a queda ocorrer entre link e unlink, ou depois da publicação, execute de
  novo **o mesmo `apply` com o mesmo plano**. O diário permite reconhecer as
  ligações desse trabalho e terminar sem duplicar registros ou arquivos finais.
- Uma última linha incompleta do diário é descartada ao retomar; as linhas
  completas precisam manter a cadeia íntegra. Corrupção é motivo de bloqueio.
- Se a queda acontecer antes de existir registro durável suficiente para
  reconhecer um estágio, a ferramenta preserva tudo e pede intervenção manual
  pelo erro. Não apaga o parcial nem cria outro conteúdo para fingir sucesso.

Não há limpeza automática da quarentena, expiração ou política de retenção
institucional inventada. A remoção definitiva permanece um procedimento separado,
a ser aprovado conforme regras institucionais. Não remova manualmente o diário
ou uma ligação de recuperação para tentar desbloquear execução sem conferir os
objetos e guardar evidência da manutenção.

## Limites e códigos

- Até 10 mil registros e entradas de raiz; até 256 MiB de PDFs lidos por categoria
  de verificação, 8 MiB de referências JSON de versões e plano/diário de até 8 MiB.
- Consultas SQLite possuem limite de instruções e espera curta por lock.
- Uso POSIX: macOS e Linux/WSL2. Não se apresenta como suporte a Windows nativo.
- A janela operacional é requisito: POSIX não oferece `unlink` condicional por
  inode em todos os ambientes; descritores e reconferências reduzem riscos, mas
  não autorizam operar com escritor malicioso ou concorrente na mesma raiz.
- A rotina não inicia API, worker, Ollama, geração ou OCR.

Saída `0`: plano gravado ou aplicação concluída. Saída `2`: operação bloqueada;
consulte `error.code`. Exemplos: `database_busy`, `active_jobs_block_maintenance`,
`worker_heartbeat_still_active`, `api_port_not_available`, `storage_state_changed`,
`database_state_changed`, `restore_hash_mismatch`, `disk_reserve_required`,
`storage_configuration_changed` e `journal_integrity_failed`. Nenhuma mensagem
inclui o caminho que causou a falha. Um erro após início da aplicação pode deixar
uma ação já concluída ou ligação intermediária; preserve plano e diário.

## Evidência nesta etapa

Foram executados **24 testes sintéticos isolados** em `tools/tests/test_source_reconciliation.py`:
plano sem mudanças, restauração exata e tamanho legado/conhecido, idempotência,
quedas em ligação/publicação, diário parcial/corrompido/ocupado, plano adulterado
ou vencido por estado, fila/heartbeat/porta/banco ativos, dependências, colisões,
links, permissões, limites de leitura e piso de disco simulado. **Nenhuma base
pessoal foi reconciliada, nenhum PDF pessoal movido e nenhuma inferência executada.**

```bash
.venv-worker/bin/python -W error::ResourceWarning \
  -m unittest tools.tests.test_source_reconciliation -v
```

Esses testes verificam integridade operacional em fixtures; não constituem auditoria
independente de segurança, política de retenção homologada nem validação clínica.
