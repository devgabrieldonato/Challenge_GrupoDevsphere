import { apiRequest } from "./api-client.js";

// Contrato único para geração assistida. Chaves e chamadas ao modelo permanecem no backend.
export const AIClinicalCaseService = {
  generateFromStructuredInput(input) {
    return apiRequest("/case-generation/structured", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  generateFromPdf(file) {
    const data = new FormData();
    data.append("file", file);
    return apiRequest("/case-generation/pdf", { method: "POST", body: data });
  },
  getJob(jobId) {
    return apiRequest(`/case-generation/${encodeURIComponent(jobId)}`);
  },
};

// O simulador cria apenas a estrutura vazia; não inventa fatos ou respostas clínicas.
export const MockAIClinicalCaseService = {
  async generateFromStructuredInput(input) {
    const questions = Array.from({ length: 18 }, (_, index) => ({
      id: `question-${String(index + 1).padStart(2, "0")}`,
      type: "question",
      title: `Pergunta a definir ${index + 1}`,
      answer: "",
      requiresClinicalReview: true,
    }));
    const exams = Array.from({ length: 22 }, (_, index) => ({
      id: `exam-${String(index + 1).padStart(2, "0")}`,
      type: "exam",
      title: `Exame a definir ${index + 1}`,
      answer: "",
      requiresClinicalReview: true,
    }));
    return {
      mode: "mock",
      status: "draft",
      requiresHumanReview: true,
      source: {
        title: input.title || "",
        chiefComplaint: input.chiefComplaint || "",
      },
      items: [...questions, ...exams],
      warnings: [
        "Integração simulada: nenhum conteúdo clínico foi gerado.",
        "Preencha e revise respostas, dependências, hipóteses e referências antes de salvar.",
      ],
    };
  },
};

