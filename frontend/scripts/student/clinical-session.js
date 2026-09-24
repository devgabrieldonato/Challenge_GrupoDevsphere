// CATÁLOGOS CLÍNICOS COMPARTILHADOS
// ----------------------------------------------------------------------
// O aluno e o professor consultam a mesma fonte, evitando divergência de conteúdo.
import { joaoItems, marinaCase } from "../cases/clinical-cases.js";
import { SubmissionService } from "../services/submission-service.js";
import { ClinicalScoring } from "../scoring/clinical-scoring.js";

// ESTADO DA SESSÃO
// ----------------------------------------------------------------------
// Estado da sessão: caso selecionado e catálogo atualmente disponível.
let activeCase = null,
  items = [];
// Percurso, filtro ativo, tentativas diagnósticas e temporizador da notificação; os dados permanecem em memória.
let path = [],
  filter = "all",
  attempts = [],
  timer;
// Eventos de pontuação, sessão de regras e estado da entrega automática.
// Contrato esperado do módulo ClinicalScoring:
// - startSession(caseId): cria o placar inicial e informa versão/orçamento;
// - scoreSelection({ caseId, itemId, sequence, currentEvents }): devolve um evento imutável;
// - summarize(events): consolida pontos, bônus, perdas e eficiência.
let scoreEvents = [],
  scoringSession = null,
  completionLocked = false,
  pendingSubmission = null;

// CONSULTAS E NOTIFICAÇÕES
// ----------------------------------------------------------------------
// Atalho para buscar um elemento da interface pelo identificador.
const $ = (id) => document.getElementById(id);
// Consulta se uma ação já foi registrada no percurso.
const has = (id) => path.some((step) => step.id === id);
// Disponibiliza apenas ações ainda não realizadas e com a dependência satisfeita.
const available = (item) => !has(item.id) && (!item.parent || has(item.parent));
// Exibe uma mensagem temporária e substitui o prazo de ocultação da mensagem anterior.
function notify(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  clearTimeout(timer);
  timer = setTimeout(() => $("toast").classList.add("hidden"), 4000);
}

// RENDERIZAÇÃO DA INTERFACE
// ----------------------------------------------------------------------
// Atualiza biblioteca de ações, contador, histórico e árvore de perguntas e exames.
function render() {
  renderLibrary();
  $("count").textContent = String(path.length).padStart(2, "0");
  $("empty").hidden = path.length > 0;
  $("historyEmpty").hidden = path.length > 0;
  renderHistory();
  renderMap();
  renderScore();
}

// Normaliza o resultado do motor em campos simples compartilhados pela tela e pelo relatório.
function summarizeScore() {
  const result = ClinicalScoring.summarize(scoreEvents, activeCase);
  return {
    caseVersion: result.caseVersion,
    ruleSetVersion: result.ruleSetVersion,
    initialScore: result.initialScore,
    rawTotal: result.rawTotal,
    displayedTotal: result.displayedTotal,
    recommendedActionBudget: result.recommendedActionBudget,
    actionCount: result.selectedActionCount,
    gains: result.summary.gains,
    losses: result.summary.losses,
    priorityBonus: result.summary.priorityBonus,
    efficiencyPenalty: result.summary.efficiencyPenalties,
  };
}

// Atualiza placar, última variação e consumo do orçamento sem revelar opções ainda não escolhidas.
function renderScore() {
  if (!scoringSession) return;
  const summary = summarizeScore();
  const lastEvent = scoreEvents.at(-1);
  $("scoreValue").textContent = String(summary.displayedTotal);
  $("scoreRaw").textContent = String(summary.rawTotal);
  $("scoreBudget").textContent = `${scoreEvents.length} de ${summary.recommendedActionBudget}`;
  $("scoreChange").textContent = lastEvent
    ? `Última escolha: ${lastEvent.delta >= 0 ? "+" : ""}${lastEvent.delta} ponto(s).`
    : "O placar começa em 50 pontos.";
}

// Atualiza somente os botões disponíveis para investigação.
function renderLibrary() {
  // Seleciona as ações liberadas que correspondem ao filtro de perguntas ou exames.
  const list = items.filter(
    (item) => available(item) && (filter === "all" || filter === item.type),
  );
  // Transforma as ações disponíveis em botões clicáveis e arrastáveis.
  $("blocks").innerHTML =
    list
      .map(
        (item) =>
          `<button type="button" class="block ${item.type === "exam" ? "exam" : ""}" draggable="true" data-id="${item.id}" aria-label="Adicionar: ${item.title}"><span>${item.parent ? '<span class="new">Nova conexão</span>' : ""}${item.title}</span><span class="plus" aria-hidden="true">+</span></button>`,
      )
      .join("") ||
    '<p class="sub">Nenhum bloco disponível nesta categoria. Explore as outras opções ou formule sua hipótese.</p>';
}

// Atualiza a linha do tempo das escolhas realizadas.
function renderHistory() {
  // Organiza o histórico pela ordem das escolhas, incluindo o horário registrado.
  $("timeline").innerHTML = path
    .map((step, index) => {
      const item = items.find((item) => item.id === step.id);
      return `<li><span class="meta">${String(index + 1).padStart(2, "0")} · ${step.time}</span><b>${item.title}</b><span class="score-delta ${step.scoreEvent.delta < 0 ? "negative" : "positive"}">${step.scoreEvent.delta >= 0 ? "+" : ""}${step.scoreEvent.delta} ponto(s)</span></li>`;
    })
    .join("");
}

// Atualiza a árvore de evidências e suas dependências.
function renderMap() {
  // Monta recursivamente um nó do mapa com sua resposta e os descendentes já selecionados.
  function node(id) {
    const item = items.find((item) => item.id === id),
      index = path.findIndex((step) => step.id === id);
    const children = path.filter(
      (step) => items.find((item) => item.id === step.id).parent === id,
    );
    return `<article class="node ${item.type === "exam" ? "exam" : ""}"><div class="meta">${String(index + 1).padStart(2, "0")} · ${item.type === "exam" ? "EXAME" : "PERGUNTA"}</div>` +
      `<h4>${item.title}</h4>` +
        `<p>${item.answer}</p></article>${children.length ? '<div class="children">' + children.map((step) => node(step.id)).join("") + "</div>" : ""}`;
  }
  // Inicia cada ramo pelas ações sem dependência e delega os descendentes à função node.
  $("branches").innerHTML = path
    .filter((step) => !items.find((item) => item.id === step.id).parent)
    .map((step) => `<div class="branch">${node(step.id)}</div>`)
    .join("");
}

// REGISTRO DE AÇÕES
// ----------------------------------------------------------------------
// Valida a ação, registra seu horário, redesenha a sessão e informa as opções liberadas.
function add(id) {
  if (!activeCase || completionLocked) return;
  const item = items.find((item) => item.id === id);
  if (!item || !available(item)) return;
  const scoreEvent = ClinicalScoring.scoreSelection({
    caseId: activeCase,
    itemId: id,
    sequence: path.length + 1,
    currentEvents: scoreEvents.map((event) => ({ ...event })),
  });
  scoreEvents.push(scoreEvent);
  path.push({
    id,
    time: new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    scoreEvent: { ...scoreEvent },
  });
  render();
  const unlocked = items.filter((item) => item.parent === id).length;
  notify(
    `${item.title} adicionado. Variação: ${scoreEvent.delta >= 0 ? "+" : ""}${scoreEvent.delta} ponto(s).${unlocked ? " " + unlocked + " nova(s) opção(ões) liberada(s)." : ""}`,
  );
}

// EVENTOS DE INVESTIGAÇÃO
// ----------------------------------------------------------------------
// Delega os cliques da biblioteca ao botão de ação mais próximo do alvo.
$("blocks").addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (button) add(button.dataset.id);
});
// Transporta o identificador da ação quando o aluno começa a arrastar um bloco.
$("blocks").addEventListener("dragstart", (event) => {
  const button = event.target.closest("[data-id]");
  if (button) {
    event.dataTransfer.setData("text/plain", button.dataset.id);
    event.dataTransfer.effectAllowed = "copy";
  }
});
// Permite soltar blocos no mapa e destaca a área de destino.
$("map").addEventListener("dragover", (event) => {
  event.preventDefault();
  $("map").classList.add("over");
});
// Remove o destaque quando o arraste deixa a área do mapa.
$("map").addEventListener("dragleave", (event) => {
  if (!$("map").contains(event.relatedTarget))
    $("map").classList.remove("over");
});
// Recupera a ação solta no mapa e a adiciona pelo mesmo fluxo usado no clique.
$("map").addEventListener("drop", (event) => {
  event.preventDefault();
  $("map").classList.remove("over");
  add(event.dataTransfer.getData("text/plain"));
});
// Limpa o destaque ao terminar qualquer arraste, inclusive fora do mapa.
document.addEventListener("dragend", () =>
  $("map").classList.remove("over"),
);

// FILTROS E DIÁLOGOS
// ----------------------------------------------------------------------
// Associa cada botão de filtro à atualização do catálogo visível.
document.querySelectorAll("[data-filter]").forEach(
  (button) =>
    (button.onclick = () => {
      filter = button.dataset.filter;
      // Sincroniza o destaque visual e o estado acessível de todos os filtros.
      document.querySelectorAll("[data-filter]").forEach((filterButton) => {
        filterButton.classList.toggle("active", filterButton === button);
        filterButton.setAttribute("aria-pressed", String(filterButton === button));
      });
      render();
    }),
);
// Cada botão fecha o diálogo indicado no seu atributo data-close.
document
  .querySelectorAll("[data-close]")
  .forEach((button) => (button.onclick = () => $(button.dataset.close).close()));
// Abre o formulário de hipótese diagnóstica.
$("diagnose").onclick = () => $("diagnosis").showModal();
// Solicita confirmação antes de apagar o percurso da sessão.
$("reset").onclick = () => $("restart").showModal();
// Limpa percurso, tentativas e formulário, mantendo o caso selecionado.
$("confirmReset").onclick = () => {
  path = [];
  attempts = [];
  scoreEvents = [];
  scoringSession = ClinicalScoring.startSession(activeCase);
  completionLocked = false;
  pendingSubmission = null;
  setSubmissionStatus("idle", "Finalize o caso para enviá-lo automaticamente ao professor.");
  setSessionControlsDisabled(false);
  $("diagnosisForm").reset();
  $("restart").close();
  render();
  notify("Caso reiniciado.");
};

// HIPÓTESE E FEEDBACK
// ----------------------------------------------------------------------
// Valida a justificativa, registra a tentativa e apresenta o feedback correspondente ao caso.
$("diagnosisForm").onsubmit = (event) => {
  event.preventDefault();
  if (!$("reason").value.trim()) {
    $("reason").setCustomValidity("Descreva ao menos um achado.");
    $("reason").reportValidity();
    return;
  }
  // Compara apenas a alternativa escolhida com o desfecho esperado; não avalia automaticamente a justificativa.
  const correct =
    $("hypothesis").value ===
    (activeCase === "marina" ? marinaCase.correctHypothesis : "stemi");
  // Preserva a hipótese, justificativa e ações existentes no momento desta tentativa.
  attempts.push({
    hypothesis: $("hypothesis").selectedOptions[0].text,
    reason: $("reason").value,
    actions: path.map((step) => step.id),
    correct,
    submittedAt: new Date().toISOString(),
  });
  $("diagnosis").close();
  // Compõe o desfecho, a presença das evidências e a revisão pedagógica das escolhas realizadas.
  $("feedback").innerHTML =
    (activeCase === "marina"
      ? `<div class="feedback"><h3>${correct ? "Hipótese compatível com o caso" : "Vale revisar sua hipótese"}</h3>` +
        `<p>O desfecho proposto é <strong>${marinaCase.outcome}</strong>. ${marinaCase.rationale}</p>` +
        `<p>${marinaCase.evidenceIds.every(has) ? "Você reuniu as evidências centrais. Relacione a glicemia, a cetonemia e a acidose com a história clínica." : "A glicemia, a cetonemia e a avaliação da acidose são evidências centrais. Confira quais ainda faltam no seu percurso."}</p>` +
        `</div><h3>Prioridades e evidências</h3>` +
        `<p class="sub">${has("vitals") ? "Sinais vitais avaliados." : "Faltou avaliar os sinais vitais."} ${has(marinaCase.priorityId) ? (path.findIndex((step) => step.id === marinaCase.priorityId) < 3 ? "Glicemia capilar entre as primeiras escolhas." : "A glicemia capilar poderia ter sido priorizada mais cedo.") : "A glicemia capilar deve ser priorizada."} A ordem de cliques não representa tempo clínico.</p>` +
        `<p class="sub">${marinaCase.urgentGuidance} A justificativa escrita fica registrada para revisão docente; não é corrigida automaticamente.</p>`
      : `<div class="feedback"><h3>${correct ? "Hipótese compatível com o caso" : "Vale revisar sua hipótese"}</h3>` +
        `<p>O desfecho proposto é <strong>infarto agudo do miocárdio com supra de ST, de parede inferior</strong>. Dor persistente, sintomas associados e o padrão do ECG sustentam essa hipótese.</p>` +
        `<p>${has("ecg") ? "Você obteve o ECG. Relacione suas alterações com a história clínica." : "Você concluiu sem obter o ECG, uma evidência central para este caso."}</p>` +
        `</div><h3>Prioridades e evidências</h3>` +
        `<p class="sub">${has("vitals") ? "Sinais vitais avaliados." : "Faltou avaliar os sinais vitais."} ${has("ecg") ? (path.findIndex((step) => step.id === "ecg") < 3 ? "ECG entre as primeiras escolhas." : "O ECG poderia ter sido priorizado mais cedo.") : "O ECG deve ser priorizado."} A ordem de cliques não representa tempo clínico.</p>` +
        `<p class="sub">Este quadro exige acionamento urgente da equipe e avaliação para reperfusão. Não se deve esperar a elevação da troponina. Exames alterados podem ser inespecíficos: o D-dímero elevado não confirma embolia e a troponina inicial abaixo do limite não exclui infarto precoce. A justificativa escrita fica registrada para revisão docente; não é corrigida automaticamente.</p>`) +
    `<h3 class="review-heading">Revisão das suas ${path.length} escolhas</h3>${
      path.length
        ? path
            .map((step) => {
              const item = items.find((item) => item.id === step.id);
              return `<div class="review"><strong>${item.title}</strong><span>${item.quality} · ${item.why}</span></div>`;
            })
            .join("")
        : '<p class="sub">Nenhuma investigação realizada. Volte ao mapa para explorar as evidências.</p>'
    }`;
  const scoreSummary = summarizeScore();
  $("feedback").insertAdjacentHTML(
    "beforeend",
    `<h3 class="review-heading">Resumo da pontuação</h3>` +
      `<div class="score-summary">` +
      `<div><span>Pontuação final</span><strong>${scoreSummary.displayedTotal}/100</strong></div>` +
      `<div><span>Total bruto</span><strong>${scoreSummary.rawTotal}</strong></div>` +
      `<div><span>Ganhos</span><strong>+${scoreSummary.gains}</strong></div>` +
      `<div><span>Perdas</span><strong>${scoreSummary.losses}</strong></div>` +
      `<div><span>Bônus de prioridade</span><strong>+${scoreSummary.priorityBonus}</strong></div>` +
      `<div><span>Penalidades de eficiência</span><strong>${scoreSummary.efficiencyPenalty}</strong></div>` +
      `</div>`,
  );
  $("result").showModal();
};
// Remove a mensagem de validação anterior quando a justificativa é editada.
$("reason").oninput = () => $("reason").setCustomValidity("");

// EXPORTAÇÃO DO PERCURSO EM PDF
// ----------------------------------------------------------------------
// Captura os dados da sessão sem modificar o percurso nem as tentativas originais.
function collectReportData(exportedAt = new Date().toISOString(), clientSubmissionId = null) {
  const scoreSummary = summarizeScore();
  return {
    // Contrato versionado utilizado pela importação segura no painel docente.
    schemaVersion: 2,
    reportType: "patient-virtual-submission",
    caseId: activeCase,
    studentId: document.body.dataset.userId || null,
    studentName: document.body.dataset.userName || "Aluno não identificado",
    activityId: null,
    clientSubmissionId,
    submissionProtocol: clientSubmissionId,
    ruleSetVersion: scoreSummary.ruleSetVersion,
    case:
      activeCase === "marina"
        ? marinaCase.exportLabel
        : "João, 54 anos — dor torácica",
    exportedAt,
    path: path.map((step, index) => ({
      step: index + 1,
      ...step,
      ...items.find((item) => item.id === step.id),
    })),
    attempts: attempts.map((attempt) => ({
      ...attempt,
      actions: [...attempt.actions],
    })),
    scoring: {
      ...scoreSummary,
      events: scoreEvents.map((event) => ({ ...event })),
    },
  };
}

// Mantém rótulo e conteúdo como texto, inclusive quando o aluno escreve sinais de HTML.
function reportField(label, value) {
  return {
    text: [{ text: `${label}: `, bold: true }, String(value)],
    margin: [0, 0, 0, 5],
  };
}

// Apresenta cada escolha em ordem, com resposta e orientação pedagógica do catálogo.
function buildReportPath(report) {
  if (!report.path.length) return [{ text: "Nenhuma pergunta ou exame registrado." }];
  return report.path.flatMap((step) => {
    const parent = report.path.find((entry) => entry.id === step.parent);
    return [
      {
        text: `${step.step}. ${step.title}`,
        style: "subheading",
        headlineLevel: 2,
      },
      reportField("Registro", `${step.time} | ${step.type === "question" ? "Pergunta" : "Exame"}`),
      reportField("Resposta / resultado", step.answer),
      reportField("Avaliação pedagógica", step.quality),
      reportField("Comentário", step.why),
      reportField(
        "Pontuação",
        `Clínica: ${step.scoreEvent.basePoints >= 0 ? "+" : ""}${step.scoreEvent.basePoints} | ` +
          `Prioridade: ${step.scoreEvent.priorityBonus >= 0 ? "+" : ""}${step.scoreEvent.priorityBonus} | ` +
          `Eficiência: ${step.scoreEvent.efficiencyPenalty} | ` +
          `Variação: ${step.scoreEvent.delta >= 0 ? "+" : ""}${step.scoreEvent.delta} | ` +
          `Total: ${step.scoreEvent.displayedTotalAfterAction}`,
      ),
      ...(parent ? [reportField("Liberado após", `${parent.step}. ${parent.title}`)] : []),
    ];
  });
}

// Preserva a justificativa completa e relaciona somente ações realizadas antes de cada tentativa.
function buildReportAttempts(report) {
  if (!report.attempts.length) return [{ text: "Nenhuma hipótese registrada." }];
  return report.attempts.flatMap((attempt, index) => {
    const actionNames = attempt.actions.map((id) => {
      const step = report.path.find((entry) => entry.id === id);
      return step ? `${step.step}. ${step.title}` : id;
    });
    return [
      { text: `Tentativa ${index + 1}`, style: "subheading", headlineLevel: 2 },
      reportField("Hipótese", attempt.hypothesis),
      reportField(
        "Resultado",
        attempt.correct
          ? "Hipótese compatível com o desfecho esperado."
          : "Hipótese diferente do desfecho esperado.",
      ),
      reportField("Justificativa do aluno", attempt.reason),
      { text: "Escolhas realizadas até esta tentativa:", bold: true, margin: [0, 3, 0, 5] },
      actionNames.length
        ? { ul: actionNames, margin: [0, 0, 0, 8] }
        : { text: "Nenhuma pergunta ou exame registrado antes desta tentativa." },
    ];
  });
}

// Define um relatório A4 com texto selecionável, paginação automática e fontes com acentos.
function buildReportDocument(report) {
  const questions = report.path.filter((step) => step.type === "question").length;
  const exams = report.path.filter((step) => step.type === "exam").length;
  return {
    pageSize: "A4",
    pageMargins: [42, 48, 42, 48],
    info: { title: `Relatório de atendimento - ${report.case}`, subject: "Percurso educacional do paciente virtual" },
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.2, color: "#223447" },
    styles: {
      title: { fontSize: 20, bold: true, margin: [0, 0, 0, 12] },
      heading: { fontSize: 14, bold: true, margin: [0, 16, 0, 8] },
      subheading: { fontSize: 11, bold: true, margin: [0, 12, 0, 6] },
      note: { fontSize: 9, color: "#526172", margin: [0, 6, 0, 6] },
    },
    header: { text: "PACIENTE VIRTUAL | RELATÓRIO EDUCACIONAL", fontSize: 8, color: "#526172", margin: [42, 20, 42, 0] },
    footer: (currentPage, pageCount) => ({
      text: `Página ${currentPage} de ${pageCount}`,
      alignment: "right",
      fontSize: 8,
      color: "#526172",
      margin: [42, 15, 42, 0],
    }),
    // Evita que o título de uma seção fique isolado no fim de uma página.
    pageBreakBefore: (currentNode, followingNodesOnPage) =>
      Boolean(currentNode.headlineLevel && followingNodesOnPage.length === 0),
    content: [
      { text: "Relatório de atendimento", style: "title" },
      reportField("Caso", report.case),
      reportField("Exportado em", new Date(report.exportedAt).toLocaleString("pt-BR", { timeZoneName: "short" })),
      reportField("Resumo", `${questions} pergunta(s), ${exams} exame(s) e ${report.attempts.length} tentativa(s)`),
      reportField("Protocolo", report.submissionProtocol || "Cópia ainda não enviada"),
      { text: "Resumo da pontuação", style: "heading", headlineLevel: 1 },
      reportField("Pontuação inicial", report.scoring.initialScore),
      reportField("Pontuação final", report.scoring.displayedTotal),
      reportField("Total bruto", report.scoring.rawTotal),
      reportField("Orçamento recomendado", `${report.scoring.actionCount} de ${report.scoring.recommendedActionBudget} escolhas`),
      reportField("Versão das regras", report.scoring.ruleSetVersion),
      reportField("Ganhos", report.scoring.gains),
      reportField("Perdas", report.scoring.losses),
      reportField("Bônus de prioridade", report.scoring.priorityBonus),
      reportField("Penalidades de eficiência", report.scoring.efficiencyPenalty),
      {
        text: "Caso fictício com resultados simulados, para uso educacional. Conteúdo sujeito à validação docente. Os horários e a ordem das escolhas não representam tempo clínico.",
        style: "note",
      },
      { text: "Percurso de investigação", style: "heading", headlineLevel: 1 },
      ...buildReportPath(report),
      { text: "Hipóteses e justificativas", style: "heading", headlineLevel: 1 },
      {
        text: "O resultado compara apenas a hipótese selecionada com o desfecho esperado. A justificativa não é corrigida automaticamente e deve ser analisada pelo professor.",
        style: "note",
      },
      ...buildReportAttempts(report),
    ],
  };
}

// Usa o fluxo público da biblioteca com fontes locais para capturar erros e gerar um PDF real.
function encodeReportPayload(report) {
  const bytes = new TextEncoder().encode(JSON.stringify(report));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// Acrescenta os dados estruturados como comentário após o PDF. Leitores comuns ignoram
// esse trecho, enquanto a plataforma consegue validar e reconstruir o percurso original.
function createReportBlob(documentDefinition, report) {
  return new Promise((resolve, reject) => {
    const stream = window.pdfMake.createPdf(documentDefinition).getStream();
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => {
      const marker = `\n%PV_REPORT_V1:${encodeReportPayload(report)}\n`;
      resolve(new Blob([...chunks, marker], { type: "application/pdf" }));
    });
    stream.end();
  });
}

// Mantém um link visível para download manual caso o navegador bloqueie o clique automático.
let reportUrl = null;
function downloadReport(blob, filename, startDownload = true) {
  if (reportUrl) URL.revokeObjectURL(reportUrl);
  reportUrl = URL.createObjectURL(blob);
  const downloadLink = $("downloadPdf");
  downloadLink.href = reportUrl;
  downloadLink.download = filename;
  downloadLink.hidden = false;
  if (startDownload) downloadLink.click();
}
window.addEventListener("pagehide", () => {
  if (reportUrl) URL.revokeObjectURL(reportUrl);
});

// Altera os controles de investigação quando a tentativa entra em conclusão.
function setSessionControlsDisabled(disabled) {
  $("reset").disabled = disabled;
  $("diagnose").disabled = disabled;
  $("blocks").setAttribute("aria-disabled", String(disabled));
}

// Informa o estágio da entrega com texto persistente e anúncio acessível.
function setSubmissionStatus(state, message) {
  const status = $("submissionStatus");
  status.dataset.state = state;
  status.textContent = message;
  status.setAttribute("aria-busy", String(["preparing", "generating", "sending"].includes(state)));
}

// Cria uma chave idempotente estável para todos os retries desta conclusão.
function createClientSubmissionId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

// Traduz falhas conhecidas da API em instruções úteis, sem afirmar que houve envio.
function submissionErrorMessage(error, stage) {
  if (stage === "generating") return "Não foi possível gerar o PDF. Seu percurso foi preservado; tente novamente.";
  if (error?.status === 401) return "Sua sessão expirou. Entre novamente e tente reenviar.";
  if (error?.status === 403) return "Sua conta não tem autorização para enviar este atendimento.";
  if (error?.status === 409) return "O protocolo já foi usado com outro conteúdo. Reinicie o atendimento.";
  if (error?.status >= 400 && error?.status < 500)
    return error.message || "O atendimento contém dados que precisam ser revisados.";
  return "Não foi possível alcançar o servidor. Seu percurso foi preservado; tente novamente.";
}

// Prepara uma cópia manual sem modificar ou finalizar o atendimento.
$("export").onclick = async () => {
  const button = $("export");
  if (button.disabled || !activeCase) return;
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Gerando PDF…";
  button.setAttribute("aria-busy", "true");
  try {
    if (!window.pdfMake) throw new Error("Biblioteca PDF indisponível.");
    const report = pendingSubmission?.report || collectReportData();
    const blob = pendingSubmission?.pdf || await createReportBlob(buildReportDocument(report), report);
    downloadReport(blob, `percurso-${activeCase}.pdf`);
    notify("PDF pronto. Se o download não iniciar, clique em Baixar PDF.");
  } catch (error) {
    console.error("Não foi possível exportar o percurso em PDF.", error);
    notify("Não foi possível gerar o PDF. Tente novamente.");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
    button.removeAttribute("aria-busy");
  }
};

// Congela um retrato da tentativa, gera o PDF e envia ambos com a mesma chave idempotente.
async function finalizeAndSubmit() {
  const button = $("finalizeSubmission");
  if (button.disabled || !activeCase || !attempts.length) return;
  completionLocked = true;
  setSessionControlsDisabled(true);
  button.disabled = true;
  button.setAttribute("aria-busy", "true");

  let stage = "preparing";
  try {
    if (!pendingSubmission) {
      const clientSubmissionId = createClientSubmissionId();
      pendingSubmission = {
        clientSubmissionId,
        report: collectReportData(new Date().toISOString(), clientSubmissionId),
        pdf: null,
      };
    }

    setSubmissionStatus("preparing", "Preparando atendimento…");
    if (!window.pdfMake) throw new Error("Biblioteca PDF indisponível.");
    if (!pendingSubmission.pdf) {
      stage = "generating";
      setSubmissionStatus("generating", "Gerando PDF…");
      pendingSubmission.pdf = await createReportBlob(
        buildReportDocument(pendingSubmission.report),
        pendingSubmission.report,
      );
    }

    stage = "sending";
    setSubmissionStatus("sending", "Enviando ao professor…");
    const submission = await SubmissionService.submit({
      report: pendingSubmission.report,
      pdf: pendingSubmission.pdf,
      clientSubmissionId: pendingSubmission.clientSubmissionId,
      activityId: pendingSubmission.report.activityId,
    });
    const protocol = submission?.protocol || submission?.id || pendingSubmission.clientSubmissionId;
    setSubmissionStatus(
      "sent",
      `Enviado para revisão. Protocolo: ${protocol}.`,
    );
    button.textContent = "Atendimento enviado";
    $("downloadPdf").textContent = "Baixar PDF enviado";
    downloadReport(pendingSubmission.pdf, `percurso-${activeCase}-${protocol}.pdf`, false);
    notify("Atendimento e PDF enviados ao professor.");
  } catch (error) {
    console.error("Não foi possível finalizar o atendimento.", error);
    setSubmissionStatus("error", submissionErrorMessage(error, stage));
    button.disabled = false;
    button.textContent = "Tentar novamente";
  } finally {
    button.removeAttribute("aria-busy");
  }
}

$("finalizeSubmission").onclick = finalizeAndSubmit;

// ESCOLHA E ABERTURA DO CASO
// ----------------------------------------------------------------------
// Inicia uma única sessão a partir da escolha do caso e prepara seus dados na interface.
$("caseForm").onsubmit = (event) => {
  event.preventDefault();
  const selected = $("caseSelect").value;
  if (activeCase || !["joao", "marina"].includes(selected)) return;
  activeCase = selected;
  items = selected === "marina" ? marinaCase.items : joaoItems;
  scoringSession = ClinicalScoring.startSession(activeCase);
  $("blocks").dataset.totalOptions = String(items.length);
  // Substitui a apresentação inicial de João pelos dados, imagem e alternativas de Marina.
  if (selected === "marina") {
    const patient = marinaCase.patient;
    document.querySelector(".intro .eyebrow").textContent =
      "Caso 02 / Pronto atendimento";
    const scene = document.querySelector(".patient-scene");
    const sceneImage = scene.querySelector("img");
    sceneImage.src =
      "../assets/images/marina-atendimento.png";
    sceneImage.alt =
      "Ilustração de Marina, sentada com a mão sobre o abdômen, sendo acolhida por uma profissional de enfermagem.";
    sceneImage.width = 1536;
    sceneImage.height = 1024;
    scene.querySelector("figcaption").textContent =
      "Marina na chegada ao atendimento · imagem gerada por IA";
    scene.hidden = false;
    document.querySelector(".patient .avatar").textContent =
      patient.initials;
    document.querySelector(".patient h3").textContent =
      patient.name + ", " + patient.age + " anos";
    // Converte as características da paciente em etiquetas visuais.
    document.querySelector(".patient .tags").innerHTML = patient.tags
      .map((tag) => `<span>${tag}</span>`)
      .join("");
    document.querySelector(".patient > p").textContent =
      patient.complaint;
    document.querySelector(".patient > .meta").textContent =
      patient.onset;
    // Preenche o seletor com as alternativas diagnósticas específicas de Marina.
    $("hypothesis").innerHTML =
      '<option value="">Selecione uma hipótese</option>' +
      marinaCase.hypotheses
        .map(
          (option) =>
            `<option value="${option.value}">${option.label}</option>`,
        )
        .join("");
    // Atualiza os links bibliográficos preservando o trecho inicial do rodapé.
    const footer = document.querySelector("footer");
    footer.innerHTML =
      footer.innerHTML.slice(
        0,
        footer.innerHTML.indexOf("Referência:"),
      ) +
      "Referência: " +
      marinaCase.references
        .map(
          (reference) =>
            `<a href="${reference.url}" target="_blank" rel="noopener">${reference.label}</a>`,
        )
        .join(" e ") +
      ". Ao finalizar, o percurso e o PDF são enviados automaticamente ao professor.";
  }
  render();
  // Exibe o atendimento e direciona o foco ao título para facilitar a navegação por teclado.
  $("caseChoice").hidden = true;
  $("caseSession").hidden = false;
  $("caseActions").hidden = false;
  const heading = document.querySelector(".intro h2");
  heading.tabIndex = -1;
  heading.focus();
};
