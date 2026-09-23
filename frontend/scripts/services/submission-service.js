import { apiRequest } from "./api-client.js";
export const SubmissionService = {
  list() { return apiRequest("/submissions"); },
  get(submissionId) { return apiRequest(`/submissions/${encodeURIComponent(submissionId)}`); },
  importPdf(file) { const data = new FormData(); data.append("file", file); return apiRequest("/submissions/import-pdf", { method: "POST", body: data }); },
};
