/* Motor puro e determinístico de pontuação dos percursos clínicos. */
import { getClinicalScoringRuleSet } from "./clinical-scoring-rules.js";

/** Limita somente o valor apresentado; o total bruto permanece auditável. */
function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Localiza a penalidade progressiva aplicável à posição atual. */
function getEfficiencyPenalty(sequence, ruleSet) {
  if (sequence <= ruleSet.recommendedActionBudget) {
    return 0;
  }

  const band = ruleSet.efficiencyPenaltyBands.find(
    ({ fromAction, toAction }) =>
      sequence >= fromAction && (toAction === null || sequence <= toAction),
  );
  return band?.points ?? 0;
}

/**
 * Calcula todo o percurso em ordem cronológica.
 *
 * @param {object} input Dados mínimos e não confiáveis enviados pelo cliente.
 * @param {string} input.caseId Identificador do caso clínico.
 * @param {string[]} input.itemIds Itens na ordem exata em que foram escolhidos.
 * @returns {object} Resumo e eventos imutáveis, próprios para persistência.
 * @throws {Error} Quando há repetição, item desconhecido ou dependência não atendida.
 */
function calculateClinicalScore({ caseId, itemIds }) {
  if (!Array.isArray(itemIds)) {
    throw new TypeError("itemIds deve ser uma lista ordenada de identificadores.");
  }

  const ruleSet = getClinicalScoringRuleSet(caseId);
  const selectedIds = new Set();
  let rawTotal = ruleSet.initialScore;
  let awardedPriorityBonus = 0;

  const events = itemIds.map((itemId, index) => {
    const sequence = index + 1;
    const itemRule = ruleSet.items[itemId];

    if (!itemRule) {
      throw new Error(`Item inexistente no caso ${caseId}: ${itemId}.`);
    }
    if (selectedIds.has(itemId)) {
      throw new Error(`O item ${itemId} foi selecionado mais de uma vez.`);
    }
    if (itemRule.parentId && !selectedIds.has(itemRule.parentId)) {
      throw new Error(
        `A dependência ${itemRule.parentId} deve preceder o item ${itemId}.`,
      );
    }

    const canAwardPriorityBonus =
      itemRule.isCentralEvidence &&
      sequence <= ruleSet.priorityBonus.firstActionsLimit &&
      awardedPriorityBonus < ruleSet.priorityBonus.maximum;
    const priorityBonus = canAwardPriorityBonus
      ? ruleSet.priorityBonus.maximum - awardedPriorityBonus
      : 0;
    awardedPriorityBonus += priorityBonus;

    const efficiencyPenalty = getEfficiencyPenalty(sequence, ruleSet);
    const delta = itemRule.basePoints + priorityBonus + efficiencyPenalty;
    rawTotal += delta;
    selectedIds.add(itemId);

    return Object.freeze({
      caseId,
      caseVersion: ruleSet.caseVersion,
      sequence,
      itemKey: itemId,
      itemType: itemRule.itemType,
      classification: itemRule.classification,
      classificationLabel: itemRule.classificationLabel,
      ruleSetVersion: ruleSet.ruleSetVersion,
      initialScore: ruleSet.initialScore,
      recommendedActionBudget: ruleSet.recommendedActionBudget,
      basePoints: itemRule.basePoints,
      priorityBonus,
      efficiencyPenalty,
      delta,
      rawTotalAfterAction: rawTotal,
      displayedTotalAfterAction: clamp(
        rawTotal,
        ruleSet.displayMinimum,
        ruleSet.displayMaximum,
      ),
    });
  });

  const gains = events.reduce((total, event) => total + Math.max(event.basePoints, 0), 0);
  const losses = events.reduce((total, event) => total + Math.min(event.basePoints, 0), 0);
  const efficiencyPenalties = events.reduce(
    (total, event) => total + event.efficiencyPenalty,
    0,
  );

  return Object.freeze({
    caseId,
    caseVersion: ruleSet.caseVersion,
    ruleSetVersion: ruleSet.ruleSetVersion,
    initialScore: ruleSet.initialScore,
    rawTotal,
    displayedTotal: clamp(rawTotal, ruleSet.displayMinimum, ruleSet.displayMaximum),
    recommendedActionBudget: ruleSet.recommendedActionBudget,
    selectedActionCount: events.length,
    summary: Object.freeze({
      gains,
      losses,
      priorityBonus: awardedPriorityBonus,
      efficiencyPenalties,
    }),
    events: Object.freeze(events),
  });
}

/** Cria o estado inicial esperado pela jornada, sem compartilhar arrays mutáveis. */
function startSession(caseId) {
  const ruleSet = getClinicalScoringRuleSet(caseId);
  return Object.freeze({
    caseId,
    caseVersion: ruleSet.caseVersion,
    ruleSetVersion: ruleSet.ruleSetVersion,
    initialScore: ruleSet.initialScore,
    rawTotal: ruleSet.initialScore,
    displayedTotal: ruleSet.initialScore,
    recommendedActionBudget: ruleSet.recommendedActionBudget,
    selectedActionCount: 0,
    summary: Object.freeze({
      gains: 0,
      losses: 0,
      priorityBonus: 0,
      efficiencyPenalties: 0,
    }),
    events: Object.freeze([]),
  });
}

/**
 * Pontua uma única escolha a partir do histórico recebido.
 * O histórico é somente lido e um novo evento congelado é devolvido.
 */
function scoreSelection({ caseId, itemId, sequence, currentEvents = [] }) {
  if (!Array.isArray(currentEvents)) {
    throw new TypeError("currentEvents deve ser uma lista de eventos.");
  }
  if (sequence !== currentEvents.length + 1) {
    throw new Error(
      `Sequência inválida: esperado ${currentEvents.length + 1}, recebido ${sequence}.`,
    );
  }

  const itemIds = currentEvents.map((event) => {
    if (event.caseId !== caseId || typeof event.itemKey !== "string") {
      throw new Error("O histórico contém evento incompatível com o caso atual.");
    }
    return event.itemKey;
  });
  const recalculated = calculateClinicalScore({ caseId, itemIds: [...itemIds, itemId] });
  return recalculated.events.at(-1);
}

/**
 * Resume eventos previamente calculados sem confiar nos totais acumulados.
 * Para uma lista vazia, `caseId` permite recuperar as configurações da sessão.
 */
function summarize(events, caseId = null) {
  if (!Array.isArray(events)) {
    throw new TypeError("events deve ser uma lista de eventos.");
  }
  if (events.length === 0) {
    return startSession(caseId ?? "joao");
  }

  const inferredCaseId = events[0].caseId;
  const itemIds = events.map((event) => {
    if (event.caseId !== inferredCaseId || typeof event.itemKey !== "string") {
      throw new Error("Não é possível resumir eventos de casos diferentes.");
    }
    return event.itemKey;
  });
  return calculateClinicalScore({ caseId: inferredCaseId, itemIds });
}

/** Interface estável usada pela sessão clínica. */
const ClinicalScoring = Object.freeze({ startSession, scoreSelection, summarize });

export {
  ClinicalScoring,
  calculateClinicalScore,
  getEfficiencyPenalty,
  scoreSelection,
  startSession,
  summarize,
};
