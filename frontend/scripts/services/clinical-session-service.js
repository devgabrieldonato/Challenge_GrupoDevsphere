import {
  apiRequest
} from "./api-client.js";
// O servidor mantém identidade, versão, ordem das escolhas e pontuação oficiais.
export const ClinicalSessionService = {
  start(caseKey) {
    return apiRequest('/clinical-sessions', {
      method: 'POST',
      body: JSON.stringify({
        caseKey
      })
    });
  },
  get(id) {
    return apiRequest(`/clinical-sessions/${encodeURIComponent(id)}`);
  },
  choose(id, itemKey) {
    return apiRequest(`/clinical-sessions/${encodeURIComponent(id)}/actions`, {
      method: 'POST',
      body: JSON.stringify({
        itemKey
      })
    });
  },
  hypothesis(id, hypothesis, justification) {
    return apiRequest(`/clinical-sessions/${encodeURIComponent(id)}/hypotheses`, {
      method: 'POST',
      body: JSON.stringify({
        hypothesis,
        justification
      })
    });
  }
};
