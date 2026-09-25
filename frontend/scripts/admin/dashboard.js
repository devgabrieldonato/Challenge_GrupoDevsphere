// Carrega a configuração institucional e permite decidir solicitações pendentes.
import { apiRequest } from "../services/api-client.js";
import { AuthService } from "../services/auth-service.js";

const list = document.querySelector("#requestsList");
const status = document.querySelector("#dashboardStatus");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const roleLabel = (role) => role === "teacher" ? "Professor" : "Aluno";

function renderRequests(requests) {
  document.querySelector("#pendingCount").textContent = String(requests.length);
  if (!requests.length) {
    list.innerHTML = '<div class="empty-state"><h3>Nenhum cadastro pendente</h3><p>Novas solicitações aparecerão aqui.</p></div>';
    return;
  }
  list.innerHTML = requests.map((item) => `
    <article class="registration-item" data-request-id="${item.id}">
      <div>
        <span class="badge">${roleLabel(item.role)}</span>
        <h3>${escapeHtml(item.name)}</h3>
        <p><strong>E-mail:</strong> ${escapeHtml(item.email)}</p>
        ${item.className ? `<p><strong>Turma:</strong> ${escapeHtml(item.className)}</p>` : ""}
        ${item.professionalRegistration ? `<p><strong>Registro:</strong> ${escapeHtml(item.professionalRegistration)}</p>` : ""}
        <p class="hint">Solicitado em ${escapeHtml(item.submittedAt)}</p>
      </div>
      <div class="decision-box">
        <label for="note-${item.id}">Observação ou motivo da recusa</label>
        <textarea id="note-${item.id}" rows="3"></textarea>
        <div class="cluster"><button class="button primary" type="button" data-decision="approve">Aprovar</button><button class="button danger" type="button" data-decision="reject">Recusar</button></div>
      </div>
    </article>`).join("");
}

async function loadDashboard() {
  status.textContent = "";
  try {
    const [session, requests, configuration] = await Promise.all([
      AuthService.session(), apiRequest("/admin/registrations"), apiRequest("/admin/configuration"),
    ]);
    document.querySelector("#adminName").textContent = session.user?.name || "administrador";
    document.querySelector("#queuedCount").textContent = String(configuration.queuedEmails ?? 0);
    document.querySelector("#domainCount").textContent = String(configuration.domains?.length ?? 0);
    document.querySelector("#notificationEmails").textContent = configuration.notificationEmails?.join(", ") || "Nenhum e-mail configurado";
    document.querySelector("#allowedDomains").textContent = configuration.domains?.join(", ") || "Nenhum domínio configurado";
    renderRequests(requests);
  } catch (error) {
    status.className = "status error";
    status.textContent = error.message || "Não foi possível carregar o painel.";
    list.innerHTML = "";
  }
}

list?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-decision]");
  const item = button?.closest("[data-request-id]");
  if (!button || !item) return;
  const decision = button.dataset.decision;
  const note = item.querySelector("textarea").value.trim();
  if (decision === "reject" && note.length < 3) {
    status.className = "status error";
    status.textContent = "Informe o motivo da recusa.";
    item.querySelector("textarea").focus();
    return;
  }
  item.querySelectorAll("button").forEach((control) => { control.disabled = true; });
  status.className = "status";
  status.textContent = decision === "approve" ? "Aprovando cadastro…" : "Registrando recusa…";
  try {
    await apiRequest(`/admin/registrations/${item.dataset.requestId}/${decision}`, { method: "POST", body: JSON.stringify({ note }) });
    status.className = "status success";
    status.textContent = decision === "approve" ? "Cadastro aprovado e acesso liberado." : "Cadastro recusado.";
    await loadDashboard();
  } catch (error) {
    status.className = "status error";
    status.textContent = error.message || "Não foi possível registrar a decisão.";
    item.querySelectorAll("button").forEach((control) => { control.disabled = false; });
  }
});

document.querySelector("#refreshButton")?.addEventListener("click", loadDashboard);
await loadDashboard();
