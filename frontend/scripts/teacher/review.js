// Reconstrói o percurso, a pontuação e as tentativas sem alterar o relatório original.
import { SubmissionService } from "../services/submission-service.js";
import { parsePatientReport } from "../pdf/report-parser.js";

const fileInput = document.querySelector("#reportFile");
const status = document.querySelector("#importStatus");
const content = document.querySelector("#reviewContent");
const viewPdfButton = document.querySelector("#viewPdfButton");
const downloadPdfButton = document.querySelector("#downloadPdfButton");
let activeSubmissionId = null;
let activePdfUrl = null;

/** Adiciona um par termo/descrição em listas semânticas. */
function addDefinition(list, term, description) {
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = term;
  dd.textContent = description ?? "Não informado";
  list.append(dt, dd);
}

/** Converte valores opcionais de pontuação sem confundir ausência com zero. */
function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

/** Converte a resposta persistida pela API para o contrato usado na revisão. */
function normalizeReport(source) {
  const merged = source.report ? { ...source, ...source.report } : source;
  const rawPath = Array.isArray(merged.path) ? merged.path : merged.steps || [];
  const path = rawPath.map((step, index) => ({
    ...step,
    id: step.id || step.itemKey || `step-${step.sequence || index + 1}`,
    type: step.type || step.itemType,
    title: step.title || step.itemTitle || "Ação clínica",
    answer: step.answer ?? step.response,
    quality: step.quality || step.classification || step.classificationLabel,
    why: step.why || step.comment || step.pedagogicalRationale,
    parent: step.parent || step.parentId || null,
    time: step.time || step.recordedAt,
    sequence: step.sequence || step.sequenceNumber || index + 1,
  }));
  const rawAttempts = Array.isArray(merged.attempts) ? merged.attempts : [];
  const attempts = rawAttempts.map((attempt) => ({
    ...attempt,
    hypothesis: attempt.hypothesis,
    reason: attempt.reason ?? attempt.justification,
    result: attempt.result ?? attempt.comparison,
    actions: Array.isArray(attempt.actions) ? attempt.actions : [],
    evidence: Array.isArray(attempt.evidence) ? attempt.evidence : [],
    attemptedAt: attempt.attemptedAt,
  }));
  const score = merged.score || merged.scoring || merged.scoreSummary || null;
  const scoreEvents = merged.scoreEvents || merged.scoringEvents || score?.events || [];

  return {
    ...merged,
    schemaVersion: Number(merged.schemaVersion || 1),
    reportType: merged.reportType || "patient-virtual-submission",
    case: merged.case || merged.caseTitle || "Caso clínico",
    exportedAt: merged.exportedAt || merged.submittedAt || merged.completedAt,
    isTest: Boolean(merged.isTest ?? merged.is_test),
    path,
    attempts,
    score,
    scoreEvents: Array.isArray(scoreEvents) ? scoreEvents : [],
  };
}

/** Localiza o evento auditável ligado a uma etapa clínica. */
function findScoreEvent(report, step, index) {
  return report.scoreEvents.find((event) =>
    event.itemKey === step.id || Number(event.sequence) === Number(step.sequence || index + 1),
  );
}

/** Exibe o percurso e a decomposição de pontos na ordem escolhida. */
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
    const event = findScoreEvent(report, step, index);

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

    if (event) {
      const breakdown = document.createElement("p");
      const base = firstDefined(event.basePoints, event.base, 0);
      const bonus = firstDefined(event.priorityBonus, event.bonus, 0);
      const efficiency = firstDefined(event.efficiencyPenalty, event.penalty, 0);
      const delta = firstDefined(event.delta, base + bonus + efficiency);
      const total = firstDefined(
        event.displayedTotalAfterAction,
        event.displayedAfter,
        event.rawTotalAfterAction,
        event.rawAfter,
      );
      breakdown.className = `score-event ${delta >= 0 ? "score-positive" : "score-negative"}`;
      breakdown.textContent =
        `Valor clínico: ${formatPoints(base)} · Bônus: ${formatPoints(bonus)} · ` +
        `Eficiência: ${formatPoints(efficiency)} · Variação: ${formatPoints(delta)}` +
        (total === undefined ? "" : ` · Total: ${total}`);
      item.append(breakdown);
    }
    pathList.append(item);
  });
}

/** Formata variações com sinal para facilitar a leitura da decomposição. */
function formatPoints(value) {
  const numericValue = Number(value || 0);
  return numericValue > 0 ? `+${numericValue}` : String(numericValue);
}

/** Exibe o resumo validado sem fabricar pontuação em relatórios antigos. */
function renderScore(report) {
  const section = document.querySelector("#scoreSection");
  const total = document.querySelector("#scoreTotal");
  const summaryList = document.querySelector("#scoreSummary");
  const unavailable = document.querySelector("#scoreUnavailable");
  const score = report.score;
  section.hidden = false;
  summaryList.replaceChildren();

  if (!score) {
    total.textContent = "—";
    unavailable.hidden = false;
    return;
  }

  unavailable.hidden = true;
  const authoritativeSummary = report.scoreEvents.length
    ? report.scoreEvents.reduce(
        (result, event) => ({
          gains: result.gains + Math.max(firstDefined(event.basePoints, event.base, 0), 0),
          losses: result.losses + Math.min(firstDefined(event.basePoints, event.base, 0), 0),
          priorityBonus: result.priorityBonus + firstDefined(event.priorityBonus, event.bonus, 0),
          efficiencyPenalties:
            result.efficiencyPenalties +
            firstDefined(event.efficiencyPenalty, event.penalty, 0),
        }),
        { gains: 0, losses: 0, priorityBonus: 0, efficiencyPenalties: 0 },
      )
    : null;
  const summary = authoritativeSummary || score.summary || score;
  const displayedTotal = firstDefined(
    score.displayedTotal,
    score.displayed,
    score.finalScore,
    score.total,
  );
  total.textContent = displayedTotal === undefined ? "—" : `${displayedTotal}/100`;
  addDefinition(
    summaryList,
    "Pontuação inicial",
    firstDefined(score.initialScore, score.initial, report.initialScore),
  );
  addDefinition(
    summaryList,
    "Total bruto",
    firstDefined(score.rawTotal, score.rawScore, score.raw),
  );
  addDefinition(summaryList, "Ganhos", formatPoints(firstDefined(summary.gains, 0)));
  addDefinition(summaryList, "Perdas", formatPoints(firstDefined(summary.losses, 0)));
  addDefinition(summaryList, "Bônus de prioridade", formatPoints(firstDefined(summary.priorityBonus, 0)));
  addDefinition(summaryList, "Penalidades de eficiência", formatPoints(firstDefined(summary.efficiencyPenalties, 0)));
  addDefinition(
    summaryList,
    "Ações selecionadas",
    firstDefined(score.selectedActionCount, report.scoreEvents.length, report.path.length),
  );
  addDefinition(summaryList, "Orçamento recomendado", firstDefined(score.recommendedActionBudget, report.recommendedActionBudget));
  addDefinition(summaryList, "Versão das regras", firstDefined(score.ruleSetVersion, report.ruleSetVersion));
}

/** Relaciona evidências disponíveis a cada tentativa diagnóstica. */
function appendEvidence(list, attempt, report) {
  const allowed = new Set(attempt.actions || []);
  report.path.filter((step) => allowed.has(step.id)).forEach((step) => {
    const item = document.createElement("li");
    item.textContent = `${step.title}: ${step.answer || "sem resposta"}`;
    list.append(item);
  });
  for (const evidence of attempt.evidence || []) {
    const item = document.createElement("li");
    item.textContent = typeof evidence === "string"
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

/** Renderiza hipóteses e justificativas integrais para a devolutiva docente. */
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
    hypothesis.textContent = `Hipótese: ${attempt.hypothesis || "Não informada"}`;
    reason.textContent = `Justificativa integral: ${attempt.reason || "Não informada"}`;
    comparison.textContent =
      `Comparação com o desfecho: ${attempt.result || (typeof attempt.correct === "boolean"
        ? (attempt.correct ? "compatível" : "diferente")
        : "não registrada")}`;
    evidenceTitle.textContent = "Evidências disponíveis naquele momento";
    appendEvidence(evidence, attempt, report);
    article.append(title, hypothesis, reason, comparison, evidenceTitle, evidence);
    attempts.append(article);
  });
}

/** Configura ações de PDF somente para submissões persistidas e autorizadas. */
function configurePdfActions(submissionId) {
  activeSubmissionId = submissionId;
  viewPdfButton.hidden = !submissionId;
  downloadPdfButton.hidden = !submissionId;
}

/** Renderiza uma submissão automática ou um relatório legado normalizado. */
function renderReport(source, submissionId = null, persisted = false) {
  const report = normalizeReport(source);
  const reviewTitle = document.querySelector("#reviewCase");
  reviewTitle.textContent = report.case || report.caseTitle || report.caseId;
  reviewTitle.setAttribute("tabindex", "-1");

  const meta = document.querySelector("#reviewMeta");
  meta.replaceChildren();
  addDefinition(meta, "Aluno", report.studentName || report.studentId);
  addDefinition(meta, "Atividade", report.activityTitle || report.activityId);
  addDefinition(meta, "Finalizado/registrado em", report.exportedAt
    ? new Date(report.exportedAt).toLocaleString("pt-BR")
    : null);
  addDefinition(meta, "Versão do relatório", String(report.schemaVersion));
  addDefinition(meta, "Natureza do atendimento", report.isTest
    ? "Simulação administrativa — excluída das métricas acadêmicas"
    : "Atendimento acadêmico");
  addDefinition(meta, "Totais",
    `${report.path.filter((step) => step.type === "question").length} pergunta(s) e ` +
    `${report.path.filter((step) => step.type === "exam").length} exame(s)`);

  renderScore(report);
  renderPath(report);
  renderAttempts(report);

  const badge = document.querySelector("#persistenceBadge");
  badge.textContent = report.isTest
    ? "Simulação administrativa"
    : (persisted ? "Registrado na plataforma" : "Revisão local");
  badge.classList.toggle("badge-test", report.isTest);
  const feedbackLink = document.querySelector("#feedbackLink");
  if (submissionId) {
    feedbackLink.href = `teacher-feedback.html?id=${encodeURIComponent(submissionId)}`;
    feedbackLink.hidden = false;
  } else {
    feedbackLink.hidden = true;
  }
  configurePdfActions(submissionId);
  content.hidden = false;
  reviewTitle.focus();
}

/** Importa um PDF antigo sem substituir o fluxo automático principal. */
async function importSelectedFile(file) {
  content.hidden = true;
  status.className = "status";
  status.textContent = "Validando relatório legado…";
  try {
    const report = await parsePatientReport(file);
    let submissionId = null;
    let persisted = false;
    try {
      const imported = await SubmissionService.importPdf(file);
      submissionId = imported.id || imported.submissionId || null;
      persisted = Boolean(submissionId);
    } catch {
      // A revisão local permanece disponível quando a persistência legada falha.
    }
    renderReport(report, submissionId, persisted);
    status.className = persisted ? "status success" : "status warning";
    status.textContent = persisted
      ? "Relatório legado validado e registrado na plataforma."
      : "Relatório validado. A revisão está disponível somente nesta página.";
  } catch (error) {
    status.className = "status error";
    status.textContent = error.message || "Não foi possível importar o relatório.";
    fileInput.value = "";
    fileInput.focus();
  }
}

/** Resolve a origem da API também quando o frontend roda no Live Server. */
function getApiBase() {
  const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (isLocalHost && window.location.port === "5501") {
    return `http://${window.location.hostname}:8080/api/v1`;
  }
  return "/api/v1";
}

/** Obtém o PDF protegido com o mesmo cookie de sessão usado pelos serviços. */
async function fetchSubmissionPdf() {
  if (!activeSubmissionId) throw new Error("Atendimento sem PDF associado.");
  const response = await fetch(
    `${getApiBase()}/submissions/${encodeURIComponent(activeSubmissionId)}/pdf`,
    { credentials: "include" },
  );
  if (response.status === 401) window.dispatchEvent(new CustomEvent("session-expired"));
  if (!response.ok) {
    throw new Error(response.status === 404
      ? "PDF não encontrado ou não autorizado."
      : "Não foi possível obter o PDF deste atendimento.");
  }
  const blob = await response.blob();
  if (blob.type && blob.type !== "application/pdf") {
    throw new Error("A API não retornou um PDF válido.");
  }
  return blob;
}

/** Executa visualização ou download e libera URLs temporárias do navegador. */
async function handlePdfAction(download) {
  viewPdfButton.disabled = true;
  downloadPdfButton.disabled = true;
  status.className = "status";
  status.textContent = download ? "Preparando download do PDF…" : "Carregando PDF…";
  try {
    const blob = await fetchSubmissionPdf();
    if (activePdfUrl) URL.revokeObjectURL(activePdfUrl);
    activePdfUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = activePdfUrl;
    if (download) {
      link.download = `atendimento-${activeSubmissionId}.pdf`;
    } else {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    link.click();
    status.className = "status success";
    status.textContent = download ? "Download do PDF iniciado." : "PDF aberto em uma nova guia.";
  } catch (error) {
    status.className = "status error";
    status.textContent = error.message;
  } finally {
    viewPdfButton.disabled = false;
    downloadPdfButton.disabled = false;
  }
}

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) importSelectedFile(fileInput.files[0]);
});
viewPdfButton.addEventListener("click", () => handlePdfAction(false));
downloadPdfButton.addEventListener("click", () => handlePdfAction(true));
window.addEventListener("pagehide", () => {
  if (activePdfUrl) URL.revokeObjectURL(activePdfUrl);
});

// Um identificador na URL abre automaticamente um atendimento autorizado pela API.
const submissionId = new URLSearchParams(window.location.search).get("id");
if (submissionId) {
  status.className = "status";
  status.textContent = "Carregando atendimento…";
  SubmissionService.get(submissionId)
    .then((submission) => {
      renderReport(submission, submissionId, true);
      status.className = "status success";
      status.textContent = "Atendimento automático carregado.";
    })
    .catch((error) => {
      status.className = "status error";
      status.textContent = error.status === 403 || error.status === 404
        ? "Você não tem autorização para este atendimento."
        : "Não foi possível carregar o atendimento.";
    });
} else {
  status.className = "status warning";
  status.textContent = "Selecione um atendimento no painel. A importação abaixo é exclusiva para relatórios legados.";
}
