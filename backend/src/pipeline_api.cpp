#include "pipeline_api.hpp"
#include "security.hpp"
#include "storage_limits.hpp"
#include <cerrno>
#include <ctime>
#include <cstdlib>
#include <fcntl.h>
#include <filesystem>
#include <fstream>
#include <regex>
#include <sqlite3.h>
#include <sstream>
#include <stdexcept>
#include <sys/stat.h>
#include <unistd.h>
#include <vector>

namespace devsphere {
namespace {
struct Failure : std::runtime_error {
  int status;
  std::string code;
  Failure(int s, std::string c, std::string m)
      : runtime_error(m), status(s), code(std::move(c)) {}
};
class Sql {
public:
  sqlite3 *db{};
  Sql() {
    const char *path = std::getenv("DEVSPHERE_DB_PATH");
    if (sqlite3_open_v2(path ? path : "data/devsphere.db", &db,
                        SQLITE_OPEN_READWRITE, nullptr) != SQLITE_OK)
      throw Failure(503, "database_unavailable", "Banco indisponível.");
    sqlite3_busy_timeout(db, 5000);
    sqlite3_exec(db, "PRAGMA foreign_keys=ON", nullptr, nullptr, nullptr);
  }
  ~Sql() {
    if (db)
      sqlite3_close(db);
  }
  std::string query(const std::string &sql,
                    const std::vector<std::string> &values = {}) {
    sqlite3_stmt *q{};
    if (sqlite3_prepare_v2(db, sql.c_str(), -1, &q, nullptr) != SQLITE_OK)
      throw Failure(500, "database_error", "Consulta indisponível.");
    struct Finalize {
      sqlite3_stmt *q;
      ~Finalize() { sqlite3_finalize(q); }
    } guard{q};
    int i = 1;
    for (auto &value : values)
      sqlite3_bind_text(q, i++, value.c_str(), -1, SQLITE_TRANSIENT);
    int result = sqlite3_step(q);
    if (result == SQLITE_ROW) {
      auto text = sqlite3_column_text(q, 0);
      return text ? reinterpret_cast<const char *>(text) : "";
    }
    if (result != SQLITE_DONE)
      throw Failure(
          409, "operation_conflict",
          "Operação não concluída; verifique estado e tente novamente.");
    return "";
  }
  void audit(const SessionUser &u, const std::string &action,
             const std::string &id, const std::string &metadata = "{}") {
    query("INSERT INTO audit_logs(user_id,action,entity_type,metadata_json) "
          "VALUES(?,?,'source',json_set(json(?),'$.id',?))",
          {std::to_string(u.id), action, metadata, id});
  }
};
std::string field(Sql &s, const std::string &body, const char *key,
                  const std::string &fallback = "") {
  if (s.query("SELECT json_valid(?)", {body}) != "1")
    throw Failure(400, "invalid_json", "JSON inválido.");
  auto result = s.query("SELECT coalesce(json_extract(?,?),?)",
                        {body, "$." + std::string(key), fallback});
  return result;
}
std::string uid(const SessionUser &u) { return std::to_string(u.id); }
bool access(Sql &s, const std::string &id, const SessionUser &u) {
  return s.query(
             "SELECT EXISTS(SELECT 1 FROM source_documents d WHERE d.id=? AND "
             "(SELECT institution_id FROM users WHERE id=d.owner_id)=(SELECT "
             "institution_id FROM users WHERE id=?) AND (owner_id=? OR "
             "?='admin' OR (d.status<>'withdrawn' AND EXISTS(SELECT 1 FROM "
             "document_grants g WHERE "
             "g.document_id=d.id AND g.user_id=?))))",
             {id, uid(u), uid(u), u.role, uid(u)}) == "1";
}
// Conversão/geração compartilham 12 solicitações/hora; prévias têm quota
// independente de 30/hora. Cancelamentos,
// conclusão e falhas não devolvem a quota; retries aceitos contam na auditoria.
// A configuração inválida bloqueia novas solicitações em vez de desabilitar o
// limite.
int quotaConfiguration(const char *name, int fallback, int minimum,
                       int maximum) {
  const char *configured = std::getenv(name);
  if (!configured)
    return fallback;
  const std::string value(configured);
  if (value.empty() || value.size() > 8 ||
      value.find_first_not_of("0123456789") != std::string::npos)
    throw Failure(503, "invalid_job_quota_configuration",
                  "Configuração de limite de processamento inválida.");
  const auto parsed = std::stoll(value);
  if (parsed < minimum || parsed > maximum)
    throw Failure(503, "invalid_job_quota_configuration",
                  "Configuração de limite de processamento inválida.");
  return static_cast<int>(parsed);
}
void requireJobQuota(Sql &s, const SessionUser &actor, bool budget = false) {
  const int limit =
      budget ? quotaConfiguration("DEVSPHERE_BUDGET_REQUEST_LIMIT", 30, 1, 120)
             : quotaConfiguration("DEVSPHERE_JOB_REQUEST_LIMIT", 12, 1, 120);
  const int seconds =
      quotaConfiguration("DEVSPHERE_JOB_WINDOW_SECONDS", 3600, 60, 86400);
  const auto modifier = "-" + std::to_string(seconds) + " seconds";
  const auto used =
      s.query("SELECT (SELECT COUNT(*) FROM worker_jobs WHERE owner_id=? AND "
              "created_at>datetime('now',?) AND "
              "(coalesce(json_extract(request_json,'$.operation'),operation)='budget')=CAST(? AS INTEGER))+(SELECT COUNT(*) FROM audit_logs "
              "WHERE user_id=? AND action=? AND "
              "created_at>datetime('now',?))",
              {uid(actor), modifier, budget ? "1" : "0", uid(actor),
               budget ? "budget_retry_queued" : "job_retry_queued", modifier});
  if (std::stoll(used) >= limit)
    throw Failure(429, "job_request_limit",
                  "Limite de solicitações de processamento atingido. Aguarde a "
                  "renovação da janela de uso.");
}
// A política exige opt-in no processo; campos do navegador jamais habilitam IA.
bool inferenceEnabled() {
  const char *value = std::getenv("DEVSPHERE_INFERENCE_ENABLED");
  return value && std::string(value) == "1";
}
void requireInference(Sql &s, const SessionUser &u, const std::string &id) {
  if (!inferenceEnabled()) {
    s.audit(u, "inference_blocked", id);
    throw Failure(403, "inference_disabled",
                  "Geração desabilitada neste ambiente de apresentação. A prévia não executa modelos.");
  }
}
// O heartbeat vem do worker, e não dos padrões do servidor HTTP. A lista
// explícita de campos impede que um registro inesperado exponha ambiente/logs.
HttpResponse runtimeResponse(Sql &s, const SessionUser &u);
HttpResponse operationsResponse(Sql &s, const SessionUser &u);
// Caminho operacional é definido no processo, nunca recebido do navegador.
std::filesystem::path sourceDirectory() {
  if (const char *root = std::getenv("DEVSPHERE_SOURCE_DIR")) return std::filesystem::path(root);
  const char *db = std::getenv("DEVSPHERE_DB_PATH");
  return std::filesystem::path(db ? db : "data/devsphere.db").parent_path()/"sources";
}

// Tetos técnicos para a fila compartilhada; não representam política
// institucional homologada. Exigem a transação de escrita do chamador.
void requireSharedQueueCapacity(Sql &s, const SessionUser &actor) {
  const int institutionLimit =
      quotaConfiguration("DEVSPHERE_JOB_INSTITUTION_PENDING_LIMIT", 12, 1, 120);
  const int globalLimit =
      quotaConfiguration("DEVSPHERE_JOB_GLOBAL_PENDING_LIMIT", 24, 1, 1000);
  if (std::stoll(s.query(
          "SELECT COUNT(*) FROM worker_jobs j JOIN users owner ON "
          "owner.id=j.owner_id WHERE j.status IN ('queued','running') AND "
          "owner.institution_id=(SELECT institution_id FROM users WHERE id=?)",
          {uid(actor)})) >= institutionLimit)
    throw Failure(429, "institution_queue_full",
                  "A fila de processamento da instituição atingiu a "
                  "capacidade. Aguarde a conclusão dos trabalhos.");
  if (std::stoll(s.query("SELECT COUNT(*) FROM worker_jobs WHERE status IN "
                         "('queued','running')")) >= globalLimit)
    throw Failure(429, "global_queue_full",
                  "A fila compartilhada atingiu a capacidade. Tente novamente "
                  "após a conclusão dos trabalhos.");
}
// O arquivo pertence ao guard apenas após criação exclusiva. Qualquer exceção
// antes do commit remove somente esse arquivo; nenhuma fonte anterior é tocada.
class PrivateUpload {
  std::filesystem::path path_;
  int fd_{-1};
  bool retained_{false};

public:
  explicit PrivateUpload(std::filesystem::path path) : path_(std::move(path)) {
    fd_ = open(path_.c_str(),
               O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
    if (fd_ < 0)
      throw Failure(503, "storage_unavailable",
                    "Não foi possível reservar o arquivo privado.");
  }
  PrivateUpload(const PrivateUpload &) = delete;
  PrivateUpload &operator=(const PrivateUpload &) = delete;
  ~PrivateUpload() {
    if (fd_ >= 0)
      close(fd_);
    if (!retained_) {
      std::error_code ignored;
      std::filesystem::remove(path_, ignored);
    }
  }
  void writeAndSync(const std::string &data) {
    std::size_t offset = 0;
    while (offset < data.size()) {
      const auto size = write(fd_, data.data() + offset, data.size() - offset);
      if (size < 0 && errno == EINTR)
        continue;
      if (size <= 0)
        throw Failure(503, "storage_unavailable",
                      "Falha ao preservar o arquivo privado.");
      offset += static_cast<std::size_t>(size);
    }
    while (fsync(fd_) != 0) {
      if (errno != EINTR)
        throw Failure(503, "storage_unavailable",
                      "Falha ao sincronizar o arquivo privado.");
    }
  }
  void retain() noexcept { retained_ = true; }
};
void requireSource(Sql &s, const std::string &id, const SessionUser &u) {
  if (!access(s, id, u))
    throw Failure(404, "not_found", "Fonte não encontrada.");
}
// Registrar exposição também antes da geração permite propagar para casos
// futuros.
void expose(Sql &s, const std::string &id, const SessionUser &u) {
  if (u.role != "student")
    return;
  s.query(
      "INSERT OR IGNORE INTO source_readers(document_id,user_id) VALUES(?,?)",
      {id, uid(u)});
  s.query("INSERT OR IGNORE INTO "
          "case_exposures(user_id,case_version_id,reason) SELECT "
          "?,version_id,'source_seen' FROM version_sources WHERE document_id=?",
          {uid(u), id});
}
HttpResponse json(const std::string &data, int status = 200) {
  return {status,
          {{"Content-Type", "application/json; charset=utf-8"},
           {"Cache-Control", "no-store"}},
          data};
}
HttpResponse runtimeResponse(Sql &s, const SessionUser &u) {
  const auto selected = s.query("SELECT instance_id FROM worker_runtime ORDER BY heartbeat_at DESC LIMIT 1");
  if (selected.empty())
    return json(std::string("{\"apiInferenceEnabled\":") + (inferenceEnabled() ? "true" : "false") + ",\"worker\":{\"status\":\"absent\"}}");
  const auto runtime = s.query(
    "SELECT json_object('status',CASE WHEN heartbeat_at BETWEEN unixepoch()-30 AND unixepoch()+5 THEN 'alive' ELSE 'stale' END,"
    "'instanceId',instance_id,'configHash',config_hash,'heartbeatAt',heartbeat_at,'startedAt',started_at,"
    "'inferenceEnabled',CASE WHEN json_type(config_json,'$.inferenceEnabled')='true' THEN json('true') ELSE json('false') END) "
    "FROM worker_runtime WHERE instance_id=?", {selected});
  auto result = s.query("SELECT json_object('apiInferenceEnabled',json(?),'worker',json(?))",
                       {inferenceEnabled() ? "true" : "false", runtime});
  if (u.role == "admin") {
    const auto safeConfig = s.query(
      "SELECT json_object('generatorModel',substr(json_extract(config_json,'$.generatorModel'),1,160),"
      "'criticModel',substr(json_extract(config_json,'$.criticModel'),1,160),"
      "'timeoutSeconds',CASE WHEN json_type(config_json,'$.timeoutSeconds') IN ('integer','real') THEN json_extract(config_json,'$.timeoutSeconds') END,"
      "'concurrency',CASE WHEN json_type(config_json,'$.concurrency')='integer' THEN json_extract(config_json,'$.concurrency') END,"
      "'contractVersion',substr(json_extract(config_json,'$.contractVersion'),1,160),'configurationSource','worker_process','codeVersion',substr(json_extract(config_json,'$.codeVersion'),1,160),"
      "'configurationLoadedAt',CASE WHEN json_type(config_json,'$.configurationLoadedAt')='integer' THEN json_extract(config_json,'$.configurationLoadedAt') END,"
      "'generation',json_object('context',CASE WHEN json_type(config_json,'$.generation.context') IN ('integer','real') THEN json_extract(config_json,'$.generation.context') END,'output',CASE WHEN json_type(config_json,'$.generation.output') IN ('integer','real') THEN json_extract(config_json,'$.generation.output') END,"
      "'batch',CASE WHEN json_type(config_json,'$.generation.batch') IN ('integer','real') THEN json_extract(config_json,'$.generation.batch') END,'sourceBytes',CASE WHEN json_type(config_json,'$.generation.sourceBytes') IN ('integer','real') THEN json_extract(config_json,'$.generation.sourceBytes') END),"
      "'review',json_object('context',CASE WHEN json_type(config_json,'$.review.context') IN ('integer','real') THEN json_extract(config_json,'$.review.context') END,'output',CASE WHEN json_type(config_json,'$.review.output') IN ('integer','real') THEN json_extract(config_json,'$.review.output') END,"
      "'batch',CASE WHEN json_type(config_json,'$.review.batch') IN ('integer','real') THEN json_extract(config_json,'$.review.batch') END,'sourceBytes',CASE WHEN json_type(config_json,'$.review.sourceBytes') IN ('integer','real') THEN json_extract(config_json,'$.review.sourceBytes') END)) "
      "FROM worker_runtime WHERE instance_id=?", {selected});
    result = s.query("SELECT json_set(?,'$.worker.config',json(?))", {result,safeConfig});
  }
  return json(result);
}

// Diagnóstico é leitura autorizada da instituição. Alarmes nunca reexecutam,
// removem ou cancelam trabalhos. Ausência de métrica não equivale a valor zero.
HttpResponse operationsResponse(Sql &s, const SessionUser &u) {
  if (u.role != "admin")
    throw Failure(403,"forbidden","Diagnóstico operacional restrito à administração.");
  const int stallSeconds=quotaConfiguration("DEVSPHERE_QUEUE_ALERT_SECONDS",120,30,86400);
  const int failureWindow=quotaConfiguration("DEVSPHERE_FAILURE_WINDOW_SECONDS",3600,60,86400);
  const int failureThreshold=quotaConfiguration("DEVSPHERE_FAILURE_ALERT_COUNT",3,1,1000);
  const auto queue=s.query(
    "SELECT json_object('queued',COALESCE(SUM(j.status='queued'),0),'running',COALESCE(SUM(j.status='running'),0),"
    "'oldestQueuedAgeSeconds',MAX(CASE WHEN j.status='queued' THEN MAX(0,unixepoch()-CAST(strftime('%s',j.created_at) AS INTEGER)) END),"
    "'expiredLeases',COALESCE(SUM(j.status='running' AND j.lease_until IS NOT NULL AND j.lease_until<unixepoch()),0)) "
    "FROM worker_jobs j JOIN users owner ON owner.id=j.owner_id "
    "WHERE owner.institution_id=(SELECT institution_id FROM users WHERE id=?)",{uid(u)});
  const auto failures=s.query(
    "SELECT COUNT(*) FROM worker_jobs j JOIN users owner ON owner.id=j.owner_id WHERE owner.institution_id="
    "(SELECT institution_id FROM users WHERE id=?) AND j.status='failed' AND j.updated_at>=datetime('now',?) "
    "AND COALESCE(json_extract(j.error_json,'$.code'),'')<>'inference_disabled'",{uid(u),"-"+std::to_string(failureWindow)+" seconds"});
  const auto heartbeat=s.query("SELECT COALESCE((SELECT CASE WHEN heartbeat_at BETWEEN unixepoch()-30 AND unixepoch()+5 THEN 'alive' ELSE 'stale' END FROM worker_runtime ORDER BY heartbeat_at DESC LIMIT 1),'absent')");
  std::vector<std::string> alerts;
  auto alert=[&](const char *code,const char *message,const char *action) {
    alerts.push_back(s.query("SELECT json_object('code',?,'severity','warning','message',?,'action',?)",{code,message,action}));
  };
  const auto pending=std::stoll(s.query("SELECT json_extract(?,'$.queued')+json_extract(?,'$.running')",{queue,queue}));
  if(heartbeat!="alive" && pending>0)
    alert("worker_unavailable","Há trabalhos pendentes sem heartbeat recente do worker.","Confira o terminal do worker e a base configurada; não inicie instâncias concorrentes.");
  if(s.query("SELECT COALESCE(json_extract(?,'$.oldestQueuedAgeSeconds'),0)>=CAST(? AS INTEGER)",{queue,std::to_string(stallSeconds)})=="1")
    alert("queue_wait_exceeded","Há trabalho na fila acima do limite de espera configurado.","Confira disponibilidade, capacidade e erros do worker antes de tentar novamente.");
  if(s.query("SELECT json_extract(?,'$.expiredLeases')>0",{queue})=="1")
    alert("expired_job_lease","Há execução com prazo de posse expirado.","Siga o roteiro de recuperação; não altere estados manualmente nem zere tentativas.");
  if(std::stoll(failures)>=failureThreshold)
    alert("recurring_failures","Falhas recorrentes atingiram o limiar da janela operacional.","Inspecione os códigos dos trabalhos autorizados; preserve histórico e não repita falhas determinísticas.");
  std::string storage="null";
  try {
    const auto state=storageSnapshot(s.db,u.id,sourceDirectory());
    storage=s.query("SELECT json_object('measurement','filesystem_available_and_registered_pdf_bytes','availableBytes',CAST(? AS INTEGER),"
      "'minimumFreeBytes',CAST(? AS INTEGER),'userUsedBytes',CASE WHEN CAST(? AS INTEGER)=0 THEN CAST(? AS INTEGER) END,"
      "'institutionUsedBytes',CASE WHEN CAST(? AS INTEGER)=0 THEN CAST(? AS INTEGER) END,"
      "'knownInstitutionBytes',CAST(? AS INTEGER),'unknownSizes',CAST(? AS INTEGER),"
      "'userLimitBytes',CAST(? AS INTEGER),'institutionLimitBytes',CAST(? AS INTEGER))",
      {std::to_string(state.availableBytes),std::to_string(state.limits.minFreeBytes),std::to_string(state.unknownSizes),std::to_string(state.userUsedBytes),
       std::to_string(state.unknownSizes),std::to_string(state.institutionUsedBytes),std::to_string(state.institutionUsedBytes),std::to_string(state.unknownSizes),
       std::to_string(state.limits.userBytes),std::to_string(state.limits.institutionBytes)});
    if(state.availableBytes<state.limits.minFreeBytes)
      alert("low_disk_space","O espaço disponível está abaixo da reserva configurada.","Suspenda novos envios e confira disco e backups; não apague fontes automaticamente.");
    if(state.unknownSizes)
      alert("storage_accounting_required","Há fontes legadas ainda sem tamanho conferido.","Uso total é desconhecido até a conferência segura. Consulte o procedimento de armazenamento.");
    if(state.institutionUsedBytes>=state.limits.institutionBytes)
      alert("institution_storage_limit","O limite de PDFs armazenados da instituição foi atingido.","Revise capacidade e a política de retenção; arquivar trabalhos não libera bytes.");
  } catch(const StorageLimitError &e) {
    alert(e.code.c_str(),"Não foi possível medir o armazenamento com segurança.","Confira configuração, diretório privado e o procedimento de recuperação.");
  }
  std::string array="[";
  for(std::size_t index=0;index<alerts.size();++index){if(index)array+=",";array+=alerts[index];}
  array+="]";
  return json(s.query("SELECT json_object('observedAt',unixepoch(),'scope','institution','status',?,'workerState',?,"
    "'queue',json(?),'failures',json_object('count',CAST(? AS INTEGER),'windowSeconds',CAST(? AS INTEGER),'threshold',CAST(? AS INTEGER)),"
    "'queueAlertSeconds',CAST(? AS INTEGER),'storage',json(?),'alerts',json(?))",
    {alerts.empty()?"ok":"warning",heartbeat,queue,failures,std::to_string(failureWindow),std::to_string(failureThreshold),std::to_string(stallSeconds),storage,array}));
}

// Retenção institucional não é presumida. Purge exige habilitação operacional
// de desenvolvimento e ausência de qualquer vínculo de conteúdo ou histórico.
bool purgeEnabled() {
  const char *value=std::getenv("DEVSPHERE_ALLOW_SOURCE_PURGE");
  const char *environment=std::getenv("DEVSPHERE_ENV");
  return value && std::string(value)=="1" && environment && std::string(environment)=="development";
}
std::string deletionEligibility(Sql &s,const std::string &id) {
  return s.query(
    "SELECT json_object('eligible',json(CASE WHEN count(*)=0 THEN 'true' ELSE 'false' END),"
    "'retentionPolicyEnabled',json(?),'reasons',json_group_array(reason)) FROM ("
    "SELECT 'retention_policy' reason WHERE ?='0' UNION ALL "
    "SELECT 'source_not_withdrawn' WHERE (SELECT status FROM source_documents WHERE id=?)<>'withdrawn' UNION ALL "
    "SELECT 'processing_history' WHERE EXISTS(SELECT 1 FROM worker_jobs WHERE document_id=?) UNION ALL "
    "SELECT 'case_versions' WHERE EXISTS(SELECT 1 FROM version_sources WHERE document_id=?) UNION ALL "
    "SELECT 'contribution_reference' WHERE EXISTS(SELECT 1 FROM case_versions WHERE instr(content_json,?)>0 OR instr(metadata_json,?)>0) UNION ALL "
    "SELECT 'library_chunks' WHERE EXISTS(SELECT 1 FROM library_chunks WHERE document_id=?) UNION ALL "
    "SELECT 'source_readers' WHERE EXISTS(SELECT 1 FROM source_readers WHERE document_id=?) UNION ALL "
    "SELECT 'document_grants' WHERE EXISTS(SELECT 1 FROM document_grants WHERE document_id=?))",
    {purgeEnabled()?"true":"false",purgeEnabled()?"1":"0",id,id,id,id,id,id,id,id});
}
// O diretório configurado é confiável, mas o nome persistido deve corresponder
// exatamente ao ID. Todos os componentes do diretório resolvido são abertos
// com NOFOLLOW; o arquivo nunca é seguido se for link ou compartilhado por hardlink.
class QuarantinedSource {
  int directory_{-1};
  std::string original_, quarantined_;
  bool moved_{false}, committed_{false};
public:
  QuarantinedSource(const std::string &id,const std::string &stored) {
    const char *source=std::getenv("DEVSPHERE_SOURCE_DIR");
    const char *database=std::getenv("DEVSPHERE_DB_PATH");
    auto configured=std::filesystem::absolute(source?std::filesystem::path(source):
      std::filesystem::path(database?database:"data/devsphere.db").parent_path()/"sources").lexically_normal();
    original_=id+".pdf";
    if(std::filesystem::path(stored).lexically_normal()!=configured/original_)
      throw Failure(409,"unsafe_source_path","Arquivo não elegível: caminho interno inconsistente.");
    std::error_code error;
    auto resolved=std::filesystem::canonical(configured,error);
    if(error) throw Failure(503,"storage_unavailable","Diretório privado indisponível.");
    directory_=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC);
    for(const auto &part:resolved.relative_path()) {
      int next=openat(directory_,part.c_str(),O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
      close(directory_); directory_=next;
      if(next<0) throw Failure(503,"unsafe_source_path","Diretório privado não seguro.");
    }
    struct stat st{};
    if(fstatat(directory_,original_.c_str(),&st,AT_SYMLINK_NOFOLLOW)!=0 || !S_ISREG(st.st_mode) || st.st_nlink!=1) {
      close(directory_); directory_=-1;
      throw Failure(409,"unsafe_source_file","Arquivo ausente, link ou tipo não suportado; exclusão bloqueada.");
    }
    quarantined_=".purge-"+randomToken(32)+".pdf";
    struct stat existing{};
    if(fstatat(directory_,quarantined_.c_str(),&existing,AT_SYMLINK_NOFOLLOW)==0 || errno!=ENOENT ||
       renameat(directory_,original_.c_str(),directory_,quarantined_.c_str())!=0) {
      close(directory_); directory_=-1;
      throw Failure(503,"source_quarantine_failed","Não foi possível reservar a remoção do arquivo.");
    }
    moved_=true;
    if(fsync(directory_)!=0) {
      renameat(directory_,quarantined_.c_str(),directory_,original_.c_str());
      close(directory_); directory_=-1;
      throw Failure(503,"source_quarantine_failed","Não foi possível sincronizar a reserva da remoção.");
    }
  }
  ~QuarantinedSource() {
    if(directory_>=0) {
      if(moved_&&!committed_) renameat(directory_,quarantined_.c_str(),directory_,original_.c_str());
      close(directory_);
    }
  }
  const std::string &name() const { return quarantined_; }
  void commit() noexcept { committed_=true; }
  bool remove() noexcept {
    if(unlinkat(directory_,quarantined_.c_str(),0)!=0) return false;
    moved_=false;
    return fsync(directory_)==0;
  }
};
void requireSourceOwner(Sql &s,const std::string &id,const SessionUser &u) {
  if(u.role!="admin" && s.query("SELECT owner_id FROM source_documents WHERE id=?",{id})!=uid(u))
    throw Failure(403,"forbidden","Somente titular ou administração pode excluir material.");
}
std::string textPart(const HttpRequest &r, const std::string &name) {
  const std::string marker = "name=\"" + name + "\"";
  auto at = r.body.find(marker);
  if (at == std::string::npos)
    return "";
  auto begin = r.body.find("\r\n\r\n", at);
  if (begin == std::string::npos)
    return "";
  begin += 4;
  auto end = r.body.find("\r\n--", begin);
  return end == std::string::npos ? "" : r.body.substr(begin, end - begin);
}
const std::string documentFields =
    "json_object('id',id,'ownerId',owner_id,'name',original_name,'originalName'"
    ",original_name,'sha256',sha256,'status',status,'area',area,'markdown',"
    "markdown,'pages',json(pages_json),'warnings',json(warnings_json),'"
    "createdAt',created_at,'updatedAt',updated_at,'extractionRevision',extraction_revision)";
const std::string invalidJobSources =
    R"SQL((operation='generate' AND result_json IS NOT NULL AND (
 NOT EXISTS(SELECT 1 FROM source_documents main_source JOIN users owner ON owner.id=main_source.owner_id
  JOIN users actor ON actor.id=worker_jobs.owner_id AND actor.institution_id=owner.institution_id
  WHERE main_source.id=worker_jobs.document_id AND main_source.status IN ('converted','approved') AND main_source.owner_id=actor.id)
 OR EXISTS(SELECT 1 FROM json_each(worker_jobs.result_json,'$.provenance.retrievedSources') src
  WHERE NOT EXISTS(SELECT 1 FROM source_documents d JOIN users owner ON owner.id=d.owner_id
   JOIN users actor ON actor.id=worker_jobs.owner_id AND actor.institution_id=owner.institution_id
   WHERE d.id=json_extract(src.value,'$.document_id') AND d.status='approved'
    AND d.authorized_use=1 AND d.deidentified=1 AND
    (d.owner_id=actor.id OR EXISTS(SELECT 1 FROM document_grants g WHERE g.document_id=d.id AND g.user_id=actor.id))))
)))SQL";
const std::string jobFields =
    "json_object('id',id,'documentId',document_id,'operation',operation,'"
    "status',status,'attempts',attempts,'maxAttempts',max_attempts,'result',"
    "CASE WHEN " +
    invalidJobSources +
    " THEN NULL ELSE json(result_json) END,"
    "'resultAccess',CASE WHEN " +
    invalidJobSources +
    " THEN 'revoked' ELSE 'available' "
    "END,'error',json(error_json),'cancelRequested',cancel_requested,'"
    "updatedAt',updated_at,'archivedAt',archived_at)";
} // namespace

std::optional<HttpResponse> pipelineRoute(const HttpRequest &r,
                                          const SessionUser &u) {
  if (r.path.rfind("/api/v1/documents", 0) != 0 &&
      r.path.rfind("/api/v1/jobs", 0) != 0 &&
      r.path.rfind("/api/v1/library", 0) != 0 && r.path != "/api/v1/runtime" && r.path != "/api/v1/operations")
    return std::nullopt;
  try {
    Sql s;
    if (r.method == "GET" && r.path == "/api/v1/runtime")
      return runtimeResponse(s,u);
    if (r.method == "GET" && r.path == "/api/v1/operations")
      return operationsResponse(s,u);
    if (r.method == "GET" && r.path == "/api/v1/documents")
      return json(
          s.query("SELECT coalesce(json_group_array(json(value)),'[]') FROM "
                  "(SELECT json_remove(" +
                      documentFields +
                      ",'$.markdown','$.pages') value FROM source_documents d "
                      "WHERE (SELECT institution_id FROM users WHERE "
                      "id=d.owner_id)=(SELECT institution_id FROM users WHERE "
                      "id=?) AND (owner_id=? OR ?='admin' OR "
                      "(d.status<>'withdrawn' AND EXISTS(SELECT 1 "
                      "FROM document_grants g WHERE g.document_id=d.id AND "
                      "g.user_id=?))) ORDER BY created_at DESC LIMIT 100)",
                  {uid(u), uid(u), u.role, uid(u)}));
    if (r.method == "POST" && r.path == "/api/v1/documents") {
      if (u.role != "student" && u.role != "teacher" && u.role != "admin")
        throw Failure(403, "forbidden", "Perfil sem acesso.");
      if (textPart(r, "authorized") != "true" ||
          textPart(r, "deidentified") != "true")
        throw Failure(
            400, "declarations_required",
            "Confirme autorização de uso e desidentificação antes de enviar.");
      auto ct = r.headers.find("content-type");
      if (ct == r.headers.end())
        throw Failure(400, "invalid_upload", "Envie multipart/form-data.");
      std::smatch boundary;
      const std::regex boundaryPattern("boundary=\"?([^;\" ]+)");
      if (!std::regex_search(ct->second, boundary, boundaryPattern))
        throw Failure(400, "invalid_upload", "Multipart inválido.");
      const auto start = r.body.find("name=\"pdf\"");
      if (start == std::string::npos)
        throw Failure(400, "invalid_upload", "Campo pdf obrigatório.");
      auto headersEnd = r.body.find("\r\n\r\n", start);
      if (headersEnd == std::string::npos)
        throw Failure(400, "invalid_upload", "PDF ausente.");
      auto fileHeaders = r.body.substr(start, headersEnd - start);
      std::smatch filename;
      if (!std::regex_search(fileHeaders, filename,
                             std::regex("filename=\"([^\"]+)\"")))
        throw Failure(400, "invalid_upload", "Nome PDF ausente.");
      auto name = std::filesystem::path(filename[1].str()).filename().string();
      auto end = r.body.find("\r\n--" + boundary[1].str(), headersEnd + 4);
      if (end == std::string::npos)
        throw Failure(400, "invalid_upload", "Multipart incompleto.");
      auto data = r.body.substr(headersEnd + 4, end - headersEnd - 4);
      if (name.size() > 200 ||
          name.find_first_of("\r\n") != std::string::npos ||
          std::filesystem::path(name).extension() != ".pdf" ||
          fileHeaders.find("application/pdf") == std::string::npos ||
          !data.starts_with("%PDF-") || data.size() > 10 * 1024 * 1024 ||
          data.find("%%EOF") == std::string::npos)
        throw Failure(400, "invalid_pdf", "PDF inválido ou maior que 10 MiB.");
      if (textPart(r, "area").size() > 120)
        throw Failure(400, "invalid_area", "Área acima do limite.");
      const char *storage = std::getenv("DEVSPHERE_SOURCE_DIR");
      const char *db = std::getenv("DEVSPHERE_DB_PATH");
      auto directory =
          storage ? std::filesystem::path(storage)
                  : (std::filesystem::path(db ? db : "data/devsphere.db")
                         .parent_path() /
                     "sources");
      try {
        std::filesystem::create_directories(directory);
        if (chmod(directory.c_str(), 0700) != 0)
          throw Failure(503, "storage_unavailable",
                        "Não foi possível proteger o diretório de fontes.");
      } catch (const std::filesystem::filesystem_error &) {
        throw Failure(503, "storage_unavailable",
                      "Diretório de fontes indisponível.");
      }
      const auto id = randomToken(16);
      const auto path = std::filesystem::absolute(directory / (id + ".pdf"));
      const auto digest = sha256Hex(data);
      auto response =
          json("{\"id\":\"" + id + "\",\"status\":\"uploaded\"}", 201);
      // SQLite serializa a reserva, o registro e a auditoria. O guard trata
      // falhas normais; interrupção abrupta entre FS e commit exige
      // reconciliação.
      s.query("BEGIN IMMEDIATE");
      try {
        if (std::stoll(s.query(
                "SELECT COUNT(*) FROM source_documents WHERE owner_id=?",
                {uid(u)})) >= 100)
          throw Failure(429, "quota_exceeded",
                        "Limite local de fontes atingido.");
        // Conta bytes medidos no servidor sob a mesma reserva de escrita do INSERT.
        requireStorageAdmission(s.db,u.id,data.size(),directory);
        PrivateUpload file(path);
        file.writeAndSync(data);
        s.query(
            "INSERT INTO "
            "source_documents(id,owner_id,storage_path,original_name,sha256,"
            "authorized_use,deidentified,area,byte_size) VALUES(?,?,?,?,?,1,1,?,?)",
            {id, uid(u), path.string(), name, digest,
             textPart(r, "area").empty() ? "general" : textPart(r, "area"),std::to_string(data.size())});
        s.audit(u, "source_uploaded", id);
        s.query("COMMIT");
        file.retain();
        return response;
      } catch (...) {
        if (!sqlite3_get_autocommit(s.db))
          s.query("ROLLBACK");
        throw;
      }
    }
    std::smatch match;
    if (std::regex_match(
            r.path, match,
            std::regex("^/api/v1/documents/([a-f0-9]{32})(?:/"
                       "(jobs|approve|withdraw|grants|pdf|dependencies|deletion-eligibility))?$"))) {
      auto id = match[1].str(), action = match[2].str();
      // Recibo mínimo torna reenvio idempotente sem reter PDF ou texto clínico.
      if (r.method == "DELETE" && action.empty()) {
        const auto receipt=s.query("SELECT json_object('status','deleted','cleanupPending',json(CASE WHEN cleanup_pending=1 THEN 'true' ELSE 'false' END)) FROM source_purge_receipts WHERE document_id=? AND institution_id=(SELECT institution_id FROM users WHERE id=?) AND (owner_id=? OR ?='admin')", {id,uid(u),uid(u),u.role});
        if(!receipt.empty()) return json(receipt);
      }
      requireSource(s, id, u);
      if ((r.method == "GET" && action == "deletion-eligibility") || (r.method == "DELETE" && action.empty())) {
        requireSourceOwner(s,id,u);
        if(r.method=="GET") return json(deletionEligibility(s,id));
        s.query("BEGIN IMMEDIATE");
        try {
          requireSource(s,id,u);
          requireSourceOwner(s,id,u);
          auto eligibility=deletionEligibility(s,id);
          if(s.query("SELECT json_extract(?,'$.eligible')",{eligibility})!="1")
            throw Failure(409,"source_delete_blocked","Material não elegível. Consulte os motivos antes de excluir.");
          const auto owner=s.query("SELECT owner_id FROM source_documents WHERE id=?",{id});
          const auto institution=s.query("SELECT institution_id FROM users WHERE id=?",{owner});
          const auto path=s.query("SELECT storage_path FROM source_documents WHERE id=?",{id});
          QuarantinedSource file(id,path);
          s.query("DELETE FROM library_index_state WHERE document_id=?",{id});
          s.query("DELETE FROM source_documents WHERE id=?",{id});
          s.query("INSERT INTO source_purge_receipts(document_id,owner_id,institution_id,quarantine_name,cleanup_pending) VALUES(?,?,?,?,1)",{id,owner,institution,file.name()});
          s.audit(u,"source_purged",id);
          s.query("COMMIT");
          file.commit();
          const bool removed=file.remove();
          if(removed) {
            try { s.query("UPDATE source_purge_receipts SET cleanup_pending=0,quarantine_name=NULL WHERE document_id=?",{id}); }
            catch(...) { return json("{\"status\":\"deleted\",\"cleanupPending\":true}",202); }
          }
          return json(removed?"{\"status\":\"deleted\",\"cleanupPending\":false}":"{\"status\":\"deleted\",\"cleanupPending\":true}",removed?200:202);
        } catch(...) {
          if(!sqlite3_get_autocommit(s.db)) s.query("ROLLBACK");
          throw;
        }
      }
      if (r.method == "GET" && action.empty()) {
        expose(s, id, u);
        return json(s.query("SELECT " + documentFields +
                                " FROM source_documents WHERE id=?",
                            {id}));
      }
      if (r.method == "GET" && action == "pdf") {
        expose(s, id, u);
        auto path = s.query(
            "SELECT storage_path FROM source_documents WHERE id=?", {id});
        std::ifstream file(path, std::ios::binary);
        if (!file)
          throw Failure(404, "not_found", "Arquivo indisponível.");
        std::ostringstream data;
        data << file.rdbuf();
        s.audit(u, "source_downloaded", id);
        return HttpResponse{
            200,
            {{"Content-Type", "application/pdf"},
             {"Content-Disposition", "attachment; filename=\"fonte.pdf\""},
             {"Cache-Control", "no-store"}},
            data.str()};
      }
      if (r.method == "PUT" && action.empty()) {
        if (s.query("SELECT owner_id FROM source_documents WHERE id=?", {id}) !=
            uid(u))
          throw Failure(403, "forbidden",
                        "Somente autor pode corrigir a extração.");
        auto markdown = field(s, r.body, "markdown");
        if (markdown.empty() || markdown.size() > 1000000 ||
            !std::regex_search(markdown,
                               std::regex("(^|\\n)## Página [1-9][0-9]*")))
          throw Failure(400, "invalid_markdown",
                        "Texto ausente ou grande demais.");
        s.query("UPDATE source_documents SET "
                "markdown=?,status='converted',approved_by=NULL,updated_at="
                "CURRENT_TIMESTAMP WHERE id=? AND status<>'withdrawn'",
                {markdown, id});
        s.query("DELETE FROM library_chunks WHERE document_id=?", {id});
        s.query("UPDATE worker_jobs SET cancel_requested=1 WHERE document_id=? "
                "AND status IN ('queued','running')",
                {id});
        s.audit(u, "source_extraction_edited", id);
        return json("{\"status\":\"converted\"}");
      }
      if (r.method == "GET" &&
          (action == "grants" || action == "dependencies")) {
        const bool owner =
            s.query("SELECT owner_id=? FROM source_documents WHERE id=?",
                    {uid(u), id}) == "1";
        if (u.role != "admin" && !owner)
          throw Failure(
              403, "forbidden",
              "Somente titular ou administração consulta vínculos da fonte.");
        if (action == "grants")
          return json(s.query(
              "SELECT "
              "COALESCE(json_group_array(json_object('userId',users.id,'name',"
              "full_name,'role',role)),'[]') FROM document_grants JOIN users "
              "ON users.id=document_grants.user_id WHERE document_id=?",
              {id}));
        return json(s.query(
            "SELECT COALESCE(json_group_array(json(value)),'[]') FROM (SELECT "
            "json_object('id',v.id,'caseId',c.id,'title',COALESCE(json_extract("
            "v.metadata_json,'$.publicTitle'),c.title),'version',v.version_"
            "number,'state',v.review_state) value FROM version_sources vs JOIN "
            "case_versions v ON v.id=vs.version_id JOIN clinical_cases c ON "
            "c.id=v.clinical_case_id WHERE vs.document_id=? AND "
            "c.institution_id=(SELECT institution_id FROM users WHERE id=?) "
            "ORDER BY v.id)",
            {id, uid(u)}));
      }
      if (r.method == "POST" && action == "grants") {
        if (u.role != "admin")
          throw Failure(403, "forbidden", "Atribuição exige administração.");
        auto target = field(s, r.body, "userId");
        if (s.query(
                "SELECT json_type(?,'$.userId')='integer' AND "
                "COALESCE(json_type(?,'$.enabled'),'true') IN ('true','false')",
                {r.body, r.body}) != "1")
          throw Failure(
              400, "invalid_grant",
              "Usuário deve ser inteiro e enabled deve ser booleano.");
        const bool enabled = field(s, r.body, "enabled", "1") == "1";
        auto reason = field(s, r.body, "reason");
        if (!enabled && (s.query("SELECT length(trim(?))", {reason}) == "0" ||
                         reason.size() > 2000))
          throw Failure(400, "reason_required",
                        "Informe motivo administrativo de até 2000 caracteres, "
                        "sem dados clínicos.");
        s.query("BEGIN IMMEDIATE");
        try {
          if (s.query("SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND (?='0' "
                      "OR is_active=1) AND institution_id=(SELECT "
                      "institution_id FROM users WHERE id=?))",
                      {target, enabled ? "1" : "0", uid(u)}) != "1")
            throw Failure(400, "invalid_user", "Usuário inválido.");
          if (s.query("SELECT owner_id=? FROM source_documents WHERE id=?",
                      {target, id}) == "1")
            throw Failure(
                400, "owner_access",
                "Acesso do titular é inerente à propriedade da fonte.");
          if (enabled)
            s.query("INSERT OR IGNORE INTO "
                    "document_grants(document_id,user_id) VALUES(?,?)",
                    {id, target});
          else
            s.query(
                "DELETE FROM document_grants WHERE document_id=? AND user_id=?",
                {id, target});
          const auto metadata = s.query(
              "SELECT json_object('userId',CAST(? AS INTEGER),'reason',?)",
              {target, reason});
          s.audit(u,
                  enabled ? "source_access_granted" : "source_access_revoked",
                  id, metadata);
          s.query("COMMIT");
        } catch (...) {
          s.query("ROLLBACK");
          throw;
        }
        return json(enabled ? "{\"status\":\"granted\"}"
                            : "{\"status\":\"revoked\"}");
      }
      if (r.method == "POST" && action == "approve") {
        auto area =
            s.query("SELECT area FROM source_documents WHERE id=?", {id});
        if (u.role != "teacher" ||
            s.query("SELECT EXISTS(SELECT 1 FROM reviewer_areas WHERE "
                    "user_id=? AND area=?)",
                    {uid(u), area}) != "1")
          throw Failure(403, "forbidden",
                        "Fonte exige revisor habilitado e com acesso.");
        if (field(s, r.body, "confirmed") != "1")
          throw Failure(400, "confirmation_required",
                        "Confirme conferência da fonte e uso autorizado.");
        s.query("UPDATE source_documents SET "
                "status='approved',approved_by=?,updated_at=CURRENT_TIMESTAMP "
                "WHERE id=? AND status='converted' AND markdown<>''",
                {uid(u), id});
        if (sqlite3_changes(s.db) != 1)
          throw Failure(409, "invalid_state",
                        "Converta e confira a fonte antes de aprovar.");
        s.audit(u, "source_approved", id);
        return json("{\"status\":\"approved\"}");
      }
      if (r.method == "POST" && action == "withdraw") {
        if (u.role != "admin" &&
            s.query("SELECT owner_id FROM source_documents WHERE id=?", {id}) !=
                uid(u))
          throw Failure(403, "forbidden", "Somente autor ou administração.");
        s.query("UPDATE source_documents SET "
                "status='withdrawn',updated_at=CURRENT_TIMESTAMP WHERE id=?",
                {id});
        s.query("UPDATE worker_jobs SET cancel_requested=1 WHERE document_id=? "
                "AND status IN ('queued','running')",
                {id});
        s.audit(u, "source_withdrawn", id);
        return json("{\"status\":\"withdrawn\"}");
      }
      if (r.method == "POST" && action == "jobs") {
        auto operation = field(s, r.body, "operation");
        if (operation != "convert" && operation != "generate" && operation != "budget")
          throw Failure(400, "invalid_operation", "Operação inválida.");
        if (s.query("SELECT owner_id FROM source_documents WHERE id=?", {id}) !=
            uid(u))
          throw Failure(403, "forbidden",
                        "Somente autor solicita processamento.");
        if (s.query("SELECT status FROM source_documents WHERE id=?", {id}) ==
            "withdrawn")
          throw Failure(409, "source_withdrawn", "Fonte retirada.");
        if ((operation == "generate" || operation == "budget") &&
            s.query(
                "SELECT length(markdown)>0 FROM source_documents WHERE id=?",
                {id}) != "1")
          throw Failure(409, "conversion_required",
                        "Converta e confira o texto primeiro.");
        if (operation == "generate")
          requireInference(s, u, id);
        if (field(s, r.body, "instructions").size() > 4000 ||
            field(s, r.body, "query").size() > 1000 || r.body.size() > 12000)
          throw Failure(400, "request_limit",
                        "Instruções ou consulta acima do limite.");
        if (s.query("SELECT coalesce(json_type(?, '$.pages'),'array')='array' "
                    "AND coalesce(json_array_length(?, '$.pages'),0)<=100 AND "
                    "NOT EXISTS(SELECT 1 FROM json_each(?, '$.pages') WHERE "
                    "type<>'integer' OR value<1 OR value>100)",
                    {r.body, r.body, r.body}) != "1")
          throw Failure(400, "invalid_pages",
                        "Selecione até 100 páginas inteiras positivas.");
        auto key = field(s, r.body, "idempotencyKey", randomToken(16));
        if (key.empty() || key.size() > 128)
          throw Failure(400, "invalid_key", "Chave de reenvio inválida.");
        s.query("BEGIN IMMEDIATE");
        try {
          auto prior = s.query("SELECT id FROM worker_jobs WHERE owner_id=? "
                               "AND idempotency_key=?",
                               {uid(u), key});
          if (!prior.empty()) {
            if (s.query(
                    "SELECT document_id=? AND operation=? AND request_json=? "
                    "FROM worker_jobs WHERE id=?",
                    {id, operation == "budget" ? "generate" : operation, r.body, prior}) != "1")
              throw Failure(409, "idempotency_conflict",
                            "Chave já utilizada com outra solicitação.");
            const auto previous =
                s.query("SELECT " + jobFields + " FROM worker_jobs WHERE id=?",
                        {prior});
            s.query("COMMIT");
            return json(previous);
          }
          requireJobQuota(s, u, operation == "budget");
          requireSharedQueueCapacity(s, u);
          if (std::stoll(
                  s.query("SELECT count(*) FROM worker_jobs WHERE "
                          "owner_id=? AND status IN ('queued','running')",
                          {uid(u)})) >= 3)
            throw Failure(429, "queue_full",
                          "Você já possui três trabalhos pendentes.");
          // A prévia usa a fila autenticada existente; o worker reconhece a operação
          // no request_json e não executa inferência nem produz contribuição.
          auto jobId = randomToken(16);
          s.query("INSERT INTO "
                  "worker_jobs(id,owner_id,document_id,operation,request_json,"
                  "idempotency_key) VALUES(?,?,?,?,?,?)",
                  {jobId, uid(u), id, operation == "budget" ? "generate" : operation, r.body, key});
          s.audit(u, "job_queued", jobId);
          s.query("COMMIT");
          return json("{\"id\":\"" + jobId + "\",\"status\":\"queued\"}", 202);
        } catch (...) {
          s.query("ROLLBACK");
          throw;
        }
      }
    }
    if (r.method == "GET" && r.path == "/api/v1/jobs")
      return json(s.query(
          "SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT " +
              jobFields +
              " value FROM worker_jobs WHERE owner_id=? ORDER BY (archived_at IS NOT NULL),created_at "
              "DESC LIMIT 100)",
          {uid(u)}));
    if (std::regex_match(
            r.path, match,
            std::regex("^/api/v1/jobs/([a-f0-9]{32})(?:/(cancel|retry|archive|restore))?$"))) {
      auto id = match[1].str(), action = match[2].str();
      if (s.query("SELECT owner_id FROM worker_jobs WHERE id=?", {id}) !=
          uid(u))
        throw Failure(404, "not_found", "Trabalho não encontrado.");
      if (r.method == "GET" && action.empty())
        return json(s.query(
            "SELECT " + jobFields + " FROM worker_jobs WHERE id=?", {id}));
      // Remover da lista é arquivamento, nunca descarte de fonte, resultado ou
      // contribuição. A transação serializa a decisão com cancelamento/retry.
      // Somente o titular altera sua organização; administração não o substitui.
      if (r.method == "POST" && (action == "archive" || action == "restore")) {
        s.query("BEGIN IMMEDIATE");
        try {
          if (action == "archive") {
            if (s.query("SELECT status IN ('completed','failed','cancelled') FROM worker_jobs WHERE id=? AND owner_id=?", {id,uid(u)}) != "1")
              throw Failure(409, "job_active", "Cancele o trabalho e aguarde o encerramento antes de removê-lo da lista.");
            s.query("UPDATE worker_jobs SET archived_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=? AND archived_at IS NULL", {id,uid(u)});
          } else {
            s.query("UPDATE worker_jobs SET archived_at=NULL WHERE id=? AND owner_id=? AND archived_at IS NOT NULL", {id,uid(u)});
          }
          // Replay não altera carimbos, tentativas, quotas ou duplica auditoria.
          if (sqlite3_changes(s.db) == 1)
            s.query("INSERT INTO audit_logs(user_id,action,entity_type,metadata_json) VALUES(?,?,'worker_job',json_object('id',?))", {uid(u),action == "archive" ? "job_archived" : "job_restored",id});
          auto response=s.query("SELECT " + jobFields + " FROM worker_jobs WHERE id=? AND owner_id=?", {id,uid(u)});
          s.query("COMMIT");
          return json(response);
        } catch (...) {
          s.query("ROLLBACK");
          throw;
        }
      }
      if (r.method == "POST" && action == "cancel") {
        s.query("UPDATE worker_jobs SET cancel_requested=1,status=CASE WHEN "
                "status='queued' THEN 'cancelled' ELSE status "
                "END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN "
                "('queued','running')",
                {id});
        return json("{\"status\":\"cancellation_requested\"}");
      }
      if (r.method == "POST" && action == "retry") {
        if (s.query("SELECT archived_at IS NOT NULL FROM worker_jobs WHERE id=?", {id}) == "1")
          throw Failure(409, "job_archived", "Restaure o trabalho na lista antes de solicitar uma retentativa.");
        const auto operation = s.query("SELECT coalesce(json_extract(request_json,'$.operation'),operation) FROM worker_jobs WHERE id=?", {id});
        if (operation == "generate")
          requireInference(s,u,id);
        // A verificação e o evento de consumo são atômicos. Requisições
        // rejeitadas ou repetidas em estado não elegível não consomem quota.
        s.query("BEGIN IMMEDIATE");
        try {
          if (s.query("SELECT archived_at IS NOT NULL FROM worker_jobs WHERE id=?", {id}) == "1")
            throw Failure(409, "job_archived", "Restaure o trabalho na lista antes de solicitar uma retentativa.");
          if (s.query("SELECT coalesce(json_extract(error_json,'$.code'),'') IN ('select_fewer_pages','context_limit','invalid_configuration','invalid_pages','source_insufficient','inference_disabled','invalid_model_config','invalid_provider_url','preview_stale','preview_required','stale_preview','stale_config','insufficient_source') FROM worker_jobs WHERE id=?",{id})=="1")
            throw Failure(409,"retry_requires_change","Altere a entrada ou configuração e crie nova solicitação; repetir esta falha não resolve sua causa.");
          if (s.query("SELECT status='failed' AND attempts<max_attempts AND "
                      "expires_at>CAST(strftime('%s','now') AS INTEGER) FROM "
                      "worker_jobs WHERE id=?",
                      {id}) != "1")
            throw Failure(409, "retry_unavailable",
                          "Retentativas esgotadas ou estado inválido.");
          requireJobQuota(s, u, operation == "budget");
          requireSharedQueueCapacity(s, u);
          if (std::stoll(
                  s.query("SELECT count(*) FROM worker_jobs WHERE owner_id=? "
                          "AND status IN ('queued','running')",
                          {uid(u)})) >= 3)
            throw Failure(429, "queue_full", "Limite de trabalhos pendentes.");
          s.query("UPDATE worker_jobs SET "
                  "status='queued',cancel_requested=0,error_json=NULL,next_"
                  "attempt_at=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND "
                  "status='failed' AND attempts<max_attempts AND "
                  "expires_at>CAST(strftime('%s','now') AS INTEGER)",
                  {id});
          if (sqlite3_changes(s.db) != 1)
            throw Failure(409, "retry_unavailable",
                          "Retentativa indisponível.");
          s.audit(u, operation == "budget" ? "budget_retry_queued" : "job_retry_queued", id);
          s.query("COMMIT");
          return json("{\"status\":\"queued\"}");
        } catch (...) {
          s.query("ROLLBACK");
          throw;
        }
      }
    }
    // O filtro de acesso é aplicado na seleção das fontes antes de retornar
    // trechos.
    if (r.method == "POST" && r.path == "/api/v1/library/search") {
      auto query = field(s, r.body, "query");
      if (query.empty() || query.size() > 200)
        throw Failure(400, "invalid_query", "Consulta inválida.");
      if (u.role == "student") {
        s.query(
            "INSERT OR IGNORE INTO source_readers(document_id,user_id) SELECT "
            "DISTINCT d.id,? FROM source_documents d JOIN library_chunks c ON "
            "c.document_id=d.id WHERE d.status='approved' AND (SELECT "
            "institution_id FROM users WHERE id=d.owner_id)=(SELECT "
            "institution_id FROM users WHERE id=?) AND (d.owner_id=? OR "
            "EXISTS(SELECT 1 FROM document_grants g WHERE g.document_id=d.id "
            "AND g.user_id=?)) AND c.text LIKE '%'||?||'%' LIMIT 20",
            {uid(u), uid(u), uid(u), uid(u), query});
        s.query("INSERT OR IGNORE INTO "
                "case_exposures(user_id,case_version_id,reason) SELECT "
                "?,v.version_id,'source_search_seen' FROM version_sources v "
                "JOIN source_readers sr ON sr.document_id=v.document_id AND "
                "sr.user_id=?",
                {uid(u), uid(u)});
      }
      return json(s.query(
          "SELECT coalesce(json_group_array(json(value)),'[]') FROM (SELECT "
          "json_object('documentId',d.id,'page',c.page,'text',substr(c.text,1,"
          "2000)) value FROM (SELECT * FROM source_documents d WHERE "
          "status='approved' AND authorized_use=1 AND deidentified=1 AND "
          "(SELECT institution_id FROM users WHERE id=d.owner_id)=(SELECT "
          "institution_id FROM users WHERE id=?) AND (owner_id=? OR "
          "EXISTS(SELECT 1 FROM document_grants g WHERE g.document_id=d.id AND "
          "g.user_id=?))) d JOIN library_chunks c ON c.document_id=d.id WHERE "
          "c.text LIKE '%'||?||'%' LIMIT 20)",
          {uid(u), uid(u), uid(u), query}));
    }
    return json("{\"error\":{\"code\":\"not_found\",\"message\":\"Rota não "
                "encontrada.\"}}",
                404);
  } catch (const StorageLimitError &e) {
    return json("{\"error\":{\"code\":\"" + jsonEscape(e.code) +
                    "\",\"message\":\"" + jsonEscape(e.what()) + "\"}}",e.status);
  } catch (const Failure &e) {
    return json("{\"error\":{\"code\":\"" + jsonEscape(e.code) +
                    "\",\"message\":\"" + jsonEscape(e.what()) + "\"}}",
                e.status);
  } catch (...) {
    return json("{\"error\":{\"code\":\"pipeline_error\",\"message\":"
                "\"Processamento indisponível.\"}}",
                500);
  }
}
} // namespace devsphere
