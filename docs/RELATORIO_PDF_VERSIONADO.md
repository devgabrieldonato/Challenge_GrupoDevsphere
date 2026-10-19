# Contrato versionado do relatório acadêmico — NEXT_2026

## Documento oficial e cópia pessoal

O atendimento concluído possui relatório JSON para revisão e PDF legível para
consulta. Na NEXT_2026, ambos os registros oficiais são derivados do histórico
aceito pelo backend. O arquivo criado no navegador é uma cópia pessoal e parte
do transporte compatível; ele não determina nota, identidade ou conteúdo oficial.

O contrato utiliza `schemaVersion: 2`,
`reportType: "patient-virtual-submission"` e `clinicalSessionId` obrigatório.
Veja o [schema](schemas/submission-report.schema.json) e o
[OpenAPI](../backend/openapi/openapi.yaml).

## Identidade, versão e eventos

O relatório apresenta caso, aluno, protocolo, versão, ordem das escolhas,
respostas, hipóteses, justificativas e pontuação. A sessão persistida fixa a
versão do caso e as evidências disponíveis em cada hipótese.

Campos `studentId`, `studentName`, pontos, respostas e decisões recebidos do
navegador não concedem propriedade nem autenticidade. O backend usa a sessão e
seus registros para conferir e reconstruir o conteúdo. O documento oficial
recebe `officialAttempt: true` apenas nesse fluxo validado.

`clientSubmissionId` é um UUID criado uma vez por conclusão. Reenvios reutilizam
UUID, JSON e PDF de entrada. A mesma chave com conteúdo diferente resulta em
`409 idempotency_conflict`; não cria outra versão do atendimento.

## Finalização automática

O cliente envia `POST /api/v1/submissions` como `multipart/form-data`, com:

- `clientSubmissionId`: protocolo estável entre tentativas de envio;
- `report`: JSON v2 com `clinicalSessionId`, percurso e tentativas;
- `activityId`: inteiro positivo opcional, compatível com a sessão e atribuição;
- `pdf`: PDF pessoal `application/pdf` para o mesmo relatório.

Mutações também exigem sessão, origem permitida e `X-PV-Request: 1`. O cliente
oficial já inclui esse cabeçalho. Professor não conclui no papel de aluno;
simulações administrativas são identificadas como testes.

Depois de validar o envelope e conciliar o histórico, o backend executa o
renderizador oficial com os dados autoritativos. O PDF final, seu SHA-256 e os
registros da submissão são guardados transacionalmente. A sessão fica vinculada
à submissão e concluída, impedindo novas escolhas.

Uma submissão nova responde `201`; reenvio idêntico responde `200`. A resposta
inclui identificação, indicação de criação, estado e pontuação. O estado acadêmico
é `submitted` quando existe revisor ou `awaiting_assignment` quando depende de
atribuição. O sucesso só aparece após confirmação da API.

A interface envia automaticamente após registrar a hipótese. Se houver falha,
preserva o protocolo e permite tentar novamente. O aluno não precisa exportar e
importar um arquivo para entregar o atendimento ao professor.

## Dependência do renderizador oficial

`backend/src/official_pdf.cpp` chama `tools/render_official_report.py`, usando
o Python configurado em `DEVSPHERE_PYTHON`. O interpretador precisa de ReportLab.
`DEVSPHERE_PDF_RENDERER` permite definir o caminho do renderizador.

O processo recebe dados validados em arquivos temporários privados, sem shell
e sem autoridade de edição do banco. Texto clínico e autoral é escapado antes de
compor o PDF. O conteúdo recebido do aluno não é reaproveitado como páginas oficiais.

Se a renderização falhar, a API informa `503 official_pdf_unavailable` e não
apresenta a submissão como concluída. Corrija a dependência e repita o envio com
o mesmo protocolo. A preparação está nos READMEs [principal](../README.md) e
[do backend](../backend/README.md).

## Contêiner PDF e marcador

O PDF contém JSON no marcador `%PV_REPORT_V1:`. O sufixo `V1` identifica o
contêiner legado; `schemaVersion` identifica a versão do conteúdo.

O envelope enviado pelo cliente exige extensão `.pdf`, MIME `application/pdf`,
assinatura, limite de tamanho e coincidência do marcador com o campo multipart
`report`. Divergência resulta em `400 pdf_report_mismatch`.

Essa coincidência verifica consistência do transporte, não autenticidade acadêmica.
Um usuário consegue alterar texto e JSON em seu próprio arquivo. Por isso, a NEXT
reconcilia os dados com a sessão e gera outro PDF oficial a partir do servidor.

O documento oficial é armazenado como BLOB e nunca executa o JSON incorporado.
O download autorizado é `GET /api/v1/submissions/{id}/pdf`; o caminho físico não
é divulgado. A cópia pessoal oferecida no atendimento e o PDF oficial obtido por
essa rota podem ter apresentação diferente.

## Compatibilidade e histórico

Antes da NEXT_2026, o PDF do navegador era validado e armazenado diretamente.
Registros já existentes permanecem históricos; essa forma antiga de transporte
não constitui garantia retroativa de verificação pelo novo fluxo.

A importação manual aceita relatórios legados v1 reconhecidos pelo sistema.
Ela fica separada da conclusão de sessão e é marcada como `source: "pdf_import"`
e `officialAttempt: false`. Seu percurso é documental, não autenticado pelo
servidor. Não se atribui nota oficial a pontos escritos no PDF importado.

Relatórios v1 sem pontuação apresentam **Pontuação não disponível**. A leitura
legada permanece compatível, sem recalcular notas retroativamente.

## Acesso e devolutiva

O aluno acessa o próprio atendimento, documento e devolutivas concluídas.
O professor precisa de vínculo de revisão ou atividade; conhecer o identificador
não dá acesso. O administrador tem os acessos técnicos previstos pela política.
Consultas sem vínculo não devem revelar a existência de documento privado.

A devolutiva é entidade separada do percurso imutável. Rascunhos não aparecem
para o aluno; conclusão disponibiliza todos os campos e gera uma notificação
interna. Consulte [Portais NEXT_2026](PORTAIS_NEXT_2026.md).

## Limitações e segurança

Não versione PDFs privados, banco, chaves ou informações identificáveis. Logs
não devem conter relatório integral, documento ou texto livre clínico.
Backups, retenção e uso institucional dependem das políticas homologadas.

O documento oficial comprova a vinculação aos registros do sistema, não validade
médica do caso, identidade presencial do aluno, certificação acadêmica ou assinatura
digital externa. Classificações e casos exigem revisão docente antes de uso formal.

Veja [Segurança NEXT_2026](SEGURANCA_NEXT_2026.md),
[Arquitetura](ARQUITETURA_BACKEND_CPP20.md) e [Worker](../worker/README.md).
