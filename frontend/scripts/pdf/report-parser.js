const MAX_REPORT_BYTES = 10 * 1024 * 1024;
const MARKER = "%PV_REPORT_V1:";

// Valida o contêiner PDF e extrai apenas o bloco estruturado criado pela plataforma.
export async function parsePatientReport(file) {
  if (!file) throw new Error("Selecione um relatório em PDF.");
  if (file.size === 0) throw new Error("O arquivo está vazio.");
  if (file.size > MAX_REPORT_BYTES) throw new Error("O relatório excede o limite de 10 MB.");
  if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("Selecione um arquivo com extensão .pdf.");
  // Alguns navegadores não informam MIME em arquivos locais; quando presente, ele deve ser PDF.
  if (file.type && file.type !== "application/pdf") throw new Error("O tipo do arquivo não corresponde a PDF.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") throw new Error("O arquivo não possui uma assinatura PDF válida.");

  // O marcador fica no fim do relatório; ler só a cauda reduz memória e evita interpretar conteúdo ativo.
  const tail = new TextDecoder("utf-8").decode(bytes.slice(Math.max(0, bytes.length - 2_000_000)));
  const markerIndex = tail.lastIndexOf(MARKER);
  if (markerIndex < 0) throw new Error("Este PDF não é um relatório reconhecido pelo Paciente Virtual.");

  const encoded = tail.slice(markerIndex + MARKER.length).split(/[\r\n]/, 1)[0].trim();
  let report;
  try {
    const binary = atob(encoded);
    const payload = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    report = JSON.parse(new TextDecoder("utf-8").decode(payload));
  } catch {
    throw new Error("Os dados estruturados do relatório estão corrompidos.");
  }
  validateReportSchema(report);
  return report;
}

// O contrato mínimo impede que PDFs genéricos ou versões incompatíveis sejam tratados como submissões.
function validateReportSchema(report) {
  if (report?.schemaVersion !== 1 || report?.reportType !== "patient-virtual-submission") {
    throw new Error("A versão deste relatório não é compatível com a plataforma.");
  }
  if (typeof report.caseId !== "string" || !Array.isArray(report.path) || !Array.isArray(report.attempts)) {
    throw new Error("O relatório não contém o percurso obrigatório.");
  }
  for (const step of report.path) {
    if (!step || typeof step.id !== "string" || typeof step.title !== "string" || typeof step.answer !== "string" || !["question", "exam"].includes(step.type) || (step.parent != null && typeof step.parent !== "string")) {
      throw new Error("O relatório contém uma etapa de investigação inválida.");
    }
  }
  for (const attempt of report.attempts) {
    if (!attempt || typeof attempt.hypothesis !== "string" || typeof attempt.reason !== "string" || typeof attempt.correct !== "boolean" || !Array.isArray(attempt.actions) || attempt.actions.some((id) => typeof id !== "string")) {
      throw new Error("O relatório contém uma tentativa diagnóstica inválida.");
    }
  }
}
