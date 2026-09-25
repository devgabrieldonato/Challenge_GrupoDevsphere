// Controla a autoria estruturada e deixa explícito quando a IA real não está configurada.
import {
  AIClinicalCaseService,
  MockAIClinicalCaseService,
} from "../services/ai-case-service.js";
import { CaseService } from "../services/case-service.js";

const form = document.querySelector("#caseForm");
const status = document.querySelector("#caseFormStatus");
const draftSection = document.querySelector("#generatedDraft");
const draftSummary = document.querySelector("#draftSummary");
const saveButton = document.querySelector("#saveDraft");
let generatedCase = null;

function readForm() {
  return Object.fromEntries(new FormData(form));
}

function showProposal(proposal, simulated = false) {
  const questions = proposal.items?.filter((item) => item.type === "question").length ?? 0;
  const exams = proposal.items?.filter((item) => item.type === "exam").length ?? 0;
  draftSection.hidden = false;
  draftSummary.textContent = simulated
    ? `Estrutura simulada criada com ${questions} perguntas e ${exams} exames vazios. ` +
      "Nenhum conteúdo clínico foi gerado ou validado."
    : `A proposta foi criada com ${questions} perguntas e ${exams} exames. ` +
      "Revise os alertas e o conteúdo completo antes de salvar.";
  draftSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  saveButton.disabled = false;
  status.className = "status";
  status.textContent = "Enviando informações para geração assistida…";
  draftSection.hidden = true;

  try {
    const result =
      await AIClinicalCaseService.generateFromStructuredInput(readForm());
    generatedCase = result.case || result;
    showProposal(generatedCase);
    status.className = "status success";
    status.textContent =
      "Proposta recebida. Ela permanece sem publicação até revisão e confirmação docente.";
  } catch (error) {
    if (error.status === 501) {
      const mock = await MockAIClinicalCaseService.generateFromStructuredInput(readForm());
      generatedCase = null;
      saveButton.disabled = true;
      showProposal(mock, true);
      status.className = "status warning";
      status.textContent =
        "O provedor de IA ainda não está configurado. A prévia mostra somente o contrato esperado e não pode ser salva.";
    } else {
      status.className = "status error";
      status.textContent =
        error.message || "A geração assistida ainda não está disponível.";
    }
  } finally {
    submit.disabled = false;
  }
});

saveButton.addEventListener("click", async () => {
  if (!generatedCase) return;
  saveButton.disabled = true;
  status.className = "status";
  status.textContent = "Salvando rascunho…";

  try {
    const saved = await CaseService.create({
      ...generatedCase,
      status: "draft",
      requiresHumanReview: true,
    });
    status.className = "status success";
    status.textContent =
      `Rascunho salvo${saved.id ? ` com identificação ${saved.id}` : ""}. Nenhum caso foi publicado.`;
  } catch (error) {
    status.className = "status error";
    status.textContent =
      error.message || "Não foi possível salvar o rascunho.";
  } finally {
    saveButton.disabled = false;
  }
});

