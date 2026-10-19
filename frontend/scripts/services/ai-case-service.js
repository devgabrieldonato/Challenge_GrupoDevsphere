import {
  apiRequest
} from './api-client.js';
// Integração real de documentos e trabalhos. Não há fallback com conteúdo clínico simulado.
export const AIClinicalCaseService = {
  generateFromPdf(file, {
    authorized = false,
    deidentified = false
  } = {}) {
    if (!authorized || !deidentified) throw Error(
      'Confirme a autorização e desidentificação na área de contribuições.');
    const data = new FormData();
    data.append('pdf', file);
    data.append('authorized', 'true');
    data.append('deidentified', 'true');
    return apiRequest('/documents', {
      method: 'POST',
      body: data
    });
  },
  getJob(id) {
    return apiRequest(`/jobs/${encodeURIComponent(id)}`);
  }
};
