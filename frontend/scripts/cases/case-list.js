import {
  apiRequest
} from '../services/api-client.js';
import {
  node,
  asList,
  message,
  button
} from '../services/ui.js';
const list = document.getElementById('caseList'),
  status = document.getElementById('caseStatus');
// O catálogo docente não importa os arquivos de gabarito usados anteriormente no navegador.
async function load() {
  message(status, 'Carregando versões e contribuições autorizadas…');
  list.replaceChildren();
  const results = await Promise.allSettled([apiRequest('/cases'), apiRequest('/contributions')]);
  results.forEach((r, index) => {
    if (r.status === 'rejected') {
      list.append(node('p', r.reason.message));
      return;
    }
    for (const c of asList(r.value)) {
      const card = node('article', '', 'card');
      card.append(node('span', index ? 'Contribuição' : 'Catálogo', 'badge'), node('h2', c.title || c
        .key), node('p', `${c.state||c.status} · versão ${c.version||c.versionId||'—'}`), node('p',
        c.metadata?.publicSummary || ''));
      if (index) {
        const link = node('a', 'Revisar versão', 'button');
        link.href = `case-curation.html?id=${c.id}`;
        card.append(link);
      }
      list.append(card);
    }
  });
  if (!list.childElementCount) list.append(node('p', 'Nenhum caso disponível.'));
  message(status,
    'Dados recebidos. Aprovação e publicação exigem habilitação e atribuição verificadas pelo servidor.');
}
status.after(button('Atualizar lista', load));
load();
