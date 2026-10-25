# Acessibilidade no Safari, com leitor de tela e no PDF

Estado verificado em 23/10/2026, branch `NEXT_2026`. Os testes desta etapa usam
apenas dados sintéticos e não executam Qwen3, Gemma3 ou outro modelo.

## O que foi implementado e verificado

O relatório oficial gerado em `tools/render_official_report.py` agora contém:

- Idioma `pt-BR`, título e autor identificáveis e preferência para exibir o título.
- Fontes TrueType incorporadas e mapeamento de caracteres do ReportLab.
- Marcadores de navegação para título, seções, escolhas e hipóteses.
- Uma árvore lógica real: `StructTreeRoot`, elemento `Document`, títulos
  `H1`/`H2`/`H3` e parágrafos `P`, associados a MCIDs locais por página.
- `ParentTree` e `StructParents` consistentes com os fragmentos desenhados.
- Rodapé de paginação marcado como `Artifact`, separado do conteúdo lógico.
- Ordem de desenho e de estrutura compatíveis com o percurso registrado.
- Espaçamento do próprio parágrafo, preservando a ligação entre título e texto
  ao trocar de página. Conteúdo que excede uma página continua marcado.

O pós-processamento usa `pypdf`, já presente em `worker/requirements.txt`, além
do ReportLab. Ambos precisam estar no interpretador de `DEVSPHERE_PYTHON`.
O marcador `%PV_REPORT_V1` preserva exatamente os dados oficiais utilizados,
sem mudanças na importação anterior. Nenhum PDF já existente é reescrito.

Quatro testes sintéticos verificam metadados, fontes, títulos, estrutura real,
MCIDs e referências, marcação de todo texto visível, acentos, unidades, ordem,
ausência de JavaScript e compatibilidade do marcador. Um PDF de quatro páginas
foi renderizado com Poppler e todas as páginas foram inspecionadas visualmente:
sem sobreposição, cortes de texto ou títulos isolados no fim da página.

```bash
.venv-worker/bin/python -m unittest tools.tests.test_pdf_accessibility -v
```

`pdfinfo` identifica o artefato sintético como `Tagged: yes`, sem JavaScript.
Isso é uma constatação estrutural, **não certificação PDF/UA nem evidência de
que a leitura pelo VoiceOver foi validada**. Não foi executado validador
independente de PDF/UA; a experiência real ainda exige avaliação humana.

Relatórios antigos continuam com sua estrutura original. Para conferir esta
melhoria, conclua um atendimento sintético novo, sem alterar o histórico antigo.
A página de histórico em HTML permanece uma alternativa de consulta caso o
visualizador de PDF utilizado não ofereça boa navegação assistiva.

## Safari nativo: resultado e limite desta rodada

Foi identificado Safari **26.6.2 (21624.5.1.11.3)** com o SafariDriver do macOS.
O driver iniciou, mas a criação de sessão retornou HTTP `500`, erro
`session not created`, indicando **automação remota desabilitada**.
Nenhuma preferência do Safari foi habilitada ou modificada, e nenhuma sessão,
cookie, URL ou credencial pessoal foi lida pelo teste.

```bash
.venv-worker/bin/python tools/tests/safari_accessibility_probe.py
```

O probe cria somente um driver temporário, tenta uma sessão vazia e encerra
apenas os recursos que iniciou. Ele não habilita menus de desenvolvimento,
não aprova diálogos e não testa jornadas por conta própria. Se a automação
continuar bloqueada, use o roteiro manual abaixo. Se ficar disponível no futuro,
a criação de uma sessão vazia ainda não prova o funcionamento das jornadas.

**Pendentes:** jornadas no Safari nativo e leitura real com VoiceOver. Testes
anteriores com Chrome, axe ou árvore de acessibilidade não encerram essas duas
pendências. Playwright WebKit também não seria evidência de Safari nativo.

## Roteiro manual no Mac, sem inferência

Execute em ambiente de teste, com contas e casos sintéticos. Não anote senha,
cookie ou dados clínicos no relatório. Use a API em `http://127.0.0.1:8080` e,
numa segunda passagem, o frontend do Live Server em `http://127.0.0.1:5501`.
Confirme que o modo protegido informa geração desabilitada antes de testar.

1. Abra o Safari manualmente. Em sua preferência de navegação por teclado,
   confira se Tab percorre todos os controles; caso contrário, Option+Tab
   costuma permitir percorrer os itens. Não confunda preferência do navegador
   com defeito do aplicativo. Registre a configuração utilizada.
2. Abra a escolha de perfil e faça login de aluno digitando suas credenciais.
   Percorra com Tab/Shift+Tab, confirme foco visível, rótulos dos campos,
   mensagem de erro de login e link para o conteúdo principal.
3. No catálogo, selecione João ou Marina, inicie uma prática e realize uma
   pergunta e um exame. Confira ordem, estado dos controles e anúncio de
   atualização da pontuação. Tente enviar uma hipótese sem justificativa para
   verificar o aviso, depois conclua corretamente com uma justificativa sintética.
4. Abra o histórico. Confira nova tentativa, pontuação, PDF e ausência de
   sobrescrita da anterior. Abra o PDF em um visualizador compatível com a
   tecnologia assistiva; registre nome e versão desse visualizador.
5. Faça login docente com atribuição ao atendimento sintético. Leia percurso,
   hipóteses e evidências, salve uma avaliação em rascunho e confira que ela não
   aparece para o aluno. Conclua a devolutiva e confira seu anúncio e leitura
   no portal do aluno. Não é necessário aprovar/publicar um caso clínico.
6. Em Contribuições, envie apenas um PDF sintético autorizado. Confira leitura
   de erro de arquivo inválido, Markdown, orçamento, atualização sem perda dos
   campos, filtro de retirados e confirmação de remoção quando disponível.
   **Não solicite geração real de casos**; confira a mensagem de bloqueio.
7. Amplie texto/zoom, estreite a janela e confira se conteúdo e controles
   permanecem alcançáveis sem sobreposição ou perda de informação.

### VoiceOver real

Ative o VoiceOver manualmente com Command+F5 (a combinação pode variar conforme
o teclado; alternativamente use Acessibilidade do macOS). Não automatizamos
sua ativação, nem alteramos as preferências de acessibilidade do sistema.

- Percorra os itens usando Control+Option+Seta direita/esquerda e confirme se
  nome, papel, estado e instruções de cada controle são compreensíveis.
- Use o rotor Control+Option+U e confira títulos, links e controles. Verifique
  se a ordem é útil; a mera existência do título na árvore não é suficiente.
- Confira anúncio de erros, avanço da investigação, pontuação, conclusão e
  nova devolutiva. Evite gravação de voz contendo credenciais ou dados pessoais.
- No PDF, confira título/idioma, leitura contínua, acentos/unidades, passagem
  de página e navegação por marcadores/títulos quando suportada pelo leitor.
  Confirme que o rodapé não interrompe a compreensão do percurso.
- Compare o texto lido com a versão HTML do histórico. Se o visualizador
  ignorar tags ou não permitir navegar, registre visualizador, versão e ação.
  Não marque o relatório como plenamente acessível apenas por extrair o texto.

A etapa técnica inicial não incluiu evidência humana de leitura. O relato
posterior do usuário está registrado no complemento de 24/10 abaixo; resultados
não descritos individualmente não devem ser presumidos.

## Registro de evidências, sem dados privados

| Verificação | Estado nesta rodada | Evidência exigida para encerrar |
|---|---|---|
| Idioma, fontes, metadados e estrutura do PDF | Testado | 4 testes e inspeção visual sintética |
| Preservação do marcador de importação | Testado | Comparação do JSON original em teste |
| Navegação manual no Safari nativo | Relato positivo do usuário em 24/10 | Roteiro fornecido; cenários individuais não enumerados. Automação do SafariDriver continua bloqueada. |
| Navegação real com VoiceOver na aplicação | Relatos positivos do usuário no Safari e Chrome em 24/10 | Verificação funcional humana informada pelo usuário, sem contagem de cenários. |
| Leitura e navegação do PDF com VoiceOver | Roteiro fornecido; retorno geral positivo sem detalhamento separado | Não presumir todos os anúncios/visualizadores a partir do relato geral. |
| Conformidade PDF/UA | Não declarada | Validação específica e revisão independente |

Para cada revisão humana, anote data, sistema/navegador/visualizador, papel
sintético, ação, resultado esperado, resultado observado e impacto. Pode usar
“aprovado”, “falhou” ou “não testado” por item, sem transformar lacunas em sucesso.

## Relato humano e extensão ao Chrome — 24/10/2026

O usuário informou: “Está funcionado tudo corretamente no voice over pelo safari”.
Esse é um relato positivo de verificação manual no Safari com VoiceOver, após
o roteiro fornecido. Não é resultado de automação nem auditoria independente.
O relato foi geral: não houve registro individual de cada cenário, papel,
visualizador ou anúncio; não atribuir contagens de testes ou conformidade PDF/UA.
A limitação do SafariDriver continua distinta da navegação manual, que o usuário
conseguiu realizar. Nenhuma configuração do Safari foi alterada pelo agente.

Foi preparado o mesmo teste no Google Chrome do Mac, versão local conferida
**155.0.8059.86**, no macOS **26.6.2**. Em seguida, o usuário confirmou
funcionamento correto no teste funcional Chrome/VoiceOver. Esse relato manual
é separado dos testes automáticos anteriores. Não foi executada inferência.

### Repetição no Chrome

1. Abra a aplicação no Chrome e faça login manualmente; use a API 8080, depois
   repita pelo Live Server 5501 se ele estiver ativo.
2. Com VoiceOver ativo, percorra campos e botões com Control+Option+setas; confira
   nomes, estados, instruções, foco e leitura de erros. Tab/Shift+Tab também devem
   alcançar as ações; não digite credenciais em mensagens ou relatórios.
3. Percorra catálogo, investigação, pontuação, histórico e devolutiva conforme
   o roteiro acima; mantenha a geração real bloqueada.
4. Abra o PDF sintético **no visualizador do próprio Chrome**, não somente no
   Preview, e compare com a leitura no Safari. Confira ordem, título, acentos,
   unidades e troca de página; use o rotor/títulos quando o visualizador oferecer.
5. Registre separadamente aplicação e PDF: passou/falhou, controle ou trecho
   problemático e o que foi anunciado. Se o visualizador ignorar tags, registre
   a limitação; não considere a simples leitura do texto como conformidade.

Este procedimento não ativa/desativa o VoiceOver automaticamente nem altera
as preferências persistentes de acessibilidade ou do navegador.

## Confirmação do Chrome — 24/10/2026

O usuário confirmou: “Teste funcional do VoiceOver através do Google Chrome
também está funcionando perfeitame”. Assim, há retorno humano positivo para
o funcionamento do VoiceOver tanto no Safari quanto no Chrome do Mac.
A confirmação é geral e não enumera ações, papéis ou a leitura de cada trecho
do PDF separadamente; esses detalhes não foram inventados. O roteiro permanece
disponível para regressões futuras. Não é certificação PDF/UA ou auditoria
independente. Nenhum código funcional, preferência ou modelo foi alterado para
registrar esse retorno.
