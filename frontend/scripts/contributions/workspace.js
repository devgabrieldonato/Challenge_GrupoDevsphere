import {
  AuthService
} from '../services/auth-service.js';
import {
  apiRequest
} from '../services/api-client.js';
import {
  node,
  asList,
  message
} from '../services/ui.js';
const status = document.getElementById('contributionStatus');
let pendingActionFocus = null;
// O utilitário desabilita o botão durante a operação; alguns navegadores então
// movem o foco ao body. Guarda o acionador antes disso, sem roubar foco posterior.
function button(label, action) {
  const control = node('button',label,'button'); control.type='button';
  control.onclick=async()=> {
    if(control.disabled) return;
    control.disabled=true;
    try {await action();}
    finally {
      control.disabled=false;
      if(pendingActionFocus===control) pendingActionFocus=null;
      // Reaplica a política depois do desbloqueio genérico do botão, sem janela de habilitação.
      for(const id of cardBindings.keys()) syncCard(id);
    }
  };
  control.addEventListener('click', () => {
    if (document.activeElement === control) pendingActionFocus = control;
  }, true);
  return control;
}
document.addEventListener('focusin', event => {
  if (pendingActionFocus && event.target !== pendingActionFocus && event.target !== document.body) pendingActionFocus = null;
});
document.addEventListener('pointerdown', event => {
  if (pendingActionFocus && !pendingActionFocus.contains(event.target)) pendingActionFocus = null;
});
let documentReturnFocus = null;
let activeDocument = null,
  currentRole = null, currentUserId = null;
const labels = {
  queued: 'Na fila',
  running: 'Em processamento',
  completed: 'Concluído',
  failed: 'Falhou',
  cancelled: 'Cancelado',
  needs_review: 'Aguardando revisão',
  draft: 'Rascunho',
  published: 'Publicado',
  approved: 'Aprovado',
  awaiting_review: 'Aguardando revisão',
  submitted: 'Aguardando revisão',
  in_review: 'Em revisão',
  changes_requested: 'Ajustes solicitados',
  withdrawn: 'Retirado'
};
// Estado transitório por documento: nunca grava orientações ou texto clínico em disco.
const formStates = new Map();
const cardBindings = new Map();
let runtime = null, runtimeLoading = false, loadSequence = 0;
let sourceSnapshot = null;
let cachedDocuments = [];
const deletionReasons={retention_policy:'Política de descarte físico ainda não habilitada',source_not_withdrawn:'A fonte precisa estar retirada',processing_history:'Há histórico de processamento vinculado',case_versions:'Há versões de casos dependentes',contribution_reference:'Há contribuições dependentes',library_chunks:'Há trechos na biblioteca',source_readers:'Há leitores ou exposição registrada',document_grants:'Há acessos concedidos'};
function deletionExplanation(reasons) {return (reasons || ['retention_policy']).map(reason=>deletionReasons[reason] || 'Há um vínculo que impede a exclusão.').join(' · ');}
function stateFor(id) {
  if (!formStates.has(id)) formStates.set(id, {pages:'', instructions:'', query:'', budget:null, busy:false, revision:0, notice:'Confira o orçamento antes de gerar.', relationships:null});
  return formStates.get(id);
}
function invalidateState(state, reason) {
  state.budget = null;
  state.revision++;
  state.notice = reason;
}
function policyAllowsInference() {
  return runtime?.apiInferenceEnabled === true && runtime.worker?.status === 'alive' && runtime.worker?.inferenceEnabled === true;
}
function previewIsValid(state) {
  const b=state.budget;
  return Boolean(b && b.signature === JSON.stringify([state.pages,state.instructions,state.query]) &&
    Number(b.validUntil)*1000 > Date.now() && runtime?.worker?.status === 'alive' &&
    b.configHash && b.configHash === runtime.worker.configHash);
}
function syncCard(id) { cardBindings.get(id)?.(); }
// O diagnóstico usa uma lista explícita; nunca serializa todo o ambiente do worker.
function displayRuntime() {
  const text = !runtime ? 'Diagnóstico indisponível. A geração permanece bloqueada; atualize para tentar novamente.' :
    runtime.apiInferenceEnabled !== true ? 'Modo protegido: geração e avaliação com modelos desabilitadas neste ambiente. Upload, conversão e orçamento continuam disponíveis. A validação completa está pendente no Windows.' :
    runtime.worker?.status !== 'alive' ? 'Worker ausente ou diagnóstico desatualizado. A geração permanece bloqueada.' :
    runtime.worker.inferenceEnabled !== true ? 'Worker em modo protegido: a geração está desabilitada. A prévia de orçamento não executa modelos.' :
    'Geração habilitada pela configuração operacional. Caber no contexto não garante memória ou conclusão.';
  document.getElementById('inferencePolicyStatus').textContent=text;
  const details=document.getElementById('workerDiagnostics'); details.hidden=currentRole!=='admin';
  if(currentRole==='admin') {
    const target=document.getElementById('workerDiagnosticFields'); target.replaceChildren();
    const w=runtime?.worker || {}, c=w.config || {};
    const entries=[['Estado',w.status],['Instância',w.instanceId],['Última atividade',w.heartbeatAt],['Início',w.startedAt],['Configuração',w.configHash],['Inferência na API',runtime?.apiInferenceEnabled],['Inferência no worker',w.inferenceEnabled],['Gerador configurado',c.generatorModel],['Avaliador configurado',c.criticModel],['Contexto de geração',c.generation?.context],['Saída de geração',c.generation?.output],['Contexto da crítica',c.review?.context],['Saída da crítica',c.review?.output],['Lote configurado',c.generation?.batch],['Limite de fontes (bytes)',c.generation?.sourceBytes],['Concorrência configurada',c.concurrency],['Versão do contrato',c.contractVersion],['Timeout configurado (s)',c.timeoutSeconds],['Configuração carregada em',c.configurationLoadedAt],['Versão de código',c.codeVersion]];
    for(const [label,value] of entries) target.append(node('dt',label),node('dd',value===undefined || value===null ? 'Não informado' : String(value)));
    target.append(node('dt','Limite da evidência'),node('dd','Valores configurados não comprovam parâmetros recebidos pelo provedor nem uso físico de memória. Esses valores não foram medidos nesta tela.'));
  }
  for(const id of cardBindings.keys()) syncCard(id);
}
async function refreshRuntime() {
  if(runtimeLoading) return;
  runtimeLoading=true;
  try { runtime=await apiRequest('/runtime'); }
  catch { runtime=null; }
  finally {
    runtimeLoading=false;
    for(const state of formStates.values()) if(state.budget && !previewIsValid(state)) invalidateState(state,'Prévia vencida ou configuração/worker alterado; confira novamente.');
    displayRuntime();
  }
}
// Prévia usa texto puro: Markdown não confiável nunca é inserido como HTML.
async function preview(id) {
  // O acionador pode estar temporariamente desabilitado pelo utilitário assíncrono.
  // Guardá-lo antes de abrir permite retornar ao contexto ao fechar por Escape.
  documentReturnFocus = pendingActionFocus || document.activeElement;
  try {
    const d = await apiRequest(`/documents/${id}`);
    activeDocument = d.id;
    document.getElementById('documentPreview').value = d.markdown || '';
    document.getElementById('saveMarkdown').hidden = !d.markdown || Number(d.ownerId)!==Number(currentUserId);
    document.getElementById('documentDialog').showModal();
  } catch (e) {
    message(status, e.message, true);
  }
}
const documentDialog = document.getElementById('documentDialog');
document.getElementById('closeDocument').onclick = () => documentDialog.close();
documentDialog.addEventListener('close', () => {
  const destination = documentReturnFocus;
  documentReturnFocus = null;
  // Não toma o foco se o usuário já navegou para outro controle após o fechamento.
  if (destination?.isConnected && !destination.disabled &&
      (document.activeElement === document.body || documentDialog.contains(document.activeElement))) {
    destination.focus();
  }
});
// Rótulos visíveis persistem depois da digitação e identificam cada fonte.
function labeledControl(card, control, label, id) {
  control.id = id;
  const caption = node('label', label);
  caption.htmlFor = id;
  card.append(caption, control);
  return caption;
}
// Página e instruções ficam explícitas para limitar o escopo do material de referência.
function documentCard(d) {
  const card = node('article');
  card.dataset.recordKey = `document-${d.id}`;
  const state = stateFor(d.id);
  const owner=Number(d.ownerId)===Number(currentUserId);
  card.append(node('h3', d.name || d.originalName || d.filename || d.title || `Documento ${d.id}`));
  card.append(node('p', labels[d.status] || d.status || 'Recebido'));
  const pages = node('input');
  pages.placeholder = 'Páginas: 1,2,3 (opcional)';
  pages.setAttribute('aria-label', 'Páginas do documento');
  const instructions = node('textarea');
  instructions.placeholder = 'Objetivos de aprendizagem e orientações para a geração';
  instructions.setAttribute('aria-label', 'Orientações pedagógicas');
  instructions.maxLength = 4000;
  const query = node('input');
  query.placeholder = 'Busca na biblioteca aprovada (opcional)';
  query.setAttribute('aria-label', 'Tema para recuperar referências aprovadas');
  for(const [key,control] of [['pages',pages],['instructions',instructions],['query',query]]) control.value=state[key];
  labeledControl(card, pages, 'Páginas do documento (opcional; exemplo: 1,2,3)', `source-${d.id}-pages`);
  labeledControl(card, instructions, 'Orientações pedagógicas', `source-${d.id}-instructions`);
  labeledControl(card, query, 'Tema para recuperar referências aprovadas (opcional)', `source-${d.id}-query`);
  if (d.warnings?.length) card.append(node('p', `Avisos: ${d.warnings.join(' · ')}`));
  const actions = node('div', '', 'next-actions');
  actions.append(button('Ver Markdown', () => preview(d.id)));
  // A prévia pertence à entrada e configuração efetivas; atualização de listas não apaga o formulário.
  const budgetStatus = node('p'); budgetStatus.setAttribute('role','status');
  budgetStatus.setAttribute('aria-live','polite');
  const generationButton = button('Gerar rascunho',()=>submitOperation('generate'));
  const convertButton=button('Converter para Markdown',()=>submitOperation('convert'));
  const budgetButton=button('Conferir orçamento',()=>submitOperation('budget'));
  const sync = () => {
    const valid=previewIsValid(state);
    generationButton.disabled=state.busy || d.status==='withdrawn' || !valid || !state.budget?.fits || !policyAllowsInference() || state.budget?.inferenceEnabled !== true;
    convertButton.disabled=state.busy || d.status==='withdrawn';
    budgetButton.disabled=state.busy || d.status==='withdrawn' || runtime?.worker?.status!=='alive';
    if(state.budget && valid) {
      const p=state.budget,b=p.budget || {};
      const total=b.totalEstimatedTokens ?? (Number(b.estimatedInputTokens)+Number(b.reservedOutputTokens));
      const margin=`template ${b.templateReserveTokens ?? 'não informado'}; mensagens ${b.messageReserveTokens ?? 'não informado'} (incluídos na entrada)`;
      const when=Number.isFinite(Number(p.diagnosedAt)) ? new Date(Number(p.diagnosedAt)*1000).toLocaleString('pt-BR') : 'Não informado';
      budgetStatus.textContent=`Estimativa de entrada: ${b.estimatedInputTokens}; saída reservada: ${b.reservedOutputTokens}; total estimado: ${total}; contexto: ${b.contextTokens}; saldo: ${b.remainingTokens}; margem: ${margin}. Calculado em ${when}. Validade: até ${new Date(Number(p.validUntil)*1000).toLocaleTimeString('pt-BR')}. ${p.message || ''} A crítica depende do caso gerado e será conferida posteriormente. Caber no contexto não garante memória ou conclusão. ${policyAllowsInference() ? '' : 'Inferência bloqueada neste ambiente.'}`;
    } else budgetStatus.textContent=state.notice;
  };
  cardBindings.set(d.id,sync);
  for(const [key,control] of [['pages',pages],['instructions',instructions],['query',query]]) control.addEventListener('input',()=>{
    state[key]=control.value; invalidateState(state,'Entrada alterada; confira o orçamento novamente.'); sync();
  });
  async function submitOperation(operation) {
    if(state.busy) return;
    state.busy=true; sync();
    try {
      if(operation==='generate' && (!previewIsValid(state) || !state.budget?.fits || !policyAllowsInference() || state.budget?.inferenceEnabled!==true)) throw Error('Geração indisponível: confira a política do ambiente e o orçamento atual.');
      const signature=JSON.stringify([state.pages,state.instructions,state.query]);
      const revision=state.revision;
      const pageList=state.pages.trim()?state.pages.split(',').map(x=>Number(x.trim())):[];
      if(pageList.some(x=>!Number.isInteger(x)||x<1)) throw Error('Informe páginas inteiras positivas separadas por vírgula.');
      const body={operation,pages:pageList,instructions:state.instructions,query:state.query,idempotencyKey:crypto.randomUUID()};
      if(operation==='generate') body.previewJobId=state.budget.jobId;
      if(operation==='budget') invalidateState(state,'Prévia na fila; aguardando o worker, sem inferência.');
      const expectedRevision=operation==='budget'?state.revision:revision;
      sync();
      const job=await apiRequest(`/documents/${d.id}/jobs`,{method:'POST',body:JSON.stringify(body)});
      if(operation!=='budget') { await load(); return; }
      for(let attempt=0;attempt<30;attempt++) {
        await new Promise(resolve=>setTimeout(resolve,1000));
        const result=await apiRequest(`/jobs/${job.id}`);
        if(['failed','cancelled'].includes(result.status)) throw Error(result.error?.message || 'A prévia não foi concluída.');
        if(result.status!=='completed') continue;
        if(expectedRevision!==state.revision || signature!==JSON.stringify([state.pages,state.instructions,state.query])) {state.notice='Entrada ou fonte alterada durante a consulta; confira novamente.';return;}
        const p=result.result;
        if(p?.budgetPreview!==true || !p.configHash || !p.inputHash || !Number.isFinite(Number(p.validUntil))) throw Error('O worker retornou uma prévia sem identificação ou validade.');
        state.budget={...p,signature,jobId:job.id};
        await refreshRuntime();
        if(!previewIsValid(state)) {invalidateState(state,'Prévia incompatível com o diagnóstico atual; confira novamente.');}
        syncCard(d.id); return;
      }
      throw Error('O worker não concluiu a prévia em 30 segundos. Consulte os trabalhos antes de solicitar outra.');
    } catch(e) {message(status,e.message,true);}
    finally { state.busy=false; syncCard(d.id); queueMicrotask(()=>syncCard(d.id)); }
  }
  if(owner && d.status!=='withdrawn') {actions.append(convertButton,budgetButton,generationButton);card.append(budgetStatus);}
  sync();
  // Aprovar a fonte não aprova casos gerados. O backend exige docente habilitado na área.
  if (currentRole === 'teacher' && d.status === 'converted') {
    const confirmation = node('label');
    const check = node('input');
    check.type = 'checkbox';
    confirmation.append(check, document.createTextNode(
      ' Conferi o texto, a autorização de uso e a desidentificação.'));
    card.append(confirmation);
    actions.append(button('Aprovar fonte para biblioteca', async () => {
      try {
        if (!check.checked) throw Error('Confirme a conferência antes de aprovar.');
        await apiRequest(`/documents/${d.id}/approve`, {
          method: 'POST',
          body: JSON.stringify({
            confirmed: true
          })
        });
        await load();
      } catch (e) {
        message(status, e.message, true);
      }
    }));
  }
  // O titular consulta a rastreabilidade; somente administração muda permissões.
  if(owner || currentRole==='admin') {
    const details=node('div');card.append(details);
    const renderRelationships=()=>{
      if(!state.relationships) return;
      const {action,label,rows}=state.relationships; details.replaceChildren(node('h4',label));
      if(!rows.length)details.append(node('p','Nenhum vínculo registrado.'));
      for(const row of rows)details.append(node('p',action==='grants'?`${row.name} · ID ${row.userId} · ${row.role}`:`${row.title} · versão ${row.version} · ${row.state}`));
    };renderRelationships();
    for(const [action,label] of [['grants','Consultar acessos concedidos'],['dependencies','Casos que utilizam esta fonte']]) actions.append(button(label,async()=>{
      details.replaceChildren(node('p','Consultando vínculos…'));
      try {
        const rows=asList(await apiRequest(`/documents/${d.id}/${action}`));
        state.relationships={action,label,rows};renderRelationships();
      }catch(e){details.replaceChildren(node('p',e.message));}
    }));
  }
  if (currentRole === 'admin') {
    const target=node('input');target.type='number';target.min='1';target.placeholder='ID do usuário';target.setAttribute('aria-label','ID do usuário para acesso à fonte');
    const mode=node('select');mode.setAttribute('aria-label','Operação de acesso à fonte');mode.add(new Option('Conceder acesso','grant'));mode.add(new Option('Revogar acesso','revoke'));
    const reason=node('textarea');reason.placeholder='Motivo administrativo da revogação, sem dados clínicos';reason.setAttribute('aria-label','Motivo administrativo da revogação');reason.maxLength=2000;reason.hidden=true;
    labeledControl(card, target, 'ID do usuário para acesso à fonte', `source-${d.id}-target`);
    labeledControl(card, mode, 'Operação de acesso à fonte', `source-${d.id}-mode`);
    const reasonLabel = labeledControl(card, reason, 'Motivo administrativo da revogação', `source-${d.id}-reason`);
    reasonLabel.hidden = true;
    mode.onchange=()=>{reason.hidden=reasonLabel.hidden=mode.value!=='revoke';};
    actions.append(button('Aplicar permissão da fonte',async()=>{
      try{
        if(!Number.isInteger(Number(target.value)) || Number(target.value)<1)throw Error('Informe um ID válido.');
        const enabled=mode.value==='grant';if(!enabled&&!reason.value.trim())throw Error('Informe o motivo administrativo da revogação.');
        await apiRequest(`/documents/${d.id}/grants`,{method:'POST',body:JSON.stringify({userId:Number(target.value),enabled,reason:reason.value.trim()})});
        message(status,enabled?'Acesso concedido.':'Acesso revogado. Resultados dependentes respeitam a permissão atual.');
      }catch(e){message(status,e.message,true);}
    }));
  }
  if ((owner || currentRole==='admin') && d.status !== 'withdrawn') actions.append(button('Retirar fonte', async () => {
    try {
      await apiRequest(`/documents/${d.id}/withdraw`, {
        method: 'POST'
      });
      await load();
    } catch (e) {
      message(status, e.message, true);
    }
  }));
  if((owner || currentRole==='admin') && d.status==='withdrawn') {
    const eligibility=node('p','A exclusão depende da política de retenção e da ausência de vínculos.');
    eligibility.setAttribute('role','status');card.append(eligibility);
    const remove=button('Excluir definitivamente',async()=>{
      try {
        const check=await apiRequest(`/documents/${d.id}/deletion-eligibility`);
        if(!check.eligible) throw Error(deletionExplanation(check.reasons));
        if(!window.confirm('Excluir definitivamente este documento retirado e seus arquivos internos? Esta ação não pode ser desfeita. Casos, atendimentos e avaliações não serão excluídos.')) return;
        const result=await apiRequest(`/documents/${d.id}`,{method:'DELETE'});
        formStates.delete(d.id);await load();message(status,result.cleanupPending?'Registro removido. A limpeza física ainda está pendente; consulte a administração.':'Documento excluído definitivamente.');
      } catch(e) {message(status,e.message,true);}
    });
    remove.hidden=true;actions.append(remove);
    actions.append(button('Verificar possibilidade de exclusão',async()=>{
      try {
        const check=await apiRequest(`/documents/${d.id}/deletion-eligibility`);
        remove.hidden=!check.eligible;
        eligibility.textContent=check.eligible?'Sem dependências impeditivas. Confirme a ação em Excluir definitivamente.':`Exclusão bloqueada: ${deletionExplanation(check.reasons)} O filtro permite manter o material fora da lista principal.`;
      } catch(e) {eligibility.textContent=e.message;remove.hidden=true;}
    }));
  }
  card.append(actions);
  return card;
}

// O arquivamento é reversível: a API mantém o trabalho e seus vínculos.
// Somente estados terminais admitem remoção; fila e execução precisam terminar primeiro.
function jobCard(job) {
  const jobState = job.state || job.status;
  const archived = Boolean(job.archivedAt);
  const terminal = ['completed', 'failed', 'cancelled'].includes(jobState);
  const card = node('article');
  card.dataset.recordKey = `job-${job.id}`;
  card.append(node('h3', `Trabalho ${job.id} · ${job.operation||job.type||''}`));
  card.append(node('p', labels[jobState] || jobState || 'Estado indisponível'));
  if (archived) card.append(node('p', 'Removido da lista principal. Os resultados e vínculos continuam preservados.'));
  if (['queued', 'running'].includes(jobState)) {
    card.append(node('p', job.cancelRequested
      ? 'Cancelamento solicitado. Aguarde a confirmação do processamento; a remoção fica disponível quando o trabalho terminar.'
      : 'Este trabalho ainda está ativo. Para removê-lo da lista, aguarde o término ou solicite o cancelamento e aguarde a confirmação.'));
  }
  if (archived || terminal) card.append(button(archived ? 'Restaurar na lista' : 'Remover da lista', async () => {
    try {
      if (!archived && !window.confirm('Remover este trabalho da lista principal? O documento, o Markdown, os rascunhos e o histórico serão preservados. Você poderá restaurá-lo pelo filtro “Removidos da lista” ou iniciar uma nova solicitação a partir do documento.')) return;
      await apiRequest(`/jobs/${job.id}/${archived ? 'restore' : 'archive'}`, {method:'POST'});
      await load();
      message(status, archived
        ? 'Trabalho restaurado na lista principal.'
        : 'Trabalho removido da lista principal. O documento e os resultados foram preservados; uma nova solicitação pode ser iniciada pelo documento.');
    } catch (e) { message(status, e.message, true); }
  }));
  if (job.error || job.errorMessage) card.append(node('p', job.errorMessage || (typeof job.error ===
    'object' ? (job.error.message || JSON.stringify(job.error)) : job.error)));
  if(job.resultAccess==='revoked')card.append(node('p','Resultado restrito: uma fonte foi retirada ou sua permissão de acesso deixou de ser válida.'));
  const result = job.result || job.result_json;
  if (result) {
    const pre = node('pre', typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    card.append(pre);
    if (!archived && (job.operation === 'generate') && !result.budgetPreview && jobState === 'completed') card.append(button(
      'Salvar proposta como contribuição', async () => {
        try {
          const saved = await apiRequest(`/jobs/${job.id}/contribution`, {
            method: 'POST'
          });
          message(status, 'Rascunho salvo; exige revisão docente.');
          if (saved.id) location.assign(`case-curation.html?id=${saved.id}`);
          else await load();
        } catch (e) {
          message(status, e.message, true);
        }
      }));
  }
  // Um trabalho arquivado não pode ser reenviado antes de ser restaurado.
  // Cancelamento em execução é uma solicitação, nunca uma confirmação antecipada.
  for (const action of (archived ? [] : ['failed', 'cancelled'].includes(jobState) ? ['retry'] :
    ['queued', 'running'].includes(jobState) && !job.cancelRequested ? ['cancel'] : [])) card.append(button(action === 'retry' ?
    'Tentar novamente' : 'Cancelar', async () => {
      try {
        await apiRequest(`/jobs/${job.id}/${action}`, {
          method: 'POST'
        });
        await load();
        if (action === 'cancel') message(status, 'Solicitação de cancelamento enviada. Confira o estado atualizado; a remoção será permitida após o término do trabalho.');
      } catch (e) {
        message(status, e.message, true);
      }
    }));
  return card;
}
async function load() {
  const sequence=++loadSequence;
  message(status, 'Consultando documentos e trabalhos…');
  try {
    const actor=(await AuthService.session()).user;
    currentRole=actor.role;currentUserId=actor.id;
  } catch (e) {
    message(status, e.message, true);
    return;
  }
  const results = await Promise.allSettled([apiRequest('/documents'), apiRequest('/jobs'), apiRequest(
    '/contributions')]);
  if(sequence!==loadSequence) return;
  await refreshRuntime();
  if(sequence!==loadSequence) return;
  // Guarda o foco atual imediatamente antes de substituir cartões; navegação
  // feita durante a consulta é respeitada e controles externos não são alterados.
  const previousFocus = document.activeElement === document.body && pendingActionFocus
    ? pendingActionFocus : document.activeElement;
  const previousCard = previousFocus?.closest('[data-record-key]');
  const previousList = previousCard?.parentElement;
  const focusId = previousFocus?.id;
  const focusText = previousFocus?.textContent;
  const focusTag = previousFocus?.tagName;
  const previousScroll={x:window.scrollX,y:window.scrollY};
  const selection=previousFocus && 'selectionStart' in previousFocus ? [previousFocus.selectionStart,previousFocus.selectionEnd] : null;
  results.forEach((r, i) => {
    const container = document.getElementById(['documents', 'jobs', 'drafts'][i]);
    container.replaceChildren();
    if (r.status === 'rejected') {
      container.append(node('p', r.reason.message));
      return;
    }
    let rows = asList(r.value);
    if(i===0) {
      const snapshot=JSON.stringify(rows.map(d=>[d.id,d.sha256,d.updatedAt,d.extractionRevision,d.status]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
      if(sourceSnapshot!==null && snapshot!==sourceSnapshot) for(const state of formStates.values()) invalidateState(state,'Uma fonte ou permissão foi alterada; confira o orçamento novamente.');
      sourceSnapshot=snapshot;cachedDocuments=rows;cardBindings.clear();
      const retired=rows.filter(d=>d.status==='withdrawn').length;
      const mode=document.getElementById('documentFilter').value;
      rows=rows.filter(d=>mode==='all' || (mode==='withdrawn'?d.status==='withdrawn':d.status!=='withdrawn'));
      document.getElementById('documentCounts').textContent=`${cachedDocuments.length-retired} ativos · ${retired} retirados · ${rows.length} exibidos.`;
    }
    if (i === 1) {
      // O filtro afeta somente a apresentação. Histórico, fonte e resultados não são apagados.
      const archivedCount = rows.filter(job => Boolean(job.archivedAt)).length;
      const total = rows.length;
      const mode = document.getElementById('jobFilter').value;
      rows = rows.filter(job => mode === 'all' || (mode === 'archived' ? Boolean(job.archivedAt) : !job.archivedAt));
      document.getElementById('jobCounts').textContent = `${total - archivedCount} visíveis · ${archivedCount} removidos da lista · ${rows.length} exibidos.`;
      if (!rows.length) container.append(node('p', mode === 'archived'
        ? 'Nenhum trabalho removido da lista.'
        : mode === 'visible' && archivedCount
          ? 'Nenhum trabalho visível. Consulte “Removidos da lista” para restaurar trabalhos anteriores.'
          : 'Nenhum trabalho de processamento disponível.'));
    } else if (!rows.length) container.append(node('p', 'Nenhum registro disponível.'));
    for (const item of rows) {
      if (i < 2) container.append(i === 0 ? documentCard(item) : jobCard(item));
      else {
        const card = node('article');
        card.dataset.recordKey = `draft-${item.id}`;
        card.append(node('h3', item.title || item.key), node('p',
          `${labels[item.state]||item.state} · versão ${item.version}`));
        const link = node('a', 'Abrir contribuição', 'button');
        link.href = `case-curation.html?id=${encodeURIComponent(item.id)}`;
        card.append(link);
        container.append(card);
      }
    }
  });
  if (previousCard && !previousFocus.isConnected && document.activeElement === document.body) {
    const replacement = Array.from(previousList.children).find(card => card.dataset.recordKey === previousCard.dataset.recordKey);
    const controls = replacement?.querySelectorAll('button, input, select, textarea, a[href]') || [];
    const control = Array.from(controls).find(item => !item.disabled && !item.hidden &&
      (focusId ? item.id === focusId : item.tagName === focusTag && item.textContent === focusText));
    // Se a ação desapareceu ao mudar de estado, o título mantém o contexto.
    const destination = control || replacement?.querySelector('h3') || previousList.previousElementSibling;
    if (destination) {
      if (!control) destination.tabIndex = -1;
      destination.focus({preventScroll:true});
      if(control && selection && typeof control.setSelectionRange==='function') {try{control.setSelectionRange(...selection);}catch{}}
    }
  }
  window.scrollTo(previousScroll.x,previousScroll.y);
  message(status, results.some(x => x.status === 'rejected') ?
    'Algumas consultas falharam. Atualize para tentar novamente.' : 'Consulta atualizada.');
}
document.getElementById('uploadForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.target;
  if (!form.reportValidity()) return;
  const submit = event.submitter;
  submit.disabled = true;
  try {
    const file = document.getElementById('sourcePdf').files[0];
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) throw Error('Selecione um PDF.');
    const data = new FormData();
    data.append('pdf', file);
    data.append('area', document.getElementById('sourceArea').value.trim());
    data.append('authorized', 'true');
    data.append('deidentified', 'true');
    await apiRequest('/documents', {
      method: 'POST',
      body: data
    });
    form.reset();
    await load();
    message(status, 'Documento recebido. Solicite a conversão para acompanhar a extração.');
  } catch (e) {
    message(status, e.message, true);
  } finally {
    submit.disabled = false;
  }
};
document.getElementById('refreshContributions').onclick = load;
document.getElementById('documentFilter').onchange = load;
document.getElementById('jobFilter').onchange = load;
load();
// Consulta leve de heartbeat e expiração: não chama o Ollama nem inicia inferência.
const runtimeTimer=setInterval(()=>{if(!document.hidden) refreshRuntime();},10000);
window.addEventListener('pagehide',()=>clearInterval(runtimeTimer),{once:true});

// Correção da extração retira aprovação anterior; o servidor mantém auditoria dessa mudança.
document.getElementById('saveMarkdown').onclick = async () => {
  try {
    if (!activeDocument) return;
    await apiRequest(`/documents/${activeDocument}`, {
      method: 'PUT',
      body: JSON.stringify({
        markdown: document.getElementById('documentPreview').value
      })
    });
    document.getElementById('documentDialog').close();
    await load();
    message(status, 'Extração corrigida. A fonte requer nova conferência.');
  } catch (e) {
    message(status, e.message, true);
  }
};
// Busca autorizada apresenta documento/página e texto puro para permitir rastrear a referência.
document.getElementById('librarySearchForm').onsubmit = async event => {
  event.preventDefault();
  const searchStatus = document.getElementById('librarySearchStatus');
  message(searchStatus, 'Buscando referências aprovadas…');
  try {
    const result = await apiRequest('/library/search', {
      method: 'POST',
      body: JSON.stringify({
        query: document.getElementById('libraryQuery').value
      })
    });
    const container = document.getElementById('libraryResults');
    container.replaceChildren();
    const matches = asList(result);
    if (!matches.length) container.append(node('p',
      'Nenhum trecho aprovado e autorizado foi encontrado.'));
    for (const source of matches) {
      const card = node('article');
      card.append(node('h3', `Fonte ${source.documentId} · página ${source.page}`), node('p', source
        .text));
      container.append(card);
    }
    message(searchStatus, matches.length ? `${matches.length} trechos aprovados e autorizados encontrados.` : 'Nenhum trecho aprovado e autorizado foi encontrado.');
  } catch (e) {
    message(searchStatus, e.message, true);
  }
};
