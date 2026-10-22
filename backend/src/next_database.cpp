#include "database.hpp"
#include "security.hpp"
#include <algorithm>
#include <fstream>
#include <sqlite3.h>
#include <sstream>
#include <stdexcept>

namespace devsphere {
namespace {
// Cada instrução possui parâmetros vinculados e libera o statement em qualquer
// saída.
class Query {
public:
  sqlite3_stmt *stmt{};
  Query(sqlite3 *db, const std::string &sql,
        const std::vector<std::string> &args = {}) {
    if (sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK)
      throw std::runtime_error(sqlite3_errmsg(db));
    for (std::size_t i = 0; i < args.size(); ++i)
      sqlite3_bind_text(stmt, static_cast<int>(i + 1), args[i].c_str(), -1,
                        SQLITE_TRANSIENT);
  }
  ~Query() { sqlite3_finalize(stmt); }
};
std::string text(sqlite3_stmt *q, int col = 0) {
  auto p = sqlite3_column_text(q, col);
  return p ? reinterpret_cast<const char *>(p) : "";
}
std::string sid(std::int64_t id) { return std::to_string(id); }
void require(bool condition, const char *error) {
  if (!condition)
    throw std::invalid_argument(error);
}
} // namespace
std::string Database::nextJson(const std::string &sql,
                               const std::vector<std::string> &args) {
  Query q(db_, sql, args);
  int rc = sqlite3_step(q.stmt);
  if (rc != SQLITE_ROW)
    throw std::runtime_error(sqlite3_errmsg(db_));
  return text(q.stmt);
}
void Database::nextExec(const std::string &sql,
                        const std::vector<std::string> &args) {
  Query q(db_, sql, args);
  if (sqlite3_step(q.stmt) != SQLITE_DONE)
    throw std::runtime_error(sqlite3_errmsg(db_));
}

// Sementes privadas preservam os casos publicados anteriores sem lhes atribuir
// nova aprovação clínica. Nunca são expostas como arquivos estáticos.
void Database::seedLegacyCases(const std::string &seedFile) {
  std::ifstream in(seedFile);
  if (!in)
    throw std::runtime_error("semente clínica privada ausente: " + seedFile);
  std::string data{std::istreambuf_iterator<char>(in),
                   std::istreambuf_iterator<char>()};
  require(nextJson("SELECT json_valid(?)", {data}) == "1",
          "semente JSON inválida");
  nextExec("BEGIN IMMEDIATE");
  try {
    Query cases(
        db_,
        "SELECT value,json_extract(value,'$.id'),json_extract(value,'$.name') "
        "FROM json_each(?)",
        {data});
    while (sqlite3_step(cases.stmt) == SQLITE_ROW) {
      std::string c = text(cases.stmt), key = text(cases.stmt, 1);
      nextExec("INSERT OR IGNORE INTO clinical_cases(stable_key,title,status) "
               "VALUES(?,?,'published')",
               {key, text(cases.stmt, 2)});
      std::string id =
          nextJson("SELECT id FROM clinical_cases WHERE stable_key=?", {key});
      if (nextJson(
              "SELECT COUNT(*) FROM case_versions WHERE clinical_case_id=?",
              {id}) != "0")
        continue;
      nextExec("INSERT INTO "
               "case_versions(clinical_case_id,version_number,content_json,"
               "metadata_json,review_state,content_sha256) "
               "VALUES(?,1,?,json_extract(?,'$.metadata'),'published',?)",
               {id, c, c, sha256Hex(c)});
      std::string version = sid(sqlite3_last_insert_rowid(db_));
      nextExec("UPDATE clinical_cases SET current_version_id=? WHERE id=?",
               {version, id});
      nextExec("INSERT INTO "
               "case_items(case_version_id,stable_key,item_type,position,title,"
               "answer,pedagogical_classification,pedagogical_comment,"
               "dependencies_json) SELECT "
               "?,json_extract(value,'$.id'),json_extract(value,'$.type'),CAST("
               "key AS "
               "INTEGER)+1,json_extract(value,'$.title'),json_extract(value,'$."
               "answer'),json_extract(value,'$.quality'),json_extract(value,'$."
               "why'),CASE WHEN json_extract(value,'$.parent') IS NULL THEN "
               "'[]' ELSE json_array(json_extract(value,'$.parent')) END FROM "
               "json_each(?,'$.items')",
               {version, c});
      nextExec("INSERT INTO "
               "case_hypotheses(case_version_id,stable_key,label,is_expected,"
               "position) SELECT ?,CAST(key AS "
               "TEXT),value,value=json_extract(?,'$.correctHypothesis'),CAST("
               "key AS INTEGER)+1 FROM json_each(?,'$.hypotheses')",
               {version, c, c});
    }
    nextExec("COMMIT");
  } catch (...) {
    nextExec("ROLLBACK");
    throw;
  }
}

// Só metadados públicos e opções são liberados antes da escolha. Respostas,
// justificativas de correção e o diagnóstico ficam restritos no banco.
std::string Database::publicCase(const std::string &key) {
  std::string result = nextJson(
      R"SQL(SELECT COALESCE((SELECT json_object('id',c.id,'key',c.stable_key,'title',COALESCE(json_extract(v.metadata_json,'$.publicTitle'),c.title),'status',c.status,'versionId',v.id,
 'metadata',json_object('difficulty',json_extract(v.metadata_json,'$.difficulty'),'classificationStatus',json_extract(v.metadata_json,'$.classificationStatus'),'audience',json_extract(v.metadata_json,'$.audience'),'publicSummary',json_extract(v.metadata_json,'$.publicSummary'),'publicTags',json_extract(v.metadata_json,'$.publicTags'),'skills',json_extract(v.metadata_json,'$.skills'),'durationMinutes',json_extract(v.metadata_json,'$.durationMinutes')),'patient',json_object('name',json_extract(v.content_json,'$.patient.name'),'age',json_extract(v.content_json,'$.patient.age'),'initials',json_extract(v.content_json,'$.patient.initials'),'complaint',json_extract(v.content_json,'$.patient.complaint'),'onset',json_extract(v.content_json,'$.patient.onset'),'tags',json_extract(v.metadata_json,'$.publicTags')),'image',CASE c.stable_key WHEN 'joao' THEN '/assets/images/joao-atendimento.png' WHEN 'marina' THEN '/assets/images/marina-atendimento.png' END,
 'choices',json(COALESCE((SELECT json_group_array(json_object('id',json_extract(value,'$.id'),'type',json_extract(value,'$.type'),'title',json_extract(value,'$.title'),'parent',json_extract(value,'$.parent'))) FROM json_each(v.content_json,'$.items')),'[]')),
 'hypotheses',json_extract(v.content_json,'$.hypotheses')) FROM clinical_cases c JOIN case_versions v ON v.id=c.current_version_id
 WHERE c.stable_key=? AND c.status='published' AND v.review_state='published'),'null'))SQL",
      {key});
  require(result != "null", "caso não disponível");
  return result;
}
std::string Database::publicCase(const std::string &key,
                                 const SessionUser &actor) {
  require(
      nextJson(
          "SELECT EXISTS(SELECT 1 FROM clinical_cases c JOIN users u ON "
          "u.institution_id=c.institution_id WHERE c.stable_key=? AND u.id=?)",
          {key, sid(actor.id)}) == "1",
      "caso não disponível nesta instituição");
  return publicCase(key);
}
std::string Database::listCases(const SessionUser &actor) {
  std::string all = listCases(actor.role);
  return nextJson("SELECT COALESCE(json_group_array(json(j.value)),'[]') FROM "
                  "json_each(?) j WHERE EXISTS(SELECT 1 FROM clinical_cases c "
                  "JOIN users u ON u.institution_id=c.institution_id WHERE "
                  "u.id=? AND c.stable_key=json_extract(j.value,'$.key'))",
                  {all, sid(actor.id)});
}
std::string Database::startClinicalSession(const SessionUser &actor,
                                           const std::string &body) {
  require(actor.role == "student" || actor.role == "admin",
          "somente aluno ou administrador inicia prática");
  std::string key =
      nextJson("SELECT COALESCE(json_extract(?,'$.caseKey'),'')", {body});
  std::string pub = publicCase(key, actor);
  std::string version = nextJson("SELECT json_extract(?,'$.versionId')", {pub});
  std::string activity =
      nextJson("SELECT COALESCE(json_extract(?,'$.activityId'),'')", {body});
  if (!activity.empty()) {
    version = nextJson(
        "SELECT COALESCE((SELECT a.case_version_id FROM activities a JOIN "
        "case_versions v ON v.id=a.case_version_id JOIN clinical_cases c ON "
        "c.id=v.clinical_case_id WHERE a.id=? AND c.stable_key=?),'')",
        {activity, key});
    require(!version.empty(), "atividade incompatível com o caso");
    require(
        nextJson("SELECT EXISTS(SELECT 1 FROM activities a JOIN "
                 "activity_assignments aa ON aa.activity_id=a.id WHERE a.id=? "
                 "AND aa.student_id=? AND a.case_version_id=? AND (a.opens_at "
                 "IS NULL OR a.opens_at<=CURRENT_TIMESTAMP) AND (a.closes_at "
                 "IS NULL OR a.closes_at>=CURRENT_TIMESTAMP))",
                 {activity, sid(actor.id), version}) == "1",
        "atividade não atribuída ou encerrada");
    require(
        nextJson("SELECT NOT EXISTS(SELECT 1 FROM case_versions v WHERE v.id=? "
                 "AND (v.created_by=? OR EXISTS(SELECT 1 FROM case_exposures e "
                 "WHERE e.user_id=? AND e.case_version_id=v.id)))",
                 {version, sid(actor.id), sid(actor.id)}) == "1",
        "usuário exposto ao gabarito não realiza avaliação independente");
  }
  require(nextJson("SELECT COUNT(*)<20 FROM clinical_sessions WHERE user_id=? "
                   "AND status='active'",
                   {sid(actor.id)}) == "1",
          "limite de sessões ativas atingido");
  nextExec("INSERT INTO clinical_sessions(user_id,case_version_id,activity_id) "
           "VALUES(?,?,NULLIF(?,''))",
           {sid(actor.id), version, activity});
  return clinicalSession(sqlite3_last_insert_rowid(db_), actor);
}
std::string Database::clinicalSession(std::int64_t id,
                                      const SessionUser &actor) {
  std::string result = nextJson(
      R"SQL(SELECT COALESCE((SELECT json_object('id',s.id,'clinicalSessionId',s.id,'caseKey',c.stable_key,'caseId',c.stable_key,'versionId',v.id,'status',s.status,
 'patient',json_object('name',json_extract(v.content_json,'$.patient.name'),'age',json_extract(v.content_json,'$.patient.age'),'initials',json_extract(v.content_json,'$.patient.initials'),'complaint',json_extract(v.content_json,'$.patient.complaint'),'onset',json_extract(v.content_json,'$.patient.onset'),'tags',json_extract(v.metadata_json,'$.publicTags')),'metadata',json_object('difficulty',json_extract(v.metadata_json,'$.difficulty'),'classificationStatus',json_extract(v.metadata_json,'$.classificationStatus'),'audience',json_extract(v.metadata_json,'$.audience'),'publicSummary',json_extract(v.metadata_json,'$.publicSummary'),'publicTags',json_extract(v.metadata_json,'$.publicTags'),'skills',json_extract(v.metadata_json,'$.skills'),'durationMinutes',json_extract(v.metadata_json,'$.durationMinutes')),
 'choices',json(COALESCE((SELECT json_group_array(json_object('id',json_extract(value,'$.id'),'type',json_extract(value,'$.type'),'title',json_extract(value,'$.title'),'parent',json_extract(value,'$.parent'))) FROM json_each(v.content_json,'$.items')),'[]')),
 'hypotheses',json_extract(v.content_json,'$.hypotheses'),
 'score',json_object('initialScore',50,'rawScore',s.raw_score,'displayedScore',max(0,min(100,s.raw_score)),'initial',50,'raw',s.raw_score,'displayed',max(0,min(100,s.raw_score)),'ruleSetVersion',COALESCE(json_extract(v.content_json,'$.scoring.ruleSetVersion'),'1.0.0'),'events',json(COALESCE((SELECT json_group_array(json_extract(snapshot_json,'$.scoreEvent')) FROM clinical_actions WHERE session_id=s.id ORDER BY sequence_number),'[]'))),
 'path',json(COALESCE((SELECT json_group_array(json(snapshot_json)) FROM (SELECT snapshot_json FROM clinical_actions WHERE session_id=s.id ORDER BY sequence_number)),'[]')),
 'attempts',json(COALESCE((SELECT json_group_array(json_object('hypothesis',hypothesis,'reason',justification,'correct',json(CASE is_correct WHEN 1 THEN 'true' ELSE 'false' END),'actions',json(evidence_json),'time',created_at)) FROM clinical_hypotheses WHERE session_id=s.id ORDER BY id),'[]')))
 FROM clinical_sessions s JOIN case_versions v ON v.id=s.case_version_id JOIN clinical_cases c ON c.id=v.clinical_case_id WHERE s.id=? AND s.user_id=?),'null'))SQL",
      {sid(id), sid(actor.id)});
  require(result != "null", "atendimento não encontrado");
  return result;
}

// A ação é aceita em transação: dependências, duplicidade e pontos são obtidos
// da versão imutável; títulos e respostas enviados pelo cliente são ignorados.
std::string Database::clinicalAction(std::int64_t id, const SessionUser &actor,
                                     const std::string &body) {
  clinicalSession(id, actor);
  nextExec("BEGIN IMMEDIATE");
  try {
    require(nextJson("SELECT status='active' FROM clinical_sessions WHERE id=?",
                     {sid(id)}) == "1",
            "atendimento concluído");
    std::string key =
        nextJson("SELECT COALESCE(json_extract(?,'$.itemKey'),'')", {body});
    require(!key.empty(), "informe itemKey");
    if (nextJson("SELECT EXISTS(SELECT 1 FROM clinical_actions WHERE "
                 "session_id=? AND item_key=?)",
                 {sid(id), key}) == "1") {
      nextExec("COMMIT");
      return clinicalSession(id, actor);
    }
    std::string item =
        nextJson("SELECT COALESCE((SELECT value FROM clinical_sessions s JOIN "
                 "case_versions v ON "
                 "v.id=s.case_version_id,json_each(v.content_json,'$.items') "
                 "WHERE s.id=? AND json_extract(value,'$.id')=?),'null')",
                 {sid(id), key});
    require(item != "null", "item não pertence à versão do caso");
    std::string parent =
        nextJson("SELECT COALESCE(json_extract(?,'$.parent'),'')", {item});
    require(parent.empty() ||
                nextJson("SELECT EXISTS(SELECT 1 FROM clinical_actions WHERE "
                         "session_id=? AND item_key=?)",
                         {sid(id), parent}) == "1",
            "dependência ainda não selecionada");
    std::string rule =
        nextJson("SELECT COALESCE((SELECT value FROM clinical_sessions s JOIN "
                 "case_versions v ON "
                 "v.id=s.case_version_id,json_each(v.content_json,'$.scoring."
                 "items') WHERE s.id=? AND key=?),'null')",
                 {sid(id), key});
    require(rule != "null", "item sem regra de pontuação");
    int sequence = std::stoi(
        nextJson("SELECT COUNT(*)+1 FROM clinical_actions WHERE session_id=?",
                 {sid(id)}));
    int base =
        std::stoi(nextJson("SELECT json_extract(?,'$.basePoints')", {rule}));
    int bonus =
        (sequence <= 3 &&
         nextJson("SELECT COALESCE(json_extract(?,'$.isCentralEvidence'),0)",
                  {rule}) == "1" &&
         nextJson(
             "SELECT COUNT(*) FROM clinical_actions WHERE session_id=? AND "
             "json_extract(snapshot_json,'$.scoreEvent.priorityBonus')>0",
             {sid(id)}) == "0")
            ? 2
            : 0;
    int penalty = sequence >= 21   ? -12
                  : sequence >= 17 ? -8
                  : sequence >= 13 ? -4
                                   : 0;
    const auto scoringVersion =
        nextJson("SELECT "
                 "COALESCE(json_extract(v.content_json,'$.scoring."
                 "ruleSetVersion'),'1.0.0') FROM clinical_sessions s JOIN "
                 "case_versions v ON v.id=s.case_version_id WHERE s.id=?",
                 {sid(id)});
    int delta = base + bonus + penalty;
    int raw =
        std::stoi(nextJson("SELECT raw_score FROM clinical_sessions WHERE id=?",
                           {sid(id)})) +
        delta;
    std::string snapshot = nextJson(
        R"SQL(SELECT json_set(?,'$.step',CAST(? AS INTEGER),'$.time',strftime('%Y-%m-%dT%H:%M:%SZ','now'),'$.scoreEvent',json_object('sequence',CAST(? AS INTEGER),'itemKey',?,'itemType',json_extract(?,'$.type'),'classification',json_extract(?,'$.classification'),'basePoints',CAST(? AS INTEGER),'priorityBonus',CAST(? AS INTEGER),'efficiencyPenalty',CAST(? AS INTEGER),'delta',CAST(? AS INTEGER),'rawTotalAfter',CAST(? AS INTEGER),'displayedTotalAfter',max(0,min(100,CAST(? AS INTEGER))),'ruleSetVersion',?)))SQL",
        {item, sid(sequence), sid(sequence), key, item, rule, sid(base),
         sid(bonus), sid(penalty), sid(delta), sid(raw), sid(raw),
         scoringVersion});
    nextExec("INSERT INTO "
             "clinical_actions(session_id,sequence_number,item_key,snapshot_"
             "json,score_delta,raw_after) VALUES(?,?,?,?,?,?)",
             {sid(id), sid(sequence), key, snapshot, sid(delta), sid(raw)});
    nextExec("UPDATE clinical_sessions SET raw_score=? WHERE id=?",
             {sid(raw), sid(id)});
    nextExec("COMMIT");
    return clinicalSession(id, actor);
  } catch (...) {
    nextExec("ROLLBACK");
    throw;
  }
}
std::string Database::clinicalHypothesis(std::int64_t id,
                                         const SessionUser &actor,
                                         const std::string &body) {
  clinicalSession(id, actor);
  require(nextJson("SELECT status='active' FROM clinical_sessions WHERE id=?",
                   {sid(id)}) == "1",
          "atendimento concluído");
  std::string hypothesis =
      nextJson("SELECT COALESCE(json_extract(?,'$.hypothesis'),'')", {body});
  std::string reason = nextJson(
      "SELECT trim(COALESCE(json_extract(?,'$.justification'),''))", {body});
  require(!reason.empty() && reason.size() <= 10000,
          "justificativa obrigatória com até 10000 caracteres");
  require(nextJson("SELECT EXISTS(SELECT 1 FROM clinical_sessions s JOIN "
                   "case_versions v ON "
                   "v.id=s.case_version_id,json_each(v.content_json,'$."
                   "hypotheses') WHERE s.id=? AND value=?)",
                   {sid(id), hypothesis}) == "1",
          "hipótese inválida");
  require(
      nextJson("SELECT COUNT(*)<10 FROM clinical_hypotheses WHERE session_id=?",
               {sid(id)}) == "1",
      "limite de hipóteses atingido");
  nextExec("INSERT INTO "
           "clinical_hypotheses(session_id,hypothesis,justification,is_correct,"
           "evidence_json) SELECT "
           "?,?,?,json_extract(v.content_json,'$.correctHypothesis')=?,"
           "COALESCE((SELECT json_group_array(item_key) FROM (SELECT item_key "
           "FROM clinical_actions WHERE session_id=s.id ORDER BY "
           "sequence_number)),'[]') FROM clinical_sessions s JOIN "
           "case_versions v ON v.id=s.case_version_id WHERE s.id=?",
           {sid(id), hypothesis, reason, hypothesis, sid(id)});
  return clinicalSession(id, actor);
}

// O relatório/PDF pode ser produzido na interface, mas o histórico oficial deve
// coincidir exatamente com os eventos que o servidor aceitou para o
// proprietário.
void Database::verifyClinicalReport(const SessionUser &actor,
                                    const std::string &report) {
  std::string id = nextJson(
      "SELECT COALESCE(json_extract(?,'$.clinicalSessionId'),'')", {report});
  require(!id.empty(), "clinicalSessionId obrigatório; reinicie o caso para "
                       "registrar ações no servidor");
  std::string snapshot = clinicalSession(std::stoll(id), actor);
  require(
      nextJson("SELECT json_extract(?,'$.caseId')=json_extract(?,'$.caseKey')",
               {report, snapshot}) == "1",
      "caso divergente do atendimento");
  require(
      nextJson(
          "SELECT json_array_length(?,'$.path')=json_array_length(?,'$.path') "
          "AND "
          "json_array_length(?,'$.attempts')=json_array_length(?,'$.attempts')",
          {report, snapshot, report, snapshot}) == "1",
      "histórico diverge dos eventos aceitos");
  require(nextJson("SELECT NOT EXISTS(SELECT 1 FROM json_each(?,'$.path') a "
                   "JOIN json_each(?,'$.path') b ON a.key=b.key WHERE "
                   "json(a.value)<>json(b.value))",
                   {report, snapshot}) == "1",
          "percurso adulterado");
  require(
      nextJson("SELECT NOT EXISTS(SELECT 1 FROM json_each(?,'$.attempts') a "
               "JOIN json_each(?,'$.attempts') b ON a.key=b.key WHERE "
               "COALESCE(json_extract(a.value,'$.hypothesis'),'')<>json_"
               "extract(b.value,'$.hypothesis') OR "
               "COALESCE(json_extract(a.value,'$.reason'),json_extract(a.value,"
               "'$.justification'),'')<>json_extract(b.value,'$.reason') OR "
               "COALESCE(json_extract(a.value,'$.correct'),-1)<>json_extract(b."
               "value,'$.correct') OR "
               "COALESCE(json_extract(a.value,'$.actions'),'[]')<>json_extract("
               "b.value,'$.actions'))",
               {report, snapshot}) == "1",
      "hipóteses adulteradas");
}
std::string Database::notifications(const SessionUser &actor) {
  return nextJson(
      "SELECT "
      "COALESCE(json_group_array(json_object('id',id,'type',kind,'message',"
      "message,'submissionId',submission_id,'readAt',read_at,'createdAt',"
      "created_at)),'[]') FROM (SELECT * FROM user_notifications WHERE "
      "user_id=? ORDER BY id DESC LIMIT 200)",
      {sid(actor.id)});
}
bool Database::readNotification(std::int64_t id, const SessionUser &actor) {
  nextExec(
      "UPDATE user_notifications SET "
      "read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=?",
      {sid(id), sid(actor.id)});
  return sqlite3_changes(db_) > 0;
}

// Autoria e curadoria usam versões separadas; acesso técnico administrativo não
// concede a capacidade clínica de aprovar. O revisor precisa de habilitação e
// atribuição.
std::string Database::listContributions(const SessionUser &actor) {
  if (nextJson("SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND is_active=1)",
               {sid(actor.id)}) != "1")
    return "[]";
  return nextJson(
      R"SQL(SELECT COALESCE(json_group_array(json_object('id',v.id,'caseId',c.id,'key',c.stable_key,'title',COALESCE(json_extract(v.metadata_json,'$.publicTitle'),c.title),'version',v.version_number,'state',v.review_state,'metadata',json(v.metadata_json),'authorId',v.created_by,'reviewerId',r.reviewer_id)),'[]') FROM case_versions v JOIN clinical_cases c ON c.id=v.clinical_case_id LEFT JOIN case_review_assignments r ON r.version_id=v.id WHERE (v.created_by=? OR (r.reviewer_id=? AND EXISTS(SELECT 1 FROM reviewer_areas ra JOIN users reviewer ON reviewer.id=ra.user_id WHERE ra.user_id=r.reviewer_id AND ra.area=json_extract(v.metadata_json,'$.area') AND reviewer.is_active=1 AND reviewer.role='teacher')) OR ?='admin') AND c.institution_id=(SELECT institution_id FROM users WHERE id=?))SQL",
      {sid(actor.id), sid(actor.id), actor.role, sid(actor.id)});
}
std::string Database::getContribution(std::int64_t id,
                                      const SessionUser &actor) {
  require(
      nextJson("SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND is_active=1)",
               {sid(actor.id)}) == "1",
      "conta inativa");
  auto result = nextJson(
      R"SQL(SELECT COALESCE((SELECT json_object('id',v.id,'caseId',c.id,'key',c.stable_key,'title',COALESCE(json_extract(v.metadata_json,'$.publicTitle'),c.title),'version',v.version_number,'state',v.review_state,'metadata',json(v.metadata_json),'content',json(v.content_json),'authorId',v.created_by,'reviewerId',r.reviewer_id) FROM case_versions v JOIN clinical_cases c ON c.id=v.clinical_case_id LEFT JOIN case_review_assignments r ON r.version_id=v.id WHERE v.id=? AND (v.created_by=? OR (r.reviewer_id=? AND EXISTS(SELECT 1 FROM reviewer_areas ra JOIN users reviewer ON reviewer.id=ra.user_id WHERE ra.user_id=r.reviewer_id AND ra.area=json_extract(v.metadata_json,'$.area') AND reviewer.is_active=1 AND reviewer.role='teacher')) OR ?='admin') AND c.institution_id=(SELECT institution_id FROM users WHERE id=?)),'null'))SQL",
      {sid(id), sid(actor.id), sid(actor.id), actor.role, sid(actor.id)});
  require(result != "null", "contribuição não encontrada");
  return result;
}
std::string Database::saveContribution(const SessionUser &actor,
                                       const std::string &body,
                                       std::int64_t caseId) {
  require(
      nextJson("SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND is_active=1)",
               {sid(actor.id)}) == "1",
      "conta inativa");
  std::string content =
      nextJson("SELECT COALESCE(json_extract(?,'$.content'),'null')", {body});
  std::string metadata =
      nextJson("SELECT COALESCE(json_extract(?,'$.metadata'),'{}')", {body});
  std::string key =
      nextJson("SELECT COALESCE(json_extract(?,'$.key'),'')", {body});
  std::string title =
      nextJson("SELECT COALESCE(json_extract(?,'$.title'),'')", {body});
  require(content != "null" && content.size() <= 500000,
          "conteúdo obrigatório de até 500 KB");
  require(nextJson("SELECT json_type(?,'$.items')='array' AND "
                   "json_array_length(?,'$.items')=40 AND (SELECT COUNT(*) "
                   "FROM json_each(?,'$.items') WHERE "
                   "json_extract(value,'$.type')='question')=18 AND (SELECT "
                   "COUNT(*) FROM json_each(?,'$.items') WHERE "
                   "json_extract(value,'$.type')='exam')=22",
                   {content, content, content, content}) == "1",
          "caso exige 18 perguntas e 22 exames");
  require(nextJson("SELECT NOT EXISTS(SELECT 1 FROM json_each(?,'$.items') "
                   "WHERE length(COALESCE(json_extract(value,'$.id'),''))=0 OR "
                   "length(COALESCE(json_extract(value,'$.title'),''))=0 OR "
                   "length(COALESCE(json_extract(value,'$.answer'),''))=0 OR "
                   "length(COALESCE(json_extract(value,'$.why'),''))=0) AND "
                   "(SELECT COUNT(DISTINCT json_extract(value,'$.id')) FROM "
                   "json_each(?,'$.items'))=40",
                   {content, content}) == "1",
          "itens incompletos ou identificadores repetidos");
  require(nextJson("SELECT json_type(?,'$.patient')='object' AND EXISTS(SELECT "
                   "1 FROM json_each(?,'$.hypotheses') WHERE "
                   "value=json_extract(?,'$.correctHypothesis'))",
                   {content, content, content}) == "1",
          "paciente e hipóteses completos são obrigatórios");
  require(
      nextJson("SELECT NOT EXISTS(SELECT 1 FROM json_each(?,'$.items') i WHERE "
               "NOT EXISTS(SELECT 1 FROM json_each(?,'$.scoring.items') r "
               "WHERE r.key=json_extract(i.value,'$.id') AND "
               "json_extract(r.value,'$.classification') IN "
               "('priority','relevant','complementary','low_value','"
               "inappropriate') AND json_extract(r.value,'$.basePoints')=CASE "
               "json_extract(r.value,'$.classification') WHEN 'priority' THEN "
               "5 WHEN 'relevant' THEN 3 WHEN 'complementary' THEN 1 WHEN "
               "'low_value' THEN -8 ELSE -12 END))",
               {content, content}) == "1",
      "regras pedagógicas inválidas ou ausentes");
  require(
      nextJson(
          "SELECT NOT EXISTS(SELECT 1 FROM json_each(?,'$.items') i WHERE "
          "json_extract(i.value,'$.parent') IS NOT NULL AND "
          "(json_extract(i.value,'$.parent')=json_extract(i.value,'$.id') OR "
          "NOT EXISTS(SELECT 1 FROM json_each(?,'$.items') p WHERE "
          "json_extract(p.value,'$.id')=json_extract(i.value,'$.parent'))))",
          {content, content}) == "1",
      "dependências inválidas");
  require(
      nextJson(
          "WITH RECURSIVE edges(id,parent) AS (SELECT "
          "json_extract(value,'$.id'),json_extract(value,'$.parent') FROM "
          "json_each(?,'$.items')), walk(origin,id,depth) AS (SELECT "
          "id,parent,1 FROM edges WHERE parent IS NOT NULL UNION ALL SELECT "
          "walk.origin,edges.parent,depth+1 FROM walk JOIN edges ON "
          "edges.id=walk.id WHERE edges.parent IS NOT NULL AND depth<41) "
          "SELECT NOT EXISTS(SELECT 1 FROM walk WHERE id=origin OR depth>=40)",
          {content}) == "1",
      "ciclo nas dependências");
  // O algoritmo pedagógico v1 tem parâmetros globais fixos; a versão do caso
  // preserva suas classificações e o rótulo de regras durante todo atendimento.
  require(
      nextJson("SELECT "
               "length(COALESCE(json_extract(?,'$.scoring.ruleSetVersion'),'1."
               "0.0')) BETWEEN 1 AND 80 AND "
               "COALESCE(json_extract(?,'$.scoring.initialScore'),50)=50 AND "
               "COALESCE(json_extract(?,'$.scoring.displayMinimum'),0)=0 AND "
               "COALESCE(json_extract(?,'$.scoring.displayMaximum'),100)=100",
               {content, content, content, content}) == "1",
      "parâmetros globais de pontuação incompatíveis com algoritmo v1");
  require(!title.empty() && title.size() <= 200 && metadata.size() < 30000,
          "metadados acima do limite");
  // Rubrica opt-in do MVP: a sugestão não substitui decisão docente nem
  // altera versões legadas que não possuem difficultyAssessment.
  if (nextJson("SELECT json_type(?,'$.difficultyAssessment') IS NOT NULL",
               {metadata}) == "1") {
    require(
        nextJson(
            "SELECT json_type(?,'$.difficultyAssessment')='object' AND "
            "json_extract(?,'$.difficultyAssessment.version')='pv-difficulty-"
            "v1' AND json_extract(?,'$.rubricVersion')='pv-difficulty-v1' AND "
            "json_type(?,'$.difficultyAssessment.scores')='object' AND (SELECT "
            "COUNT(*) FROM json_each(?,'$.difficultyAssessment.scores'))=4 AND "
            "NOT EXISTS(SELECT 1 FROM "
            "json_each(?,'$.difficultyAssessment.scores') WHERE key NOT IN "
            "('clueAmbiguity','evidenceIntegration','competingHypotheses','"
            "prioritization') OR type<>'integer' OR value<0 OR value>2)",
            {metadata, metadata, metadata, metadata, metadata, metadata}) ==
            "1",
        "rubrica de dificuldade inválida; use quatro notas inteiras entre 0 e "
        "2");
    auto suggested =
        nextJson("SELECT CASE WHEN sum(value)<=2 THEN 'introductory' WHEN "
                 "sum(value)<=5 THEN 'intermediate' ELSE 'advanced' END FROM "
                 "json_each(?,'$.difficultyAssessment.scores')",
                 {metadata});
    require(nextJson("SELECT "
                     "COALESCE(json_extract(?,'$.difficultyAssessment."
                     "suggestedLevel'),'')=?",
                     {metadata, suggested}) == "1",
            "sugestão de dificuldade diverge da rubrica");
    require(nextJson("SELECT json_extract(?,'$.difficulty')=? OR "
                     "length(trim(COALESCE(json_extract(?,'$."
                     "difficultyAssessment.overrideReason'),'')))>0",
                     {metadata, suggested, metadata}) == "1",
            "divergência da sugestão exige justificativa docente");
  }
  // Título público também é versionado: editar um rascunho não muda o catálogo
  // nem o PDF de tentativas iniciadas em versões anteriores.
  metadata =
      nextJson("SELECT json_set(?,'$.publicTitle',?)", {metadata, title});
  bool ownTransaction = sqlite3_get_autocommit(db_) != 0;
  if (ownTransaction)
    nextExec("BEGIN IMMEDIATE");
  try {
    if (caseId) {
      require(
          nextJson("SELECT EXISTS(SELECT 1 FROM clinical_cases c WHERE c.id=? "
                   "AND c.institution_id=(SELECT institution_id FROM users "
                   "WHERE id=?) "
                   "AND (c.author_id=? OR ?='admin' OR EXISTS(SELECT 1 FROM "
                   "case_versions v "
                   "JOIN case_review_assignments r ON r.version_id=v.id "
                   "JOIN users reviewer ON reviewer.id=r.reviewer_id AND "
                   "reviewer.is_active=1 AND reviewer.role='teacher' "
                   "JOIN reviewer_areas ra ON ra.user_id=r.reviewer_id AND "
                   "ra.area=json_extract(v.metadata_json,'$.area') "
                   "WHERE v.clinical_case_id=c.id AND r.reviewer_id=?)))",
                   {sid(caseId), sid(actor.id), sid(actor.id), actor.role,
                    sid(actor.id)}) == "1",
          "nova versão exige autoria, atribuição habilitada ou administração "
          "da instituição");
    } else {
      require(!key.empty() && key.size() <= 64 &&
                  std::all_of(key.begin(), key.end(),
                              [](unsigned char c) {
                                return std::isalnum(c) || c == '-' || c == '_';
                              }) &&
                  !title.empty(),
              "key e title obrigatórios");
      nextExec("INSERT INTO "
               "clinical_cases(stable_key,title,author_id,institution_id) "
               "VALUES(?,?,?,(SELECT institution_id FROM users WHERE id=?))",
               {key, title, sid(actor.id), sid(actor.id)});
      caseId = sqlite3_last_insert_rowid(db_);
    }
    nextExec("INSERT INTO "
             "case_versions(clinical_case_id,version_number,content_json,"
             "metadata_json,created_by,content_sha256) SELECT "
             "?,COALESCE(MAX(version_number),0)+1,?,?,?,? FROM case_versions "
             "WHERE clinical_case_id=?",
             {sid(caseId), content, metadata, sid(actor.id), sha256Hex(content),
              sid(caseId)});
    auto id = sqlite3_last_insert_rowid(db_);
    nextExec(
        "INSERT INTO "
        "version_sources(version_id,document_id,source_hash,markdown_hash) "
        "SELECT ?,document_id,source_hash,markdown_hash FROM version_sources "
        "WHERE version_id=(SELECT id FROM case_versions WHERE "
        "clinical_case_id=? AND id<>? ORDER BY version_number DESC LIMIT 1)",
        {sid(id), sid(caseId), sid(id)});
    nextExec(
        "INSERT OR IGNORE INTO case_exposures(user_id,case_version_id,reason) "
        "SELECT user_id,?,'prior_version_exposure' FROM case_exposures WHERE "
        "case_version_id IN (SELECT id FROM case_versions WHERE "
        "clinical_case_id=? AND id<>?)",
        {sid(id), sid(caseId), sid(id)});
    nextExec(
        "INSERT INTO "
        "case_items(case_version_id,stable_key,item_type,position,title,answer,"
        "pedagogical_classification,pedagogical_comment,dependencies_json) "
        "SELECT "
        "?,json_extract(value,'$.id'),json_extract(value,'$.type'),CAST(key AS "
        "INTEGER)+1,json_extract(value,'$.title'),json_extract(value,'$.answer'"
        "),json_extract(value,'$.quality'),json_extract(value,'$.why'),CASE "
        "WHEN json_extract(value,'$.parent') IS NULL THEN '[]' ELSE "
        "json_array(json_extract(value,'$.parent')) END FROM "
        "json_each(?,'$.items')",
        {sid(id), content});
    nextExec("INSERT INTO "
             "case_hypotheses(case_version_id,stable_key,label,is_expected,"
             "position) SELECT ?,CAST(key AS "
             "TEXT),value,value=json_extract(?,'$.correctHypothesis'),CAST(key "
             "AS INTEGER)+1 FROM json_each(?,'$.hypotheses')",
             {sid(id), content, content});
    nextExec("INSERT INTO audit_logs(user_id,action,entity_type,entity_id) "
             "VALUES(?,'case.version.created','case_version',?)",
             {sid(actor.id), sid(id)});
    if (ownTransaction)
      nextExec("COMMIT");
    return getContribution(id, actor);
  } catch (...) {
    if (ownTransaction)
      nextExec("ROLLBACK");
    throw;
  }
}
// Job concluído só pode se tornar rascunho do proprietário. O vínculo é
// gravado na mesma transação e torna novas tentativas idempotentes.
std::string Database::materializeJob(const SessionUser &actor,
                                     const std::string &jobId) {
  nextExec("BEGIN IMMEDIATE");
  try {
    std::string info =
        nextJson("SELECT COALESCE((SELECT "
                 "json_object('contributionId',contribution_id,'body',json_"
                 "extract(result_json,'$.contribution'),'documentId',document_"
                 "id,'provenance',json_extract(result_json,'$.provenance')) "
                 "FROM worker_jobs WHERE id=? AND owner_id=? AND "
                 "operation='generate' AND status='completed' AND "
                 "COALESCE(json_extract(request_json,'$.operation'),'generate')<>'budget'),'null')",
                 {jobId, sid(actor.id)});
    require(info != "null", "geração concluída não encontrada");
    require(
        nextJson("SELECT EXISTS(SELECT 1 FROM source_documents WHERE "
                 "id=json_extract(?,'$.documentId') AND status<>'withdrawn' "
                 "AND authorized_use=1 AND deidentified=1)",
                 {info}) == "1",
        "fonte retirada ou sem autorização impede materialização");
    std::string document =
        nextJson("SELECT json_extract(?,'$.documentId')", {info});
    require(nextJson("SELECT EXISTS(SELECT 1 FROM source_documents d WHERE "
                     "d.id=? AND d.authorized_use=1 AND d.deidentified=1 AND "
                     "d.status IN ('converted','approved') AND "
                     "d.sha256=json_extract(?,'$.provenance.sourceHash') AND "
                     "(d.owner_id=? OR EXISTS(SELECT 1 FROM document_grants g "
                     "WHERE g.document_id=d.id AND g.user_id=?)) AND (SELECT "
                     "institution_id FROM users WHERE id=d.owner_id)=(SELECT "
                     "institution_id FROM users WHERE id=?))",
                     {document, info, sid(actor.id), sid(actor.id),
                      sid(actor.id)}) == "1",
            "fonte ou permissão modificada após geração");
    std::string markdown = nextJson(
        "SELECT markdown FROM source_documents WHERE id=?", {document});
    require(
        nextJson(
            "SELECT COALESCE(json_extract(?,'$.provenance.markdownHash'),'')",
            {info}) == sha256Hex(markdown),
        "extração modificada após geração; gere novamente");
    struct SourceLink {
      std::string id;
      std::string hash;
      std::string markdownHash;
    };
    std::vector<SourceLink> links;
    Query retrieved(db_,
                    "SELECT "
                    "json_extract(value,'$.document_id'),json_extract(value,'$."
                    "sha256'),json_extract(value,'$.markdown_sha256') FROM "
                    "json_each(?,'$.provenance.retrievedSources')",
                    {info});
    while (sqlite3_step(retrieved.stmt) == SQLITE_ROW) {
      SourceLink link{text(retrieved.stmt), text(retrieved.stmt, 1),
                      text(retrieved.stmt, 2)};
      require(
          nextJson(
              "SELECT EXISTS(SELECT 1 FROM source_documents d WHERE d.id=? AND "
              "d.sha256=? AND d.status='approved' AND d.authorized_use=1 AND "
              "d.deidentified=1 AND (d.owner_id=? OR EXISTS(SELECT 1 FROM "
              "document_grants g WHERE g.document_id=d.id AND g.user_id=?)) "
              "AND (SELECT institution_id FROM users WHERE "
              "id=d.owner_id)=(SELECT institution_id FROM users WHERE id=?))",
              {link.id, link.hash, sid(actor.id), sid(actor.id),
               sid(actor.id)}) == "1",
          "fonte adicional retirada ou permissão alterada");
      require(!link.markdownHash.empty() &&
                  sha256Hex(nextJson(
                      "SELECT markdown FROM source_documents WHERE id=?",
                      {link.id})) == link.markdownHash,
              "extração de fonte adicional modificada");
      links.push_back(link);
    }
    std::string old = nextJson(
        "SELECT COALESCE(json_extract(?,'$.contributionId'),'')", {info});
    if (!old.empty()) {
      nextExec("COMMIT");
      return getContribution(std::stoll(old), actor);
    }
    std::string body =
        nextJson("SELECT COALESCE(json_extract(?,'$.body'),'null')", {info});
    require(body != "null", "geração sem caso validado");
    // O identificador editorial vem do servidor para impedir colisões/nomes
    // escolhidos no prompt. A identidade e proveniência não vêm da IA.
    body = nextJson("SELECT json_set(?,'$.key',?,'$.metadata.area',(SELECT "
                    "area FROM source_documents WHERE "
                    "id=json_extract(?,'$.documentId')),'$.metadata.sourceId',"
                    "json_extract(?,'$.documentId'))",
                    {body, "generated-" + jobId, info, info});
    std::string result = saveContribution(actor, body);
    std::string version = nextJson("SELECT json_extract(?,'$.id')", {result});
    nextExec("UPDATE worker_jobs SET contribution_id=? WHERE id=?",
             {version, jobId});
    nextExec("INSERT INTO "
             "version_sources(version_id,document_id,source_hash,markdown_hash)"
             " SELECT ?,id,sha256,? FROM source_documents WHERE "
             "id=json_extract(?,'$.documentId')",
             {version, sha256Hex(markdown), info});
    for (const auto &link : links)
      nextExec("INSERT OR IGNORE INTO "
               "version_sources(version_id,document_id,source_hash,markdown_"
               "hash) VALUES(?,?,?,?)",
               {version, link.id, link.hash, link.markdownHash});
    nextExec(
        "INSERT OR IGNORE INTO case_exposures(user_id,case_version_id,reason) "
        "VALUES(?,?,'source_and_generated_answer_seen')",
        {sid(actor.id), version});
    nextExec(
        "INSERT OR IGNORE INTO case_exposures(user_id,case_version_id,reason) "
        "SELECT d.owner_id,vs.version_id,'source_author_exposure' FROM "
        "version_sources vs JOIN source_documents d ON d.id=vs.document_id "
        "WHERE vs.version_id=?",
        {version});
    // Ler a fonte antes da geração também constitui exposição ao caso derivado.
    nextExec(
        "INSERT OR IGNORE INTO case_exposures(user_id,case_version_id,reason) "
        "SELECT sr.user_id,vs.version_id,'source_seen_before_generation' "
        "FROM version_sources vs JOIN source_readers sr ON "
        "sr.document_id=vs.document_id "
        "WHERE vs.version_id=?",
        {version});
    nextExec("COMMIT");
    return result;
  } catch (...) {
    nextExec("ROLLBACK");
    throw;
  }
}
// A habilitação atual pode ser revogada sem remover atribuições históricas
// ou pareceres; todo acesso atribuído consulta a área ativa novamente.
std::string Database::configureReviewer(const SessionUser &actor,
                                        const std::string &body) {
  require(
      actor.role == "admin" &&
          nextJson("SELECT EXISTS(SELECT 1 FROM users u JOIN admin_accounts a "
                   "ON a.user_id=u.id WHERE u.id=? AND u.is_active=1)",
                   {sid(actor.id)}) == "1",
      "somente administrador ativo configura revisores");
  require(nextJson("SELECT json_type(?,'$.enabled') IS NULL OR "
                   "json_type(?,'$.enabled') IN ('true','false')",
                   {body, body}) == "1",
          "enabled deve ser um booleano JSON");
  bool enabled =
      nextJson("SELECT COALESCE(json_extract(?,'$.enabled'),1)", {body}) == "1";
  auto uid = nextJson("SELECT COALESCE(json_extract(?,'$.userId'),'')", {body});
  auto area =
      nextJson("SELECT trim(COALESCE(json_extract(?,'$.area'),''))", {body});
  auto reason =
      nextJson("SELECT trim(COALESCE(json_extract(?,'$.reason'),''))", {body});
  require(!area.empty() && area.size() <= 120 && reason.size() <= 2000,
          "área ou motivo inválido");
  require(
      nextJson("SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND "
               "role='teacher' AND (?='0' OR is_active=1) AND "
               "institution_id=(SELECT institution_id FROM users WHERE id=?))",
               {uid, enabled ? "1" : "0", sid(actor.id)}) == "1",
      "revisor deve ser professor da instituição e estar ativo para "
      "habilitação");
  nextExec("BEGIN IMMEDIATE");
  try {
    if (enabled)
      nextExec("INSERT INTO reviewer_areas(user_id,area,enabled_by) "
               "VALUES(?,?,?) ON CONFLICT(user_id,area) DO NOTHING",
               {uid, area, sid(actor.id)});
    else
      nextExec("DELETE FROM reviewer_areas WHERE user_id=? AND area=?",
               {uid, area});
    nextExec("INSERT INTO "
             "audit_logs(user_id,action,entity_type,entity_id,metadata_json) "
             "VALUES(?,?,'user',?,json_object('area',?,'reason',?))",
             {sid(actor.id), enabled ? "reviewer.enabled" : "reviewer.revoked",
              uid, area, reason});
    nextExec("COMMIT");
    return enabled ? "{\"ok\":true,\"enabled\":true}"
                   : "{\"ok\":true,\"enabled\":false}";
  } catch (...) {
    nextExec("ROLLBACK");
    throw;
  }
}
// A substituição conserva os pareceres do antecessor e exige motivo explícito.
std::string Database::assignReviewer(const SessionUser &actor,
                                     const std::string &body) {
  require(
      actor.role == "admin" &&
          nextJson("SELECT EXISTS(SELECT 1 FROM users u JOIN admin_accounts a "
                   "ON a.user_id=u.id WHERE u.id=? AND u.is_active=1)",
                   {sid(actor.id)}) == "1",
      "somente administrador ativo atribui revisão");
  auto vid =
      nextJson("SELECT COALESCE(json_extract(?,'$.versionId'),'')", {body});
  auto reviewer =
      nextJson("SELECT COALESCE(json_extract(?,'$.reviewerId'),'')", {body});
  auto reason =
      nextJson("SELECT trim(COALESCE(json_extract(?,'$.reason'),''))", {body});
  require(reason.size() <= 2000, "motivo acima do limite");
  nextExec("BEGIN IMMEDIATE");
  try {
    require(
        nextJson(
            "SELECT EXISTS(SELECT 1 FROM case_versions v JOIN reviewer_areas "
            "ra ON ra.area=json_extract(v.metadata_json,'$.area') JOIN users u "
            "ON u.id=ra.user_id WHERE v.id=? AND ra.user_id=? AND "
            "u.is_active=1 AND u.role='teacher' AND u.institution_id=(SELECT "
            "institution_id FROM users WHERE id=?) AND "
            "u.institution_id=(SELECT institution_id FROM clinical_cases WHERE "
            "id=v.clinical_case_id) AND v.review_state IN "
            "('draft','awaiting_review','in_review','changes_requested'))",
            {vid, reviewer, sid(actor.id)}) == "1",
        "revisor não habilitado para área/estado");
    auto previous = nextJson("SELECT COALESCE((SELECT reviewer_id FROM "
                             "case_review_assignments WHERE version_id=?),'')",
                             {vid});
    require(previous.empty() || previous == reviewer || !reason.empty(),
            "substituição de revisor exige motivo");
    nextExec("INSERT INTO "
             "case_review_assignments(version_id,reviewer_id,assigned_by) "
             "VALUES(?,?,?) ON CONFLICT(version_id) DO UPDATE SET "
             "reviewer_id=excluded.reviewer_id,assigned_by=excluded.assigned_"
             "by,assigned_at=CURRENT_TIMESTAMP",
             {vid, reviewer, sid(actor.id)});
    nextExec("INSERT INTO "
             "audit_logs(user_id,action,entity_type,entity_id,metadata_json) "
             "VALUES(?,'case.reviewer.assigned','case_version',?,json_object('"
             "previousReviewerId',NULLIF(?,''),'reviewerId',?,'reason',?))",
             {sid(actor.id), vid, previous, reviewer, reason});
    nextExec("COMMIT");
    return "{\"ok\":true}";
  } catch (...) {
    nextExec("ROLLBACK");
    throw;
  }
}
std::string Database::reviewerAreas(const SessionUser &actor) {
  require(
      actor.role == "admin" &&
          nextJson("SELECT EXISTS(SELECT 1 FROM users u JOIN admin_accounts a "
                   "ON a.user_id=u.id WHERE u.id=? AND u.is_active=1)",
                   {sid(actor.id)}) == "1",
      "somente administrador ativo consulta habilitações");
  return nextJson(
      "SELECT "
      "COALESCE(json_group_array(json_object('userId',u.id,'name',u.full_name,'"
      "email',u.email,'area',r.area,'enabledAt',r.enabled_at)),'[]') FROM "
      "reviewer_areas r JOIN users u ON u.id=r.user_id WHERE "
      "u.institution_id=(SELECT institution_id FROM users WHERE id=?) ORDER BY "
      "u.full_name,r.area",
      {sid(actor.id)});
}
std::string Database::reviewAssignments(const SessionUser &actor) {
  require(
      actor.role == "admin" &&
          nextJson("SELECT EXISTS(SELECT 1 FROM users u JOIN admin_accounts a "
                   "ON a.user_id=u.id WHERE u.id=? AND u.is_active=1)",
                   {sid(actor.id)}) == "1",
      "somente administrador ativo consulta atribuições");
  return nextJson(
      "SELECT "
      "COALESCE(json_group_array(json_object('versionId',v.id,'caseId',c.id,'"
      "title',COALESCE(json_extract(v.metadata_json,'$.publicTitle'),c.title),'"
      "state',v.review_state,'area',json_extract(v.metadata_json,'$.area'),'"
      "reviewerId',u.id,'reviewerName',u.full_name,'reviewerEnabled',json(CASE "
      "WHEN u.is_active=1 AND u.role='teacher' AND EXISTS(SELECT 1 FROM "
      "reviewer_areas ra WHERE ra.user_id=u.id AND "
      "ra.area=json_extract(v.metadata_json,'$.area')) THEN 'true' ELSE "
      "'false' END),'assignedAt',r.assigned_at)),'[]') FROM "
      "case_review_assignments r JOIN users u ON u.id=r.reviewer_id JOIN "
      "case_versions v ON v.id=r.version_id JOIN clinical_cases c ON "
      "c.id=v.clinical_case_id WHERE c.institution_id=(SELECT institution_id "
      "FROM users WHERE id=?)",
      {sid(actor.id)});
}
std::string Database::reviewCase(std::int64_t versionId,
                                 const SessionUser &actor,
                                 const std::string &body) {
  getContribution(versionId, actor);
  std::string action =
      nextJson("SELECT COALESCE(json_extract(?,'$.action'),'')", {body});
  std::string note =
      nextJson("SELECT trim(COALESCE(json_extract(?,'$.note'),''))", {body});
  std::string id = sid(versionId);
  std::string state =
      nextJson("SELECT review_state FROM case_versions WHERE id=?", {id});
  bool owner = nextJson("SELECT created_by=? FROM case_versions WHERE id=?",
                        {sid(actor.id), id}) == "1";
  bool assigned =
      actor.role == "teacher" &&
      nextJson("SELECT EXISTS(SELECT 1 FROM case_review_assignments r JOIN "
               "case_versions v ON v.id=r.version_id JOIN reviewer_areas a ON "
               "a.user_id=r.reviewer_id AND "
               "a.area=json_extract(v.metadata_json,'$.area') JOIN users "
               "reviewer ON reviewer.id=r.reviewer_id AND reviewer.is_active=1 "
               "AND reviewer.role='teacher' WHERE "
               "r.version_id=? AND r.reviewer_id=?)",
               {id, sid(actor.id)}) == "1";
  std::string target;
  if (action == "submit") {
    require(owner && (state == "draft" || state == "changes_requested"),
            "envio de revisão não permitido");
    target = "awaiting_review";
  } else {
    require(assigned, "revisão exige professor habilitado e atribuído");
    if (action == "approve" || action == "publish") {
      Query sources(
          db_,
          "SELECT "
          "d.status,d.authorized_use,d.deidentified,d.sha256,d.markdown,vs."
          "source_hash,vs.markdown_hash FROM version_sources vs JOIN "
          "source_documents d ON d.id=vs.document_id WHERE vs.version_id=?",
          {id});
      while (sqlite3_step(sources.stmt) == SQLITE_ROW) {
        require(text(sources.stmt) == "approved" &&
                    sqlite3_column_int(sources.stmt, 1) == 1 &&
                    sqlite3_column_int(sources.stmt, 2) == 1,
                "fontes exigem aprovação docente antes do caso");
        require(text(sources.stmt, 3) == text(sources.stmt, 5) &&
                    sha256Hex(text(sources.stmt, 4)) == text(sources.stmt, 6),
                "fonte revisada após geração; nova geração necessária");
      }
    }
    if (action == "start") {
      require(state == "awaiting_review", "transição inválida");
      target = "in_review";
    } else if (action == "approve") {
      require(state == "in_review", "aprovação exige revisão em andamento");
      require(!owner || nextJson("SELECT allow_self_approval FROM "
                                 "curation_policy WHERE singleton_id=1") == "1",
              "autoaprovação desabilitada pela política");
      require(nextJson(
                  "SELECT json_extract(metadata_json,'$.difficulty') IN "
                  "('introductory','intermediate','advanced') AND "
                  "length(COALESCE(json_extract(metadata_json,'$.audience'),'')"
                  ")>0 AND "
                  "length(COALESCE(json_extract(metadata_json,'$."
                  "difficultyRationale'),''))>0 AND "
                  "length(COALESCE(json_extract(metadata_json,'$.rubricVersion'"
                  "),''))>0 AND json_extract(metadata_json,'$.tagsReviewed')=1 "
                  "AND json_type(metadata_json,'$.publicTags')='array' AND "
                  "length(COALESCE(json_extract(metadata_json,'$.publicSummary'"
                  "),''))>0 FROM case_versions WHERE id=?",
                  {id}) == "1",
              "revisar dificuldade, público, rubrica e tags antes de aprovar");
      require(!note.empty(), "parecer clínico obrigatório");
      target = "approved";
    } else if (action == "publish") {
      require(state == "approved", "publicação exige aprovação");
      target = "published";
    } else if (action == "request_changes") {
      require(state == "in_review" && !note.empty(),
              "ajuste exige revisão e parecer");
      target = "changes_requested";
    } else if (action == "reject") {
      require((state == "in_review" || state == "awaiting_review") &&
                  !note.empty(),
              "recusa exige parecer");
      target = "rejected";
    } else if (action == "archive") {
      require(state == "published" || state == "approved",
              "arquivamento inválido");
      target = "archived";
    } else
      throw std::invalid_argument("ação de revisão desconhecida");
  }
  nextExec("BEGIN IMMEDIATE");
  try {
    nextExec(
        "UPDATE case_versions SET review_state=?,reviewed_by=CASE WHEN "
        "?='approved' THEN ? ELSE reviewed_by END,reviewed_at=CASE WHEN "
        "?='approved' THEN CURRENT_TIMESTAMP ELSE reviewed_at END WHERE id=?",
        {target, target, sid(actor.id), target, id});
    if (target == "published")
      nextExec("UPDATE clinical_cases SET "
               "current_version_id=?,status='published',updated_at=CURRENT_"
               "TIMESTAMP WHERE id=(SELECT clinical_case_id FROM case_versions "
               "WHERE id=?)",
               {id, id});
    if (target == "archived")
      nextExec("UPDATE clinical_cases SET "
               "status='archived',updated_at=CURRENT_TIMESTAMP WHERE "
               "current_version_id=?",
               {id});
    nextExec(
        "INSERT INTO "
        "case_review_decisions(version_id,reviewer_id,decision,note,content_"
        "sha256) SELECT ?,?,?,?,content_sha256 FROM case_versions WHERE id=?",
        {id, sid(actor.id), target, note, id});
    nextExec("INSERT INTO "
             "audit_logs(user_id,action,entity_type,entity_id,metadata_json) "
             "VALUES(?,'case.review.transition','case_version',?,json_object('"
             "from',?,'to',?))",
             {sid(actor.id), id, state, target});
    nextExec("COMMIT");
    return nextJson("SELECT json_object('id',id,'state',review_state) FROM "
                    "case_versions WHERE id=?",
                    {id});
  } catch (...) {
    nextExec("ROLLBACK");
    throw;
  }
}
} // namespace devsphere
