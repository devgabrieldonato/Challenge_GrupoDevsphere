import { apiRequest } from "./api-client.js";

// Serviço de submissões: centraliza consulta, importação legada e entrega automática do atendimento.
export const SubmissionService = {
  list() {
    return apiRequest("/submissions");
  },
  get(submissionId) {
    return apiRequest(`/submissions/${encodeURIComponent(submissionId)}`);
  },
  importPdf(file) {
    const data = new FormData();
    data.append("file", file);
    return apiRequest("/submissions/import-pdf", { method: "POST", body: data });
  },

  // Envia relatório estruturado e PDF na mesma requisição. A chave idempotente
  // permite repetir a chamada após falha de rede sem criar outra submissão.
  submit({ report, pdf, clientSubmissionId, activityId = null }) {
    const data = new FormData();
    data.append("report", JSON.stringify(report));
    data.append("pdf", pdf, `percurso-${report.caseId}.pdf`);
    data.append("clientSubmissionId", clientSubmissionId);
    if (activityId) data.append("activityId", String(activityId));
    return apiRequest("/submissions", {
      method: "POST",
      headers: { "Idempotency-Key": clientSubmissionId },
      body: data,
    });
  },
};
