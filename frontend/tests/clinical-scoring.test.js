/* Testes executáveis no navegador para as regras e o motor de pontuação. */
import {
  BASE_POINTS_BY_CLASSIFICATION,
  CLINICAL_SCORING_RULE_SETS,
} from "../scripts/scoring/clinical-scoring-rules.js";
import {
  ClinicalScoring,
  calculateClinicalScore,
} from "../scripts/scoring/clinical-scoring.js";

const results = document.querySelector("#test-results");
let failures = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function test(name, callback) {
  const item = document.createElement("li");
  try {
    await callback();
    item.textContent = `✓ ${name}`;
    item.dataset.status = "passed";
  } catch (error) {
    failures += 1;
    item.textContent = `✗ ${name}: ${error.message}`;
    item.dataset.status = "failed";
  }
  results.append(item);
}

await test("mapeia exatamente 40 ações em cada caso", () => {
  assert(Object.keys(CLINICAL_SCORING_RULE_SETS.joao.items).length === 40, "João não tem 40 regras");
  assert(Object.keys(CLINICAL_SCORING_RULE_SETS.marina.items).length === 40, "Marina não tem 40 regras");
});

await test("mantém 18 perguntas e 22 exames por caso", () => {
  Object.values(CLINICAL_SCORING_RULE_SETS).forEach((ruleSet) => {
    const items = Object.values(ruleSet.items);
    assert(items.filter(({ itemType }) => itemType === "question").length === 18, `${ruleSet.caseId}: perguntas inválidas`);
    assert(items.filter(({ itemType }) => itemType === "exam").length === 22, `${ruleSet.caseId}: exames inválidos`);
  });
});

await test("garante que a menor perda supera o maior ganho possível", () => {
  const positiveMaximum = Math.max(...Object.values(BASE_POINTS_BY_CLASSIFICATION), 0) + 2;
  const negativeMagnitudes = Object.values(BASE_POINTS_BY_CLASSIFICATION)
    .filter((points) => points < 0)
    .map(Math.abs);
  assert(Math.min(...negativeMagnitudes) > positiveMaximum, "a perda mínima não supera +7");
});

await test("aplica bônus uma única vez entre as três primeiras ações", () => {
  const score = calculateClinicalScore({ caseId: "joao", itemIds: ["vitals", "ecg", "pain"] });
  assert(score.events[0].priorityBonus === 2, "primeira evidência central sem bônus");
  assert(score.events[1].priorityBonus === 0, "bônus foi concedido duas vezes");
  assert(score.summary.priorityBonus === 2, "resumo de bônus inválido");
});

await test("aplica as faixas de eficiência nas posições corretas", () => {
  const orderedIds = Object.keys(CLINICAL_SCORING_RULE_SETS.marina.items);
  const score = calculateClinicalScore({ caseId: "marina", itemIds: orderedIds.slice(0, 21) });
  assert(score.events[11].efficiencyPenalty === 0, "posição 12 penalizada");
  assert(score.events[12].efficiencyPenalty === -4, "posição 13 incorreta");
  assert(score.events[15].efficiencyPenalty === -4, "posição 16 incorreta");
  assert(score.events[16].efficiencyPenalty === -8, "posição 17 incorreta");
  assert(score.events[19].efficiencyPenalty === -8, "posição 20 incorreta");
  assert(score.events[20].efficiencyPenalty === -12, "posição 21 incorreta");
});

await test("preserva total bruto e limita somente o total apresentado", () => {
  const allIds = Object.keys(CLINICAL_SCORING_RULE_SETS.joao.items);
  const score = calculateClinicalScore({ caseId: "joao", itemIds: allIds });
  assert(score.rawTotal < 0, "total bruto deveria poder ficar negativo");
  assert(score.displayedTotal === 0, "total apresentado deveria respeitar o piso");
});

await test("selecionar todas as ações é pior que um percurso focado", () => {
  const focusedPaths = {
    joao: ["vitals", "ecg", "pain", "start", "associated", "troponin", "rest", "previous", "right", "cardiac", "meds", "risk"],
    marina: ["vitals", "glucose", "ketones", "gas", "pain", "onset", "vomiting", "thirst", "urine", "weight", "abdomen", "hydration"],
  };

  Object.entries(focusedPaths).forEach(([caseId, focusedIds]) => {
    const focused = calculateClinicalScore({ caseId, itemIds: focusedIds });
    const all = calculateClinicalScore({
      caseId,
      itemIds: Object.keys(CLINICAL_SCORING_RULE_SETS[caseId].items),
    });
    assert(all.rawTotal < focused.rawTotal, `${caseId}: selecionar tudo não foi pior`);
  });
});

await test("rejeita repetição, item desconhecido e dependência não atendida", () => {
  const invalidInputs = [
    { caseId: "joao", itemIds: ["pain", "pain"] },
    { caseId: "joao", itemIds: ["inexistente"] },
    { caseId: "joao", itemIds: ["radiation"] },
  ];
  invalidInputs.forEach((input) => {
    let rejected = false;
    try {
      calculateClinicalScore(input);
    } catch {
      rejected = true;
    }
    assert(rejected, `entrada inválida aceita: ${input.itemIds.join(",")}`);
  });
});

await test("scoreSelection não altera o histórico recebido", () => {
  const first = ClinicalScoring.scoreSelection({
    caseId: "joao",
    itemId: "vitals",
    sequence: 1,
    currentEvents: [],
  });
  const history = Object.freeze([first]);
  const snapshot = JSON.stringify(history);
  const second = ClinicalScoring.scoreSelection({
    caseId: "joao",
    itemId: "ecg",
    sequence: 2,
    currentEvents: history,
  });
  assert(JSON.stringify(history) === snapshot, "histórico foi alterado");
  assert(second.sequence === 2, "novo evento tem sequência incorreta");
  assert(ClinicalScoring.summarize([...history, second]).events.length === 2, "resumo inválido");
});

const summary = document.querySelector("#test-summary");
summary.textContent = failures === 0 ? "Todos os testes passaram." : `${failures} teste(s) falharam.`;
summary.dataset.status = failures === 0 ? "passed" : "failed";
