/*
 * Regras versionadas de pontuação dos casos clínicos.
 *
 * Este módulo concentra apenas metadados pedagógicos. As respostas clínicas
 * continuam no catálogo original, evitando duplicação e divergência de conteúdo.
 */
import { joaoItems, marinaCase } from "../cases/clinical-cases.js";

/** Categorias estáveis usadas no relatório, na auditoria e no cálculo. */
const SCORE_CLASSIFICATIONS = Object.freeze({
  PRIORITY: "priority",
  RELEVANT: "relevant",
  COMPLEMENTARY: "complementary",
  LOW_VALUE: "low_value",
  INAPPROPRIATE: "inappropriate",
});

/** Valores-base centralizados para que nenhuma tela invente sua própria escala. */
const BASE_POINTS_BY_CLASSIFICATION = Object.freeze({
  [SCORE_CLASSIFICATIONS.PRIORITY]: 5,
  [SCORE_CLASSIFICATIONS.RELEVANT]: 3,
  [SCORE_CLASSIFICATIONS.COMPLEMENTARY]: 1,
  [SCORE_CLASSIFICATIONS.LOW_VALUE]: -8,
  [SCORE_CLASSIFICATIONS.INAPPROPRIATE]: -12,
});

const CLASSIFICATION_LABELS = Object.freeze({
  [SCORE_CLASSIFICATIONS.PRIORITY]: "Ação prioritária",
  [SCORE_CLASSIFICATIONS.RELEVANT]: "Ação pertinente",
  [SCORE_CLASSIFICATIONS.COMPLEMENTARY]: "Ação complementar",
  [SCORE_CLASSIFICATIONS.LOW_VALUE]: "Ação de baixo valor",
  [SCORE_CLASSIFICATIONS.INAPPROPRIATE]: "Ação inadequada",
});

/*
 * Cada identificador aparece explicitamente. A classificação segue a orientação
 * clínica já descrita em `quality` e `why`; nenhum texto clínico foi modificado.
 */
const JOAO_ITEM_CLASSIFICATIONS = Object.freeze({
  pain: SCORE_CLASSIFICATIONS.RELEVANT,
  start: SCORE_CLASSIFICATIONS.RELEVANT,
  vitals: SCORE_CLASSIFICATIONS.PRIORITY,
  ecg: SCORE_CLASSIFICATIONS.PRIORITY,
  associated: SCORE_CLASSIFICATIONS.RELEVANT,
  troponin: SCORE_CLASSIFICATIONS.RELEVANT,
  radiation: SCORE_CLASSIFICATIONS.RELEVANT,
  palpation: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  rest: SCORE_CLASSIFICATIONS.RELEVANT,
  previous: SCORE_CLASSIFICATIONS.RELEVANT,
  lung: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  right: SCORE_CLASSIFICATIONS.RELEVANT,
  serial: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  exercise: SCORE_CLASSIFICATIONS.INAPPROPRIATE,
  pleuritic: SCORE_CLASSIFICATIONS.RELEVANT,
  digestive: SCORE_CLASSIFICATIONS.RELEVANT,
  risk: SCORE_CLASSIFICATIONS.RELEVANT,
  meds: SCORE_CLASSIFICATIONS.RELEVANT,
  thrombotic: SCORE_CLASSIFICATIONS.RELEVANT,
  sudden: SCORE_CLASSIFICATIONS.RELEVANT,
  xray: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  ddimer: SCORE_CLASSIFICATIONS.LOW_VALUE,
  cbc: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  renal: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  ckmb: SCORE_CLASSIFICATIONS.LOW_VALUE,
  coronaryct: SCORE_CLASSIFICATIONS.INAPPROPRIATE,
  echo: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  cardiac: SCORE_CLASSIFICATIONS.RELEVANT,
  cough: SCORE_CLASSIFICATIONS.RELEVANT,
  syncope: SCORE_CLASSIFICATIONS.RELEVANT,
  leg: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  pulmonaryct: SCORE_CLASSIFICATIONS.LOW_VALUE,
  back: SCORE_CLASSIFICATIONS.RELEVANT,
  pulses: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  antacid: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  lipids: SCORE_CLASSIFICATIONS.LOW_VALUE,
  smoking: SCORE_CLASSIFICATIONS.RELEVANT,
  stimulants: SCORE_CLASSIFICATIONS.RELEVANT,
  oldECG: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  holter: SCORE_CLASSIFICATIONS.LOW_VALUE,
});

const MARINA_ITEM_CLASSIFICATIONS = Object.freeze({
  pain: SCORE_CLASSIFICATIONS.RELEVANT,
  onset: SCORE_CLASSIFICATIONS.RELEVANT,
  vomiting: SCORE_CLASSIFICATIONS.RELEVANT,
  thirst: SCORE_CLASSIFICATIONS.RELEVANT,
  urine: SCORE_CLASSIFICATIONS.RELEVANT,
  weight: SCORE_CLASSIFICATIONS.RELEVANT,
  fever: SCORE_CLASSIFICATIONS.RELEVANT,
  meds: SCORE_CLASSIFICATIONS.RELEVANT,
  history: SCORE_CLASSIFICATIONS.RELEVANT,
  menstrual: SCORE_CLASSIFICATIONS.RELEVANT,
  vitals: SCORE_CLASSIFICATIONS.PRIORITY,
  glucose: SCORE_CLASSIFICATIONS.PRIORITY,
  ketones: SCORE_CLASSIFICATIONS.PRIORITY,
  gas: SCORE_CLASSIFICATIONS.PRIORITY,
  abdomen: SCORE_CLASSIFICATIONS.RELEVANT,
  hydration: SCORE_CLASSIFICATIONS.RELEVANT,
  electrolytes: SCORE_CLASSIFICATIONS.RELEVANT,
  renal: SCORE_CLASSIFICATIONS.RELEVANT,
  ecg: SCORE_CLASSIFICATIONS.RELEVANT,
  pregnancy: SCORE_CLASSIFICATIONS.RELEVANT,
  radiation: SCORE_CLASSIFICATIONS.RELEVANT,
  stools: SCORE_CLASSIFICATIONS.RELEVANT,
  food: SCORE_CLASSIFICATIONS.RELEVANT,
  dysuria: SCORE_CLASSIFICATIONS.RELEVANT,
  alcohol: SCORE_CLASSIFICATIONS.RELEVANT,
  fasting: SCORE_CLASSIFICATIONS.RELEVANT,
  family: SCORE_CLASSIFICATIONS.RELEVANT,
  neuro: SCORE_CLASSIFICATIONS.RELEVANT,
  cbc: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  urinalysis: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  lactate: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  lipase: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  liver: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  osmolality: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  hba1c: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  lungs: SCORE_CLASSIFICATIONS.COMPLEMENTARY,
  mental: SCORE_CLASSIFICATIONS.RELEVANT,
  ultrasound: SCORE_CLASSIFICATIONS.LOW_VALUE,
  ct: SCORE_CLASSIFICATIONS.LOW_VALUE,
  ogtt: SCORE_CLASSIFICATIONS.INAPPROPRIATE,
});

/**
 * Monta regras completas a partir do catálogo clínico e verifica a cobertura.
 * A justificativa e a dependência permanecem ligadas ao item que as originou.
 */
function buildItemRules(items, classifications, centralEvidenceIds) {
  const itemIds = items.map((item) => item.id);
  const classifiedIds = Object.keys(classifications);
  const missingIds = itemIds.filter((id) => !classifications[id]);
  const unknownIds = classifiedIds.filter((id) => !itemIds.includes(id));

  if (missingIds.length || unknownIds.length || itemIds.length !== classifiedIds.length) {
    throw new Error(
      `Cobertura de pontuação inválida. Ausentes: ${missingIds.join(", ") || "nenhum"}; ` +
        `desconhecidos: ${unknownIds.join(", ") || "nenhum"}.`,
    );
  }

  return Object.freeze(
    Object.fromEntries(
      items.map((item) => {
        const classification = classifications[item.id];
        return [
          item.id,
          Object.freeze({
            itemKey: item.id,
            itemType: item.type,
            classification,
            classificationLabel: CLASSIFICATION_LABELS[classification],
            basePoints: BASE_POINTS_BY_CLASSIFICATION[classification],
            pedagogicalRationale: item.why,
            parentId: item.parent ?? null,
            isCentralEvidence: centralEvidenceIds.includes(item.id),
          }),
        ];
      }),
    ),
  );
}

/** Configuração comum das duas versões iniciais do instrumento. */
const COMMON_SCORING_SETTINGS = Object.freeze({
  initialScore: 50,
  displayMinimum: 0,
  displayMaximum: 100,
  recommendedActionBudget: 12,
  priorityBonus: Object.freeze({ maximum: 2, firstActionsLimit: 3 }),
  efficiencyPenaltyBands: Object.freeze([
    Object.freeze({ fromAction: 13, toAction: 16, points: -4 }),
    Object.freeze({ fromAction: 17, toAction: 20, points: -8 }),
    Object.freeze({ fromAction: 21, toAction: null, points: -12 }),
  ]),
});

/** Fonte oficial e versionada consumida pelo calculador e pelos adaptadores. */
const CLINICAL_SCORING_RULE_SETS = Object.freeze({
  joao: Object.freeze({
    caseId: "joao",
    caseVersion: "1.0.0",
    ruleSetVersion: "1.0.0",
    ...COMMON_SCORING_SETTINGS,
    items: buildItemRules(joaoItems, JOAO_ITEM_CLASSIFICATIONS, ["vitals", "ecg"]),
  }),
  marina: Object.freeze({
    caseId: "marina",
    caseVersion: "1.0.0",
    ruleSetVersion: "1.0.0",
    ...COMMON_SCORING_SETTINGS,
    items: buildItemRules(
      marinaCase.items,
      MARINA_ITEM_CLASSIFICATIONS,
      marinaCase.priorityIds,
    ),
  }),
});

/** Obtém a regra por caso sem permitir que o chamador altere a fonte oficial. */
function getClinicalScoringRuleSet(caseId) {
  const ruleSet = CLINICAL_SCORING_RULE_SETS[caseId];
  if (!ruleSet) {
    throw new Error(`Caso sem regras de pontuação: ${caseId}.`);
  }
  return ruleSet;
}

export {
  BASE_POINTS_BY_CLASSIFICATION,
  CLINICAL_SCORING_RULE_SETS,
  SCORE_CLASSIFICATIONS,
  getClinicalScoringRuleSet,
};
