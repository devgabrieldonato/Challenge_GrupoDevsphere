#include "database.hpp"

#include "security.hpp"

#include <sqlite3.h>

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <set>
#include <stdexcept>
#include <vector>

namespace devsphere {
namespace {
class Statement {
 public:
  Statement(sqlite3* database, const std::string& sql) {
    if (sqlite3_prepare_v2(database, sql.c_str(), -1, &statement_, nullptr) !=
        SQLITE_OK) {
      throw std::runtime_error(sqlite3_errmsg(database));
    }
  }
  ~Statement() { sqlite3_finalize(statement_); }
  sqlite3_stmt* get() { return statement_; }

 private:
  sqlite3_stmt* statement_{};
};

void bindText(sqlite3_stmt* statement, int position, const std::string& value) {
  if (sqlite3_bind_text(statement, position, value.c_str(), -1,
                        SQLITE_TRANSIENT) != SQLITE_OK) {
    throw std::runtime_error("falha ao vincular parâmetro SQL");
  }
}

std::string columnText(sqlite3_stmt* statement, int position) {
  const auto* value = sqlite3_column_text(statement, position);
  return value ? reinterpret_cast<const char*>(value) : "";
}

std::string readFile(const std::filesystem::path& path) {
  std::ifstream input(path);
  if (!input) throw std::runtime_error("não foi possível ler " + path.string());
  return {std::istreambuf_iterator<char>(input),
          std::istreambuf_iterator<char>()};
}

std::string scalarJson(sqlite3* database, const std::string& sql,
                       const std::vector<std::string>& values = {}) {
  Statement statement(database, sql);
  for (std::size_t i = 0; i < values.size(); ++i) {
    bindText(statement.get(), static_cast<int>(i + 1), values[i]);
  }
  if (sqlite3_step(statement.get()) != SQLITE_ROW) {
    throw std::runtime_error(sqlite3_errmsg(database));
  }
  return columnText(statement.get(), 0);
}
}  // namespace

Database::Database(const std::string& path) {
  if (sqlite3_open(path.c_str(), &db_) != SQLITE_OK) {
    const std::string message = sqlite3_errmsg(db_);
    sqlite3_close(db_);
    db_ = nullptr;
    throw std::runtime_error(message);
  }
  sqlite3_busy_timeout(db_, 5000);
  execute("PRAGMA foreign_keys = ON;");
  execute("PRAGMA journal_mode = WAL;");
}

Database::~Database() {
  if (db_) sqlite3_close(db_);
}

void Database::execute(const std::string& sql) {
  char* error = nullptr;
  if (sqlite3_exec(db_, sql.c_str(), nullptr, nullptr, &error) != SQLITE_OK) {
    const std::string message = error ? error : "erro SQLite";
    sqlite3_free(error);
    throw std::runtime_error(message);
  }
}

void Database::migrate(const std::string& migrationsDirectory) {
  execute("CREATE TABLE IF NOT EXISTS schema_migrations("
          "version TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
  std::vector<std::filesystem::path> files;
  for (const auto& entry :
       std::filesystem::directory_iterator(migrationsDirectory)) {
    if (entry.path().extension() == ".sql") files.push_back(entry.path());
  }
  std::sort(files.begin(), files.end());

  for (const auto& file : files) {
    Statement check(db_, "SELECT 1 FROM schema_migrations WHERE version = ?;");
    bindText(check.get(), 1, file.filename().string());
    if (sqlite3_step(check.get()) == SQLITE_ROW) continue;

    execute("BEGIN IMMEDIATE;");
    try {
      execute(readFile(file));
      Statement insert(
          db_, "INSERT INTO schema_migrations(version) VALUES (?);");
      bindText(insert.get(), 1, file.filename().string());
      if (sqlite3_step(insert.get()) != SQLITE_DONE) {
        throw std::runtime_error(sqlite3_errmsg(db_));
      }
      execute("COMMIT;");
    } catch (...) {
      execute("ROLLBACK;");
      throw;
    }
  }
}

std::optional<User> Database::findUserByEmail(const std::string& email) {
  Statement statement(
      db_, "SELECT u.id,u.full_name,u.email,u.password_hash,"
           "CASE WHEN a.user_id IS NULL THEN u.role ELSE 'admin' END,u.is_active "
           "FROM users u LEFT JOIN admin_accounts a ON a.user_id=u.id "
           "WHERE u.email = ? COLLATE NOCASE;");
  bindText(statement.get(), 1, email);
  if (sqlite3_step(statement.get()) != SQLITE_ROW) return std::nullopt;
  return User{sqlite3_column_int64(statement.get(), 0),
              columnText(statement.get(), 1), columnText(statement.get(), 2),
              columnText(statement.get(), 3), columnText(statement.get(), 4),
              sqlite3_column_int(statement.get(), 5) == 1};
}

void Database::createUser(const std::string& fullName, const std::string& email,
                          const std::string& passwordHash,
                          const std::string& role) {
  if (role != "student" && role != "teacher") {
    throw std::invalid_argument("papel deve ser student ou teacher");
  }
  Statement statement(
      db_, "INSERT INTO users(full_name,email,password_hash,role) VALUES(?,?,?,?);");
  bindText(statement.get(), 1, fullName);
  bindText(statement.get(), 2, email);
  bindText(statement.get(), 3, passwordHash);
  bindText(statement.get(), 4, role);
  if (sqlite3_step(statement.get()) != SQLITE_DONE) {
    throw std::runtime_error(sqlite3_errmsg(db_));
  }
}

void Database::createAdmin(const std::string& fullName,
                           const std::string& email,
                           const std::string& passwordHash,
                           const std::string& notificationEmail) {
  execute("BEGIN IMMEDIATE;");
  try {
    Statement user(
        db_, "INSERT INTO users(full_name,email,password_hash,role,is_active,"
             "registration_status,approved_at) "
             "VALUES(?,?,?,'teacher',1,'active',CURRENT_TIMESTAMP);");
    bindText(user.get(), 1, fullName);
    bindText(user.get(), 2, email);
    bindText(user.get(), 3, passwordHash);
    if (sqlite3_step(user.get()) != SQLITE_DONE) {
      throw std::runtime_error(sqlite3_errmsg(db_));
    }
    const auto userId = sqlite3_last_insert_rowid(db_);
    Statement admin(
        db_, "INSERT INTO admin_accounts(user_id,notification_email) VALUES(?,?);");
    sqlite3_bind_int64(admin.get(), 1, userId);
    bindText(admin.get(), 2, notificationEmail);
    if (sqlite3_step(admin.get()) != SQLITE_DONE) {
      throw std::runtime_error(sqlite3_errmsg(db_));
    }
    execute("COMMIT;");
  } catch (...) {
    execute("ROLLBACK;");
    throw;
  }
}

void Database::addInstitutionalDomain(const std::string& domain) {
  Statement statement(
      db_, "INSERT INTO institutional_email_domains(domain) VALUES(?) "
           "ON CONFLICT(domain) DO UPDATE SET is_active=1;");
  bindText(statement.get(), 1, domain);
  if (sqlite3_step(statement.get()) != SQLITE_DONE) {
    throw std::runtime_error(sqlite3_errmsg(db_));
  }
}

bool Database::isInstitutionalEmailAllowed(const std::string& email) {
  const auto separator = email.rfind('@');
  if (separator == std::string::npos || separator + 1 >= email.size()) {
    return false;
  }
  Statement statement(
      db_, "SELECT 1 FROM institutional_email_domains "
           "WHERE domain=? COLLATE NOCASE AND is_active=1;");
  bindText(statement.get(), 1, email.substr(separator + 1));
  return sqlite3_step(statement.get()) == SQLITE_ROW;
}

std::int64_t Database::createRegistration(
    const std::string& fullName, const std::string& email,
    const std::string& passwordHash, const std::string& role,
    const std::string& className,
    const std::string& professionalRegistration) {
  if (role != "student" && role != "teacher") {
    throw std::invalid_argument("papel de cadastro inválido");
  }
  execute("BEGIN IMMEDIATE;");
  try {
    Statement user(
        db_, "INSERT INTO users(full_name,email,password_hash,role,class_name,"
             "professional_registration,is_active,registration_status) "
             "VALUES(?,?,?,?,?,?,0,'pending_admin');");
    bindText(user.get(), 1, fullName);
    bindText(user.get(), 2, email);
    bindText(user.get(), 3, passwordHash);
    bindText(user.get(), 4, role);
    if (className.empty()) sqlite3_bind_null(user.get(), 5);
    else bindText(user.get(), 5, className);
    if (professionalRegistration.empty()) sqlite3_bind_null(user.get(), 6);
    else bindText(user.get(), 6, professionalRegistration);
    if (sqlite3_step(user.get()) != SQLITE_DONE) {
      throw std::runtime_error(sqlite3_errmsg(db_));
    }
    const auto userId = sqlite3_last_insert_rowid(db_);

    Statement request(
        db_, "INSERT INTO registration_requests(user_id,requested_role) VALUES(?,?);");
    sqlite3_bind_int64(request.get(), 1, userId);
    bindText(request.get(), 2, role);
    if (sqlite3_step(request.get()) != SQLITE_DONE) {
      throw std::runtime_error(sqlite3_errmsg(db_));
    }
    const auto requestId = sqlite3_last_insert_rowid(db_);

    Statement notify(
        db_, "INSERT INTO email_outbox(recipient,template_key,payload_json) "
             "SELECT notification_email,'registration_requested',"
             "json_object('requestId',?,'name',?,'email',?,'role',?) "
             "FROM admin_accounts;");
    sqlite3_bind_int64(notify.get(), 1, requestId);
    bindText(notify.get(), 2, fullName);
    bindText(notify.get(), 3, email);
    bindText(notify.get(), 4, role);
    if (sqlite3_step(notify.get()) != SQLITE_DONE) {
      throw std::runtime_error(sqlite3_errmsg(db_));
    }
    execute("COMMIT;");
    return requestId;
  } catch (...) {
    execute("ROLLBACK;");
    throw;
  }
}

std::string Database::listPendingRegistrations() {
  return scalarJson(
      db_, "SELECT COALESCE(json_group_array(json_object("
           "'id',id,'userId',user_id,'name',full_name,'email',email,"
           "'role',requested_role,'className',class_name,"
           "'professionalRegistration',professional_registration,"
           "'submittedAt',submitted_at)),'[]') FROM ("
           "SELECT r.id,r.user_id,u.full_name,u.email,r.requested_role,"
           "u.class_name,u.professional_registration,r.submitted_at "
           "FROM registration_requests r JOIN users u ON u.id=r.user_id "
           "WHERE r.status='pending' ORDER BY r.submitted_at ASC);");
}

std::string Database::adminConfiguration() {
  return scalarJson(
      db_, "SELECT json_object("
           "'notificationEmails',json(COALESCE((SELECT json_group_array("
           "notification_email) FROM admin_accounts),'[]')),"
           "'domains',json(COALESCE((SELECT json_group_array(domain) FROM "
           "institutional_email_domains WHERE is_active=1),'[]')),"
           "'queuedEmails',(SELECT COUNT(*) FROM email_outbox WHERE status='queued'),"
           "'pendingRegistrations',(SELECT COUNT(*) FROM registration_requests "
           "WHERE status='pending'));");
}

bool Database::reviewRegistration(std::int64_t requestId,
                                  std::int64_t adminId, bool approve,
                                  const std::string& note) {
  execute("BEGIN IMMEDIATE;");
  try {
    Statement lookup(
        db_, "SELECT r.user_id,u.email,u.full_name,r.requested_role "
             "FROM registration_requests r JOIN users u ON u.id=r.user_id "
             "WHERE r.id=? AND r.status='pending';");
    sqlite3_bind_int64(lookup.get(), 1, requestId);
    if (sqlite3_step(lookup.get()) != SQLITE_ROW) {
      execute("ROLLBACK;");
      return false;
    }
    const auto userId = sqlite3_column_int64(lookup.get(), 0);
    const std::string email = columnText(lookup.get(), 1);
    const std::string name = columnText(lookup.get(), 2);
    const std::string role = columnText(lookup.get(), 3);

    Statement request(
        db_, "UPDATE registration_requests SET status=?,reviewed_by=?,"
             "reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE id=? AND status='pending';");
    bindText(request.get(), 1, approve ? "approved" : "rejected");
    sqlite3_bind_int64(request.get(), 2, adminId);
    bindText(request.get(), 3, note);
    sqlite3_bind_int64(request.get(), 4, requestId);
    if (sqlite3_step(request.get()) != SQLITE_DONE || sqlite3_changes(db_) != 1) {
      throw std::runtime_error(sqlite3_errmsg(db_));
    }

    Statement user(
        db_, approve
            ? "UPDATE users SET is_active=1,registration_status='active',"
              "approved_by=?,approved_at=CURRENT_TIMESTAMP,rejection_reason=NULL,"
              "updated_at=CURRENT_TIMESTAMP WHERE id=?;"
            : "UPDATE users SET is_active=0,registration_status='rejected',"
              "approved_by=?,approved_at=CURRENT_TIMESTAMP,rejection_reason=?,"
              "updated_at=CURRENT_TIMESTAMP WHERE id=?;");
    sqlite3_bind_int64(user.get(), 1, adminId);
    if (approve) {
      sqlite3_bind_int64(user.get(), 2, userId);
    } else {
      bindText(user.get(), 2, note);
      sqlite3_bind_int64(user.get(), 3, userId);
    }
    if (sqlite3_step(user.get()) != SQLITE_DONE) {
      throw std::runtime_error(sqlite3_errmsg(db_));
    }

    Statement notify(
        db_, "INSERT INTO email_outbox(recipient,template_key,payload_json) "
             "VALUES(?,?,json_object('requestId',?,'name',?,'role',?,'note',?));");
    bindText(notify.get(), 1, email);
    bindText(notify.get(), 2,
             approve ? "registration_approved" : "registration_rejected");
    sqlite3_bind_int64(notify.get(), 3, requestId);
    bindText(notify.get(), 4, name);
    bindText(notify.get(), 5, role);
    bindText(notify.get(), 6, note);
    if (sqlite3_step(notify.get()) != SQLITE_DONE) {
      throw std::runtime_error(sqlite3_errmsg(db_));
    }

    Statement audit(
        db_, "INSERT INTO audit_logs(user_id,action,entity_type,entity_id,"
             "metadata_json) VALUES(?,?,'registration_request',?,"
             "json_object('userId',?,'role',?));");
    sqlite3_bind_int64(audit.get(), 1, adminId);
    bindText(audit.get(), 2,
             approve ? "registration.approved" : "registration.rejected");
    sqlite3_bind_int64(audit.get(), 3, requestId);
    sqlite3_bind_int64(audit.get(), 4, userId);
    bindText(audit.get(), 5, role);
    if (sqlite3_step(audit.get()) != SQLITE_DONE) {
      throw std::runtime_error(sqlite3_errmsg(db_));
    }
    execute("COMMIT;");
    return true;
  } catch (...) {
    execute("ROLLBACK;");
    throw;
  }
}

void Database::recordLogin(std::int64_t userId) {
  Statement statement(
      db_, "UPDATE users SET last_login_at=CURRENT_TIMESTAMP, "
           "updated_at=CURRENT_TIMESTAMP WHERE id=?;");
  sqlite3_bind_int64(statement.get(), 1, userId);
  sqlite3_step(statement.get());
}

void Database::createSession(std::int64_t userId,
                             const std::string& tokenHash,
                             const std::string& expiresAt) {
  Statement statement(
      db_, "INSERT INTO sessions(user_id,token_hash,expires_at) "
      "VALUES(?,?,datetime('now',?));");
  sqlite3_bind_int64(statement.get(), 1, userId);
  bindText(statement.get(), 2, tokenHash);
  bindText(statement.get(), 3, expiresAt);
  if (sqlite3_step(statement.get()) != SQLITE_DONE) {
    throw std::runtime_error(sqlite3_errmsg(db_));
  }
}

std::optional<SessionUser> Database::findSession(
    const std::string& tokenHash) {
  Statement statement(
      db_, "SELECT u.id,u.full_name,u.email,"
           "CASE WHEN a.user_id IS NULL THEN u.role ELSE 'admin' END "
           "FROM sessions s JOIN users u ON u.id=s.user_id "
           "LEFT JOIN admin_accounts a ON a.user_id=u.id "
           "WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP "
           "AND u.is_active=1;");
  bindText(statement.get(), 1, tokenHash);
  if (sqlite3_step(statement.get()) != SQLITE_ROW) return std::nullopt;
  return SessionUser{sqlite3_column_int64(statement.get(), 0),
                     columnText(statement.get(), 1),
                     columnText(statement.get(), 2),
                     columnText(statement.get(), 3)};
}

void Database::deleteSession(const std::string& tokenHash) {
  Statement statement(db_, "DELETE FROM sessions WHERE token_hash=?;");
  bindText(statement.get(), 1, tokenHash);
  sqlite3_step(statement.get());
}

void Database::purgeExpiredSessions() {
  execute("DELETE FROM sessions WHERE expires_at<=CURRENT_TIMESTAMP;");
}

std::string Database::listCases(const std::string& role) {
  const std::string filter = (role == "teacher" || role == "admin") ? "" : " WHERE c.status='published'";
  return scalarJson(
      db_, "SELECT COALESCE(json_group_array(json_object("
           "'id',id,'key',stable_key,'title',title,'status',status,"
           "'createdAt',created_at)),'[]') FROM "
           "(SELECT c.* FROM clinical_cases c" + filter +
           " ORDER BY c.updated_at DESC);");
}

std::int64_t Database::importSubmissionPdf(
    std::int64_t teacherId, std::int64_t studentId,
    const std::string& originalName, const std::string& storedPath,
    const std::string& sha256, std::int64_t byteSize,
    const std::string& reportJson, const std::string& schemaVersion) {
  // A validação é repetida no banco para não confiar apenas no navegador.
  {
    Statement student(
        db_, "SELECT 1 FROM users WHERE id=? AND role='student' AND is_active=1;");
    sqlite3_bind_int64(student.get(), 1, studentId);
    if (sqlite3_step(student.get()) != SQLITE_ROW) {
      throw std::invalid_argument("aluno do relatório não encontrado");
    }
  }
  {
    Statement report(
        db_, "SELECT json_valid(?),json_type(?,'$.path'),"
             "json_type(?,'$.attempts'),json_extract(?,'$.reportType');");
    for (int index = 1; index <= 4; ++index) {
      bindText(report.get(), index, reportJson);
    }
    if (sqlite3_step(report.get()) != SQLITE_ROW ||
        sqlite3_column_int(report.get(), 0) != 1 ||
        columnText(report.get(), 1) != "array" ||
        columnText(report.get(), 2) != "array" ||
        columnText(report.get(), 3) != "patient-virtual-submission") {
      throw std::invalid_argument("relatório estruturado inválido");
    }
  }

  execute("BEGIN IMMEDIATE;");
  try {
    Statement document(
        db_, "INSERT INTO uploaded_documents("
             "uploaded_by,original_name,stored_path,sha256,mime_type,byte_size) "
             "VALUES(?,?,?,?, 'application/pdf', ?);");
    sqlite3_bind_int64(document.get(), 1, teacherId);
    bindText(document.get(), 2, originalName);
    bindText(document.get(), 3, storedPath);
    bindText(document.get(), 4, sha256);
    sqlite3_bind_int64(document.get(), 5, byteSize);
    if (sqlite3_step(document.get()) != SQLITE_DONE) {
      throw std::runtime_error(sqlite3_errmsg(db_));
    }
    const auto documentId = sqlite3_last_insert_rowid(db_);

    Statement submission(
        db_, "INSERT INTO submissions("
             "student_id,source,source_pdf_path,report_schema_version,"
             "imported_by,source_document_id,raw_report_json) "
             "VALUES(?,'pdf_import',?,?,?,?,?);");
    sqlite3_bind_int64(submission.get(), 1, studentId);
    bindText(submission.get(), 2, storedPath);
    bindText(submission.get(), 3, schemaVersion);
    sqlite3_bind_int64(submission.get(), 4, teacherId);
    sqlite3_bind_int64(submission.get(), 5, documentId);
    bindText(submission.get(), 6, reportJson);
    if (sqlite3_step(submission.get()) != SQLITE_DONE) {
      throw std::runtime_error(sqlite3_errmsg(db_));
    }
    const auto submissionId = sqlite3_last_insert_rowid(db_);

    Statement audit(
        db_, "INSERT INTO audit_logs(user_id,action,entity_type,entity_id,"
             "metadata_json) VALUES(?,'submission.pdf_imported','submission',?,"
             "json_object('documentId',?,'sha256',?));");
    sqlite3_bind_int64(audit.get(), 1, teacherId);
    sqlite3_bind_int64(audit.get(), 2, submissionId);
    sqlite3_bind_int64(audit.get(), 3, documentId);
    bindText(audit.get(), 4, sha256);
    if (sqlite3_step(audit.get()) != SQLITE_DONE) {
      throw std::runtime_error(sqlite3_errmsg(db_));
    }

    execute("COMMIT;");
    return submissionId;
  } catch (...) {
    execute("ROLLBACK;");
    throw;
  }
}

PlatformSubmissionResult Database::submitPlatform(
    const SessionUser& actor, const PlatformSubmissionInput& input) {
  if (actor.role != "student" && actor.role != "admin") {
    throw std::invalid_argument("somente aluno ou administrador pode concluir um caso");
  }
  if (input.clientSubmissionId.empty() || input.clientSubmissionId.size() > 64) {
    throw std::invalid_argument("identificador idempotente inválido");
  }
  if (input.pdfData.size() < 5 || input.pdfData.rfind("%PDF-", 0) != 0 ||
      input.pdfData.size() > 20 * 1024 * 1024) {
    throw std::invalid_argument("PDF inválido ou acima de 20 MB");
  }
  if (sha256Hex(input.pdfData) != input.pdfSha256) {
    throw std::invalid_argument("hash do PDF não confere");
  }

  const std::string reportHash = sha256Hex(input.reportJson);
  std::string caseKey;
  std::string schemaVersion;
  {
    Statement report(
        db_, "SELECT json_valid(?),json_extract(?,'$.reportType'),"
             "json_extract(?,'$.caseId'),json_extract(?,'$.schemaVersion'),"
             "json_type(?,'$.path'),json_type(?,'$.attempts'),"
             "json_array_length(json_extract(?,'$.attempts')),"
             "json_extract(?,'$.ruleSetVersion');" );
    for (int index = 1; index <= 8; ++index) {
      bindText(report.get(), index, input.reportJson);
    }
    if (sqlite3_step(report.get()) != SQLITE_ROW ||
        sqlite3_column_int(report.get(), 0) != 1 ||
        columnText(report.get(), 1) != "patient-virtual-submission" ||
        (columnText(report.get(), 2) != "joao" &&
         columnText(report.get(), 2) != "marina") ||
        columnText(report.get(), 3) != "2" ||
        columnText(report.get(), 4) != "array" ||
        columnText(report.get(), 5) != "array" ||
        sqlite3_column_int(report.get(), 6) < 1 ||
        columnText(report.get(), 7) != "1.0.0") {
      throw std::invalid_argument("relatório estruturado inválido ou sem hipótese");
    }
    caseKey = columnText(report.get(), 2);
    schemaVersion = columnText(report.get(), 3);
  }
  {
    Statement justification(
        db_, "SELECT EXISTS(SELECT 1 FROM json_each(?,'$.attempts') "
             "WHERE length(trim(COALESCE(json_extract(value,'$.reason'),"
             "json_extract(value,'$.justification'),'')))>0);" );
    bindText(justification.get(), 1, input.reportJson);
    if (sqlite3_step(justification.get()) != SQLITE_ROW ||
        sqlite3_column_int(justification.get(), 0) != 1) {
      throw std::invalid_argument("ao menos uma hipótese precisa de justificativa");
    }
  }

  execute("BEGIN IMMEDIATE;");
  try {
    // A mesma chave e o mesmo conteúdo retornam a submissão já confirmada.
    {
      Statement existing(
          db_, "SELECT id,report_sha256,(SELECT sha256 FROM submission_documents "
               "WHERE submission_id=submissions.id),initial_score,raw_score,"
               "displayed_score,review_status FROM submissions "
               "WHERE client_submission_id=?;" );
      bindText(existing.get(), 1, input.clientSubmissionId);
      if (sqlite3_step(existing.get()) == SQLITE_ROW) {
        if (columnText(existing.get(), 1) != reportHash ||
            columnText(existing.get(), 2) != input.pdfSha256) {
          execute("ROLLBACK;");
          throw std::domain_error("idempotency_conflict");
        }
        PlatformSubmissionResult result{
            sqlite3_column_int64(existing.get(), 0), false,
            sqlite3_column_int(existing.get(), 3),
            sqlite3_column_int(existing.get(), 4),
            sqlite3_column_int(existing.get(), 5), columnText(existing.get(), 6)};
        execute("COMMIT;");
        return result;
      }
    }

    std::int64_t studentId = actor.id;
    const bool isTest = actor.role == "admin";
    if (isTest) {
      // A simulação nunca assume a identidade de um aluno acadêmico real.
      Statement demo(
          db_, "INSERT OR IGNORE INTO users(full_name,email,password_hash,role,"
               "is_active,registration_status) VALUES('Aluno de demonstração',"
               "'demo.student@local.invalid','!simulation-account!','student',1,'active');" );
      if (sqlite3_step(demo.get()) != SQLITE_DONE) throw std::runtime_error(sqlite3_errmsg(db_));
      Statement findDemo(db_, "SELECT id FROM users WHERE email='demo.student@local.invalid';");
      if (sqlite3_step(findDemo.get()) != SQLITE_ROW) throw std::runtime_error("aluno de demonstração indisponível");
      studentId = sqlite3_column_int64(findDemo.get(), 0);
    }

    std::optional<std::int64_t> caseVersionId;
    std::optional<std::int64_t> reviewerId;
    if (input.activityId) {
      Statement activity(
          db_, "SELECT a.case_version_id,a.teacher_id,c.stable_key,"
               "EXISTS(SELECT 1 FROM activity_assignments aa WHERE aa.activity_id=a.id "
               "AND aa.student_id=?) FROM activities a JOIN case_versions cv "
               "ON cv.id=a.case_version_id JOIN clinical_cases c ON c.id=cv.clinical_case_id "
               "WHERE a.id=?;" );
      sqlite3_bind_int64(activity.get(), 1, studentId);
      sqlite3_bind_int64(activity.get(), 2, *input.activityId);
      if (sqlite3_step(activity.get()) != SQLITE_ROW || columnText(activity.get(), 2) != caseKey ||
          (!isTest && sqlite3_column_int(activity.get(), 3) != 1)) {
        throw std::invalid_argument("atividade não pertence ao aluno ou ao caso informado");
      }
      caseVersionId = sqlite3_column_int64(activity.get(), 0);
      reviewerId = sqlite3_column_int64(activity.get(), 1);
    } else {
      Statement version(
          db_, "SELECT current_version_id FROM clinical_cases WHERE stable_key=?;" );
      bindText(version.get(), 1, caseKey);
      if (sqlite3_step(version.get()) == SQLITE_ROW && sqlite3_column_type(version.get(), 0) != SQLITE_NULL) {
        caseVersionId = sqlite3_column_int64(version.get(), 0);
      }
      Statement reviewer(
          db_, "SELECT COALESCE((SELECT default_reviewer_id FROM submission_settings "
               "WHERE singleton_id=1 AND default_reviewer_id IS NOT NULL),"
               "(SELECT u.id FROM users u LEFT JOIN admin_accounts ad ON ad.user_id=u.id "
               "WHERE u.role='teacher' AND u.is_active=1 AND ad.user_id IS NULL "
               "ORDER BY u.id LIMIT 1));" );
      if (sqlite3_step(reviewer.get()) == SQLITE_ROW &&
          sqlite3_column_type(reviewer.get(), 0) != SQLITE_NULL) {
        reviewerId = sqlite3_column_int64(reviewer.get(), 0);
      }
    }

    constexpr int initialScore = 50;
    int rawScore = initialScore;
    std::set<std::string> selected;
    struct ScoreEvent {
      int sequence{}; std::string key; std::string type; std::string title;
      std::string answer; std::string classification; std::string reason;
      std::string dependencies; std::string recordedAt; int base{}; int bonus{};
      int penalty{}; int delta{}; int rawAfter{}; int displayedAfter{};
    };
    std::vector<ScoreEvent> events;
    bool priorityBonusAwarded = false;
    Statement steps(
        db_, "SELECT key,json_extract(value,'$.step'),json_extract(value,'$.id'),json_extract(value,'$.type'),"
             "COALESCE(json_extract(value,'$.title'),''),"
             "COALESCE(json_extract(value,'$.answer'),json_extract(value,'$.response'),''),"
             "COALESCE(json_extract(value,'$.time'),json_extract(value,'$.recordedAt')) "
             "FROM json_each(?,'$.path') ORDER BY CAST(key AS INTEGER);" );
    bindText(steps.get(), 1, input.reportJson);
    while (sqlite3_step(steps.get()) == SQLITE_ROW) {
      ScoreEvent event;
      event.sequence = static_cast<int>(events.size()) + 1;
      if (sqlite3_column_type(steps.get(), 1) != SQLITE_NULL &&
          sqlite3_column_int(steps.get(), 1) != event.sequence) {
        throw std::invalid_argument("sequência inválida no percurso");
      }
      event.key = columnText(steps.get(), 2);
      event.type = columnText(steps.get(), 3);
      event.title = columnText(steps.get(), 4);
      event.answer = columnText(steps.get(), 5);
      event.recordedAt = columnText(steps.get(), 6);
      if (event.key.empty() || !selected.insert(event.key).second) {
        throw std::invalid_argument("item inexistente ou repetido no percurso");
      }
      Statement rule(
          db_, "SELECT item_type,classification,base_points,central_evidence,"
               "dependencies_json,pedagogical_reason FROM submission_scoring_rules "
               "WHERE case_key=? AND rule_set_version='1.0.0' AND item_key=?;" );
      bindText(rule.get(), 1, caseKey); bindText(rule.get(), 2, event.key);
      if (sqlite3_step(rule.get()) != SQLITE_ROW || columnText(rule.get(), 0) != event.type) {
        throw std::invalid_argument("item incompatível com o caso ou tipo informado");
      }
      event.classification = columnText(rule.get(), 1);
      event.base = sqlite3_column_int(rule.get(), 2);
      const bool central = sqlite3_column_int(rule.get(), 3) == 1;
      event.dependencies = columnText(rule.get(), 4);
      event.reason = columnText(rule.get(), 5);
      Statement missing(
          db_, "SELECT value FROM json_each(?) WHERE value NOT IN "
               "(SELECT json_extract(value,'$.id') FROM json_each(?,'$.path') "
               "WHERE CAST(key AS INTEGER) < ? ) LIMIT 1;" );
      bindText(missing.get(), 1, event.dependencies);
      bindText(missing.get(), 2, input.reportJson);
      sqlite3_bind_int(missing.get(), 3, event.sequence - 1);
      if (sqlite3_step(missing.get()) == SQLITE_ROW) {
        throw std::invalid_argument("dependência não atendida no percurso");
      }
      event.bonus = central && event.sequence <= 3 && !priorityBonusAwarded ? 2 : 0;
      if (event.bonus > 0) priorityBonusAwarded = true;
      if (event.sequence >= 13 && event.sequence <= 16) event.penalty = -4;
      else if (event.sequence >= 17 && event.sequence <= 20) event.penalty = -8;
      else if (event.sequence >= 21) event.penalty = -12;
      event.delta = event.base + event.bonus + event.penalty;
      rawScore += event.delta;
      event.rawAfter = rawScore;
      event.displayedAfter = std::clamp(rawScore, 0, 100);
      events.push_back(std::move(event));
    }

    const std::string reviewStatus = reviewerId ? "submitted" : "awaiting_assignment";
    Statement submission(
        db_, "INSERT INTO submissions(activity_id,student_id,case_version_id,source,"
             "report_schema_version,raw_report_json,client_submission_id,submitted_by,"
             "reviewer_id,is_test,review_status,report_sha256,scoring_rule_set_version,"
             "initial_score,raw_score,displayed_score) VALUES(?,?,?,'platform',?,?,?,?,?,?,?,?,?,?,?,?);" );
    if (input.activityId) sqlite3_bind_int64(submission.get(), 1, *input.activityId); else sqlite3_bind_null(submission.get(), 1);
    sqlite3_bind_int64(submission.get(), 2, studentId);
    if (caseVersionId) sqlite3_bind_int64(submission.get(), 3, *caseVersionId); else sqlite3_bind_null(submission.get(), 3);
    bindText(submission.get(), 4, schemaVersion);
    bindText(submission.get(), 5, input.reportJson);
    bindText(submission.get(), 6, input.clientSubmissionId);
    sqlite3_bind_int64(submission.get(), 7, actor.id);
    if (reviewerId) sqlite3_bind_int64(submission.get(), 8, *reviewerId); else sqlite3_bind_null(submission.get(), 8);
    sqlite3_bind_int(submission.get(), 9, isTest ? 1 : 0);
    bindText(submission.get(), 10, reviewStatus);
    bindText(submission.get(), 11, reportHash);
    bindText(submission.get(), 12, "1.0.0");
    sqlite3_bind_int(submission.get(), 13, initialScore);
    sqlite3_bind_int(submission.get(), 14, rawScore);
    sqlite3_bind_int(submission.get(), 15, std::clamp(rawScore, 0, 100));
    if (sqlite3_step(submission.get()) != SQLITE_DONE) throw std::runtime_error(sqlite3_errmsg(db_));
    const auto submissionId = sqlite3_last_insert_rowid(db_);

    for (const auto& event : events) {
      Statement step(db_, "INSERT INTO submission_steps(submission_id,sequence_number,item_key,"
          "item_type,title,response,pedagogical_classification,pedagogical_comment,dependencies_json,recorded_at) "
          "VALUES(?,?,?,?,?,?,?,?,?,?);" );
      sqlite3_bind_int64(step.get(),1,submissionId); sqlite3_bind_int(step.get(),2,event.sequence);
      bindText(step.get(),3,event.key); bindText(step.get(),4,event.type); bindText(step.get(),5,event.title);
      bindText(step.get(),6,event.answer); bindText(step.get(),7,event.classification); bindText(step.get(),8,event.reason);
      bindText(step.get(),9,event.dependencies); if(event.recordedAt.empty()) sqlite3_bind_null(step.get(),10); else bindText(step.get(),10,event.recordedAt);
      if(sqlite3_step(step.get())!=SQLITE_DONE) throw std::runtime_error(sqlite3_errmsg(db_));
      Statement score(db_, "INSERT INTO submission_score_events(submission_id,sequence_number,item_key,item_type,"
          "classification,rule_set_version,base_points,priority_bonus,efficiency_penalty,delta,raw_total_after,displayed_total_after,recorded_at) "
          "VALUES(?,?,?,?,?,'1.0.0',?,?,?,?,?,?,?);" );
      sqlite3_bind_int64(score.get(),1,submissionId); sqlite3_bind_int(score.get(),2,event.sequence);
      bindText(score.get(),3,event.key); bindText(score.get(),4,event.type); bindText(score.get(),5,event.classification);
      sqlite3_bind_int(score.get(),6,event.base); sqlite3_bind_int(score.get(),7,event.bonus); sqlite3_bind_int(score.get(),8,event.penalty);
      sqlite3_bind_int(score.get(),9,event.delta); sqlite3_bind_int(score.get(),10,event.rawAfter); sqlite3_bind_int(score.get(),11,event.displayedAfter);
      if(event.recordedAt.empty()) sqlite3_bind_null(score.get(),12); else bindText(score.get(),12,event.recordedAt);
      if(sqlite3_step(score.get())!=SQLITE_DONE) throw std::runtime_error(sqlite3_errmsg(db_));
    }

    Statement attempts(db_, "SELECT key,COALESCE(json_extract(value,'$.hypothesis'),''),"
        "COALESCE(json_extract(value,'$.reason'),json_extract(value,'$.justification'),''),"
        "COALESCE(json_extract(value,'$.correct'),''),COALESCE(json_extract(value,'$.actions'),'[]'),"
        "COALESCE(json_extract(value,'$.time'),json_extract(value,'$.attemptedAt')) FROM json_each(?,'$.attempts');" );
    bindText(attempts.get(),1,input.reportJson);
    while(sqlite3_step(attempts.get())==SQLITE_ROW){
      Statement insertAttempt(db_, "INSERT INTO diagnostic_attempts(submission_id,attempt_number,hypothesis_key,hypothesis_label,"
          "justification,comparison_result,evidence_snapshot_json,attempted_at) VALUES(?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP));" );
      sqlite3_bind_int64(insertAttempt.get(),1,submissionId); sqlite3_bind_int(insertAttempt.get(),2,sqlite3_column_int(attempts.get(),0)+1);
      bindText(insertAttempt.get(),3,columnText(attempts.get(),1)); bindText(insertAttempt.get(),4,columnText(attempts.get(),1));
      bindText(insertAttempt.get(),5,columnText(attempts.get(),2)); bindText(insertAttempt.get(),6,columnText(attempts.get(),3));
      bindText(insertAttempt.get(),7,columnText(attempts.get(),4));
      if(columnText(attempts.get(),5).empty()) sqlite3_bind_null(insertAttempt.get(),8); else bindText(insertAttempt.get(),8,columnText(attempts.get(),5));
      if(sqlite3_step(insertAttempt.get())!=SQLITE_DONE) throw std::runtime_error(sqlite3_errmsg(db_));
    }

    Statement document(db_, "INSERT INTO submission_documents(submission_id,original_name,mime_type,sha256,byte_size,pdf_blob) "
        "VALUES(?,?,'application/pdf',?,?,?);" );
    sqlite3_bind_int64(document.get(),1,submissionId); bindText(document.get(),2,input.originalPdfName);
    bindText(document.get(),3,input.pdfSha256); sqlite3_bind_int64(document.get(),4,static_cast<sqlite3_int64>(input.pdfData.size()));
    sqlite3_bind_blob(document.get(),5,input.pdfData.data(),static_cast<int>(input.pdfData.size()),SQLITE_TRANSIENT);
    if(sqlite3_step(document.get())!=SQLITE_DONE) throw std::runtime_error(sqlite3_errmsg(db_));

    Statement audit(db_, "INSERT INTO audit_logs(user_id,action,entity_type,entity_id,metadata_json) "
        "VALUES(?,'submission.finalized','submission',?,json_object('clientSubmissionId',?,'isTest',?,'reviewStatus',?));" );
    sqlite3_bind_int64(audit.get(),1,actor.id); sqlite3_bind_int64(audit.get(),2,submissionId);
    bindText(audit.get(),3,input.clientSubmissionId); sqlite3_bind_int(audit.get(),4,isTest?1:0); bindText(audit.get(),5,reviewStatus);
    if(sqlite3_step(audit.get())!=SQLITE_DONE) throw std::runtime_error(sqlite3_errmsg(db_));

    execute("COMMIT;");
    return {submissionId,true,initialScore,rawScore,std::clamp(rawScore,0,100),reviewStatus};
  } catch (...) {
    try { execute("ROLLBACK;"); } catch (...) {}
    throw;
  }
}

std::optional<SubmissionPdf> Database::getSubmissionPdf(
    std::int64_t id, const SessionUser& user) {
  Statement statement(
      db_, "SELECT d.original_name,d.sha256,d.pdf_blob FROM submissions s "
           "JOIN submission_documents d ON d.submission_id=s.id "
           "WHERE s.id=? AND (?='admin' OR s.student_id=? OR s.reviewer_id=?);" );
  sqlite3_bind_int64(statement.get(),1,id); bindText(statement.get(),2,user.role);
  sqlite3_bind_int64(statement.get(),3,user.id); sqlite3_bind_int64(statement.get(),4,user.id);
  if(sqlite3_step(statement.get())!=SQLITE_ROW) return std::nullopt;
  const auto* blob=static_cast<const char*>(sqlite3_column_blob(statement.get(),2));
  const int bytes=sqlite3_column_bytes(statement.get(),2);
  return SubmissionPdf{columnText(statement.get(),0),columnText(statement.get(),1),
                       blob && bytes>0 ? std::string(blob,static_cast<std::size_t>(bytes)) : std::string{}};
}

std::string Database::listSubmissions(const SessionUser& user) {
  const bool admin = user.role == "admin";
  const bool teacher = user.role == "teacher";
  // Administradores enxergam o conjunto para testar a plataforma. Professores
  // continuam limitados às próprias atividades; alunos veem somente seus dados.
  std::string filter;
  std::vector<std::string> values;
  if (admin) {
    filter = "";
  } else if (teacher) {
    filter = "WHERE (s.reviewer_id=? OR s.imported_by=? OR EXISTS (SELECT 1 FROM activities a "
             "WHERE a.id=s.activity_id AND a.teacher_id=?)) ";
    values = {std::to_string(user.id), std::to_string(user.id), std::to_string(user.id)};
  } else {
    filter = "WHERE s.student_id=? ";
    values = {std::to_string(user.id)};
  }
  return scalarJson(
      db_, "SELECT COALESCE(json_group_array(json_object("
           "'id',id,'studentId',student_id,'studentName',student_name,"
           "'caseTitle',case_title,'submittedAt',submitted_at,"
           "'feedbackStatus',feedback_status,'reviewStatus',review_status,"
           "'isTest',json(is_test),'score',displayed_score)),'[]') FROM ("
           "SELECT s.id,s.student_id,u.full_name student_name,"
           "COALESCE(json_extract(s.raw_report_json,'$.case'),c.title,'Caso importado') "
           "case_title,s.submitted_at,s.review_status,s.is_test,s.displayed_score,"
           "COALESCE(f.status,'pending') feedback_status FROM submissions s "
           "JOIN users u ON u.id=s.student_id "
           "LEFT JOIN case_versions cv ON cv.id=s.case_version_id "
           "LEFT JOIN clinical_cases c ON c.id=cv.clinical_case_id "
           "LEFT JOIN teacher_feedback f ON f.submission_id=s.id " +
           filter + "ORDER BY s.submitted_at DESC);",
      values);
}

std::optional<std::string> Database::getSubmission(std::int64_t id,
                                                    const SessionUser& user) {
  const bool admin = user.role == "admin";
  const bool teacher = user.role == "teacher";
  Statement statement(
      db_, "SELECT CASE WHEN s.raw_report_json IS NOT NULL "
           "THEN json_set(s.raw_report_json,'$.studentId',s.student_id,"
           "'$.studentName',u.full_name,'$.score',json_object("
           "'initial',s.initial_score,'raw',s.raw_score,'displayed',s.displayed_score,"
           "'ruleSetVersion',s.scoring_rule_set_version),"
           "'$.isTest',json(s.is_test),'$.reviewStatus',s.review_status,"
           "'$.scoreEvents',json(COALESCE((SELECT json_group_array(json_object("
           "'sequence',sequence_number,'itemKey',item_key,'classification',classification,"
           "'base',base_points,'bonus',priority_bonus,'efficiencyPenalty',efficiency_penalty,"
           "'delta',delta,'rawAfter',raw_total_after,'displayedAfter',displayed_total_after)) "
           "FROM submission_score_events WHERE submission_id=s.id),'[]'))) ELSE json_object("
           "'id',s.id,'studentId',s.student_id,'studentName',u.full_name,"
           "'submittedAt',s.submitted_at,'steps',json(COALESCE(("
           "SELECT json_group_array(json_object('sequence',sequence_number,"
           "'type',item_type,'title',title,'response',response,"
           "'classification',pedagogical_classification,"
           "'comment',pedagogical_comment,'recordedAt',recorded_at)) "
           "FROM submission_steps WHERE submission_id=s.id),'[]')),"
           "'attempts',json(COALESCE((SELECT json_group_array(json_object("
           "'number',attempt_number,'hypothesis',hypothesis_label,"
           "'justification',justification,'comparison',comparison_result,"
           "'evidence',json(evidence_snapshot_json),'attemptedAt',attempted_at)) "
           "FROM diagnostic_attempts WHERE submission_id=s.id),'[]'))) END "
           "FROM submissions s JOIN users u ON u.id=s.student_id "
           "WHERE s.id=? AND (?=1 OR (?=1 AND (s.reviewer_id=? OR s.imported_by=? OR EXISTS ("
           "SELECT 1 FROM activities a WHERE a.id=s.activity_id "
           "AND a.teacher_id=?))) OR (?=0 AND ?=0 AND s.student_id=?));");
  sqlite3_bind_int64(statement.get(), 1, id);
  sqlite3_bind_int(statement.get(), 2, admin ? 1 : 0);
  sqlite3_bind_int(statement.get(), 3, teacher ? 1 : 0);
  sqlite3_bind_int64(statement.get(), 4, user.id);
  sqlite3_bind_int64(statement.get(), 5, user.id);
  sqlite3_bind_int64(statement.get(), 6, user.id);
  sqlite3_bind_int(statement.get(), 7, teacher ? 1 : 0);
  sqlite3_bind_int(statement.get(), 8, admin ? 1 : 0);
  sqlite3_bind_int64(statement.get(), 9, user.id);
  if (sqlite3_step(statement.get()) != SQLITE_ROW) return std::nullopt;
  return columnText(statement.get(), 0);
}

bool Database::canTeacherReviewSubmission(
    std::int64_t submissionId, std::int64_t teacherId) {
  Statement statement(
      db_, "SELECT EXISTS(SELECT 1 FROM submissions s "
           "LEFT JOIN activities a ON a.id=s.activity_id "
           "WHERE s.id=? AND (EXISTS(SELECT 1 FROM admin_accounts ad "
           "WHERE ad.user_id=?) OR s.reviewer_id=? OR s.imported_by=? OR a.teacher_id=?));");
  sqlite3_bind_int64(statement.get(), 1, submissionId);
  sqlite3_bind_int64(statement.get(), 2, teacherId);
  sqlite3_bind_int64(statement.get(), 3, teacherId);
  sqlite3_bind_int64(statement.get(), 4, teacherId);
  sqlite3_bind_int64(statement.get(), 5, teacherId);
  return sqlite3_step(statement.get()) == SQLITE_ROW &&
         sqlite3_column_int(statement.get(), 0) == 1;
}

bool Database::canTeacherReviewStudent(
    std::int64_t studentId, std::int64_t teacherId) {
  Statement statement(
      db_, "SELECT EXISTS(SELECT 1 FROM submissions s "
           "LEFT JOIN activities a ON a.id=s.activity_id "
           "WHERE s.student_id=? AND (EXISTS(SELECT 1 FROM admin_accounts ad "
           "WHERE ad.user_id=?) OR s.reviewer_id=? OR s.imported_by=? OR a.teacher_id=?));");
  sqlite3_bind_int64(statement.get(), 1, studentId);
  sqlite3_bind_int64(statement.get(), 2, teacherId);
  sqlite3_bind_int64(statement.get(), 3, teacherId);
  sqlite3_bind_int64(statement.get(), 4, teacherId);
  sqlite3_bind_int64(statement.get(), 5, teacherId);
  return sqlite3_step(statement.get()) == SQLITE_ROW &&
         sqlite3_column_int(statement.get(), 0) == 1;
}

std::string Database::listFeedback(std::int64_t studentId,
                                   const SessionUser& user) {
  if (user.role != "teacher" && user.role != "admin" && user.id != studentId) return "[]";
  return scalarJson(
      db_, "SELECT COALESCE(json_group_array(json_object("
           "'id',id,'submissionId',submission_id,'status',status,"
           "'strengths',strengths,'difficulties',difficulties,"
           "'nextAttemptGuidance',next_attempt_guidance,"
           "'generalObservation',general_observation,"
           "'updatedAt',updated_at,'completedAt',completed_at)),'[]') "
           "FROM (SELECT f.* FROM teacher_feedback f JOIN submissions s "
           "ON s.id=f.submission_id WHERE s.student_id=? "
           "ORDER BY f.updated_at DESC);",
      {std::to_string(studentId)});
}

std::int64_t Database::createFeedback(std::int64_t submissionId,
                                      std::int64_t teacherId,
                                      const std::string& jsonBody) {
  Statement statement(
      db_, "INSERT INTO teacher_feedback("
           "submission_id,teacher_id,strengths,difficulties,missed_evidence,"
           "prioritization_comment,justification_comment,next_attempt_guidance,"
           "general_observation) VALUES(?,?,"
           "COALESCE(json_extract(?,'$.strengths'),''),"
           "COALESCE(json_extract(?,'$.difficulties'),''),"
           "COALESCE(json_extract(?,'$.missedEvidence'),''),"
           "COALESCE(json_extract(?,'$.prioritizationComment'),''),"
           "COALESCE(json_extract(?,'$.justificationComment'),''),"
           "COALESCE(json_extract(?,'$.nextAttemptGuidance'),''),"
           "COALESCE(json_extract(?,'$.generalObservation'),'')) "
           "ON CONFLICT(submission_id) DO UPDATE SET "
           "strengths=excluded.strengths,difficulties=excluded.difficulties,"
           "missed_evidence=excluded.missed_evidence,"
           "prioritization_comment=excluded.prioritization_comment,"
           "justification_comment=excluded.justification_comment,"
           "next_attempt_guidance=excluded.next_attempt_guidance,"
           "general_observation=excluded.general_observation,"
           "updated_at=CURRENT_TIMESTAMP WHERE status='draft' "
           "RETURNING id;");
  sqlite3_bind_int64(statement.get(), 1, submissionId);
  sqlite3_bind_int64(statement.get(), 2, teacherId);
  for (int i = 3; i <= 9; ++i) bindText(statement.get(), i, jsonBody);
  if (sqlite3_step(statement.get()) != SQLITE_ROW) {
    throw std::runtime_error(sqlite3_errmsg(db_));
  }
  return sqlite3_column_int64(statement.get(), 0);
}

bool Database::updateFeedback(std::int64_t feedbackId,
                              std::int64_t teacherId,
                              const std::string& jsonBody, bool complete) {
  const char* sql = complete
      ? "UPDATE teacher_feedback SET status='completed',"
        "completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP "
        "WHERE id=? AND teacher_id=? AND status='draft';"
      : "UPDATE teacher_feedback SET "
        "strengths=COALESCE(json_extract(?,'$.strengths'),strengths),"
        "difficulties=COALESCE(json_extract(?,'$.difficulties'),difficulties),"
        "missed_evidence=COALESCE(json_extract(?,'$.missedEvidence'),missed_evidence),"
        "prioritization_comment=COALESCE(json_extract(?,'$.prioritizationComment'),prioritization_comment),"
        "justification_comment=COALESCE(json_extract(?,'$.justificationComment'),justification_comment),"
        "next_attempt_guidance=COALESCE(json_extract(?,'$.nextAttemptGuidance'),next_attempt_guidance),"
        "general_observation=COALESCE(json_extract(?,'$.generalObservation'),general_observation),"
        "updated_at=CURRENT_TIMESTAMP WHERE id=? AND teacher_id=? AND status='draft';";
  Statement statement(db_, sql);
  if (complete) {
    sqlite3_bind_int64(statement.get(), 1, feedbackId);
    sqlite3_bind_int64(statement.get(), 2, teacherId);
  } else {
    for (int i = 1; i <= 7; ++i) bindText(statement.get(), i, jsonBody);
    sqlite3_bind_int64(statement.get(), 8, feedbackId);
    sqlite3_bind_int64(statement.get(), 9, teacherId);
  }
  if (sqlite3_step(statement.get()) != SQLITE_DONE) {
    throw std::runtime_error(sqlite3_errmsg(db_));
  }
  return sqlite3_changes(db_) > 0;
}

}  // namespace devsphere
