# Rubrica de dificuldade — proposta do MVP

Versão `pv-difficulty-v1`, implementada em 16/10/2026. É uma proposta técnica para
revisão docente, ainda sem homologação institucional. Dificuldade depende do
público-alvo e dos pré-requisitos; não mede a gravidade do paciente nem aprova o caso.

## Dimensões

Cada dimensão recebe um inteiro de 0 a 2. A avaliação considera o caso completo,
a sequência da investigação e os conhecimentos esperados do público informado.

| Campo | 0 | 1 | 2 |
| --- | --- | --- | --- |
| `clueAmbiguity` — clareza das pistas | Pistas diretas e coerentes | Pistas distribuídas exigem distinguir informações úteis | Pistas ambíguas/conflitantes exigem reavaliação |
| `evidenceIntegration` — integração | Uma evidência ou conjunto simples | Relacionar história e exames | Integrar diferentes fontes, resultados e evolução |
| `competingHypotheses` — hipóteses | Uma predomina, alternativas distinguíveis | Comparar ao menos duas plausíveis | Discriminar várias hipóteses próximas e justificar exclusões |
| `prioritization` — priorização | Sequência direta | Selecionar ordem das perguntas/exames | Justificar prioridades diante de decisões concorrentes |

A soma sugere introdutório (`introductory`) em 0–2, intermediário (`intermediate`)
em 3–5 e avançado (`advanced`) em 6–8. Esses cortes também são proposta, sujeitos
a calibração clínica e pedagógica. Não derivam de resultados de alunos existentes.

## Uso na curadoria

1. Abra uma contribuição autorizada e ative a rubrica opcional no editor.
2. Informe o público-alvo, preencha as quatro dimensões e leia a sugestão.
3. Confirme explicitamente o nível no campo Dificuldade. A sugestão não muda esse
   campo sozinha. Se divergir, escreva o motivo no campo de justificativa.
4. Salve uma nova versão. A versão anterior permanece intacta; a aprovação clínica
   segue seu próprio fluxo de revisão, separada da classificação.

A proposta pode futuramente ser preenchida pela IA, mas nesta entrega a sugestão
verificada é o cálculo determinístico a partir das notas do editor. Não há evidência
de classificação completa real produzida pelos modelos. João e Marina não receberam
níveis arbitrários; aguardam docentes. Rubricas legadas continuam válidas sem adesão
automática a este contrato.

## Contrato

`metadata.difficultyAssessment` guarda `version`, `scores`, `suggestedLevel` e
`overrideReason`; `metadata.rubricVersion` deve corresponder a `pv-difficulty-v1`.
O nível confirmado continua em `metadata.difficulty`. A soma não é aceita como
verdade vinda do navegador: o backend recalcula a sugestão, valida as quatro notas
inteiras e exige justificativa em caso de divergência. O schema documenta a forma;
as relações entre soma, nível e motivo são verificadas também no servidor.

Implementação: `frontend/scripts/cases/difficulty-rubric.js`, editor em `curation.js`
e validação em `backend/src/next_database.cpp`. Testes C++ cobrem limites/entradas
inválidas; Chrome cobre seleção, divergência justificada e preservação de versões.
