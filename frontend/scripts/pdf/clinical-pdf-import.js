// Valida o PDF clínico antes de encaminhá-lo ao processamento controlado no backend.
import { AIClinicalCaseService } from "../services/ai-case-service.js";

const MAX_CLINICAL_PDF_BYTES = 20 * 1024 * 1024;
const input = document.querySelector("#clinicalPdf");
const button = document.querySelector("#processPdf");
const status = document.querySelector("#pdfStatus");

async function validatePdf(file) {
  if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("Selecione um arquivo com extensão .pdf.");
  // MIME vazio é aceito somente porque alguns navegadores não o preenchem em arquivos locais.
  if (file.type && file.type !== "application/pdf") throw new Error("O tipo do arquivo não corresponde a PDF.");
  if (!file.size || file.size > MAX_CLINICAL_PDF_BYTES) throw new Error("O PDF deve ter conteúdo e no máximo 20 MB.");
  const signature = new TextDecoder("ascii").decode(new Uint8Array(await file.slice(0, 5).arrayBuffer()));
  if (signature !== "%PDF-") throw new Error("O arquivo selecionado não possui assinatura PDF válida.");
}

input.addEventListener("change", async () => {
  button.disabled = true;
  const file = input.files[0];
  if (!file) return;
  try {
    await validatePdf(file);
    status.className = "status success";
    status.textContent = `${file.name} selecionado (${(file.size / 1024 / 1024).toFixed(1)} MB).`;
    button.disabled = false;
  } catch (error) {
    status.className = "status error";
    status.textContent = error.message;
    input.value = "";
  }
});

button.addEventListener("click", async () => {
  const file = input.files[0];
  if (!file) return;
  button.disabled = true;
  status.className = "status";
  status.innerHTML = '<span class="loading">Enviando e preparando extração controlada…</span>';
  try {
    const job = await AIClinicalCaseService.generateFromPdf(file);
    status.className = "status success";
    status.textContent = `Documento recebido. Processamento ${job.id || job.jobId ? `identificado por ${job.id || job.jobId}` : "iniciado"}. O caso permanecerá como rascunho para revisão.`;
  } catch (error) {
    status.className = "status error";
    status.textContent = error.message || "O processamento de PDF ainda não está disponível.";
    button.disabled = false;
  }
});
