# DPS — Simulador didático de troponina

Abra index.html, selecione João e acesse “Evolução da troponina”. Use o controle de tempo e os campos início/fim. A orientação serve para comparar resultados da simulação.

## Modelo e origem

t é o tempo desde o início da dor em horas. T(t) = 120(1 − exp(−0,158t)) ng/L, para t ≥ 0; a tela mostra 0–12 h. O platô sintético é 120 ng/L; o parâmetro 0,158 h⁻¹ produz aproximadamente 12 ng/L em 40 min. A curva não foi ajustada à segunda dosagem de 186 ng/L em 2 h do caso fictício. Os marcadores de 40 min e 3 h pertencem à curva sintética. Não houve coleta de dados reais.

A derivada é 18,96 exp(−0,158t) ng/(L·h): positiva, decrescente e com limite zero. Em 0 h, concentração 0 e taxa 18,96; em 1 h, concentração 17,54 e taxa 16,19. A concentração continua subindo mesmo com taxa menor.

## Integral e orientação

Área em [a,b]: 120[(b−a) + (exp(−0,158b) − exp(−0,158a))/0,158], em ng·h/L. A classificação usa precisão integral; a área é exibida com duas casas e as taxas e proporções com uma. Intervalos vazios, iguais, invertidos ou fora de 0–12 h não geram orientação.

A regra compara distância relativa ao platô, taxa relativa à inicial e área dividida pela área do platô na mesma duração. Se distância e taxa forem ≤35% e área ≥60%, compare com janela inicial. Se distância e taxa forem ≥65% e área ≤40%, compare com janela posterior. Senão, contraste instante e intervalo. Os cortes separam regiões didáticas contrastantes. Na exponencial escolhida distância e taxa normalizadas são algebricamente iguais; elas não são evidências independentes. A área muda com a janela mesmo mantendo o instante fixo.

Exemplos: instante 1 h, janela [0,1], área 9,00 → comparar janela posterior; instante 11 h, janela [10,11], área 97,14 → comparar janela inicial. A área é concentração integrada no tempo, não massa. Mudar o platô altera os valores absolutos; mudar a constante altera a velocidade de aproximação e pode mudar a classificação. Compare áreas absolutas em janelas de mesma duração. Nenhuma saída é critério clínico.

## Roteiro e evidências observadas

No commit dcf9f86, o gráfico já mostrava limite e derivada, mas não havia seleção de janela nem integral. A versão atual adiciona área sombreada e orientação baseada nos resultados. Abra index.html → João → iniciar atendimento → Evolução da troponina. Use Tab e as setas para controlar o tempo.

No Chrome a 375 px, os valores exibidos abaixo coincidiram com os esperados: concentração pela fórmula, derivada por diferença central e integral pela regra numérica do ponto médio (10.000 subdivisões). Passaram também teclado, ausência de rolagem horizontal e remoção da orientação e da área ao informar intervalo vazio, igual, invertido ou fora de 0–12 h.

| ID | t (h) | Janela (h) | T (ng/L) | Taxa (ng/L por h) | Área (ng·h/L) | Distância e taxa relativas | Área relativa | Orientação |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 1 | [0, 1] | 17,5 | 16,2 | 9,00 | 85,4% | 7,5% | Comparar janela posterior |
| B | 11 | [10, 11] | 98,9 | 3,3 | 97,14 | 17,6% | 80,9% | Comparar janela inicial |
| C | 11 | [0, 1] | 98,9 | 3,3 | 9,00 | 17,6% | 7,5% | Contrastar instante e intervalo |

A: distância e taxa ≥65%, área ≤40%. B: distância e taxa ≤35%, área ≥60%. C: nenhuma condição completa. Em B e C, o instante é 11 h e a duração da janela é 1 h; apenas a janela muda. A integral muda de 97,14 para 9,00 ng·h/L, e a orientação muda com ela. O platô é 120 ng/L em todos os cenários.

## Matriz de critérios

| Sprint | Critério | Peso | Página | Evidência localizada | Estado |
| --- | --- | --- | --- | --- | --- |
| 3 | Organização | 30% | 4 | Roteiro de demonstração; README, Executar e demonstrar | Revisado |
| 3 | Fenômeno | 10% | 4 | Modelo e origem; painel Evolução da troponina | Revisado |
| 3 | Variáveis | 10% | 4 | Modelo e origem; controles mathTime, mathStart e mathEnd | Verificado |
| 3 | Função matemática | 10% | 4 | Modelo e origem; script.js, mathModel | Verificado |
| 3 | Limite e/ou derivada | 10% | 4 | Modelo e origem; cartões de limite e derivada | Verificado |
| 3 | Significado | 10% | 4 | Roteiro, cenários A e B; interpretação na tela | Verificado |
| 3 | Representação na interface | 10% | 4 | index.html, mathLab; script.js, renderMathChart | Verificado |
| 3 | Apoio à compreensão ou decisão | 10% | 4 | Roteiro: comparar concentração e taxa entre A e B | Verificado |
| 4 | Evolução | 15% | 13 | Histórico dcf9f86; comparação antes/depois no Roteiro | Revisado |
| 4 | Aplicação integrada | 25% | 13 | Integral e orientação; cenários A, B e C | Verificado |
| 4 | Dados e interpretação | 20% | 13 | Modelo e origem; cenário sintético e dosagens do caso | Revisado |
| 4 | Regra de decisão | 20% | 13 | script.js, mathGuidance; comparação B e C | Verificado |
| 4 | Integração ao MVP | 10% | 13 | Roteiro: jornada João → painel mathLab | Verificado |
| 4 | Análise crítica | 10% | 13 | Integral e orientação: redundância, parâmetros e duração | Revisado |

## Conferência de envio

Equipe confirmada: Gabriel Leser Donato, Jorge Meert e Vinicius Henrique Araujo da Silva. Canal confirmado pela equipe: Teams, acessado pelo Portal do Aluno da FIAP. Enviar um PDF único com os nomes dos integrantes.
