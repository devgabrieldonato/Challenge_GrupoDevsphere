# Contrato versionado do relatório acadêmico

O atendimento concluído possui duas representações vinculadas ao mesmo protocolo:

- o relatório JSON estruturado, que é a fonte de dados para a revisão docente;
- o PDF legível, oferecido ao professor e ao aluno como documento de consulta.

O contrato atual usa `schemaVersion: 2` e `reportType: "patient-virtual-submission"`. A definição completa está em `docs/schemas/submission-report.schema.json`.

## Versão 2

O relatório guarda o caso, o aluno apresentado pela interface, o protocolo idempotente, a versão das regras, a ordem das escolhas, as tentativas diagnósticas e a pontuação. Cada evento de pontuação registra separadamente valor clínico, bônus de prioridade, penalidade de eficiência, variação e totais acumulados.

O campo `studentId` recebido do navegador serve apenas para compatibilidade e exibição. O backend identifica o autor pela sessão autenticada e não usa esse campo para conceder acesso ou definir propriedade.

`clientSubmissionId` é um UUID criado uma vez por conclusão. Uma nova tentativa de envio deve reutilizar esse identificador e o mesmo conteúdo. Isso permite recuperar a submissão existente sem duplicar o atendimento.

## Finalização automática

O cliente envia `POST /api/v1/submissions` como `multipart/form-data`, com:

- `clientSubmissionId`: UUID estável entre tentativas;
- `report`: JSON conforme o schema v2;
- `activityId`: inteiro positivo e opcional;
- `pdf`: PDF `application/pdf` gerado para o mesmo relatório.

Uma submissão nova responde `201`; um retry idempotente responde `200`. A resposta contém `id`, `created`, `status` e o resumo `score`. O status é `submitted` quando há professor responsável ou `awaiting_assignment` quando depende de atribuição.

O sucesso só pode ser apresentado depois da confirmação da API. Em falha, o cliente preserva o relatório, o PDF e o identificador para permitir nova tentativa. O download manual continua disponível como cópia do aluno; ele não é necessário para entregar o atendimento ao professor.

## PDF e payload incorporado

O PDF inclui o relatório estruturado em um marcador `%PV_REPORT_V1:` após o conteúdo principal. O nome do marcador permanece `V1` por compatibilidade do contêiner; a versão do conteúdo é determinada por `schemaVersion`.

O backend valida nome `.pdf`, MIME `application/pdf`, assinatura `%PDF-`, marcador incorporado e tamanho de até 20 MiB. O JSON incorporado deve coincidir exatamente com o campo multipart `report`; uma divergência gera `400 pdf_report_mismatch`. O hash SHA-256 é calculado no servidor e o PDF é armazenado como BLOB na mesma transação da submissão. Conteúdo incorporado nunca deve ser executado.

O professor autorizado pode obter o documento em `GET /api/v1/submissions/{submissionId}/pdf`. O caminho físico de armazenamento não faz parte da resposta.

## Compatibilidade com a versão 1

Relatórios legados podem usar `schemaVersion: 1` e `reportType: "patient-virtual-submission"` na importação manual existente. Eles não possuem pontuação e devem aparecer como **Pontuação não disponível**, nunca como zero.

O schema deste diretório descreve somente novos relatórios v2. A compatibilidade v1 pertence ao importador legado e permanece isolada do fluxo automático.

## Segurança e privacidade

- O backend deriva usuário e papel do cookie de sessão.
- Alunos e administradores podem concluir; professores recebem `403`.
- Em simulação administrativa, o backend usa um aluno técnico e grava `isTest: true`.
- O JSON recebido do navegador não é fonte de autoridade para identidade ou pontuação.
- A pontuação é recalculada com a versão oficial das regras.
- O PDF só pode ser consultado pelo aluno proprietário, professor responsável ou administrador autorizado.
- Uma consulta sem vínculo responde `404`, sem revelar a existência do documento.
- Dados clínicos educacionais e identificadores não devem aparecer em logs técnicos.

## Limitação clínica

A classificação pedagógica inicial foi criada a partir do conteúdo atual dos casos. Ela ainda exige revisão e homologação por docentes de Medicina antes de ser usada como nota acadêmica, decisão assistencial ou instrumento de avaliação formal.
