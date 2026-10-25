// Proposta pedagógica do MVP: não é rubrica homologada e não atribui aprovação clínica.
export const DIFFICULTY_RUBRIC_VERSION = 'pv-difficulty-v1';
export const DIFFICULTY_LEVEL_LABELS = {
  introductory: 'Introdutório',
  intermediate: 'Intermediário',
  advanced: 'Avançado'
};
export const DIFFICULTY_DIMENSIONS = [{
  key: 'clueAmbiguity',
  label: 'Clareza das pistas',
  descriptions: [
    '0 — Pistas diretas e coerentes apontam para a interpretação principal.',
    '1 — Pistas distribuídas exigem distinguir informações mais e menos úteis.',
    '2 — Pistas ambíguas ou aparentemente conflitantes exigem reavaliar a interpretação.'
  ]
}, {
  key: 'evidenceIntegration',
  label: 'Integração de evidências',
  descriptions: [
    '0 — Uma evidência ou conjunto simples sustenta a conclusão.',
    '1 — É preciso relacionar história clínica e resultados de exames.',
    '2 — É preciso integrar diferentes fontes, resultados e evolução do quadro.'
  ]
}, {
  key: 'competingHypotheses',
  label: 'Hipóteses concorrentes',
  descriptions: [
    '0 — Uma hipótese predomina e as alternativas são facilmente diferenciadas.',
    '1 — Pelo menos duas hipóteses plausíveis precisam ser comparadas.',
    '2 — Várias hipóteses próximas exigem discriminar evidências e justificar exclusões.'
  ]
}, {
  key: 'prioritization',
  label: 'Priorização da investigação',
  descriptions: [
    '0 — A sequência necessária é direta, com poucas decisões concorrentes.',
    '1 — É preciso selecionar a ordem de perguntas e exames úteis.',
    '2 — Há decisões concorrentes que exigem justificar prioridade e eficiência.'
  ]
}];
// Soma somente dimensões conhecidas. Notas vazias/fracionárias não viram zero silenciosamente.
export function assessDifficulty(scores) {
  const normalized = {};
  for (const dimension of DIFFICULTY_DIMENSIONS) {
    const value = scores[dimension.key];
    if (!Number.isInteger(value) || value < 0 || value > 2) throw Error(
      'Preencha as quatro dimensões com valores inteiros de 0 a 2.');
    normalized[dimension.key] = value;
  }
  const total = Object.values(normalized).reduce((sum, value) => sum + value, 0);
  return {
    scores: normalized,
    total,
    suggestedLevel: total <= 2 ? 'introductory' : total <= 5 ? 'intermediate' : 'advanced'
  };
}
