// Reconstrói o percurso e as tentativas sem alterar o relatório original do aluno.
import { SubmissionService } from "../services/submission-service.js";
import { parsePatientReport } from "../pdf/report-parser.js";

const fileInput = document.querySelector("#reportFile");
const status = document.querySelector("#importStatus");
const content = document.querySelector("#reviewContent");

function addDefinition(list, term, description) {
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = term;
  dd.textContent = description ?? "Não informado";
  list.append(dt, dd);
}

// Converte a resposta persistida pela API para o mesmo contrato usado pelo PDF.
function normalizeReport(source) {
  if (Array.isArray(source.path)) return source;

  const path = (source.steps || []).map((step) => ({
    id: step.id || `step-${step.sequence}`,
    type: step.type,
    title: step.title,
    answer: step.response,
    quality: step.classification,
    why: step.comment,
    parent: step.parent || null,
    time: step.recordedAt,
  }));

  const attempts = (source.attempts || []).map((attempt) => ({
    hypothesis: attempt.hypothesis,
    reason: attempt.justification,
    result: attempt.comparison,
    actions: Array.isArray(attempt.actions) ? attempt.actions : [],
    evidence: Array.isArray(attempt.evidence) ? attempt.evidence : [],
    attemptedAt: attempt.attemptedAt,
  }));

  return {
    ...source,
    schemaVersion: Number(source.schemaVersion || 1),
    reportType: source.reportType || "patient-virtual-submission",
    case: source.case || source.caseTitle || "Caso clínico",
    exportedAt: source.exportedAt || source.submittedAt,
    path,
    attempts,
  };
}

function renderPath(report) {
  const pathList = document.querySelector("#reviewPath");
  pathList.replaceChildren();

  if (!report.path.length) {
    const item = document.createElement("li");
    item.textContent = "Nenhuma pergunta ou exame foi registrado.";
    pathList.append(item);
    return;
  }

  report.path.forEach((step, index) => {
    const item = document.createElement("li");
    const title = document.createElement("h3");
    const response = document.createElement("p");
    const detail = document.createElement("p");
    const comment = document.createElement("p");

    title.textContent = `${index + 1}. ${step.title}`;
    response.textContent = step.answer || "Sem resposta registrada.";
    detail.className = "muted";
    detail.textContent =
      `${step.type === "question" ? "Pergunta" : "Exame"} · ` +
      `${step.time || "horário não informado"}` +
      `${step.quality ? ` · ${step.quality}` : ""}`;
    comment.className = "muted";
    comment.textContent = step.why || "Sem comentário pedagógico registrado.";

    item.append(title, response, detail, comment);
    pathList.append(item);
  });
}

function appendEvidence(list, attempt, report) {
  const allowed = new Set(attempt.actions || []);
  report.path
    .filter((step) => allowed.has(step.id))
    .forEach((step) => {
      const item = document.createElement("li");
      item.textContent = `${step.title}: ${step.answer || "sem resposta"}`;
      list.append(item);
    });

  for (const evidence of attempt.evidence || []) {
    const item = document.createElement("li");
    item.textContent =
      typeof evidence === "string"
        ? evidence
        : `${evidence.title || evidence.id || "Evidência"}: ${evidence.answer || evidence.response || "registrada"}`;
    list.append(item);
  }

  if (!list.children.length) {
    const item = document.createElement("li");
    item.textContent = "Nenhuma evidência registrada antes desta tentativa.";
    list.append(item);
  }
}

function renderAttempts(report) {
  const attempts = document.querySelector("#reviewAttempts");
  attempts.replaceChildren();

  if (!report.attempts.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Nenhuma tentativa diagnóstica foi registrada.";
    attempts.append(empty);
    return;
  }

  report.attempts.forEach((attempt, index) => {
    const article = document.createElement("article");
    article.className = "card attempt";

    const title = document.createElement("h3");
    const hypothesis = document.createElement("p");
    const reason = document.createElement("p");
    const comparison = document.createElement("p");
    const evidenceTitle = document.createElement("strong");
    const evidence = document.createElement("ul");

    title.textContent = `Tentativa ${attempt.number || index + 1}`;
    hypothesis.textContent = `Hipótese: ${attempt.hypothesis}`;
    reason.textContent = `Justificativa integral: ${attempt.reason || "Não informada"}`;
    comparison.textContent =
      `Comparação com o desfecho: ${attempt.result || attempt.comparison || (typeof attempt.correct === "boolean"
        ? (attempt.correct ? "compatível" : "diferente")
        : "não registrada")}`;
    evidenceTitle.textContent = "Evidências disponíveis naquele momento";
    appendEvidence(evidence, attempt, report);

    article.append(title, hypothesis, reason, comparison, evidenceTitle, evidence);
    attempts.append(article);
  });
}

function renderReport(source, submissionId = null, persisted = false) {
  const report = normalizeReport(source);
  const reviewTitle = document.querySelector("#reviewCase");
  reviewTitle.textContent = report.case || report.caseTitle || report.caseId;
  reviewTitle.setAttribute("tabindex", "-1");

  const meta = document.querySelector("#reviewMeta");
  meta.replaceChildren();
  addDefinition(meta, "Aluno", report.studentName || report.studentId);
  addDefinition(meta, "Atividade", report.activityTitle || report.activityId);
  addDefinition(
    meta,
    "Exportado/registrado em",
    report.exportedAt ? new Date(report.exportedAt).toLocaleString("pt-BR") : null,
  );
  addDefinition(meta, "Versão do relatório", String(report.schemaVersion));
  addDefinition(
    meta,
    "Totais",
    `${report.path.filter((step) => step.type === "question").length} pergunta(s) e ` +
      `${report.path.filter((step) => step.type === "exam").length} exame(s)`,
  );

  renderPath(report);
  renderAttempts(report);

  const badge = document.querySelector("#persistenceBadge");
  badge.textContent = persisted ? "Registrado na plataforma" : "Revisão local";
  const feedbackLink = document.querySelector("#feedbackLink");
  if (submissionId) {
    feedbackLink.href = `teacher-feedback.html?id=${encodeURIComponent(submissionId)}`;
    feedbackLink.hidden = false;
  } else {
    feedbackLink.hidden = true;
  }

  content.hidden = false;
  reviewTitle.focus();
}

async function importSelectedFile(file) {
  content.hidden = true;
  status.className = "status";
  status.textContent = "Validando relatório…";

  try {
    const report = await parsePatientReport(file);
    let submissionId = null;
    let persisted = false;

    try {
      const imported = await SubmissionService.importPdf(file);
      submissionId = imported.id || imported.submissionId || null;
      persisted = Boolean(submissionId);
    } catch {
      // A revisão local continua disponível enquanto o endpoint de importação
      // persistente não estiver configurado no backend.
    }

    renderReport(report, submissionId, persisted);
    status.className = persisted ? "status success" : "status warning";
    status.textContent = persisted
      ? "Relatório validado e registrado na plataforma."
      : "Relatório validado. A revisão está disponível nesta página, sem persistência.";
  } catch (error) {
    status.className = "status error";
    status.textContent = error.message || "Não foi possível importar o relatório.";
    fileInput.value = "";
    fileInput.focus();
  }
}

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) importSelectedFile(fileInput.files[0]);
});

// Um identificador na URL abre um atendimento já autorizado pela API.
const submissionId = new URLSearchParams(window.location.search).get("id");
if (submissionId) {
  status.className = "status";
  status.textContent = "Carregando atendimento…";
  SubmissionService.get(submissionId)
    .then((submission) => {
      renderReport(submission.report || submission, submissionId, true);
      status.className = "status success";
      status.textContent = "Atendimento carregado.";
    })
    .catch((error) => {
      status.className = "status error";
      status.textContent =
        error.status === 403 || error.status === 404
          ? "Você não tem autorização para este atendimento."
          : "Não foi possível carregar o atendimento.";
    });
}

