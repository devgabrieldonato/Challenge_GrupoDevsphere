#include "database.hpp"
#include "security.hpp"

#include <sqlite3.h>

#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {
void expect(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}

void executeSql(const std::filesystem::path& path, const char* sql) {
  sqlite3* connection = nullptr;
  if (sqlite3_open(path.string().c_str(), &connection) != SQLITE_OK) {
    throw std::runtime_error("não foi possível abrir o banco de teste");
  }
  char* error = nullptr;
  const int result = sqlite3_exec(connection, sql, nullptr, nullptr, &error);
  const std::string message = error ? error : "";
  sqlite3_free(error);
  sqlite3_close(connection);
  if (result != SQLITE_OK) throw std::runtime_error(message);
}
}  // namespace

int main() {
  try {
    expect(devsphere::normalizeEmail("  ALUNO@EXEMPLO.COM ") ==
               "aluno@exemplo.com",
           "normalização de e-mail");
    expect(devsphere::isValidEmail("aluno@exemplo.com"), "e-mail válido");
    expect(!devsphere::isValidEmail("email-invalido"), "e-mail inválido");

    const auto hash = devsphere::hashPassword("senha-de-teste-123");
    expect(hash.rfind("$argon2id$", 0) == 0, "formato Argon2id");
    expect(devsphere::verifyPassword("senha-de-teste-123", hash),
           "validação da senha");
    expect(!devsphere::verifyPassword("senha-incorreta", hash),
           "rejeição de senha incorreta");

    const auto path =
        std::filesystem::temp_directory_path() / "devsphere-core-test.db";
    std::filesystem::remove(path);
    {
      devsphere::Database database(path.string());
      database.migrate("migrations");
      database.createUser("Aluno Teste", "aluno@exemplo.com", hash, "student");
      database.createUser("Professor Um", "prof1@exemplo.com", hash, "teacher");
      database.createUser("Professor Dois", "prof2@exemplo.com", hash, "teacher");

      const auto student = database.findUserByEmail("ALUNO@EXEMPLO.COM");
      const auto teacherOne = database.findUserByEmail("prof1@exemplo.com");
      const auto teacherTwo = database.findUserByEmail("prof2@exemplo.com");
      expect(student.has_value(), "usuário persistido");
      expect(student->role == "student", "papel persistido");
      expect(teacherOne.has_value() && teacherTwo.has_value(),
             "professores persistidos");

      database.createSession(student->id, devsphere::sha256Hex("token"),
                             "+1 hour");
      const auto session =
          database.findSession(devsphere::sha256Hex("token"));
      expect(session.has_value(), "sessão válida");
      expect(session->id == student->id, "sessão associada ao usuário");
      database.deleteSession(devsphere::sha256Hex("token"));
      expect(!database.findSession(devsphere::sha256Hex("token")),
             "sessão removida");
      expect(database.listCases("student") == "[]", "lista vazia de casos");

      // Monta uma atividade mínima para confirmar o isolamento entre docentes.
      executeSql(
          path,
          "INSERT INTO clinical_cases(id,stable_key,title,status,author_id) "
          "VALUES(1,'caso-teste','Caso teste','published',2);"
          "INSERT INTO case_versions(id,clinical_case_id,version_number,"
          "content_json,created_by) VALUES(1,1,1,'{}',2);"
          "UPDATE clinical_cases SET current_version_id=1 WHERE id=1;"
          "INSERT INTO activities(id,title,case_version_id,teacher_id) "
          "VALUES(1,'Atividade teste',1,2);"
          "INSERT INTO submissions(id,activity_id,student_id,case_version_id) "
          "VALUES(1,1,1,1);");

      expect(database.canTeacherReviewSubmission(1, teacherOne->id),
             "docente responsável acessa atendimento");
      expect(!database.canTeacherReviewSubmission(1, teacherTwo->id),
             "outro docente não acessa atendimento");
      expect(database.canTeacherReviewStudent(student->id, teacherOne->id),
             "docente responsável acessa aluno");
      expect(!database.canTeacherReviewStudent(student->id, teacherTwo->id),
             "outro docente não acessa aluno");

      const devsphere::SessionUser teacherOneSession{
          teacherOne->id, teacherOne->fullName, teacherOne->email,
          teacherOne->role};
      const devsphere::SessionUser teacherTwoSession{
          teacherTwo->id, teacherTwo->fullName, teacherTwo->email,
          teacherTwo->role};
      expect(database.listSubmissions(teacherOneSession).find("\"id\":1") !=
                 std::string::npos,
             "atividade aparece ao docente responsável");
      expect(database.listSubmissions(teacherTwoSession) == "[]",
             "atividade fica oculta de outro docente");

      const std::string importedReport =
          R"JSON({"schemaVersion":1,"reportType":"patient-virtual-submission","caseId":"joao","studentId":"1","path":[],"attempts":[]})JSON";
      const auto importedId = database.importSubmissionPdf(
          teacherOne->id, student->id, "relatorio.pdf", "/tmp/relatorio.pdf",
          "hash-de-teste", 100, importedReport, "1");
      expect(database.canTeacherReviewSubmission(importedId, teacherOne->id),
             "importador acessa relatório");
      expect(!database.canTeacherReviewSubmission(importedId, teacherTwo->id),
             "outro docente não acessa relatório importado");
      expect(database.getSubmission(importedId, teacherOneSession)
                     .value_or("")
                     .find("patient-virtual-submission") != std::string::npos,
             "payload versionado é preservado");


      // Confirma o ciclo institucional completo: domínio, solicitação, decisão
      // administrativa e liberação da conta sem papel admin vindo do navegador.
      database.createAdmin("Admin Teste", "admin@exemplo.com", hash,
                           "secretaria@exemplo.com");
      const auto admin = database.findUserByEmail("admin@exemplo.com");
      expect(admin.has_value() && admin->role == "admin",
             "papel administrativo vem da tabela protegida");
      database.addInstitutionalDomain("faculdade.edu.br");
      expect(database.isInstitutionalEmailAllowed("aluna@faculdade.edu.br"),
             "domínio institucional permitido");
      expect(!database.isInstitutionalEmailAllowed("aluna@email.com"),
             "domínio pessoal recusado");
      const auto registrationId = database.createRegistration(
          "Aluna Pendente", "aluna@faculdade.edu.br", hash, "student",
          "Turma A", "");
      expect(database.listPendingRegistrations().find("Aluna Pendente") !=
                 std::string::npos,
             "solicitação aparece ao administrador");
      expect(database.reviewRegistration(registrationId, admin->id, true,
                                         "Vínculo confirmado"),
             "administrador aprova cadastro");
      const auto approved = database.findUserByEmail("aluna@faculdade.edu.br");
      expect(approved.has_value() && approved->active,
             "conta aprovada fica ativa");
      expect(database.adminConfiguration().find("secretaria@exemplo.com") !=
                 std::string::npos,
             "e-mail da secretaria fica configurado");
    }
    std::filesystem::remove(path);
    std::cout << "Testes do núcleo concluídos.\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "Falha: " << error.what() << '\n';
    return 1;
  }
}

