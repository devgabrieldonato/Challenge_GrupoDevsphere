import { node, button, asList } from '../services/ui.js';
// Carrega a configuração institucional e permite decidir solicitações pendentes.
import {
  apiRequest
} from "../services/api-client.js";
import {
  AuthService
} from "../services/auth-service.js";

const list = document.querySelector("#requestsList");
const status = document.querySelector("#dashboardStatus");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[character]);
const roleLabel = (role) => role === "teacher" ? "Professor" : "Aluno";

function renderRequests(requests) {
  document.querySelector("#pendingCount").textContent = String(requests.length);
  if (!requests.length) {
    list.innerHTML =
      '<div class="empty-state"><h3>Nenhum cadastro pendente</h3><p>Novas solicitações aparecerão aqui.</p></div>';
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
    document.querySelector("#notificationEmails").textContent = configuration.notificationEmails?.join(
      ", ") || "Nenhum e-mail configurado";
    document.querySelector("#allowedDomains").textContent = configuration.domains?.join(", ") ||
      "Nenhum domínio configurado";
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
  item.querySelectorAll("button").forEach((control) => {
    control.disabled = true;
  });
  status.className = "status";
  status.textContent = decision === "approve" ? "Aprovando cadastro…" : "Registrando recusa…";
  try {
    await apiRequest(`/admin/registrations/${item.dataset.requestId}/${decision}`, {
      method: "POST",
      body: JSON.stringify({
        note
      })
    });
    status.className = "status success";
    status.textContent = decision === "approve" ? "Cadastro aprovado e acesso liberado." :
      "Cadastro recusado.";
    await loadDashboard();
  } catch (error) {
    status.className = "status error";
    status.textContent = error.message || "Não foi possível registrar a decisão.";
    item.querySelectorAll("button").forEach((control) => {
      control.disabled = false;
    });
  }
});

document.querySelector("#refreshButton")?.addEventListener("click", loadDashboard);
await loadDashboard();

// Habilitação e atribuição são operações auditadas; não elevam o papel do usuário.
for (const [formId, path, read] of [
    ['reviewerAreaForm', '/admin/reviewer-areas', () => ({
      userId: Number(document.getElementById('reviewerUserId').value),
      area: document.getElementById('reviewerArea').value,
      enabled: document.getElementById('reviewerAreaEnabled').value === 'true'
    })],
    ['reviewerAssignmentForm', '/admin/review-assignments', () => ({
      versionId: Number(document.getElementById('assignmentVersion').value),
      reviewerId: Number(document.getElementById('assignmentReviewer').value),
      reason: document.getElementById('assignmentReason').value.trim()
    })]
  ]) document.getElementById(formId)?.addEventListener('submit', async event => {
  event.preventDefault();
  const status = document.getElementById('reviewerStatus'),
    b = event.submitter;
  b.disabled = true;
  try {
    await apiRequest(path, {
      method: 'POST',
      body: JSON.stringify(read())
    });
    await loadReviewConfiguration();
    status.textContent = formId === 'reviewerAreaForm' && !read().enabled ? 'Habilitação revogada.' :
      'Configuração registrada.';
  } catch (e) {
    status.textContent = e.message;
  } finally {
    b.disabled = false;
  }
});

// Listagens administrativas dão contexto antes da ação; selecionar não revoga nem troca automaticamente.
async function loadReviewConfiguration() {
  const status = document.getElementById('reviewConfigurationStatus');
  status.textContent = 'Carregando habilitações e atribuições…';
  const results = await Promise.allSettled([apiRequest('/admin/reviewer-areas'), apiRequest('/admin/review-assignments')]);
  results.forEach((result, index) => {
    const container = document.getElementById(index === 0 ? 'reviewerAreasList' : 'reviewAssignmentsList'); container.replaceChildren();
    if (result.status === 'rejected') { container.append(node('p', result.reason.message)); return; }
    const records = asList(result.value);
    if (!records.length) container.append(node('p', index === 0 ? 'Nenhuma habilitação registrada.' : 'Nenhuma revisão atribuída.'));
    for (const record of records) {
      const article = node('article', '', 'card');
      if (index === 0) {
        article.append(node('h4', `${record.name} · ${record.area}`), node('p', `${record.email} · ID ${record.userId}`));
        article.append(button('Selecionar para revogar', async () => { document.getElementById('reviewerUserId').value = record.userId; document.getElementById('reviewerArea').value = record.area; document.getElementById('reviewerAreaEnabled').value = 'false'; document.getElementById('reviewerAreaEnabled').focus(); }));
      } else {
        article.append(node('h4', `${record.title} · versão ID ${record.versionId}`), node('p', `${record.reviewerName} · ${record.area} · ${record.state}`));
        if (!record.reviewerEnabled) article.append(node('p', 'A habilitação atual do responsável nessa área foi revogada.'));
        article.append(button('Preparar troca de responsável', async () => { document.getElementById('assignmentVersion').value = record.versionId; document.getElementById('assignmentReviewer').value = record.reviewerId; document.getElementById('assignmentReason').value = ''; document.getElementById('assignmentReason').focus(); }));
      }
      container.append(article);
    }
  });
  status.textContent = results.some(result => result.status === 'rejected') ? 'Algumas informações não foram carregadas. Tente atualizar.' : 'Habilitações e atribuições atualizadas.';
}
document.getElementById('refreshReviewConfiguration').onclick = loadReviewConfiguration;
await loadReviewConfiguration();
