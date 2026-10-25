#include "database.hpp"
#include "security.hpp"

#include <sqlite3.h>

#include <filesystem>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
void expect(bool condition, const char *message) {
  if (!condition)
    throw std::runtime_error(message);
}

void executeSql(const std::filesystem::path &path, const char *sql) {
  sqlite3 *connection = nullptr;
  if (sqlite3_open(path.string().c_str(), &connection) != SQLITE_OK) {
    throw std::runtime_error("não foi possível abrir o banco de teste");
  }
  char *error = nullptr;
  const int result = sqlite3_exec(connection, sql, nullptr, nullptr, &error);
  const std::string message = error ? error : "";
  sqlite3_free(error);
  sqlite3_close(connection);
  if (result != SQLITE_OK)
    throw std::runtime_error(message);
}
} // namespace

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
      database.createUser("Professor Dois", "prof2@exemplo.com", hash,
                          "teacher");

      const auto student = database.findUserByEmail("ALUNO@EXEMPLO.COM");
      const auto teacherOne = database.findUserByEmail("prof1@exemplo.com");
      const auto teacherTwo = database.findUserByEmail("prof2@exemplo.com");
      expect(student.has_value(), "usuário persistido");
      expect(student->role == "student", "papel persistido");
      expect(teacherOne.has_value() && teacherTwo.has_value(),
             "professores persistidos");

      database.createSession(student->id, devsphere::sha256Hex("token"),
                             "+1 hour");
      const auto session = database.findSession(devsphere::sha256Hex("token"));
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

      database.seedLegacyCases("seeds/legacy-cases.json");
      // Constrói relatórios somente a partir de eventos aceitos pela API do
      // banco.
      const auto serverReport = [&](const devsphere::SessionUser &actor,
                                    const std::string &caseKey,
                                    const std::vector<std::string> &actions,
                                    const std::string &base) {
        auto snapshot = database.startClinicalSession(
            actor, "{\"caseKey\":\"" + caseKey + "\"}");
        auto sessionId = std::stoll(
            database.nextJson("SELECT json_extract(?,'$.id')", {snapshot}));
        for (const auto &key : actions)
          snapshot = database.clinicalAction(sessionId, actor,
                                             "{\"itemKey\":\"" + key + "\"}");
        auto hypothesis = database.nextJson(
            "SELECT json_extract(?,'$.hypotheses[0]')", {snapshot});
        auto hypothesisBody = database.nextJson(
            "SELECT json_object('hypothesis',?,'justification','Justificativa "
            "clínica registrada')",
            {hypothesis});
        snapshot =
            database.clinicalHypothesis(sessionId, actor, hypothesisBody);
        return database.nextJson(
            "SELECT json_set(?,'$.clinicalSessionId',CAST(? AS "
            "INTEGER),'$.path',json_extract(?,'$.path'),'$.attempts',json_"
            "extract(?,'$.attempts'))",
            {base, std::to_string(sessionId), snapshot, snapshot});
      };
      // Finaliza uma tentativa sem confiar na pontuação informada pelo cliente.
      const std::string platformReport = serverReport(
          studentSession, "joao", {"pain", "ecg"},
          R"JSON({"schemaVersion":2,"reportType":"patient-virtual-submission","caseId":"joao","ruleSetVersion":"1.0.0","studentName":"Pessoa Falsa"})JSON");
      const std::string testPdf = "%PDF-1.4\nPDF educacional de teste";
      devsphere::PlatformSubmissionInput platformInput{
          "123e4567-e89b-42d3-a456-426614174000",
          std::nullopt,
          "atendimento.pdf",
          testPdf,
          devsphere::sha256Hex(testPdf),
          platformReport};
      const auto platform =
          database.submitPlatform(studentSession, platformInput);
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
      } catch (const std::invalid_argument &) {
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
      const auto repeated =
          database.submitPlatform(studentSession, platformInput);
      expect(!repeated.created && repeated.id == platform.id,
             "retry idempotente devolve a mesma submissão");
      expect(database.canTeacherReviewSubmission(platform.id, teacherOne->id),
             "revisor padrão recebe submissão livre");
      expect(database.listSubmissions(teacherOneSession)
                     .find(std::to_string(platform.id)) != std::string::npos,
             "submissão automática aparece na fila do revisor");
      expect(!database.canTeacherReviewSubmission(platform.id, teacherTwo->id),
             "submissão livre fica isolada de outro docente");
      expect(database.getSubmissionPdf(platform.id, teacherOneSession)
                     .value_or(devsphere::SubmissionPdf{})
                     .data.rfind("%PDF-", 0) == 0,
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
      } catch (const std::domain_error &) {
        conflict = true;
      }
      expect(conflict, "mesma chave com conteúdo diferente gera conflito");

      const std::string twoCentralReport = serverReport(
          studentSession, "joao", {"vitals", "ecg", "pain"},
          R"JSON({"schemaVersion":2,"reportType":"patient-virtual-submission","caseId":"joao","ruleSetVersion":"1.0.0"})JSON");
      const auto cappedBonus = database.submitPlatform(
          studentSession,
          {"123e4567-e89b-42d3-a456-426614174003", std::nullopt, "bonus.pdf",
           testPdf, devsphere::sha256Hex(testPdf), twoCentralReport});
      expect(cappedBonus.rawScore == 65,
             "bônus agregado de prioridade fica limitado a dois pontos");

      // Percorre todas as faixas do orçamento: 13–16, 17–20 e 21 em diante.
      const std::vector<std::pair<std::string, std::string>> longPath{
          {"pain", "question"},
          {"start", "question"},
          {"vitals", "exam"},
          {"ecg", "exam"},
          {"associated", "question"},
          {"troponin", "exam"},
          {"pleuritic", "question"},
          {"digestive", "question"},
          {"risk", "question"},
          {"meds", "question"},
          {"thrombotic", "question"},
          {"sudden", "question"},
          {"xray", "exam"},
          {"ddimer", "exam"},
          {"cbc", "exam"},
          {"renal", "exam"},
          {"ckmb", "exam"},
          {"coronaryct", "exam"},
          {"echo", "exam"},
          {"cardiac", "exam"},
          {"cough", "question"}};
      std::ostringstream longReport;
      longReport
          << R"JSON({"schemaVersion":2,"reportType":"patient-virtual-submission","caseId":"joao","ruleSetVersion":"1.0.0","path":[)JSON";
      for (std::size_t index = 0; index < longPath.size(); ++index) {
        if (index)
          longReport << ',';
        longReport << "{\"step\":" << index + 1 << ",\"id\":\""
                   << longPath[index].first << "\",\"type\":\""
                   << longPath[index].second
                   << "\",\"title\":\"Item\",\"answer\":\"Resposta\"}";
      }
      longReport
          << R"JSON(],"attempts":[{"hypothesis":"stemi","reason":"Justificativa clínica","actions":[]}]})JSON";
      const auto inefficient = database.submitPlatform(
          studentSession,
          {"123e4567-e89b-42d3-a456-426614174002", std::nullopt,
           "ineficiente.pdf", testPdf, devsphere::sha256Hex(testPdf),
           serverReport(
               studentSession, "joao",
               [&]() {
                 std::vector<std::string> keys;
                 for (const auto &entry : longPath)
                   keys.push_back(entry.first);
                 return keys;
               }(),
               longReport.str())});
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
      const std::string adminReport = serverReport(
          devsphere::SessionUser{admin->id, admin->fullName, admin->email,
                                 admin->role},
          "marina", {"glucose"},
          R"JSON({"schemaVersion":2,"reportType":"patient-virtual-submission","caseId":"marina","ruleSetVersion":"1.0.0"})JSON");
      const std::string adminPdf = "%PDF-1.4\nSimulação administrativa";
      const auto simulation = database.submitPlatform(
          devsphere::SessionUser{admin->id, admin->fullName, admin->email,
                                 admin->role},
          {"123e4567-e89b-42d3-a456-426614174001", std::nullopt,
           "simulacao.pdf", adminPdf, devsphere::sha256Hex(adminPdf),
           adminReport});
      expect(simulation.created &&
                 database.getSubmission(
                             simulation.id,
                             devsphere::SessionUser{admin->id, admin->fullName,
                                                    admin->email, admin->role})
                         .value_or("")
                         .find("\"isTest\":1") != std::string::npos,
             "admin gera simulação identificada sem usar aluno real");
      // NEXT_2026: evidências negativas de autorização e histórico imutável.
      const devsphere::SessionUser adminSession{admin->id, admin->fullName,
                                                admin->email, admin->role};
      database.createUser("Aluno Dois", "aluno2@exemplo.com", hash, "student");
      const auto second = database.findUserByEmail("aluno2@exemplo.com");
      const devsphere::SessionUser secondSession{second->id, second->fullName,
                                                 second->email, second->role};
      auto rejects = [&](const auto &operation) {
        try {
          operation();
          return false;
        } catch (const std::invalid_argument &) {
          return true;
        }
      };
      const auto publicJoao = database.publicCase("joao", studentSession);
      expect(publicJoao.find("correctHypothesis") == std::string::npos &&
                 publicJoao.find("\"answer\"") == std::string::npos,
             "catálogo não antecipa respostas/gabarito");
      auto practice = database.startClinicalSession(studentSession,
                                                    "{\"caseKey\":\"joao\"}");
      const auto practiceId = std::stoll(
          database.nextJson("SELECT json_extract(?,'$.id')", {practice}));
      expect(
          rejects([&] { database.clinicalSession(practiceId, secondSession); }),
          "aluno B não acessa atendimento de A");
      expect(rejects([&] {
               database.clinicalAction(practiceId, studentSession,
                                       "{\"itemKey\":\"radiation\"}");
             }),
             "dependência validada no servidor");
      practice = database.clinicalAction(
          practiceId, studentSession,
          "{\"itemKey\":\"pain\",\"score\":100,\"role\":\"admin\"}");
      expect(database.nextJson("SELECT json_extract(?,'$.score.raw')",
                               {practice}) == "53",
             "score e papel enviados pelo navegador são ignorados");
      expect(database.clinicalAction(practiceId, studentSession,
                                     "{\"itemKey\":\"pain\"}") == practice,
             "ação repetida idempotente");
      expect(rejects([&] {
               database.clinicalAction(practiceId, studentSession,
                                       "{\"itemKey\":\"inventado\"}");
             }),
             "ação desconhecida rejeitada");
      expect(rejects([&] {
               database.clinicalAction(1, studentSession,
                                       "{\"itemKey\":\"vitals\"}");
             }),
             "atendimento concluído não aceita alterações");
      auto tampered = platformInput;
      tampered.reportJson = database.nextJson(
          "SELECT json_set(?,'$.path[0].answer','Resposta forjada')",
          {platformReport});
      expect(
          rejects([&] { database.submitPlatform(studentSession, tampered); }),
          "resposta adulterada rejeitada antes da submissão");
      auto injectedActivity = platformInput;
      injectedActivity.activityId = 1;
      expect(rejects([&] {
               database.submitPlatform(studentSession, injectedActivity);
             }),
             "atividade não pode ser injetada após prática livre");

      const auto feedback = database.createFeedback(
          platform.id, teacherOne->id,
          R"JSON({"strengths":"Ponto forte","difficulties":"Dificuldade","missedEvidence":"Achado ausente","prioritizationComment":"Prioridade","justificationComment":"Argumentação","nextAttemptGuidance":"Orientação","generalObservation":"Comentário"})JSON");
      expect(database.listFeedback(student->id, studentSession) == "[]",
             "rascunho da devolutiva oculto ao aluno");
      expect(database.updateFeedback(feedback, teacherOne->id, "{}", true),
             "docente conclui devolutiva");
      const auto visibleFeedback =
          database.listFeedback(student->id, studentSession);
      expect(visibleFeedback.find("missedEvidence") != std::string::npos &&
                 visibleFeedback.find("justificationComment") !=
                     std::string::npos,
             "devolutiva completa devolvida ao aluno");
      expect(database.listFeedback(student->id, secondSession) == "[]",
             "outro aluno não recebe devolutiva");
      expect(database.listFeedback(student->id, teacherTwoSession) == "[]",
             "docente não atribuído não lê devolutiva");
      auto messages = database.notifications(studentSession);
      const auto notification = std::stoll(
          database.nextJson("SELECT json_extract(?,'$[0].id')", {messages}));
      expect(!database.readNotification(notification, secondSession),
             "notificação protegida por proprietário");
      expect(database.readNotification(notification, studentSession),
             "aluno marca própria notificação como lida");

      // Caso sintético de integração; a aprovação abaixo é fixture de teste,
      // não constitui validação clínica dos casos ou autorização de publicação
      // real.
      auto content = database.nextJson(
          "SELECT content_json FROM case_versions v JOIN clinical_cases c ON "
          "c.id=v.clinical_case_id WHERE c.stable_key='joao' LIMIT 1");
      content = database.nextJson(
          "SELECT json_set(?,'$.scoring.ruleSetVersion','fixture-v2')",
          {content});
      auto metadata =
          R"JSON({"area":"Clínica médica","difficulty":"intermediate","audience":"Teste sintético","difficultyRationale":"Fixture para testar fluxo","rubricVersion":"test-1","tagsReviewed":true,"publicSummary":"Caso sintético de teste","publicTags":["Investigação"]})JSON";
      auto contributionBody = database.nextJson(
          "SELECT json_object('key','third-fixture','title','Fixture sintética "
          "sem uso clínico','content',json(?),'metadata',json(?))",
          {content, metadata});
      const auto legacyCase = std::stoll(database.nextJson(
          "SELECT id FROM clinical_cases WHERE stable_key='joao'"));
      expect(rejects([&] {
               database.saveContribution(secondSession, contributionBody,
                                         legacyCase);
             }),
             "aluno sem autoria não altera legado");
      auto legacyDraft =
          database.saveContribution(adminSession, contributionBody, legacyCase);
      expect(database.nextJson("SELECT json_extract(?,'$.state')",
                               {legacyDraft}) == "draft",
             "admin cria apenas rascunho para classificar legado");
      expect(database.nextJson("SELECT json_extract(?,'$.title')",
                               {legacyDraft}) ==
                 "Fixture sintética sem uso clínico",
             "título novo é versionado");
      expect(database.nextJson("SELECT json_extract(?,'$.title')",
                               {database.publicCase("joao", studentSession)}) !=
                 "Fixture sintética sem uso clínico",
             "rascunho não altera título público antigo");
      auto contribution =
          database.saveContribution(studentSession, contributionBody);
      auto thirdVersion = std::stoll(
          database.nextJson("SELECT json_extract(?,'$.id')", {contribution}));
      auto thirdCase = std::stoll(database.nextJson(
          "SELECT json_extract(?,'$.caseId')", {contribution}));
      expect(rejects(
                 [&] { database.publicCase("third-fixture", studentSession); }),
             "caso não revisado não é público");
      expect(rejects([&] {
               database.reviewCase(thirdVersion, studentSession,
                                   "{\"action\":\"publish\"}");
             }),
             "aluno não publica");
      expect(rejects([&] {
               database.reviewCase(thirdVersion, adminSession,
                                   "{\"action\":\"approve\"}");
             }),
             "admin técnico não aprova conteúdo clínico");
      expect(rejects([&] {
               database.reviewCase(thirdVersion, teacherOneSession,
                                   "{\"action\":\"start\"}");
             }),
             "docente sem atribuição não inicia revisão");
      auto reviewerBody =
          database.nextJson("SELECT json_object('userId',CAST(? AS "
                            "INTEGER),'area','Clínica médica')",
                            {std::to_string(teacherOne->id)});
      database.configureReviewer(adminSession, reviewerBody);
      auto assignmentBody = database.nextJson(
          "SELECT json_object('versionId',CAST(? AS "
          "INTEGER),'reviewerId',CAST(? AS INTEGER))",
          {std::to_string(thirdVersion), std::to_string(teacherOne->id)});
      database.assignReviewer(adminSession, assignmentBody);
      database.reviewCase(thirdVersion, studentSession,
                          "{\"action\":\"submit\"}");
      database.reviewCase(thirdVersion, teacherOneSession,
                          "{\"action\":\"start\"}");
      database.reviewCase(thirdVersion, teacherOneSession,
                          "{\"action\":\"approve\",\"note\":\"Aprovação "
                          "fictícia exclusivamente para teste automatizado\"}");
      database.reviewCase(thirdVersion, teacherOneSession,
                          "{\"action\":\"publish\"}");
      auto thirdPractice = database.startClinicalSession(
          secondSession, "{\"caseKey\":\"third-fixture\"}");
      const auto thirdPracticeId = std::stoll(
          database.nextJson("SELECT json_extract(?,'$.id')", {thirdPractice}));
      auto versionedAction = database.clinicalAction(
          thirdPracticeId, secondSession, "{\"itemKey\":\"pain\"}");
      expect(
          database.nextJson("SELECT json_extract(?,'$.score.ruleSetVersion')",
                            {versionedAction}) == "fixture-v2",
          "sessão usa versão pedagógica do caso");
      expect(database.nextJson(
                 "SELECT json_extract(?,'$.path[0].scoreEvent.ruleSetVersion')",
                 {versionedAction}) == "fixture-v2",
             "evento preserva versão pedagógica");
      auto newVersion = database.saveContribution(studentSession,
                                                  contributionBody, thirdCase);
      expect(database.nextJson(
                 "SELECT json_extract(?,'$.versionId')",
                 {database.clinicalSession(thirdPracticeId, secondSession)}) ==
                 std::to_string(thirdVersion),
             "nova versão não altera tentativa em andamento");
      expect(database.nextJson("SELECT json_array_length(?,'$.choices')",
                               {thirdPractice}) == "40",
             "terceiro caso dinâmico sem alteração de JavaScript");
      bool immutable = false;
      try {
        database.nextExec(
            "UPDATE case_versions SET content_json='{}' WHERE id=?",
            {std::to_string(thirdVersion)});
      } catch (const std::runtime_error &) {
        immutable = true;
      }
      expect(immutable, "versão aprovada não é alterada em lugar");

      // Revogar uma área retira a autoridade corrente, preservando atribuição
      // e pareceres históricos para rastreabilidade e substituição auditada.
      const auto governanceVersion =
          database.nextJson("SELECT json_extract(?,'$.id')", {newVersion});
      auto assignGovernance = [&](std::int64_t reviewer,
                                  const std::string &reason = "") {
        return database.nextJson(
            "SELECT json_object('versionId',CAST(? AS "
            "INTEGER),'reviewerId',CAST(? AS INTEGER),'reason',?)",
            {governanceVersion, std::to_string(reviewer), reason});
      };
      auto areaPayload = [&](std::int64_t reviewer, bool enabled) {
        return database.nextJson(
            "SELECT json_object('userId',CAST(? AS INTEGER),'area','Clínica "
            "médica','enabled',json(?))",
            {std::to_string(reviewer), enabled ? "true" : "false"});
      };
      database.assignReviewer(adminSession, assignGovernance(teacherOne->id));
      database.reviewCase(std::stoll(governanceVersion), studentSession,
                          "{\"action\":\"submit\"}");
      database.reviewCase(std::stoll(governanceVersion), teacherOneSession,
                          "{\"action\":\"start\"}");
      const auto historicDecisions = database.nextJson(
          "SELECT COUNT(*) FROM case_review_decisions WHERE version_id=?",
          {governanceVersion});
      expect(rejects([&] {
               database.configureReviewer(adminSession,
                                          "{\"userId\":2,\"area\":\"Clínica "
                                          "médica\",\"enabled\":\"false\"}");
             }),
             "enabled exige booleano JSON, não texto");
      database.configureReviewer(adminSession,
                                 areaPayload(teacherOne->id, false));
      expect(rejects([&] {
               database.getContribution(std::stoll(governanceVersion),
                                        teacherOneSession);
             }),
             "área revogada bloqueia leitura por atribuição antiga");
      expect(database.nextJson(
                 "SELECT NOT EXISTS(SELECT 1 FROM json_each(?) WHERE "
                 "json_extract(value,'$.id')=CAST(? AS INTEGER))",
                 {database.listContributions(teacherOneSession),
                  governanceVersion}) == "1",
             "área revogada retira atribuição da fila preservando autoria "
             "própria");
      expect(rejects([&] {
               database.reviewCase(
                   std::stoll(governanceVersion), teacherOneSession,
                   "{\"action\":\"approve\",\"note\":\"Não permitido\"}");
             }),
             "docente revogado não decide");
      expect(
          database.nextJson(
              "SELECT COUNT(*) FROM case_review_decisions WHERE version_id=?",
              {governanceVersion}) == historicDecisions,
          "revogação preserva pareceres históricos");
      expect(database.nextJson("SELECT COUNT(*) FROM audit_logs WHERE "
                               "action='reviewer.revoked' AND entity_id=?",
                               {std::to_string(teacherOne->id)}) == "1",
             "revogação auditada");
      expect(
          !database
               .getContribution(std::stoll(governanceVersion), studentSession)
               .empty(),
          "autor mantém acesso ao próprio caso após revogação docente");
      expect(
          !database.getContribution(std::stoll(governanceVersion), adminSession)
               .empty(),
          "admin mantém acesso técnico após revogação");
      database.configureReviewer(adminSession,
                                 areaPayload(teacherTwo->id, true));
      expect(rejects([&] {
               database.assignReviewer(adminSession,
                                       assignGovernance(teacherTwo->id));
             }),
             "substituição de docente exige motivo");
      database.assignReviewer(
          adminSession,
          assignGovernance(teacherTwo->id,
                           "Suplência para continuidade da curadoria"));
      expect(rejects([&] {
               database.getContribution(std::stoll(governanceVersion),
                                        teacherOneSession);
             }),
             "docente anterior não lê após substituição");
      expect(!database
                  .getContribution(std::stoll(governanceVersion),
                                   teacherTwoSession)
                  .empty(),
             "novo docente habilitado assume revisão");
      expect(database.nextJson(
                 "SELECT COUNT(*) FROM audit_logs WHERE "
                 "action='case.reviewer.assigned' AND entity_id=? AND "
                 "json_extract(metadata_json,'$.previousReviewerId')=? AND "
                 "json_extract(metadata_json,'$.reviewerId')=? AND "
                 "length(json_extract(metadata_json,'$.reason'))>0",
                 {governanceVersion, std::to_string(teacherOne->id),
                  std::to_string(teacherTwo->id)}) == "1",
             "substituição registra antecessor, sucessor e motivo");
      expect(database.reviewerAreas(adminSession).find(teacherTwo->email) !=
                 std::string::npos,
             "admin consulta habilitações atuais");
      expect(database.reviewAssignments(adminSession).find("reviewerEnabled") !=
                 std::string::npos,
             "admin consulta estado da atribuição");
      expect(rejects([&] { database.reviewerAreas(teacherTwoSession); }),
             "docente não lista governança administrativa");
      database.nextExec("UPDATE users SET is_active=0 WHERE id=?",
                        {std::to_string(teacherTwo->id)});
      expect(rejects([&] {
               database.getContribution(std::stoll(governanceVersion),
                                        teacherTwoSession);
             }),
             "conta inativa não conserva acesso por atribuição");
      database.nextExec("UPDATE users SET is_active=1 WHERE id=?",
                        {std::to_string(teacherTwo->id)});

      // A rubrica proposta do MVP só é exigida quando a autoria opta por
      // usá-la.
      auto rubricBody = database.nextJson(
          "SELECT "
          "json_set(?,'$.key','rubric-fixture','$.metadata.rubricVersion','pv-"
          "difficulty-v1','$.metadata.difficulty','intermediate','$.metadata."
          "difficultyAssessment',json_object('version','pv-difficulty-v1','"
          "scores',json_object('clueAmbiguity',1,'evidenceIntegration',1,'"
          "competingHypotheses',1,'prioritization',1),'suggestedLevel','"
          "intermediate','overrideReason',''))",
          {contributionBody});
      expect(!database.saveContribution(studentSession, rubricBody).empty(),
             "rubrica opt-in válida permite contribuição");
      auto invalidScore = database.nextJson(
          "SELECT "
          "json_set(?,'$.key','rubric-invalid-score','$.metadata."
          "difficultyAssessment.scores.clueAmbiguity',3)",
          {rubricBody});
      expect(rejects([&] {
               database.saveContribution(studentSession, invalidScore);
             }),
             "rubrica rejeita nota fora de 0 a 2");
      auto wrongSuggestion = database.nextJson(
          "SELECT "
          "json_set(?,'$.key','rubric-invalid-suggestion','$.metadata."
          "difficultyAssessment.suggestedLevel','advanced')",
          {rubricBody});
      expect(rejects([&] {
               database.saveContribution(studentSession, wrongSuggestion);
             }),
             "sugestão deve corresponder à soma da rubrica");
      auto unexplainedOverride =
          database.nextJson("SELECT "
                            "json_set(?,'$.key','rubric-unexplained','$."
                            "metadata.difficulty','advanced')",
                            {rubricBody});
      expect(rejects([&] {
               database.saveContribution(studentSession, unexplainedOverride);
             }),
             "alteração do nível sugerido exige justificativa");
      auto explainedOverride =
          database.nextJson("SELECT "
                            "json_set(?,'$.key','rubric-explained','$.metadata."
                            "difficultyAssessment.overrideReason','Público-"
                            "alvo requer integração adicional')",
                            {unexplainedOverride});
      expect(
          !database.saveContribution(studentSession, explainedOverride).empty(),
          "docente pode divergir com justificativa preservada");

      // Geração concluída materializa somente um rascunho e preserva a fonte.
      database.nextExec("INSERT INTO "
                        "source_documents(id,owner_id,storage_path,original_"
                        "name,sha256,status,authorized_use,deidentified,area) "
                        "VALUES('source-fixture',?,'/isolated/"
                        "source.pdf','source.pdf','source-hash','converted',1,"
                        "1,'Clínica médica')",
                        {std::to_string(student->id)});
      auto generated = database.nextJson(
          "SELECT "
          "json_object('contribution',json(?),'provenance',json_object('"
          "sourceHash','source-hash','markdownHash',?))",
          {contributionBody, devsphere::sha256Hex("")});
      database.nextExec("INSERT INTO "
                        "worker_jobs(id,owner_id,document_id,operation,status,"
                        "result_json,idempotency_key) "
                        "VALUES('fixture-job',?,'source-fixture','generate','"
                        "completed',?,'fixture-generation')",
                        {std::to_string(student->id), generated});
      database.nextExec(
          "INSERT INTO "
          "source_documents(id,owner_id,storage_path,original_name,sha256,"
          "status,authorized_use,deidentified,area,markdown) "
          "VALUES('secondary-owner-fixture',?,'/isolated/"
          "secondary.pdf','secondary.pdf','secondary-hash','approved',1,1,'"
          "Clínica médica','Complemento')",
          {std::to_string(second->id)});
      database.nextExec("INSERT INTO document_grants(document_id,user_id) "
                        "VALUES('secondary-owner-fixture',?)",
                        {std::to_string(student->id)});
      generated = database.nextJson(
          "SELECT "
          "json_set(?,'$.provenance.retrievedSources',json_array(json_object('"
          "document_id','secondary-owner-fixture','page',1,'sha256','secondary-"
          "hash','markdown_sha256',?)))",
          {generated, devsphere::sha256Hex("Complemento")});
      database.nextExec(
          "UPDATE worker_jobs SET result_json=? WHERE id='fixture-job'",
          {generated});
      auto materialized =
          database.materializeJob(studentSession, "fixture-job");
      expect(database.materializeJob(studentSession, "fixture-job") ==
                 materialized,
             "materialização idempotente não duplica versão");
      expect(rejects([&] {
               database.materializeJob(secondSession, "fixture-job");
             }),
             "outro usuário não materializa geração alheia");
      expect(database.nextJson("SELECT json_extract(?,'$.state')",
                               {materialized}) == "draft",
             "resultado IA não é publicado automaticamente");
      expect(
          database.nextJson(
              "SELECT COUNT(*) FROM case_exposures e JOIN version_sources vs "
              "ON vs.version_id=e.case_version_id WHERE "
              "vs.document_id='secondary-owner-fixture' AND e.user_id=?",
              {std::to_string(second->id)}) == "1",
          "autor de fonte RAG secundária recebe exposição sem precisar de GET");
      expect(database.nextJson("SELECT COUNT(*) FROM version_sources WHERE "
                               "document_id='source-fixture'") == "1",
             "fonte vinculada à versão gerada");

      database.nextExec("UPDATE users SET institution_id='other' WHERE id=?",
                        {std::to_string(second->id)});
      expect(database.listCases(secondSession) == "[]",
             "catálogo de outra instituição não é visível");
      expect(rejects([&] { database.publicCase("joao", secondSession); }),
             "caso direto protegido por instituição");
      expect(rejects([&] {
               database.configureReviewer(
                   adminSession,
                   database.nextJson(
                       "SELECT json_object('userId',?,'area','Clínica médica')",
                       {std::to_string(second->id)}));
             }),
             "admin não habilita usuário fora da instituição/papel");

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
  } catch (const std::exception &error) {
    std::cerr << "Falha: " << error.what() << '\n';
    return 1;
  }
}
