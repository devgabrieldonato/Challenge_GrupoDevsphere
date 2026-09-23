// Carrega sessão, indicadores e atendimentos autorizados para o painel docente.
import { AuthService } from "../services/auth-service.js";
import { CaseService } from "../services/case-service.js";
import { SubmissionService } from "../services/submission-service.js";
const status = document.querySelector("#dashboardStatus");
function asArray(value) { return Array.isArray(value) ? value : value?.items || []; }
async function loadDashboard() {
  try {
    const [session, casesResult, submissionsResult] = await Promise.all([AuthService.session(), CaseService.list(), SubmissionService.list()]);
    if (session.user?.role !== "teacher" && session.user?.role !== "admin") throw Object.assign(new Error("Acesso exclusivo para professores."), { status: 403 });
    const cases = asArray(casesResult); const submissions = asArray(submissionsResult);
    document.querySelector("#caseCount").textContent = String(cases.length);
    document.querySelector("#pendingCount").textContent = String(submissions.filter((item) => !item.feedbackStatus || item.feedbackStatus === "pending").length);
    document.querySelector("#draftCount").textContent = String(submissions.filter((item) => item.feedbackStatus === "draft").length);
    status.className = "status success"; status.textContent = `Sessão ativa para ${session.user.fullName || "professor"}.`;
    if (submissions.length) {
      const container = document.querySelector("#recentSubmissions"); container.className = "table-wrap";
      const rows = submissions.slice(0, 8).map((item) => `<tr><td>${escapeHtml(item.studentName || "Aluno não identificado")}</td><td>${escapeHtml(item.caseTitle || item.caseId || "Caso")}</td><td><a class="button" href="teacher-review.html?id=${encodeURIComponent(item.id)}">Revisar</a></td></tr>`).join("");
      container.innerHTML = `<table><thead><tr><th>Aluno</th><th>Caso</th><th>Ação</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
  } catch (error) {
    status.className = error.status === 403 ? "status error" : "status warning";
    status.textContent = error.status === 403 ? "Sua conta não tem acesso a esta área." : "Os dados ainda não estão disponíveis. Verifique se a API está em execução.";
  }
}
function escapeHtml(value) { const node = document.createElement("span"); node.textContent = String(value); return node.innerHTML; }
document.querySelector("#logoutButton")?.addEventListener("click", async () => { try { await AuthService.logout(); } finally { window.location.assign("teacher-login.html"); } });
window.addEventListener("session-expired", () => { window.location.assign("teacher-login.html?reason=expired"); });
loadDashboard();
