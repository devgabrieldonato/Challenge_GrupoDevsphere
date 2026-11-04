# Paciente Virtual — DPS | sprint_mat

Esta branch contém o protótipo estático e o simulador didático de troponina do caso fictício do João. A execução desta versão usa HTML, CSS e JavaScript, sem backend, dependências npm ou modelos de IA.

## Executar e demonstrar

Abra `index.html` no Chrome ou use o Live Server nesse arquivo. Para servir localmente com Python, execute na raiz do checkout:

```sh
python3 -m http.server 5501 --bind 127.0.0.1
```

Se a porta estiver em uso, escolha outra e abra o endereço correspondente. Selecione **João**, inicie o atendimento e localize **Evolução da troponina**. Use Tab para chegar aos controles e as setas para mover o seletor de tempo. Compare **1 h com a janela [0, 1]** e **11 h com a janela [10, 11]** para ver duas orientações distintas.

## Entregas de DPS

- [Documentação das Sprints 3 e 4](docs/DPS_SPRINTS_3_E_4.md): modelo, dados sintéticos, unidades, integral, regra pedagógica e critérios.
- [PDF da Sprint 4](docs/DPS_Sprint4_Paciente_Virtual.pdf): relatório único com os nomes da equipe confirmados.

A curva sintética não ajusta todas as dosagens do caso. Seus resultados orientam a atividade pedagógica e não constituem critérios clínicos.

## Acessibilidade e responsividade

A página principal oferece atalho para o conteúdo, foco visível, filtros com contraste revisado e controles do simulador adaptados a telas estreitas. O CSS usa a main como referência para foco e cores forçadas. `paciente-virtual.html` é uma entrada legada; use `index.html` para demonstrar DPS.

No Chrome, abra o painel Lighthouse e selecione **Accessibility** para auditar a tela inicial. Para verificar a jornada ativa do João, use o modo **Snapshot** depois de iniciar o caso. Complete a auditoria automática com navegação por teclado e verificação da interface em larguras diferentes.

### Resultados verificados

Lighthouse 13.5.0, categoria **Acessibilidade**, no Google Chrome local:

| Estado | Celular (375 px) | Desktop (1350 px) |
| --- | ---: | ---: |
| Seleção de caso | 100/100 | 100/100 |
| Caso João ativo (Snapshot) | 100/100 | 100/100 |

Na primeira rodada, o caso ativo marcou 96/100 nos dois perfis por contraste insuficiente nos filtros “Perguntas” e “Exames”. Após a correção, nenhuma auditoria automática de acessibilidade reprovou nesses quatro cenários. A verificação complementar em 320, 375, 768 e 1350 px confirmou ausência de rolagem horizontal no caso do João, atalho para o conteúdo, foco visível e atualização do seletor de tempo por teclado. Essas verificações não substituem avaliação com leitor de tela nem cobrem a página legada ou a jornada da Marina.

### Demonstração com instante fixo

No painel do João, mantenha **11 h** e troque **[10, 11]** por **[0, 1]**. A concentração e a derivada ficam iguais; a integral passa de **97,14** a **9,00 ng·h/L** e a orientação muda. Consulte o roteiro e a matriz na documentação DPS. A equipe está confirmada; o envio é pelo Teams, acessado pelo Portal do Aluno da FIAP.
