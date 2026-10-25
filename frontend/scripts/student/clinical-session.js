// Interface de atendimento: nenhuma resposta, gabarito ou regra de correção é embarcada.
import {
  ClinicalSessionService
} from '../services/clinical-session-service.js';
import {
  CaseService
} from '../services/case-service.js';
import {
  SubmissionService
} from '../services/submission-service.js';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
} [c]));
let session = null,
  catalog = [],
  activeCase = null,
  filter = 'all',
  busy = false,
  pendingSubmission = null,
  path = [],
  attempts = [];
let timer;

function notify(message) {
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  clearTimeout(timer);
  timer = setTimeout(() => $('toast').classList.add('hidden'), 6500);
}
// Atualiza somente dados liberados pelo servidor e preserva a versão da sessão.
function adopt(snapshot) {
  session = snapshot;
  path = snapshot.path || [];
  attempts = snapshot.attempts || [];
  render();
}

function render() {
  const selected = new Set(path.map(x => x.id));
  const choices = (session.choices || []).filter(x => !selected.has(x.id) && (!x.parent || selected.has(x
    .parent)) && (filter === 'all' || x.type === filter));
  $('blocks').innerHTML = choices.map(x =>
    `<button type="button" class="block ${x.type==='exam'?'exam':''}" draggable="true" data-id="${esc(x.id)}" ${busy||session.status!=='active'?'disabled':''}><span>${esc(x.title)}</span><span aria-hidden="true">+</span></button>`
  ).join('') || '<p>Nenhuma opção disponível neste filtro.</p>';
  $('count').textContent = String(path.length).padStart(2, '0');
  $('empty').hidden = path.length > 0;
  $('historyEmpty').hidden = path.length > 0;
  $('timeline').innerHTML = path.map((x, i) =>
    `<li><span class="meta">${i+1} · ${esc(x.time)}</span><b>${esc(x.title)}</b></li>`).join('');
  // Mantém relações entre escolhas sem buscar respostas de opções ainda não realizadas.
  const renderNode = step => {
    const children = path.filter(child => child.parent === step.id);
    return `<article class="node ${step.type === 'exam' ? 'exam' : ''}"><div class="meta">${path.indexOf(step) + 1} · ${step.type === 'exam' ? 'EXAME' : 'PERGUNTA'}</div><h4>${esc(step.title)}</h4><p>${esc(step.answer)}</p></article>${children.length ? `<div class="children">${children.map(renderNode).join('')}</div>` : ''}`;
  };
  $('branches').innerHTML = path.filter(step => !step.parent || !selected.has(step.parent)).map(step =>
    `<div class="branch">${renderNode(step)}</div>`).join('');
  const s = session.score || {};
  $('scoreValue').textContent = s.displayed ?? s.displayedTotal ?? 50;
  $('scoreRaw').textContent = s.raw ?? s.rawTotal ?? 50;
  $('scoreBudget').textContent = `${path.length} de ${s.recommendedActionBudget??12}`;
  $('scoreChange').textContent = 'Pontuação calculada e persistida pelo servidor.';
  $('diagnose').disabled = busy || session.status !== 'active';
}
// Uma ação só aparece no mapa após ser aceita pela API; falhas não criam escolhas locais.
async function chooseAction(itemKey) {
  if (!itemKey || busy || !session || session.status !== 'active') return;
  // A renderização substitui os botões; guarda a posição para continuar pelo teclado.
  const focusedAction = document.activeElement?.closest('#blocks button[data-id]');
  const focusedIndex = focusedAction
    ? Array.from($('blocks').querySelectorAll('button[data-id]')).indexOf(focusedAction) : -1;
  busy = true;
  render();
  try {
    adopt(await ClinicalSessionService.choose(session.id, itemKey));
    // Confirma a atualização sem repetir o mapa inteiro para leitores de tela.
    const chosen = path.find(step => step.id === itemKey);
    $('investigationStatus').textContent = `${chosen?.title || "Ação"} registrada. ${path.length} ações no percurso.`;
  } catch (error) {
    notify(error.message);
  } finally {
    busy = false;
    render();
    // Não rouba o foco se o aluno navegou para outro controle durante a requisição.
    if (focusedIndex >= 0 && document.activeElement === document.body) {
      const available = $('blocks').querySelectorAll('button[data-id]:not(:disabled)');
      (available[Math.min(focusedIndex, available.length - 1)] || $('diagnose')).focus();
    }
  }
}
$('blocks').addEventListener('click', event => chooseAction(event.target.closest('[data-id]')?.dataset.id));
// Arrastar e clicar compartilham a mesma validação do servidor e a mesma fila de ação.
$('blocks').addEventListener('dragstart', event => {
  const block = event.target.closest('[data-id]');
  if (block) {
    event.dataTransfer.setData('text/plain', block.dataset.id);
    event.dataTransfer.effectAllowed = 'copy';
  }
});
$('map').addEventListener('dragover', event => {
  event.preventDefault();
  $('map').classList.add('over');
});
$('map').addEventListener('dragleave', event => {
  if (!$('map').contains(event.relatedTarget)) $('map').classList.remove('over');
});
$('map').addEventListener('drop', event => {
  event.preventDefault();
  $('map').classList.remove('over');
  chooseAction(event.dataTransfer.getData('text/plain'));
});
document.addEventListener('dragend', () => $('map').classList.remove('over'));
document.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => {
  filter = b.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(x => {
    x.classList.toggle('active', x === b);
    x.setAttribute('aria-pressed', String(x === b));
  });
  if (session) render();
});
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).close());
$('diagnose').onclick = () => $('diagnosis').showModal();
$('reset').onclick = () => $('restart').showModal();
// Reiniciar abre outra sessão. O histórico anterior nunca é apagado.
$('confirmReset').onclick = async () => {
  try {
    adopt(await ClinicalSessionService.start(activeCase));
    pendingSubmission = null;
    $('diagnosisForm').reset();
    $('restart').close();
    $('finalizeSubmission').disabled = false;
    $('finalizeSubmission').textContent = 'Finalizar caso e enviar ao professor';
    $('submissionStatus').textContent = 'Finalize o caso para enviá-lo automaticamente ao professor.';
    $('downloadPdf').hidden = true;
    notify('Nova tentativa criada; o atendimento anterior foi preservado.');
  } catch (e) {
    notify(e.message);
  }
};
$('reason').oninput = () => $('reason').setCustomValidity('');
// Hipóteses são avaliadas no backend, sem expor diagnóstico antes da conclusão.
$('diagnosisForm').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  const reason = $('reason').value.trim();
  if (!reason) return;
  busy = true;
  try {
    adopt(await ClinicalSessionService.hypothesis(session.id, $('hypothesis').value, reason));
    $('diagnosis').close();
    $('feedback').replaceChildren();
    const p = document.createElement('p');
    p.textContent =
      'Hipótese e justificativa registradas. A avaliação docente ficará disponível em Minhas devolutivas. Finalize para enviar o percurso e PDF.';
    $('feedback').append(p);
    $('result').showModal();
    await finalizeAndSubmit();
  } catch (e) {
    notify(e.message);
  } finally {
    busy = false;
    render();
  }
};
// O relatório é uma cópia legível; a API confere o percurso contra a sessão persistida.
function collectReportData() {
  const s = session.score || {};
  return {
    schemaVersion: 2,
    reportType: 'patient-virtual-submission',
    clinicalSessionId: session.id,
    caseId: activeCase,
    caseVersion: session.versionId,
    case: catalog.find(c => c.key === activeCase)?.title || activeCase,
    studentId: document.body.dataset.userId,
    studentName: document.body.dataset.userName,
    exportedAt: new Date().toISOString(),
    path: path.map((x, i) => ({
      ...x,
      step: i + 1
    })),
    attempts: attempts.map(x => ({
      ...x,
      actions: x.actions || []
    })),
    ruleSetVersion: s.ruleSetVersion || 'server-v1',
    scoring: {
      ...s,
      initialScore: s.initial ?? 50,
      rawTotal: s.raw ?? s.rawTotal ?? 50,
      displayedTotal: s.displayed ?? s.displayedTotal ?? 50,
      recommendedActionBudget: s.recommendedActionBudget ?? 12,
      actionCount: path.length,
      gains: s.gains ?? 0,
      losses: s.losses ?? 0,
      priorityBonus: s.priorityBonus ?? 0,
      efficiencyPenalty: s.efficiencyPenalty ?? 0,
      ruleSetVersion: s.ruleSetVersion || 'server-v1',
      events: s.events || []
    }
  };
}

function reportField(label, value) {
  return {
    text: [{
      text: `${label}: `,
      bold: true
    }, String(value)],
    margin: [0, 0, 0, 5],
  };
}

// Apresenta cada escolha em ordem, com resposta e orientação pedagógica do catálogo.
function buildReportPath(report) {
  if (!report.path.length) return [{
    text: "Nenhuma pergunta ou exame registrado."
  }];
  return report.path.flatMap((step) => {
    const parent = report.path.find((entry) => entry.id === step.parent);
    return [{
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
        `Clínica: ${(step.scoreEvent?.basePoints ?? 0) >= 0 ? "+" : ""}${(step.scoreEvent?.basePoints ?? 0)} | ` +
        `Prioridade: ${(step.scoreEvent?.priorityBonus ?? 0) >= 0 ? "+" : ""}${(step.scoreEvent?.priorityBonus ?? 0)} | ` +
        `Eficiência: ${(step.scoreEvent?.efficiencyPenalty ?? 0)} | ` +
        `Variação: ${(step.scoreEvent?.delta ?? 0) >= 0 ? "+" : ""}${(step.scoreEvent?.delta ?? 0)} | ` +
        `Total: ${(step.scoreEvent?.displayedTotalAfterAction ?? "—")}`,
      ),
      ...(parent ? [reportField("Liberado após", `${parent.step}. ${parent.title}`)] : []),
    ];
  });
}

// Preserva a justificativa completa e relaciona somente ações realizadas antes de cada tentativa.
function buildReportAttempts(report) {
  if (!report.attempts.length) return [{
    text: "Nenhuma hipótese registrada."
  }];
  return report.attempts.flatMap((attempt, index) => {
    const actionNames = attempt.actions.map((id) => {
      const step = report.path.find((entry) => entry.id === id);
      return step ? `${step.step}. ${step.title}` : id;
    });
    return [{
        text: `Tentativa ${index + 1}`,
        style: "subheading",
        headlineLevel: 2
      },
      reportField("Hipótese", attempt.hypothesis),
      reportField(
        "Resultado",
        attempt.correct ?
        "Hipótese compatível com o desfecho esperado." :
        "Hipótese diferente do desfecho esperado.",
      ),
      reportField("Justificativa do aluno", attempt.reason), {
        text: "Escolhas realizadas até esta tentativa:",
        bold: true,
        margin: [0, 3, 0, 5]
      },
      actionNames.length ? {
        ul: actionNames,
        margin: [0, 0, 0, 8]
      } : {
        text: "Nenhuma pergunta ou exame registrado antes desta tentativa."
      },
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
    info: {
      title: `Relatório de atendimento - ${report.case}`,
      subject: "Percurso educacional do paciente virtual"
    },
    defaultStyle: {
      font: "Roboto",
      fontSize: 10,
      lineHeight: 1.2,
      color: "#223447"
    },
    styles: {
      title: {
        fontSize: 20,
        bold: true,
        margin: [0, 0, 0, 12]
      },
      heading: {
        fontSize: 14,
        bold: true,
        margin: [0, 16, 0, 8]
      },
      subheading: {
        fontSize: 11,
        bold: true,
        margin: [0, 12, 0, 6]
      },
      note: {
        fontSize: 9,
        color: "#526172",
        margin: [0, 6, 0, 6]
      },
    },
    header: {
      text: "PACIENTE VIRTUAL | RELATÓRIO EDUCACIONAL",
      fontSize: 8,
      color: "#526172",
      margin: [42, 20, 42, 0]
    },
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
    content: [{
        text: "Relatório de atendimento",
        style: "title"
      },
      reportField("Caso", report.case),
      reportField("Exportado em", new Date(report.exportedAt).toLocaleString("pt-BR", {
        timeZoneName: "short"
      })),
      reportField("Resumo",
        `${questions} pergunta(s), ${exams} exame(s) e ${report.attempts.length} tentativa(s)`),
      reportField("Protocolo", report.submissionProtocol || "Cópia ainda não enviada"), {
        text: "Resumo da pontuação",
        style: "heading",
        headlineLevel: 1
      },
      reportField("Pontuação inicial", report.scoring.initialScore),
      reportField("Pontuação final", report.scoring.displayedTotal),
      reportField("Total bruto", report.scoring.rawTotal),
      reportField("Orçamento recomendado",
        `${report.scoring.actionCount} de ${report.scoring.recommendedActionBudget} escolhas`),
      reportField("Versão das regras", report.scoring.ruleSetVersion),
      reportField("Ganhos", report.scoring.gains),
      reportField("Perdas", report.scoring.losses),
      reportField("Bônus de prioridade", report.scoring.priorityBonus),
      reportField("Penalidades de eficiência", report.scoring.efficiencyPenalty), {
        text: "Caso fictício com resultados simulados, para uso educacional. Conteúdo sujeito à validação docente. Os horários e a ordem das escolhas não representam tempo clínico.",
        style: "note",
      }, {
        text: "Percurso de investigação",
        style: "heading",
        headlineLevel: 1
      },
      ...buildReportPath(report), {
        text: "Hipóteses e justificativas",
        style: "heading",
        headlineLevel: 1
      }, {
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
      resolve(new Blob([...chunks, marker], {
        type: "application/pdf"
      }));
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

// Reenvios usam o mesmo relatório, PDF e protocolo, evitando duplicação por falha de rede.
async function finalizeAndSubmit() {
  const button = $('finalizeSubmission');
  if (button.disabled || !session || !attempts.length) return;
  button.disabled = true;
  try {
    if (!pendingSubmission) {
      const clientSubmissionId = crypto.randomUUID();
      const report = collectReportData();
      report.clientSubmissionId = clientSubmissionId;
      report.submissionProtocol = clientSubmissionId;
      pendingSubmission = {
        clientSubmissionId,
        report,
        pdf: null
      };
    }
    $('submissionStatus').textContent = 'Gerando PDF e enviando atendimento…';
    if (!window.pdfMake) throw Error('Biblioteca PDF indisponível. Atualize a página e tente novamente.');
    if (!pendingSubmission.pdf) pendingSubmission.pdf = await createReportBlob(buildReportDocument(
      pendingSubmission.report), pendingSubmission.report);
    const result = await SubmissionService.submit(pendingSubmission);
    $('submissionStatus').textContent =
      `Atendimento enviado. Protocolo: ${result.protocol||result.id}. Consulte Meus atendimentos para acompanhar a devolutiva.`;
    button.textContent = 'Atendimento enviado';
    session.status = 'submitted';
    render();
    downloadReport(pendingSubmission.pdf, `percurso-${activeCase}.pdf`, false);
  } catch (e) {
    $('submissionStatus').textContent = e.message;
    button.disabled = false;
    button.textContent = 'Tentar enviar novamente';
  }
}
$('finalizeSubmission').onclick = finalizeAndSubmit;
$('export').onclick = async () => {
  try {
    const report = pendingSubmission?.report || collectReportData();
    const blob = pendingSubmission?.pdf || await createReportBlob(buildReportDocument(report), report);
    downloadReport(blob, `percurso-${activeCase}.pdf`);
  } catch (e) {
    notify(e.message);
  }
};
// Catálogo público apresenta metadados revisados; não carrega conteúdo docente oculto.
async function loadCatalog() {
  $('catalogStatus').textContent = 'Carregando casos…';
  try {
    const result = await CaseService.list();
    catalog = Array.isArray(result) ? result : result.items || [];
    renderCatalogOptions();
    $('catalogStatus').textContent = catalog.some(x => x.status === 'published') ?
      'Escolha um caso publicado.' : 'Nenhum caso publicado disponível.';
  } catch (e) {
    $('catalogStatus').textContent = e.message;
  }
}
// Busca apenas metadados públicos; especialidades internas não são expostas pelo filtro.
function renderCatalogOptions() {
  const select = $('caseSelect'),
    previous = select.value;
  const query = $('catalogSearch').value.trim().toLocaleLowerCase('pt-BR');
  const difficulty = $('catalogDifficulty').value;
  select.replaceChildren(new Option('Selecione um paciente', ''));
  for (const c of catalog.filter(x => x.status === 'published')) {
    const publicText = [c.title, c.metadata?.publicSummary, ...(c.metadata?.publicTags || []), ...(c.metadata
      ?.skills || [])].join(' ').toLocaleLowerCase('pt-BR');
    if ((difficulty && c.metadata?.difficulty !== difficulty) || (query && !publicText.includes(query)))
      continue;
    const level = {
      introductory: 'Introdutório',
      intermediate: 'Intermediário',
      advanced: 'Avançado'
    } [c.metadata?.difficulty] || 'Dificuldade em revisão';
    select.add(new Option(`${c.title} · ${level}`, c.key));
  }
  if ([...select.options].some(option => option.value === previous)) select.value = previous;
  $('caseMetadata').textContent = '';
}
$('catalogSearch').oninput = renderCatalogOptions;
$('catalogDifficulty').onchange = renderCatalogOptions;
$('catalogRetry').onclick = loadCatalog;
$('caseSelect').onchange = () => {
  const c = catalog.find(x => x.key === $('caseSelect').value);
  $('caseMetadata').textContent = c ?
    `${c.metadata?.publicSummary||''} · ${c.metadata?.audience||'Público em revisão'} · ${(c.metadata?.publicTags||[]).join(' · ')}` :
    '';
};
$('caseForm').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  const button = event.submitter;
  button.disabled = true;
  try {
    activeCase = $('caseSelect').value;
    if (!activeCase) return;
    adopt(await ClinicalSessionService.start(activeCase));
    const c = catalog.find(x => x.key === activeCase) || {},
      patient = session.patient || c.patient || {};
    document.querySelector('.patient h3').textContent =
      `${patient.name||c.title}${patient.age?', '+patient.age+' anos':''}`;
    document.querySelector('.patient .avatar').textContent = patient.initials || 'PV';
    document.querySelector('.patient > p').textContent = patient.complaint || '';
    document.querySelector('.patient > .meta').textContent = patient.onset || '';
    const tags = document.querySelector('.patient .tags');
    tags.replaceChildren();
    for (const t of patient.tags || []) {
      const span = document.createElement('span');
      span.textContent = t;
      tags.append(span);
    }
    const image = document.querySelector('.patient-scene img');
    const imageSource = c.image || '';
    image.closest('figure').hidden = !imageSource;
    if (imageSource && /^(?:\.\.\/|\/)assets\/images\/[\w.-]+$/.test(imageSource)) {
      image.src = `../assets/images/${imageSource.split('/').pop()}`;
      image.alt = `Ilustração educacional de ${patient.name||'paciente fictício'}`;
      // O figure é compartilhado pelos casos; a legenda acompanha o paciente escolhido.
      image.closest('figure').querySelector('figcaption').textContent =
        `${patient.name||'Paciente fictício'} na chegada ao atendimento · imagem gerada por IA`;
    } else image.closest('figure').hidden = true;
    document.querySelector('.intro .eyebrow').textContent =
      `Caso ${activeCase} · versão ${session.versionId}`;
    document.querySelector('.intro .badge').textContent = ({
      introductory: 'Introdutório',
      intermediate: 'Intermediário',
      advanced: 'Avançado'
    } [c.metadata?.difficulty] || 'Classificação em revisão');
    const h = $('hypothesis');
    h.replaceChildren(new Option('Selecione uma hipótese', ''));
    for (const option of session.hypotheses || []) h.add(new Option(typeof option === 'string' ? option :
      option.label, typeof option === 'string' ? option : option.value));
    $('caseChoice').hidden = true;
    $('caseSession').hidden = false;
    $('caseActions').hidden = false;
    // O formulário anterior fica oculto; o foco acompanha a nova etapa da jornada.
    $('caseIntroTitle').focus();
  } catch (e) {
    notify(e.message);
  } finally {
    busy = false;
    button.disabled = false;
    if (session) render();
  }
};
loadCatalog();
