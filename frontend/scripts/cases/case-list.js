// Exibe os casos locais preservados e acrescenta rascunhos autorizados pela API.
import { CaseService } from "../services/case-service.js";
import { joaoCase, joaoItems, marinaCase } from "./clinical-cases.js";

const status = document.querySelector("#caseStatus");
const list = document.querySelector("#caseList");

function appendText(parent, tag, text, className = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function appendItemList(parent, title, values) {
  appendText(parent, "h3", title);
  const ordered = document.createElement("ol");
  for (const value of values) appendText(ordered, "li", value);
  parent.append(ordered);
}

function createReferenceList(references) {
  const listElement = document.createElement("ul");
  for (const reference of references) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = reference.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = reference.label;
    item.append(link);
    listElement.append(item);
  }
  return listElement;
}

// Os detalhes docentes são derivados do mesmo catálogo usado no atendimento.
function renderBuiltInCase(metadata, items) {
  const article = document.createElement("article");
  article.className = "card case-card";
  appendText(article, "span", "Publicado", "badge done");
  appendText(article, "h2", `${metadata.name}, ${metadata.age} anos`);
  appendText(article, "p", metadata.chiefComplaint || metadata.complaint);
  appendText(
    article,
    "p",
    `${items.filter((item) => item.type === "question").length} perguntas · ` +
      `${items.filter((item) => item.type === "exam").length} exames`,
    "muted",
  );

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Consultar conteúdo docente";
  details.append(summary);

  appendText(details, "h3", "Contexto do atendimento");
  appendText(details, "p", metadata.context || metadata.onset);
  appendItemList(details, "Objetivos de aprendizagem", metadata.learningObjectives || [
    "Reconhecer a emergência metabólica e priorizar estabilização.",
    "Relacionar sintomas, hiperglicemia, cetonemia e acidose metabólica.",
    "Reavaliar diagnósticos diferenciais após a estabilização inicial.",
  ]);

  const questions = items.filter((item) => item.type === "question");
  const exams = items.filter((item) => item.type === "exam");
  appendItemList(details, "Perguntas disponíveis", questions.map((item) => item.title));
  appendItemList(details, "Exames disponíveis", exams.map((item) => item.title));

  const dependencies = items
    .filter((item) => item.parent)
    .map((item) => {
      const parent = items.find((candidate) => candidate.id === item.parent);
      return `${item.title} — disponível após ${parent?.title || item.parent}`;
    });
  appendItemList(details, "Dependências entre escolhas", dependencies);

  appendItemList(
    details,
    "Hipóteses diagnósticas",
    metadata.hypotheses.map((hypothesis) => hypothesis.label || hypothesis),
  );

  const priorityIds = metadata.priorityEvidenceIds || metadata.priorityIds || [];
  appendItemList(
    details,
    "Evidências prioritárias",
    priorityIds.map((id) => items.find((item) => item.id === id)?.title || id),
  );

  appendText(details, "h3", "Desfecho esperado");
  appendText(details, "p", metadata.outcome);
  appendText(details, "h3", "Feedback pedagógico");
  appendText(
    details,
    "p",
    metadata.pedagogicalFeedback ||
      `${metadata.rationale} ${metadata.urgentGuidance}`,
  );
  appendText(details, "h3", "Referências clínicas");
  details.append(createReferenceList(metadata.references));

  article.append(details);
  list.append(article);
}

function renderApiCase(caseData) {
  const article = document.createElement("article");
  article.className = "card";
  const state = caseData.status === "draft"
    ? "Rascunho"
    : caseData.status === "review"
      ? "Em revisão"
      : "Publicado";
  appendText(article, "span", state, `badge ${caseData.status === "draft" ? "draft" : "done"}`);
  appendText(article, "h2", caseData.title || caseData.patientName || "Caso sem título");
  appendText(
    article,
    "p",
    caseData.chiefComplaint || caseData.summary || "Sem resumo disponível.",
    "muted",
  );
  appendText(
    article,
    "p",
    `${caseData.questionCount ?? "—"} perguntas · ${caseData.examCount ?? "—"} exames · ` +
      `versão ${caseData.version ?? "—"}`,
  );
  list.append(article);
}

renderBuiltInCase(joaoCase, joaoItems);
renderBuiltInCase({
  ...marinaCase,
  chiefComplaint: marinaCase.complaint,
  context: `Pronto atendimento. ${marinaCase.onset}.`,
  status: "published",
}, marinaCase.items);

CaseService.list()
  .then((result) => {
    const cases = Array.isArray(result) ? result : result.items || [];
    const additional = cases.filter((caseData) => !["joao", "marina"].includes(caseData.key));
    additional.forEach(renderApiCase);
    status.className = "status success";
    status.textContent =
      additional.length
        ? `João, Marina e ${additional.length} caso(s) autorizado(s) pela API.`
        : "João e Marina estão disponíveis para consulta docente.";
  })
  .catch(() => {
    status.className = "status warning";
    status.textContent =
      "João e Marina estão disponíveis. Rascunhos adicionais dependem da API.";
  });

