import {
  apiRequest
} from '../services/api-client.js';
import {
  AuthService
} from '../services/auth-service.js';
import {
  node,
  asList,
  message,
  button,
  field
} from '../services/ui.js';
const status = document.getElementById('historyStatus');
let pdfUrl;
// PDFs são obtidos com cookies de sessão; nenhum arquivo privado recebe URL pública permanente.
async function downloadPdf(id) {
  try {
    const host = location.port === '5501' ? `http://${location.hostname}:8080` : '';
    const response = await fetch(`${host}/api/v1/submissions/${encodeURIComponent(id)}/pdf`, {
      credentials: 'include'
    });
    if (!response.ok) throw Error('PDF indisponível ou acesso não autorizado.');
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(await response.blob());
    const a = node('a', 'Baixar');
    a.href = pdfUrl;
    a.download = `atendimento-${id}.pdf`;
    a.click();
  } catch (e) {
    message(status, e.message, true);
  }
}
window.addEventListener('pagehide', () => {
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
});
// Cada coleção é carregada independentemente, para que uma falha não esconda as demais.
async function load() {
  message(status, 'Carregando seu histórico…');
  try {
    const session = await AuthService.session();
    const user = session.user;
    const outcomes = await Promise.allSettled([apiRequest('/submissions'), apiRequest(
      `/students/${user.id}/feedback`), apiRequest('/notifications')]);
    const ids = ['studentSubmissions', 'studentFeedback', 'notifications'];
    outcomes.forEach((result, index) => {
      const container = document.getElementById(ids[index]);
      container.replaceChildren();
      if (result.status !== 'fulfilled') {
        container.append(node('p', result.reason.message));
        return;
      }
      const entries = asList(result.value);
      if (!entries.length) {
        container.append(node('p', index === 0 ? 'Nenhum atendimento finalizado.' : index === 1 ?
          'Nenhuma devolutiva docente concluída.' : 'Nenhuma notificação.'));
        return;
      }
      for (const item of entries) {
        const card = node('article');
        if (index === 0) {
          card.append(node('h3', item.caseTitle || item.caseId || 'Atendimento'));
          field(card, 'Registrado em', item.submittedAt || item.createdAt);
          field(card, 'Situação', item.status || item.feedbackStatus || 'Enviado para revisão');
          field(card, 'Pontuação', item.scoring?.displayedTotal ?? item.score?.displayed ?? item
            .displayedScore ?? 'Consulte o percurso');
          card.append(button('Baixar percurso em PDF', () => downloadPdf(item.id)));
          const link = node('a', 'Praticar novamente', 'button');
          link.href = 'student-cases.html';
          card.append(link);
        } else if (index === 1) {
          card.append(node('h3', `Devolutiva · atendimento ${item.submissionId}`));
          for (const [key, label] of Object.entries({
              strengths: 'Pontos fortes',
              difficulties: 'Dificuldades',
              missedEvidence: 'Evidências não consideradas',
              prioritizationComment: 'Priorização',
              justificationComment: 'Justificativa',
              nextAttemptGuidance: 'Próxima tentativa',
              generalObservation: 'Observação geral'
            })) field(card, label, item[key]);
        } else {
          card.append(node('p', item.message));
          if (!item.readAt) card.append(button('Marcar como lida', async () => {
            try {
              await apiRequest(`/notifications/${item.id}/read`, {
                method: 'POST'
              });
              await load();
            } catch (e) {
              message(status, e.message, true);
            }
          }));
          else card.append(node('small', 'Lida'));
        }
        container.append(card);
      }
    });
    message(status, outcomes.some(x => x.status === 'rejected') ?
      'Algumas informações não puderam ser carregadas. Use Atualizar para tentar novamente.' :
      'Histórico atualizado.');
  } catch (e) {
    message(status, e.message, true);
  }
}
document.getElementById('refreshHistory').onclick = load;
load();
