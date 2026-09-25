#include "database.hpp"
#include "security.hpp"

#include <sqlite3.h>

#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <sstream>
#include <vector>
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

      const devsphere::SessionUser studentSession{
          student->id, student->fullName, student->email, student->role};
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

      // Finaliza uma tentativa sem confiar na pontuação informada pelo cliente.
      const std::string platformReport =
          R"JSON({"schemaVersion":2,"reportType":"patient-virtual-submission","caseId":"joao","ruleSetVersion":"1.0.0","case":"João","studentId":"999","studentName":"Pessoa Falsa","path":[{"step":1,"id":"pain","type":"question","title":"Dor","answer":"Resposta"},{"step":2,"id":"ecg","type":"exam","title":"ECG","answer":"Resultado"}],"attempts":[{"hypothesis":"stemi","reason":"Dor e alteração eletrocardiográfica","correct":true,"actions":["pain","ecg"]}]})JSON";
      const std::string testPdf = "%PDF-1.4\nPDF educacional de teste";
      devsphere::PlatformSubmissionInput platformInput{
          "123e4567-e89b-42d3-a456-426614174000", std::nullopt,
          "atendimento.pdf", testPdf, devsphere::sha256Hex(testPdf),
          platformReport};
      const auto platform = database.submitPlatform(studentSession, platformInput);
      expect(platform.created && platform.initialScore == 50,
             "submissão automática criada");
      expect(platform.rawScore == 60 && platform.displayedScore == 60,
             "servidor recalcula pontos e bônus de prioridade");
      bool incompatibleRuleVersion = false;
      try {
        auto incompatible = platformInput;
        incompatible.clientSubmissionId =
            "123e4567-e89b-42d3-a456-426614174009";
        const auto versionPosition = incompatible.reportJson.find("1.0.0");
        incompatible.reportJson.replace(versionPosition, 5, "9.9.9");
        database.submitPlatform(studentSession, incompatible);
      } catch (const std::invalid_argument&) {
        incompatibleRuleVersion = true;
      }
      expect(incompatibleRuleVersion,
             "backend rejeita versão de regra incompatível");
      const std::string serializedPlatform =
          database.getSubmission(platform.id, teacherOneSession).value_or("");
      expect(serializedPlatform.find("1.0.0") != std::string::npos,
             "submissão registra a versão 1.0.0 das regras");
      expect(serializedPlatform.find("\"studentName\":\"Aluno Teste\"") !=
                 std::string::npos &&
                 serializedPlatform.find("Pessoa Falsa") == std::string::npos,
             "identidade exibida vem da sessão e não do relatório");
      const auto repeated = database.submitPlatform(studentSession, platformInput);
      expect(!repeated.created && repeated.id == platform.id,
             "retry idempotente devolve a mesma submissão");
      expect(database.canTeacherReviewSubmission(platform.id, teacherOne->id),
             "revisor padrão recebe submissão livre");
      expect(database.listSubmissions(teacherOneSession).find(
                 std::to_string(platform.id)) != std::string::npos,
             "submissão automática aparece na fila do revisor");
      expect(!database.canTeacherReviewSubmission(platform.id, teacherTwo->id),
             "submissão livre fica isolada de outro docente");
      expect(database.getSubmissionPdf(platform.id, teacherOneSession)
                     .value_or(devsphere::SubmissionPdf{})
                     .data == testPdf,
             "docente responsável lê PDF protegido");
      expect(!database.getSubmissionPdf(platform.id, teacherTwoSession),
             "outro docente não lê PDF protegido");
      expect(database.getSubmission(platform.id, teacherOneSession)
                     .value_or("")
                     .find("\"displayed\":60") != std::string::npos,
             "revisão expõe decomposição autoritativa da pontuação");
      bool conflict = false;
      try {
        auto changed = platformInput;
        changed.pdfData += "alterado";
        changed.pdfSha256 = devsphere::sha256Hex(changed.pdfData);
        database.submitPlatform(studentSession, changed);
      } catch (const std::domain_error&) {
        conflict = true;
      }
      expect(conflict, "mesma chave com conteúdo diferente gera conflito");

      const std::string twoCentralReport =
          R"JSON({"schemaVersion":2,"reportType":"patient-virtual-submission","caseId":"joao","ruleSetVersion":"1.0.0","path":[{"step":1,"id":"vitals","type":"exam"},{"step":2,"id":"ecg","type":"exam"},{"step":3,"id":"pain","type":"question"}],"attempts":[{"hypothesis":"stemi","reason":"Justificativa clínica","actions":["vitals","ecg","pain"]}]})JSON";
      const auto cappedBonus = database.submitPlatform(
          studentSession,
          {"123e4567-e89b-42d3-a456-426614174003", std::nullopt,
           "bonus.pdf", testPdf, devsphere::sha256Hex(testPdf), twoCentralReport});
      expect(cappedBonus.rawScore == 65,
             "bônus agregado de prioridade fica limitado a dois pontos");

      // Percorre todas as faixas do orçamento: 13–16, 17–20 e 21 em diante.
      const std::vector<std::pair<std::string, std::string>> longPath{
          {"pain","question"},{"start","question"},{"vitals","exam"},
          {"ecg","exam"},{"associated","question"},{"troponin","exam"},
          {"pleuritic","question"},{"digestive","question"},{"risk","question"},
          {"meds","question"},{"thrombotic","question"},{"sudden","question"},
          {"xray","exam"},{"ddimer","exam"},{"cbc","exam"},{"renal","exam"},
          {"ckmb","exam"},{"coronaryct","exam"},{"echo","exam"},
          {"cardiac","exam"},{"cough","question"}};
      std::ostringstream longReport;
      longReport << R"JSON({"schemaVersion":2,"reportType":"patient-virtual-submission","caseId":"joao","ruleSetVersion":"1.0.0","path":[)JSON";
      for (std::size_t index = 0; index < longPath.size(); ++index) {
        if (index) longReport << ',';
        longReport << "{\"step\":" << index + 1 << ",\"id\":\""
                   << longPath[index].first << "\",\"type\":\""
                   << longPath[index].second
                   << "\",\"title\":\"Item\",\"answer\":\"Resposta\"}";
      }
      longReport << R"JSON(],"attempts":[{"hypothesis":"stemi","reason":"Justificativa clínica","actions":[]}]})JSON";
      const auto inefficient = database.submitPlatform(
          studentSession,
          {"123e4567-e89b-42d3-a456-426614174002", std::nullopt,
           "ineficiente.pdf", testPdf, devsphere::sha256Hex(testPdf),
           longReport.str()});
      expect(inefficient.rawScore == 14 && inefficient.displayedScore == 14,
             "penalidade progressiva reduz investigação excessiva");

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
      const std::string adminReport =
          R"JSON({"schemaVersion":2,"reportType":"patient-virtual-submission","caseId":"marina","ruleSetVersion":"1.0.0","case":"Marina","path":[{"step":1,"id":"glucose","type":"exam","title":"Glicemia","answer":"Elevada"}],"attempts":[{"hypothesis":"dka","reason":"Hiperglicemia com quadro compatível","actions":["glucose"]}]})JSON";
      const std::string adminPdf = "%PDF-1.4\nSimulação administrativa";
      const auto simulation = database.submitPlatform(
          devsphere::SessionUser{admin->id, admin->fullName, admin->email, admin->role},
          {"123e4567-e89b-42d3-a456-426614174001", std::nullopt,
           "simulacao.pdf", adminPdf, devsphere::sha256Hex(adminPdf), adminReport});
      expect(simulation.created &&
                 database.getSubmission(
                     simulation.id,
                     devsphere::SessionUser{admin->id, admin->fullName,
                                            admin->email, admin->role})
                         .value_or("")
                         .find("\"isTest\":1") != std::string::npos,
             "admin gera simulação identificada sem usar aluno real");
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

