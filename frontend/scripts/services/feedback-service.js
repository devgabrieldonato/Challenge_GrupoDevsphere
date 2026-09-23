import { apiRequest } from "./api-client.js";
export const FeedbackService = {
  create(submissionId, data) { return apiRequest(`/submissions/${encodeURIComponent(submissionId)}/feedback`, { method: "POST", body: JSON.stringify(data) }); },
  update(feedbackId, data) { return apiRequest(`/feedback/${encodeURIComponent(feedbackId)}`, { method: "PUT", body: JSON.stringify(data) }); },
  complete(feedbackId) { return apiRequest(`/feedback/${encodeURIComponent(feedbackId)}/complete`, { method: "POST" }); },
};
