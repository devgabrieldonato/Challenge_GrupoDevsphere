// Carrega sessão, indicadores e atendimentos autorizados para o painel docente.
import { AuthService } from "../services/auth-service.js";
import { CaseService } from "../services/case-service.js";
import { SubmissionService } from "../services/submission-service.js";

const status = document.querySelector("#dashboardStatus");

/** Normaliza respostas paginadas ou listas diretas sem alterar os dados da API. */
function asArray(value) {
  return Array.isArray(value) ? value : value?.items || [];
}

/** Escapa conteúdo vindo da API antes de montar as linhas da tabela. */
function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value);
  return node.innerHTML;
}

/** Lê a marca de simulação nos formatos aceitos durante a evolução do contrato. */
function isTestSubmission(item) {
  return Boolean(item.isTest ?? item.is_test ?? item.report?.isTest ?? item.report?.is_test);
}

/** Obtém a pontuação validada para a visão resumida, sem converter ausência em zero. */
function getDisplayedScore(item) {
  return (typeof item.score === "number" ? item.score : item.score?.displayedTotal) ??
    item.score?.displayed ??
    item.scoring?.displayedTotal ??
    item.scoreSummary?.displayedTotal ??
    item.report?.score?.displayedTotal ??
    item.report?.scoring?.displayedTotal ??
    null;
}

/** Monta uma linha de atendimento com identificação de teste e situação acadêmica. */
function renderSubmissionRow(item) {
  const testBadge = isTestSubmission(item)
    ? '<span class="badge badge-test">Simulação administrativa</span>'
    : "";
  const score = getDisplayedScore(item);
  const scoreLabel = score === null || score === undefined ? "Não disponível" : `${score}/100`;
  const submittedAt = item.submittedAt || item.completedAt || item.createdAt;
  const dateLabel = submittedAt
    ? new Date(submittedAt).toLocaleString("pt-BR")
    : "Não informada";

  return `<tr>
    <td>${escapeHtml(item.studentName || "Aluno não identificado")} ${testBadge}</td>
    <td>${escapeHtml(item.caseTitle || item.caseId || "Caso")}</td>
    <td>${escapeHtml(scoreLabel)}</td>
    <td>${escapeHtml(dateLabel)}</td>
    <td><a class="button" href="teacher-review.html?id=${encodeURIComponent(item.id)}">Revisar</a></td>
  </tr>`;
}

/** Busca em paralelo os dados do painel e torna os envios automáticos revisáveis. */
async function loadDashboard() {
  try {
    const [session, casesResult, submissionsResult] = await Promise.all([
      AuthService.session(),
      CaseService.list(),
      SubmissionService.list(),
    ]);
    if (session.user?.role !== "teacher" && session.user?.role !== "admin") {
      throw Object.assign(new Error("Acesso exclusivo para professores."), { status: 403 });
    }

    const cases = asArray(casesResult);
    const submissions = asArray(submissionsResult);
    document.querySelector("#caseCount").textContent = String(cases.length);
    document.querySelector("#pendingCount").textContent = String(
      submissions.filter((item) => !item.feedbackStatus || item.feedbackStatus === "pending").length,
    );
    document.querySelector("#draftCount").textContent = String(
      submissions.filter((item) => item.feedbackStatus === "draft").length,
    );
    status.className = "status success";
    status.textContent = `Sessão ativa para ${session.user.fullName || "professor"}.`;

    if (submissions.length) {
      const container = document.querySelector("#recentSubmissions");
      container.className = "table-wrap";
      const rows = submissions.slice(0, 8).map(renderSubmissionRow).join("");
      container.innerHTML = `<table>
        <thead><tr><th>Aluno</th><th>Caso</th><th>Pontuação</th><th>Finalizado em</th><th>Ação</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    }
  } catch (error) {
    status.className = error.status === 403 ? "status error" : "status warning";
    status.textContent = error.status === 403
      ? "Sua conta não tem acesso a esta área."
      : "Os dados ainda não estão disponíveis. Verifique se a API está em execução.";
  }
}

// Encerra a sessão no servidor antes de voltar à autenticação docente.
document.querySelector("#logoutButton")?.addEventListener("click", async () => {
  try {
    await AuthService.logout();
  } finally {
    window.location.assign("teacher-login.html");
  }
});
window.addEventListener("session-expired", () => {
  window.location.assign("teacher-login.html?reason=expired");
});
loadDashboard();
