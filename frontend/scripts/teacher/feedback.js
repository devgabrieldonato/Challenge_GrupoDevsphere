// Registra rascunhos e conclusão da devolutiva em entidade separada da submissão.
import { SubmissionService } from "../services/submission-service.js";
import { FeedbackService } from "../services/feedback-service.js";

const submissionId = new URLSearchParams(window.location.search).get("id");
const form = document.querySelector("#feedbackForm");
const status = document.querySelector("#feedbackStatus");
const backLink = document.querySelector("#backToReview");
const exportButton = document.querySelector("#exportFeedback");
let loadedSubmission = null;

if (!submissionId) {
  status.className = "status error";
  status.textContent = "Abra um atendimento antes de preparar a devolutiva.";
} else {
  SubmissionService.get(submissionId)
    .then((submission) => {
      loadedSubmission = submission;
      form.hidden = false;
      form.submissionId.value = submissionId;
      backLink.href = `teacher-review.html?id=${encodeURIComponent(submissionId)}`;
      status.className = "status success";
      status.textContent = "Atendimento carregado. Preencha a avaliação docente.";
      form.strengths.focus();
    })
    .catch(() => {
      status.className = "status error";
      status.textContent = "Não foi possível carregar o atendimento autorizado.";
    });
}

// Rascunhos podem ser incompletos; a conclusão exige todos os campos obrigatórios.
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = event.submitter?.value || "draft";
  if (action === "complete" && !form.reportValidity()) return;

  const data = Object.fromEntries(new FormData(form));
  data.status = action === "complete" ? "completed" : "draft";
  const buttons = form.querySelectorAll("button");
  buttons.forEach((button) => { button.disabled = true; });
  status.className = "status";
  status.textContent =
    action === "complete" ? "Concluindo devolutiva…" : "Salvando rascunho…";

  try {
    const feedback = await FeedbackService.create(submissionId, data);
    if (action === "complete" && feedback.id && feedback.status !== "completed") {
      await FeedbackService.complete(feedback.id);
    }
    status.className = "status success";
    status.textContent =
      action === "complete" ? "Devolutiva concluída." : "Rascunho salvo.";
  } catch (error) {
    status.className = "status error";
    status.textContent = error.message || "Não foi possível salvar a devolutiva.";
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
});

function feedbackField(label, value) {
  return [
    { text: label, bold: true, margin: [0, 9, 0, 3] },
    { text: value.trim() || "Não informado", margin: [0, 0, 0, 5] },
  ];
}

// A exportação cria um documento legível; o percurso do aluno continua imutável.
exportButton.addEventListener("click", () => {
  if (!window.pdfMake) {
    status.className = "status error";
    status.textContent = "A biblioteca de PDF não foi carregada.";
    return;
  }

  const values = Object.fromEntries(new FormData(form));
  const studentName = loadedSubmission?.studentName || "Aluno";
  const caseTitle =
    loadedSubmission?.caseTitle || loadedSubmission?.case || "Caso clínico";
  const content = [
    { text: "Devolutiva docente", style: "title" },
    { text: `Aluno: ${studentName}`, margin: [0, 0, 0, 4] },
    { text: `Caso: ${caseTitle}`, margin: [0, 0, 0, 4] },
    { text: `Atendimento: ${submissionId}`, margin: [0, 0, 0, 8] },
    ...feedbackField("Pontos fortes", values.strengths || ""),
    ...feedbackField("Dificuldades identificadas", values.difficulties || ""),
    ...feedbackField("Evidências relevantes não consideradas", values.missedEvidence || ""),
    ...feedbackField("Comentário sobre priorização", values.prioritizationComment || ""),
    ...feedbackField("Comentário sobre a justificativa", values.justificationComment || ""),
    ...feedbackField("Orientações para a próxima tentativa", values.nextAttemptGuidance || ""),
    ...feedbackField("Observação geral", values.generalObservation || ""),
  ];

  const definition = {
    pageSize: "A4",
    pageMargins: [42, 48, 42, 48],
    info: {
      title: `Devolutiva docente - ${caseTitle}`,
      subject: "Avaliação docente do Paciente Virtual",
    },
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#223447" },
    styles: { title: { fontSize: 20, bold: true, margin: [0, 0, 0, 14] } },
    footer: (page, pages) => ({
      text: `Página ${page} de ${pages}`,
      alignment: "right",
      fontSize: 8,
      margin: [42, 12, 42, 0],
    }),
    content,
  };

  window.pdfMake
    .createPdf(definition)
    .download(`devolutiva-atendimento-${submissionId}.pdf`);
  status.className = "status success";
  status.textContent = "Devolutiva preparada para download em PDF.";
});

