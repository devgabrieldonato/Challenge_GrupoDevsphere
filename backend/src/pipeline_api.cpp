#include "pipeline_api.hpp"
#include "security.hpp"
#include <cerrno>
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
// Limite persistente compartilhado por conversão e geração. Cancelamentos,
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
void requireJobQuota(Sql &s, const SessionUser &actor) {
  const int limit =
      quotaConfiguration("DEVSPHERE_JOB_REQUEST_LIMIT", 12, 1, 120);
  const int seconds =
      quotaConfiguration("DEVSPHERE_JOB_WINDOW_SECONDS", 3600, 60, 86400);
  const auto modifier = "-" + std::to_string(seconds) + " seconds";
  const auto used =
      s.query("SELECT (SELECT COUNT(*) FROM worker_jobs WHERE owner_id=? AND "
              "created_at>datetime('now',?))+(SELECT COUNT(*) FROM audit_logs "
              "WHERE user_id=? AND action='job_retry_queued' AND "
              "created_at>datetime('now',?))",
              {uid(actor), modifier, uid(actor), modifier});
  if (std::stoll(used) >= limit)
    throw Failure(429, "job_request_limit",
                  "Limite de solicitações de processamento atingido. Aguarde a "
                  "renovação da janela de uso.");
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
    "createdAt',created_at)";
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
    "updatedAt',updated_at)";
} // namespace

std::optional<HttpResponse> pipelineRoute(const HttpRequest &r,
                                          const SessionUser &u) {
  if (r.path.rfind("/api/v1/documents", 0) != 0 &&
      r.path.rfind("/api/v1/jobs", 0) != 0 &&
      r.path.rfind("/api/v1/library", 0) != 0)
    return std::nullopt;
  try {
    Sql s;
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
        PrivateUpload file(path);
        file.writeAndSync(data);
        s.query(
            "INSERT INTO "
            "source_documents(id,owner_id,storage_path,original_name,sha256,"
            "authorized_use,deidentified,area) VALUES(?,?,?,?,?,1,1,?)",
            {id, uid(u), path.string(), name, digest,
             textPart(r, "area").empty() ? "general" : textPart(r, "area")});
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
                       "(jobs|approve|withdraw|grants|pdf|dependencies))?$"))) {
      auto id = match[1].str(), action = match[2].str();
      requireSource(s, id, u);
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
        if (operation != "convert" && operation != "generate")
          throw Failure(400, "invalid_operation", "Operação inválida.");
        if (s.query("SELECT owner_id FROM source_documents WHERE id=?", {id}) !=
            uid(u))
          throw Failure(403, "forbidden",
                        "Somente autor solicita processamento.");
        if (s.query("SELECT status FROM source_documents WHERE id=?", {id}) ==
            "withdrawn")
          throw Failure(409, "source_withdrawn", "Fonte retirada.");
        if (operation == "generate" &&
            s.query(
                "SELECT length(markdown)>0 FROM source_documents WHERE id=?",
                {id}) != "1")
          throw Failure(409, "conversion_required",
                        "Converta e confira o texto primeiro.");
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
                    {id, operation, r.body, prior}) != "1")
              throw Failure(409, "idempotency_conflict",
                            "Chave já utilizada com outra solicitação.");
            const auto previous =
                s.query("SELECT " + jobFields + " FROM worker_jobs WHERE id=?",
                        {prior});
            s.query("COMMIT");
            return json(previous);
          }
          requireJobQuota(s, u);
          requireSharedQueueCapacity(s, u);
          if (std::stoll(
                  s.query("SELECT count(*) FROM worker_jobs WHERE "
                          "owner_id=? AND status IN ('queued','running')",
                          {uid(u)})) >= 3)
            throw Failure(429, "queue_full",
                          "Você já possui três trabalhos pendentes.");
          auto jobId = randomToken(16);
          s.query("INSERT INTO "
                  "worker_jobs(id,owner_id,document_id,operation,request_json,"
                  "idempotency_key) VALUES(?,?,?,?,?,?)",
                  {jobId, uid(u), id, operation, r.body, key});
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
              " value FROM worker_jobs WHERE owner_id=? ORDER BY created_at "
              "DESC LIMIT 100)",
          {uid(u)}));
    if (std::regex_match(
            r.path, match,
            std::regex("^/api/v1/jobs/([a-f0-9]{32})(?:/(cancel|retry))?$"))) {
      auto id = match[1].str(), action = match[2].str();
      if (s.query("SELECT owner_id FROM worker_jobs WHERE id=?", {id}) !=
          uid(u))
        throw Failure(404, "not_found", "Trabalho não encontrado.");
      if (r.method == "GET" && action.empty())
        return json(s.query(
            "SELECT " + jobFields + " FROM worker_jobs WHERE id=?", {id}));
      if (r.method == "POST" && action == "cancel") {
        s.query("UPDATE worker_jobs SET cancel_requested=1,status=CASE WHEN "
                "status='queued' THEN 'cancelled' ELSE status "
                "END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN "
                "('queued','running')",
                {id});
        return json("{\"status\":\"cancellation_requested\"}");
      }
      if (r.method == "POST" && action == "retry") {
        // A verificação e o evento de consumo são atômicos. Requisições
        // rejeitadas ou repetidas em estado não elegível não consomem quota.
        s.query("BEGIN IMMEDIATE");
        try {
          if (s.query("SELECT status='failed' AND attempts<max_attempts AND "
                      "expires_at>CAST(strftime('%s','now') AS INTEGER) FROM "
                      "worker_jobs WHERE id=?",
                      {id}) != "1")
            throw Failure(409, "retry_unavailable",
                          "Retentativas esgotadas ou estado inválido.");
          requireJobQuota(s, u);
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
          s.audit(u, "job_retry_queued", id);
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
