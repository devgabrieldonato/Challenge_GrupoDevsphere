import {
  DIFFICULTY_RUBRIC_VERSION,
  DIFFICULTY_LEVEL_LABELS,
  DIFFICULTY_DIMENSIONS,
  assessDifficulty
} from './difficulty-rubric.js';
import {
  apiRequest
} from '../services/api-client.js';
import {
  AuthService
} from '../services/auth-service.js';
import {
  node,
  message,
  button
} from '../services/ui.js';
const $ = id => document.getElementById(id),
  status = $('curationStatus');
let current, user, editingBase, initialGuidedSerialized;
let itemControls = [];
let initialRubricState = null,
  removeGuidedAssessment = false,
  previousRubricVersion = null;
const rubricControls = new Map();
const transitions = {
  draft: ['submit'],
  changes_requested: ['submit'],
  awaiting_review: ['start', 'request_changes', 'reject'],
  submitted: ['start', 'request_changes', 'reject'],
  in_review: ['request_changes', 'approve', 'reject'],
  approved: ['publish'],
  published: ['archive'],
  rejected: ['archive']
};
const labels = {
  submit: 'Solicitar revisão',
  start: 'Iniciar revisão',
  request_changes: 'Solicitar ajustes',
  approve: 'Aprovar versão',
  publish: 'Publicar versão aprovada',
  reject: 'Recusar',
  archive: 'Arquivar'
};
// Valores pedagógicos são fixos no conjunto atual; o revisor escolhe a classificação.
const scoreCategories = {
  priority: {
    label: 'Ação prioritária',
    points: 5
  },
  relevant: {
    label: 'Ação pertinente',
    points: 3
  },
  complementary: {
    label: 'Ação complementar',
    points: 1
  },
  low_value: {
    label: 'Ação de baixo valor',
    points: -8
  },
  inappropriate: {
    label: 'Ação inadequada',
    points: -12
  }
};
const lines = text => text.split('\n').map(value => value.trim()).filter(Boolean);

// Cada campo tem rótulo ligado ao controle, incluindo os quarenta itens clínicos.
function editorField(parent, label, value, id, tag = 'textarea') {
  const caption = node('label', label);
  caption.htmlFor = id;
  const control = document.createElement(tag);
  control.id = id;
  control.value = value ?? '';
  parent.append(caption, control);
  return control;
}

// Os IDs e tipos permanecem imutáveis; dependências só apontam para itens existentes.
function renderClinicalEditor(content) {
  editingBase = structuredClone(content);
  const patient = content.patient || {};
  const values = {
    patientName: patient.name ?? patient.displayName,
    patientAge: patient.age,
    patientInitials: patient.initials,
    patientComplaint: patient.complaint ?? patient.chiefComplaint,
    patientOnset: patient.onset,
    patientTags: (patient.tags || []).join('\n'),
    clinicalObjectives: (content.learningObjectives || []).join('\n'),
    clinicalHypotheses: (content.hypotheses || []).join('\n'),
    clinicalOutcome: content.outcome && typeof content.outcome === 'object' ? content.outcome.explanation :
      content.outcome,
    clinicalFeedback: content.pedagogicalFeedback
  };
  for (const [id, value] of Object.entries(values)) $(id).value = value ?? '';
  refreshHypotheses(content.correctHypothesis);
  const container = $('clinicalItemEditors');
  container.replaceChildren();
  itemControls = [];
  const items = content.items || [];
  const count = type => items.filter(item => item.type === type).length;
  $('clinicalItemsCount').textContent =
    `${count('question')} perguntas · ${count('exam')} exames · ${items.length} itens. O servidor exige 18 perguntas e 22 exames.`;
  items.forEach((item, index) => {
    const details = document.createElement('details');
    details.append(node('summary',
      `${index + 1}. ${item.type === 'question' ? 'Pergunta' : 'Exame'} · ${item.title}`));
    const body = node('div', '', 'next-form');
    details.append(body);
    body.append(node('p', `Identificador preservado: ${item.id}`));
    const title = editorField(body, 'Título da opção', item.title, `item-title-${index}`, 'input');
    title.required = true;
    const answer = editorField(body, 'Resposta / resultado liberado após a escolha', item.answer,
      `item-answer-${index}`);
    answer.required = true;
    const why = editorField(body, 'Justificativa pedagógica', item.why, `item-why-${index}`);
    const quality = editorField(body, 'Descrição da pertinência clínica', item.quality,
      `item-quality-${index}`, 'input');
    const rule = content.scoring?.items?.[item.id] || {};
    const classification = editorField(body, 'Classificação de pontuação', '', `item-score-${index}`,
      'select');
    for (const [key, data] of Object.entries(scoreCategories)) classification.add(new Option(
      `${data.label} (${data.points > 0 ? '+' : ''}${data.points})`, key));
    classification.value = rule.classification || 'relevant';
    const points = editorField(body, 'Pontos-base da regra selecionada', rule.basePoints ??
      scoreCategories[classification.value]?.points, `item-points-${index}`, 'input');
    points.readOnly = true;
    classification.onchange = () => {
      const selected = scoreCategories[classification.value];
      points.value = selected.points;
      quality.value = selected.label;
    };
    const parent = editorField(body, 'Liberar após esta pergunta ou exame', '', `item-parent-${index}`,
      'select');
    parent.add(new Option('Disponível desde o início', ''));
    for (const candidate of items)
      if (candidate.id !== item.id) parent.add(new Option(`${candidate.title} (${candidate.id})`,
        candidate.id));
    parent.value = item.parent || rule.parentId || '';
    const centralLabel = node('label');
    const central = document.createElement('input');
    central.type = 'checkbox';
    central.checked = Boolean(rule.isCentralEvidence);
    centralLabel.append(central, document.createTextNode(
      ' Evidência central elegível ao bônus de prioridade'));
    body.append(centralLabel);
    itemControls.push({
      item,
      title,
      answer,
      why,
      quality,
      classification,
      points,
      parent,
      central
    });
    container.append(details);
  });
  $('revisionContent').value = JSON.stringify(content, null, 2);
  initialGuidedSerialized = JSON.stringify(readClinicalEditor());
}

// A hipótese esperada precisa continuar entre as alternativas editadas.
function refreshHypotheses(preferred = $('clinicalCorrect').value) {
  const select = $('clinicalCorrect');
  select.replaceChildren(new Option('Selecione a hipótese esperada', ''));
  for (const hypothesis of lines($('clinicalHypotheses').value)) select.add(new Option(hypothesis,
    hypothesis));
  if ([...select.options].some(option => option.value === preferred)) select.value = preferred;
}
$('clinicalHypotheses').addEventListener('input', () => refreshHypotheses());

// Reconstrói somente campos conhecidos sobre uma cópia; extensões, fontes e proveniência não são descartadas.
function readClinicalEditor() {
  const content = structuredClone(editingBase);
  const optional = (target, key, value) => {
    if (key in target || (Array.isArray(value) ? value.length : value !== '')) target[key] = value;
  };
  content.patient = {
    ...content.patient,
    name: $('patientName').value,
    age: Number($('patientAge').value),
    complaint: $('patientComplaint').value
  };
  // O adaptador mantém aliases do schema de geração. Sincroniza somente quando já existem.
  if ('displayName' in content.patient) content.patient.displayName = content.patient.name;
  if ('chiefComplaint' in content.patient) content.patient.chiefComplaint = content.patient.complaint;
  optional(content.patient, 'initials', $('patientInitials').value);
  optional(content.patient, 'onset', $('patientOnset').value);
  optional(content.patient, 'tags', lines($('patientTags').value));
  optional(content, 'learningObjectives', lines($('clinicalObjectives').value));
  content.hypotheses = lines($('clinicalHypotheses').value);
  content.correctHypothesis = $('clinicalCorrect').value;
  // IDs estáveis do gerador acompanham as alternativas por posição; nunca são inferidos do texto.
  if ('hypothesisDefinitions' in content) {
    const definitions = content.hypothesisDefinitions;
    if (!Array.isArray(definitions) || definitions.length !== content.hypotheses.length) {
      throw Error(
        'A quantidade de alternativas difere do mapeamento de IDs. Corrija hypothesisDefinitions no conteúdo avançado antes de salvar.'
      );
    }
    const ids = definitions.map(definition => definition?.id);
    if (ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length || new Set(
        content.hypotheses).size !== content.hypotheses.length) {
      throw Error(
        'O mapeamento de hipóteses precisa de IDs únicos e alternativas distintas. Corrija o conteúdo avançado.'
      );
    }
    content.hypothesisDefinitions = definitions.map((definition, index) => ({
      ...definition,
      label: content.hypotheses[index]
    }));
    const expected = content.hypothesisDefinitions.find(definition => definition.label === content
      .correctHypothesis);
    if (!expected) throw Error('Selecione a hipótese esperada entre as alternativas antes de salvar.');
    if (content.outcome && typeof content.outcome === 'object' && !Array.isArray(content.outcome)) content
      .outcome.hypothesisId = expected.id;
  }

  // Casos gerados têm desfecho estruturado; o texto guiado edita a explicação sem apagar IDs/extensões.
  if (content.outcome && typeof content.outcome === 'object' && !Array.isArray(content.outcome)) {
    content.outcome = {
      ...content.outcome,
      explanation: $('clinicalOutcome').value
    };
    if ('rationale' in content) content.rationale = content.outcome.explanation;
  } else {
    optional(content, 'outcome', $('clinicalOutcome').value);
  }
  optional(content, 'pedagogicalFeedback', $('clinicalFeedback').value);
  if ('name' in content) content.name = content.patient.name;
  if ('age' in content) content.age = content.patient.age;

  content.scoring = structuredClone(content.scoring || {});
  content.scoring.items = {
    ...content.scoring.items
  };
  content.items = itemControls.map(control => {
    const item = {
      ...control.item,
      title: control.title.value,
      answer: control.answer.value,
      why: control.why.value,
      quality: control.quality.value
    };
    if (control.parent.value) item.parent = control.parent.value;
    else delete item.parent;
    const original = content.scoring.items[item.id] || {};
    const data = scoreCategories[control.classification.value];
    content.scoring.items[item.id] = {
      ...original,
      itemKey: item.id,
      itemType: item.type,
      classification: control.classification.value,
      classificationLabel: data.label,
      basePoints: data.points,
      pedagogicalRationale: item.why,
      parentId: item.parent || null,
      isCentralEvidence: control.central.checked
    };
    return item;
  });
  if ('priorityEvidenceIds' in content && itemControls.some(control => control.central.checked !== Boolean(
      editingBase.scoring?.items?.[control.item.id]?.isCentralEvidence))) content.priorityEvidenceIds =
    itemControls.filter(control => control.central.checked).map(control => control.item.id);
  return content;
}

// O JSON é opcional e só substitui a base após aplicação explícita, sem executar conteúdo externo.
$('applyAdvancedContent').onclick = () => {
  try {
    const content = JSON.parse($('revisionContent').value);
    if (!Array.isArray(content.items) || !content.patient) throw Error('Informe patient e a lista items.');
    renderClinicalEditor(content);
    message(status, 'Conteúdo avançado aplicado. Revise os campos antes de salvar a nova versão.');
  } catch (error) {
    message(status, error instanceof SyntaxError ? 'JSON inválido.' : error.message, true);
  }
};

// Captura estado bruto para detectar edições sem exigir uma avaliação completa durante a leitura.
function difficultyRubricState() {
  return JSON.stringify({
    enabled: $('useDifficultyRubric').checked,
    removed: removeGuidedAssessment,
    scores: Object.fromEntries([...rubricControls].map(([key, control]) => [key, control.value])),
    overrideReason: $('difficultyOverrideReason').value
  });
}

// A sugestão informa o docente; não seleciona nível nem marca os casos legados como avaliados.
function updateDifficultySuggestion() {
  const enabled = $('useDifficultyRubric').checked;
  for (const control of rubricControls.values()) control.disabled = !enabled;
  $('difficultyOverrideReason').disabled = !enabled;
  $('revisionDifficulty').required = enabled;
  $('difficultyOverrideReason').required = false;
  $('revisionRubric').readOnly = enabled;
  if (!enabled) {
    $('difficultyRubricSuggestion').textContent = removeGuidedAssessment ?
      'A avaliação guiada será retirada somente da nova versão ao salvar.' :
      'Avaliação guiada opcional. Nenhum nível foi aplicado.';
    return;
  }
  try {
    const scores = Object.fromEntries([...rubricControls].map(([key, control]) => [key, control.value === '' ?
      null : Number(control.value)
    ]));
    const result = assessDifficulty(scores);
    $('difficultyRubricSuggestion').textContent =
      `${result.total}/8 pontos · sugestão: ${DIFFICULTY_LEVEL_LABELS[result.suggestedLevel]}. Considere o público-alvo; confirme o nível no campo Dificuldade.`;
    const differs = $('revisionDifficulty').value && $('revisionDifficulty').value !== result.suggestedLevel;
    $('difficultyOverrideReason').required = Boolean(differs);
    $('difficultyOverrideHelp').textContent = differs ?
      'Você escolheu um nível diferente da sugestão. Registre a justificativa em relação ao público-alvo.' :
      'O docente escolhe o nível; a sugestão não altera essa escolha.';
  } catch (error) {
    $('difficultyRubricSuggestion').textContent = error.message;
  }
}

function renderDifficultyRubric(metadata) {
  const assessment = metadata.difficultyAssessment;
  const recognized = assessment?.version === DIFFICULTY_RUBRIC_VERSION;
  removeGuidedAssessment = false;
  previousRubricVersion = $('revisionRubric').value;
  $('useDifficultyRubric').checked = recognized;
  $('difficultyOverrideReason').value = recognized ? assessment.overrideReason || '' : '';
  const fields = $('difficultyDimensionFields');
  fields.replaceChildren();
  rubricControls.clear();
  for (const dimension of DIFFICULTY_DIMENSIONS) {
    const control = editorField(fields, dimension.label, '', `difficulty-${dimension.key}`, 'select');
    control.add(new Option('Selecione a descrição correspondente', ''));
    dimension.descriptions.forEach((description, score) => control.add(new Option(description, String(
      score))));
    const existing = recognized ? assessment.scores?.[dimension.key] : null;
    control.value = Number.isInteger(existing) && existing >= 0 && existing <= 2 ? String(existing) : '';
    control.onchange = updateDifficultySuggestion;
    rubricControls.set(dimension.key, control);
  }
  updateDifficultySuggestion();
  initialRubricState = difficultyRubricState();
}

// Remoção de uma avaliação conhecida é explícita no rótulo e só afeta a nova versão salva.
$('useDifficultyRubric').onchange = () => {
  if ($('useDifficultyRubric').checked) {
    previousRubricVersion = $('revisionRubric').value || previousRubricVersion;
    $('revisionRubric').value = DIFFICULTY_RUBRIC_VERSION;
    removeGuidedAssessment = false;
  } else {
    removeGuidedAssessment = current.metadata?.difficultyAssessment?.version === DIFFICULTY_RUBRIC_VERSION;
    $('revisionRubric').value = removeGuidedAssessment ? '' : previousRubricVersion || '';
  }
  updateDifficultySuggestion();
};
$('revisionDifficulty').addEventListener('change', updateDifficultySuggestion);

// Mantém campos desconhecidos da avaliação e dos escores, mas recalcula a sugestão conhecida.
function readDifficultyAssessment() {
  if (!$('useDifficultyRubric').checked) return null;
  const scores = Object.fromEntries([...rubricControls].map(([key, control]) => [key, control.value === '' ?
    null : Number(control.value)
  ]));
  const result = assessDifficulty(scores),
    chosenLevel = $('revisionDifficulty').value;
  if (!DIFFICULTY_LEVEL_LABELS[chosenLevel]) throw Error(
    'Selecione o nível de dificuldade confirmado pelo docente.');
  if (!$('revisionAudience').value.trim()) throw Error('Informe o público-alvo da avaliação de dificuldade.');
  const overrideReason = $('difficultyOverrideReason').value.trim();
  if (chosenLevel !== result.suggestedLevel && !overrideReason) throw Error(
    'Justifique por que o nível escolhido difere da sugestão da rubrica.');
  const prior = current.metadata?.difficultyAssessment || {};
  return {
    ...prior,
    version: DIFFICULTY_RUBRIC_VERSION,
    scores: {
      ...prior.scores,
      ...result.scores
    },
    suggestedLevel: result.suggestedLevel,
    overrideReason
  };
}

// Dados restritos são entregues apenas ao autor/revisor autorizado; erros não têm fallback local.
async function load() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    message(status, 'Selecione uma contribuição no catálogo.', true);
    return;
  }
  message(status, 'Carregando versão autorizada…');
  try {
    const values = await Promise.all([apiRequest(`/contributions/${encodeURIComponent(id)}`), AuthService
      .session()
    ]);
    current = values[0];
    user = values[1].user;
    const m = current.metadata || {};
    $('curationDetails').hidden = false;
    $('curationTitle').textContent = current.title;
    $('curationState').textContent =
      `Versão ${current.version} · ${current.state} · responsável: ${current.reviewerId||'Aguardando atribuição'}`;
    for (const [id, value] of Object.entries({
        revisionTitle: current.title,
        revisionArea: m.area,
        revisionDiscipline: m.discipline,
        revisionAudience: m.audience,
        revisionDifficulty: m.difficulty,
        revisionRationale: m.difficultyRationale,
        revisionSummary: m.publicSummary,
        revisionTags: (m.publicTags || []).join(', '),
        revisionRubric: m.rubricVersion || '1.0',
        revisionContent: JSON.stringify(current.content, null, 2)
      })) $(id).value = value || '';
    $('tagsReviewed').checked = Boolean(m.tagsReviewed);
    renderClinicalEditor(current.content);
    renderDifficultyRubric(m);
    $('curationSources').textContent = JSON.stringify(current.content?.sources || current.sources || [],
      null, 2);
    const actions = $('reviewActions');
    actions.replaceChildren();
    for (const action of transitions[current.state] || []) {
      if (user.role === 'student' && action !== 'submit') continue;
      actions.append(button(labels[action], async () => {
        try {
          const dirty = difficultyRubricState() !== initialRubricState || JSON.stringify(
              readClinicalEditor()) !== initialGuidedSerialized || JSON
            .stringify(editingBase) !== JSON.stringify(current.content) ||
            $('revisionTitle').value !== current.title ||
            $('revisionArea').value !== (current.metadata?.area || '') ||
            $('revisionAudience').value !== (current.metadata?.audience || '') ||
            $('revisionDifficulty').value !== (current.metadata?.difficulty || '') ||
            $('revisionRationale').value !== (current.metadata?.difficultyRationale || '') ||
            $('revisionSummary').value !== (current.metadata?.publicSummary || '') ||
            $('revisionTags').value !== (current.metadata?.publicTags || []).join(', ') ||
            $('revisionDiscipline').value !== (current.metadata?.discipline || '') ||
            $('revisionRubric').value !== (current.metadata?.rubricVersion || '1.0') ||
            $('tagsReviewed').checked !== Boolean(current.metadata?.tagsReviewed);
          if (dirty) throw Error(
            'Existem alterações não salvas. Salve a nova versão ou atualize antes de decidir.');
          await apiRequest(`/case-versions/${current.id}/review`, {
            method: 'POST',
            body: JSON.stringify({
              action,
              note: $('reviewNote').value
            })
          });
          await load();
        } catch (e) {
          message(status, e.message, true);
        }
      }));
    }
    message(status, 'Versão carregada. Permissões finais e transições são verificadas pelo servidor.');
  } catch (e) {
    $('curationDetails').hidden = true;
    message(status, e.message, true);
  }
}
// Nunca altera a versão aprovada: edição cria outra versão sem herdar aprovação.
$('revisionForm').onsubmit = async event => {
  event.preventDefault();
  const control = event.submitter;
  control.disabled = true;
  try {
    const content = readClinicalEditor();
    const metadata = {
      ...current.metadata,
      area: $('revisionArea').value,
      discipline: $('revisionDiscipline').value,
      audience: $('revisionAudience').value,
      difficulty: $('revisionDifficulty').value,
      difficultyRationale: $('revisionRationale').value,
      publicSummary: $('revisionSummary').value,
      publicTags: $('revisionTags').value.split(',').map(x => x.trim()).filter(Boolean),
      rubricVersion: $('revisionRubric').value,
      tagsReviewed: $('tagsReviewed').checked
    };
    const assessment = readDifficultyAssessment();
    if (assessment) {
      metadata.difficultyAssessment = assessment;
      metadata.rubricVersion = DIFFICULTY_RUBRIC_VERSION;
    } else if (removeGuidedAssessment) {
      delete metadata.difficultyAssessment;
      if (!metadata.rubricVersion) delete metadata.rubricVersion;
    }
    const saved = await apiRequest(`/contributions/${current.caseId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: $('revisionTitle').value,
        content,
        metadata
      })
    });
    location.assign(`case-curation.html?id=${saved.id}`);
  } catch (e) {
    message(status, e instanceof SyntaxError ? 'Conteúdo JSON inválido.' : e.message, true);
  } finally {
    control.disabled = false;
  }
};
$('refreshCuration').onclick = load;
load();
