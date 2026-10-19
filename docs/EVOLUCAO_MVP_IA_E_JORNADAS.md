# Planejamento de evolução do MVP

Registro da discussão de 15/10/2026. Este documento descreve propostas e
pendências; não declara funcionalidades implementadas nem decisões definitivas.

## Objetivo

Fechar o ciclo atendimento, revisão docente e devolutiva ao aluno. Evoluir para
uma biblioteca de documentos autorizados e casos educacionais fictícios gerados
com apoio de IA, mantendo o backend C++20 e o SQLite.

## Sequência proposta

1. Exibir no portal do aluno as devolutivas concluídas e todos os campos docentes.
2. Tornar os casos dinâmicos, incluindo catálogo, execução, pontuação e submissão.
3. Integrar upload autenticado e conversão PDF para Markdown revisável.
4. Adicionar geração local de rascunhos, fontes rastreáveis e revisão docente.
5. Implementar busca em fontes aprovadas (RAG), sem presumir treinamento do modelo.

O conversor independente em Conversor_to_md pode ser aproveitado. OCR, integração
com usuários e persistência documental ainda precisam de trabalho. Markdown é
uma representação intermediária; o caso executável deve seguir JSON validado.

## Contribuições de professor e aluno

- Ambos poderão enviar documentos autorizados e desidentificados e solicitar
  geração, sujeitos a limites de processamento.
- Todo caso gerado começa como rascunho não validado, mesmo quando solicitado
  por um professor. Verificação automática não comprova validade clínica.
- O professor autor poderá revisar e aprovar explicitamente o próprio rascunho;
  revisão por outro docente poderá ser exigida futuramente pela instituição.
- O aluno poderá acompanhar extração, geração e revisão e solicitar ajustes,
  mas não aprovar nem publicar casos.
- A contribuição do aluno deve seguir para uma fila docente. O exercício
  aprovado poderá então ser praticado, atribuído a uma turma ou publicado.
- Uma prévia de autoria pode mostrar o rascunho ao aluno contribuinte, mas não
  deve ser tratada como exercício avaliado nem entrar na biblioteca aprovada.
- Quem conhece o PDF original ou o gabarito tem exposição prévia ao caso:
  registrar essa informação e separar prática de avaliação formal.
- Não transformar automaticamente saídas de IA em fontes para novas gerações.

Fluxo conceitual: recebido -> extração -> geração -> rascunho -> revisão ->
ajustes ou aprovação -> publicação. Aprovação e publicação são ações distintas.
Guardar versão aprovada, fontes/páginas, modelo, configuração, autor, revisor e
histórico. Alteração clínica posterior exige nova versão e nova revisão.

## Conteúdo e critérios de revisão

Preservar inicialmente 18 perguntas e 22 exames, hipóteses, dependências,
justificativas, evidências e pontuação. Verificar coerência entre queixa,
história, resultados, unidades, diagnóstico esperado e objetivos educacionais.
Dados acrescentados para construir o paciente fictício devem ser distinguidos
dos fatos extraídos da fonte. Fonte insuficiente deve gerar pendência explícita.

## Execução de IA local

Ollama, GPT4All, Jan, LM Studio, llama.cpp e vLLM são ferramentas/ecossistemas
de execução; não identificam sozinhos o modelo responsável pela geração.

Recomendação provisória para teste: Ollama como serviço inicial e LM Studio como
alternativa de comparação. llama.cpp é uma opção para maior controle técnico;
vLLM deve ser considerado se houver necessidade medida de maior concorrência e
hardware compatível. Jan e GPT4All também podem ser avaliados, sem prioridade
sobre os dois primeiros neste MVP.

Escolha final pendente de benchmark no equipamento disponível, usando as mesmas
fontes e critérios: qualidade clínica revisada por docente, português, fidelidade
à fonte, validade do JSON, consistência dos 40 itens, latência, memória, falhas e
licença. Não afirmar vencedor nem desempenho antes do teste.

Manter adaptador de provedor na aplicação para trocar o executor sem reescrever
as jornadas. Software e modelos locais podem evitar cobrança por requisição;
hardware, energia, armazenamento e operação continuam sendo custos. Verificar
licenças de ferramentas e pesos antes de uso institucional/comercial.

Fontes oficiais consultadas:

- https://docs.ollama.com/capabilities/structured-outputs
- https://lmstudio.ai/docs/developer/openai-compat/structured-output
- https://github.com/ggml-org/llama.cpp/tree/master/tools/server
- https://www.jan.ai/docs/desktop/cli
- https://docs.gpt4all.io/gpt4all_api_server/home.html
- https://docs.vllm.ai/en/latest/cli/serve/

## Dificuldade e tags

Propor níveis introdutório, intermediário e avançado, sempre relativos ao
público-alvo. IA sugere; docente confirma com uma rubrica. Considerar quantidade
e semelhança de diagnósticos diferenciais, ambiguidade das pistas, integração
de evidências, priorização e autonomia exigida. Gravidade não equivale a
dificuldade. Manter a quantidade de itens não impede variar a complexidade.

Metadados propostos: dificuldade, justificativa, público-alvo, pré-requisitos,
objetivos, duração estimada, versão da rubrica, revisor e estado de validação.
Tags públicas podem indicar especialidade, habilidade e tipo de atendimento.
Evitar diagnóstico ou tags que revelem o gabarito em atividades avaliativas.

João e Marina também devem receber classificação mediante revisão, sem atribuir
nível arbitrariamente nesta discussão. Filtros e cartões devem apresentar nível,
público e duração. Preservar a classificação por versão para históricos.

## Portal do aluno

Prever catálogo filtrável, histórico de atendimentos, devolutivas concluídas,
notificações internas, upload, acompanhamento de contribuições e nova prática.
Separar feedback automático da avaliação do professor e preservar tentativas
anteriores. Rascunhos docentes devem permanecer privados.

## Decisões ainda em aberto

- Aprovação do fluxo de rascunhos e prática não avaliada.
- Hardware e modelo a comparar; limites de tamanho, tempo e quantidade de uploads.
- Política institucional de fontes, desidentificação, revisão e publicação.
- Rubrica de dificuldade e avaliação dos casos existentes.
- Disponibilidade de docentes para medir a qualidade clínica dos casos gerados.
