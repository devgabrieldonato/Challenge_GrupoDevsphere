# Geração assistida e importação de casos — NEXT_2026

## Dois tipos de PDF

O PDF clínico de referência entra na área de contribuições e pode originar um novo
caso fictício. O PDF de percurso acadêmico contém uma investigação já realizada
e pertence ao fluxo de [relatórios](RELATORIO_PDF_VERSIONADO.md). Importar um
relatório não o transforma em caso nem autentica uma nota externa.

## Entrada e processamento reais

Alunos e professores autenticados podem enviar PDFs autorizados e previamente
desidentificados em `contributions.html`. A declaração é obrigatória e não
representa anonimização automática.

O backend valida extensão, MIME, assinatura real, limites e estrutura inicial,
atribui nome interno, calcula SHA-256 e guarda o original fora do frontend.
O limite atual da fonte é 10 MiB e 100 páginas. Acesso à fonte, Markdown e
trabalhos depende das permissões do usuário.

O fluxo implementado é:

1. `POST /documents` recebe PDF e declarações explícitas de uso e desidentificação.
2. `POST /documents/{id}/jobs` solicita `convert`, com páginas físicas opcionais.
3. O worker extrai texto/tabelas e usa OCR quando necessário e disponível.
4. O proprietário consulta o Markdown, páginas e avisos e pode corrigir a extração.
5. A correção invalida a aprovação anterior da fonte.
6. O proprietário solicita `generate`, com objetivos e busca opcional na biblioteca.
7. Qwen gera JSON; Gemma realiza crítica complementar, sem aprovação clínica.
8. Validação estrutural verifica o contrato e exatamente 18 perguntas e 22 exames.
9. A proposta concluída pode ser materializada como contribuição em rascunho.
10. A versão segue atribuição, revisão, aprovação e publicação separadas.

Markdown é uma representação intermediária revisável. Não garante interpretação
correta de valores, unidades, tabelas ou conteúdo médico. Dados acrescentados
precisam aparecer como suposições/elementos sintéticos, distintos dos fatos extraídos.

## Fila persistente e falhas

Os estados técnicos de `worker_jobs` são `queued`, `running`, `completed`,
`failed` e `cancelled`. Operação, tentativas, idempotência, lease, expiração,
resultado e erro são persistidos. Cancelamento e retentativa têm limites definidos.
Não existe porcentagem fictícia de processamento.

Os nomes antigos `validating_source`, `extracting`, `generating`, `requires_ocr`
e `validation_failed` descreviam etapas propostas. Não devem ser tratados como
o enum atual da fila. A necessidade de OCR ou indisponibilidade de provedor é
informada por erro/aviso estruturado, sem inventar um caso ou simular conclusão.

Geração e crítica executam sequencialmente para limitar memória. O worker não
escreve versões aprovadas e não possui autoridade de publicação. Veja configuração,
limites e contratos em [Worker local](../worker/README.md).

## Modelos locais e dependências

O adaptador inicial utiliza Ollama, `qwen3:8b` para geração e `gemma3:4b` para
crítica. O backend C++20 continua responsável por login, dados, permissões e
pontuação. Um provedor pode ser substituído pelo adaptador sem reescrever as jornadas.

Dependências Python estão em `worker/requirements.txt`. PDFs digitalizados exigem
Poppler e Tesseract com idiomas apropriados. Modelos não são baixados automaticamente.
Não há uso de API paga neste fluxo.

No equipamento auditado, Ollama e modelos não estavam instalados; geração real,
benchmark de memória/tempo e avaliação clínica ainda precisam ocorrer. A implementação
do cliente e testes com provedores falsos não comprovam esses resultados.

## Curadoria e publicação

Caso e fonte possuem aprovações diferentes. Uma fonte aprovada pode alimentar a
biblioteca; cada exercício derivado precisa de revisão própria.

Estados das versões: `draft`, `awaiting_review`, `in_review`, `changes_requested`,
`approved`, `published`, `rejected` e `archived`. A API valida a transição, a
instituição, habilitação por área e atribuição de revisão. Autoaprovação depende
da política configurada; não é direito automático do autor.

O aluno envia e acompanha sua contribuição, mas não aprova nem publica. O
administrador habilita e atribui revisores; sua permissão técnica não equivale
a competência clínica. Cada versão aprovada identifica o responsável e o parecer.
Mudanças criam outra versão e exigem nova revisão.

A revisão abrange paciente, perguntas, exames, respostas, dependências, hipóteses,
pontuação, referências, dificuldade e a combinação de tags/título/resumo. As tags
públicas não podem antecipar diagnóstico; área interna pode permanecer restrita.
Disciplina é vínculo curricular opcional.

A revisão tem formulário guiado para paciente, hipóteses, objetivos e quarenta
perguntas/exames, com respostas, justificativas, dependências e regras pedagógicas.
JSON é opcional na revisão; extensões e proveniência são preservadas. A autoria
manual inicial técnica ainda pode utilizar JSON. Não há mais fallback visual que gere uma estrutura clínica vazia e a apresente
como geração bem-sucedida.

## Biblioteca e rastreabilidade

RAG recupera trechos relevantes de fontes aprovadas com acesso por propriedade ou
concessão explícita. A autorização ocorre antes da recuperação. Retirada e alterações
de fonte precisam refletir nas consultas; referências incluem documento, hash e página.

Não existe treinamento automático nem incorporação automática de rascunhos ao acervo.
A proveniência registra solicitante, documento, hashes, modelos, versão de prompt,
alertas, resultado e duração. Dados sensíveis e chaves não devem aparecer em logs.

Documentos e saídas dos modelos são dados não confiáveis. Instruções neles contidas
não concedem acesso, executam comandos ou mudam política. Markdown é apresentado como
texto seguro; não se executa HTML bruto.

## Demonstração e segurança

Veja [Portais NEXT_2026](PORTAIS_NEXT_2026.md) para o percurso de upload e curadoria,
[Segurança NEXT_2026](SEGURANCA_NEXT_2026.md) para controles e bloqueios e
[Arquitetura](ARQUITETURA_BACKEND_CPP20.md) para a separação entre componentes.

O isolamento atual em subprocesso possui limites e não é sandbox completa. Produção
exige usuário dedicado, montagem e rede restritas, revisão independente e regras
institucionais de uso, retenção e aprovação. Validação estrutural nunca substitui
validação médica.

Atualização após a rodada inicial: Ollama, Qwen3:8b e Gemma3:4b estão instalados. Gemma passou em JSON curto; Qwen apresentou timeouts. Geração completa permanece pendente. Veja [resultados dos modelos](MODELOS_LOCAIS_NEXT_2026.json) e o README do worker.
