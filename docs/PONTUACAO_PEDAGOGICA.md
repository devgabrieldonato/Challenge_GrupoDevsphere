# Pontuação pedagógica dos casos clínicos — NEXT_2026

## Objetivo

A pontuação orienta o estudante a priorizar perguntas e exames. Não substitui a
avaliação docente, não corrige automaticamente a justificativa escrita e não
representa uma conduta médica automatizada.

## Escala preservada

O percurso começa em 50 pontos. A interface mostra valores entre 0 e 100,
enquanto o total bruto permanece disponível para auditoria.

| Classificação | Valor-base |
| --- | ---: |
| Ação prioritária | +5 |
| Ação pertinente | +3 |
| Ação complementar | +1 |
| Ação de baixo valor | -8 |
| Ação inadequada | -12 |

Uma evidência central escolhida entre as três primeiras ações pode receber +2,
no máximo uma vez por percurso. Assim, o maior ganho possível por ação é +7 e
a menor perda é -8. Isso desestimula a seleção indiscriminada sem impedir que
o aluno explore alternativas.

## Eficiência

O orçamento recomendado atual de João e Marina é 12 escolhas. A investigação
continua após esse ponto, com penalidade adicional:

| Posição da escolha | Penalidade adicional |
| --- | ---: |
| 1 a 12 | 0 |
| 13 a 16 | -4 |
| 17 a 20 | -8 |
| 21 em diante | -12 |

A variação é `valor-base + bônus de prioridade + penalidade de eficiência`.
A ordem dos cliques não representa tempo clínico. Essa regra é pedagógica e
precisa de homologação antes de qualquer avaliação acadêmica formal.

## Autoridade do servidor

Na implementação anterior, o cliente calculava uma prévia com regras carregadas
no JavaScript. Na NEXT_2026 esse catálogo completo não é entregue ao navegador:
as fixtures legadas estão em `backend/tests/legacy-assets/` e o servidor lê
conteúdo privado versionado no banco.

O novo fluxo usa uma sessão persistente:

1. A API fixa a versão do caso ao iniciar.
2. O navegador envia somente o identificador da escolha.
3. O servidor valida propriedade, estado, existência e dependência.
4. A ação aceita e seu evento de pontuação são persistidos transacionalmente.
5. A resposta devolve o histórico e o placar autoritativos para a interface.
6. Na conclusão, o backend confere novamente a sessão e não aceita pontos forjados no relatório.

Repetir uma escolha já aceita não produz um segundo evento nem novos pontos.
Uma escolha inexistente ou com dependência pendente não entra no percurso.
O atendimento concluído não aceita investigação adicional. Recomeçar abre
outra sessão e preserva o histórico anterior.

Mudar o DOM, um campo JSON de pontuação ou o papel informado pelo navegador
não altera a autoridade dos dados. Veja a [matriz de segurança](SEGURANCA_NEXT_2026.md).

## Casos dinâmicos e auditoria

Cada versão de caso guarda as classificações e regras dos seus itens. Novos
casos precisam de exatamente 18 perguntas e 22 exames e de regras válidas para
essas escolhas. A validação estrutural não aprova o julgamento clínico das categorias.

Cada evento preserva item, ordem, classificação, valor-base, bônus, penalidade,
variação e totais acumulados. O rótulo `ruleSetVersion` vem da versão do caso; João e Marina utilizam inicialmente
`"1.0.0"`. `case_version_id` vincula o conteúdo e o mapeamento pedagógico utilizados.
O algoritmo global e seus limites atuais permanecem fixos; mudar o rótulo não
habilita fórmulas arbitrárias.
O JSON e o PDF oficiais são derivados do histórico validado, não da nota exibida
no navegador. Veja [Relatório PDF](RELATORIO_PDF_VERSIONADO.md).

Mudanças no conteúdo geram outra versão e exigem nova revisão. Uma sessão já
iniciada mantém a versão anterior. A nova dificuldade ou rubrica não deve ser
aplicada retroativamente a resultados históricos.

Dificuldade introdutória, intermediária ou avançada é classificação relativa
ao público-alvo, separada da nota, gravidade do paciente e estado da revisão.
A rubrica e a justificativa da dificuldade são conferidas pelo docente.

## Revisão clínica e avaliações

O mapeamento legado de João e Marina foi derivado das descrições existentes e
permanece sujeito à homologação docente. Os agentes não conferiram aprovação
médica nova. Casos gerados por IA entram em rascunho, com revisão de pontuação,
evidências, dependências e risco de pistas antes da publicação.

Autoria ou exposição prévia ao gabarito impede apresentar aquele atendimento
como avaliação independente nas atividades sujeitas a essa regra. Prática
educacional e avaliação formal precisam permanecer identificáveis.

Relatórios v1 importados não possuem nota oficial. Apresente **Pontuação não
disponível**, nunca zero calculado ou uma nota importada como autenticada.
A justificativa escrita continua destinada à análise do professor, cuja
[devolutiva aparece no portal do aluno](PORTAIS_NEXT_2026.md) depois de concluída.

## Referências internas

- [Arquitetura do backend](ARQUITETURA_BACKEND_CPP20.md)
- [Geração e importação](GERACAO_E_IMPORTACAO_DE_CASOS.md)
- [Worker e validação de casos](../worker/README.md)
