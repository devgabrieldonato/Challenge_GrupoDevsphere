# Pontuação pedagógica dos casos clínicos

## Objetivo

A pontuação orienta o estudante a priorizar perguntas e exames. Ela não substitui a avaliação do professor, não corrige a justificativa escrita e não representa uma conduta médica automatizada.

## Escala atual

O percurso começa em 50 pontos. A interface mostra valores entre 0 e 100, enquanto o total bruto permanece no relatório para auditoria.

| Classificação | Valor-base |
| --- | ---: |
| Ação prioritária | +5 |
| Ação pertinente | +3 |
| Ação complementar | +1 |
| Ação de baixo valor | -8 |
| Ação inadequada | -12 |

Uma evidência central escolhida entre as três primeiras ações pode receber +2. Esse bônus é concedido no máximo uma vez por percurso, mesmo quando outras evidências centrais também aparecem entre as três primeiras ações. Assim, o maior ganho possível por ação é +7 e a menor perda é -8.

## Eficiência

João e Marina possuem orçamento recomendado de 12 escolhas. A investigação continua disponível após esse ponto, com penalidade adicional:

| Posição da escolha | Penalidade adicional |
| --- | ---: |
| 1 a 12 | 0 |
| 13 a 16 | -4 |
| 17 a 20 | -8 |
| 21 em diante | -12 |

A variação final de cada ação é `valor-base + bônus de prioridade + penalidade de eficiência`.

## Versão e auditoria

Cada evento contém caso, versão do caso, `ruleSetVersion`, item, sequência, classificação, componentes da variação e totais acumulados. O relatório v2 também guarda o resumo de ganhos, perdas, bônus e penalidades.

O cliente calcula uma prévia imediata. O backend recalcula a sequência com sua cópia oficial das regras e rejeita item inexistente, repetido, fora de ordem ou com dependência não atendida.

## Limitação e revisão clínica

O mapeamento inicial foi derivado das descrições pedagógicas existentes em João e Marina. Ele precisa ser revisado e homologado por docentes responsáveis antes de ser usado para nota, progressão acadêmica ou pesquisa. Mudanças clínicas exigem nova versão do conjunto de regras; resultados antigos preservam a versão usada na época.
