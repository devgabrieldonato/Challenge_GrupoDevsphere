import {
  apiRequest
} from '../services/api-client.js';
import {
  message
} from '../services/ui.js';
const form = document.getElementById('caseForm'),
  status = document.getElementById('caseFormStatus');
// Autoria explícita: conteúdo incompleto não é preenchido com fatos clínicos inventados.
document.getElementById('contentJson').placeholder = JSON.stringify({
  patient: {
    name: '',
    age: null,
    complaint: '',
    onset: ''
  },
  items: [],
  hypotheses: [],
  correctHypothesis: '',
  scoring: {
    items: {}
  }
}, null, 2);
form.onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const content = JSON.parse(document.getElementById('contentJson').value);
    const data = Object.fromEntries(new FormData(form));
    const saved = await apiRequest('/contributions', {
      method: 'POST',
      body: JSON.stringify({
        key: data.key,
        title: data.title,
        content,
        metadata: {
          area: data.area
        }
      })
    });
    message(status, 'Rascunho salvo. Nenhuma aprovação ou publicação foi realizada.');
    if (saved.id) location.assign(`case-curation.html?id=${saved.id}`);
  } catch (e) {
    message(status, e instanceof SyntaxError ? 'O conteúdo precisa ser um JSON válido.' : e.message,
    true);
  } finally {
    button.disabled = false;
  }
};
