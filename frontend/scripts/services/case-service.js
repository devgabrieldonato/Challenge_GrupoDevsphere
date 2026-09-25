import { apiRequest } from "./api-client.js";
export const CaseService = {
  list() { return apiRequest("/cases"); },
  get(caseId) { return apiRequest(`/cases/${encodeURIComponent(caseId)}`); },
  create(data) { return apiRequest("/cases", { method: "POST", body: JSON.stringify(data) }); },
  update(caseId, data) { return apiRequest(`/cases/${encodeURIComponent(caseId)}`, { method: "PUT", body: JSON.stringify(data) }); },
  publish(caseId) { return apiRequest(`/cases/${encodeURIComponent(caseId)}/publish`, { method: "POST" }); },
};
