import {
  AuthService
} from '../services/auth-service.js';
import {
  apiRequest
} from '../services/api-client.js';
import {
  node,
  asList,
  message,
  button
} from '../services/ui.js';
const status = document.getElementById('contributionStatus');
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
  changes_requested: 'Ajustes solicitados'
};
// Prévia usa texto puro: Markdown não confiável nunca é inserido como HTML.
async function preview(id) {
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
document.getElementById('closeDocument').onclick = () => document.getElementById('documentDialog').close();
// Página e instruções ficam explícitas para limitar o escopo do material de referência.
function documentCard(d) {
  const card = node('article');
  const owner=Number(d.ownerId)===Number(currentUserId);
  card.append(node('h3', d.name || d.originalName || d.filename || d.title || `Documento ${d.id}`));
  card.append(node('p', labels[d.status] || d.status || 'Recebido'));
  const pages = node('input');
  pages.placeholder = 'Páginas: 1,2,3 (opcional)';
  pages.setAttribute('aria-label', 'Páginas do documento');
  const instructions = node('textarea');
  instructions.placeholder = 'Objetivos de aprendizagem e orientações para a geração';
  instructions.setAttribute('aria-label', 'Orientações pedagógicas');
  const query = node('input');
  query.placeholder = 'Busca na biblioteca aprovada (opcional)';
  query.setAttribute('aria-label', 'Tema para recuperar referências aprovadas');
  card.append(pages, instructions, query);
  if (d.warnings?.length) card.append(node('p', `Avisos: ${d.warnings.join(' · ')}`));
  const actions = node('div', '', 'next-actions');
  actions.append(button('Ver Markdown', () => preview(d.id)));
  if(owner) for (const operation of ['convert', 'generate']) actions.append(button(operation === 'convert' ?
    'Converter para Markdown' : 'Gerar rascunho', async () => {
      try {
        const pageList = pages.value.trim() ? pages.value.split(',').map(x => Number(x.trim())) : [];
        if (pageList.some(x => !Number.isInteger(x) || x < 1)) throw Error(
          'Informe páginas inteiras positivas separadas por vírgula.');
        await apiRequest(`/documents/${d.id}/jobs`, {
          method: 'POST',
          body: JSON.stringify({
            operation,
            pages: pageList,
            instructions: instructions.value,
            query: query.value,
            idempotencyKey: crypto.randomUUID()
          })
        });
        await load();
      } catch (e) {
        message(status, e.message, true);
      }
    }));
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
    for(const [action,label] of [['grants','Consultar acessos concedidos'],['dependencies','Casos que utilizam esta fonte']]) actions.append(button(label,async()=>{
      details.replaceChildren(node('p','Consultando vínculos…'));
      try {
        const rows=asList(await apiRequest(`/documents/${d.id}/${action}`));
        details.replaceChildren(node('h4',label));
        if(!rows.length)details.append(node('p','Nenhum vínculo registrado.'));
        for(const row of rows)details.append(node('p',action==='grants'?`${row.name} · ID ${row.userId} · ${row.role}`:`${row.title} · versão ${row.version} · ${row.state}`));
      }catch(e){details.replaceChildren(node('p',e.message));}
    }));
  }
  if (currentRole === 'admin') {
    const target=node('input');target.type='number';target.min='1';target.placeholder='ID do usuário';target.setAttribute('aria-label','ID do usuário para acesso à fonte');
    const mode=node('select');mode.setAttribute('aria-label','Operação de acesso à fonte');mode.add(new Option('Conceder acesso','grant'));mode.add(new Option('Revogar acesso','revoke'));
    const reason=node('textarea');reason.placeholder='Motivo administrativo da revogação, sem dados clínicos';reason.setAttribute('aria-label','Motivo administrativo da revogação');reason.maxLength=2000;reason.hidden=true;
    mode.onchange=()=>{reason.hidden=mode.value!=='revoke';};card.append(target,mode,reason);
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
  card.append(actions);
  return card;
}

function jobCard(job) {
  const card = node('article');
  card.append(node('h3', `Trabalho ${job.id} · ${job.operation||job.type||''}`));
  card.append(node('p', labels[job.state || job.status] || job.state || job.status || 'Estado indisponível'));
  if (job.error || job.errorMessage) card.append(node('p', job.errorMessage || (typeof job.error ===
    'object' ? (job.error.message || JSON.stringify(job.error)) : job.error)));
  if(job.resultAccess==='revoked')card.append(node('p','Resultado restrito: uma fonte foi retirada ou sua permissão de acesso deixou de ser válida.'));
  const result = job.result || job.result_json;
  if (result) {
    const pre = node('pre', typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    card.append(pre);
    if ((job.operation === 'generate') && (job.state || job.status) === 'completed') card.append(button(
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
  for (const action of (['failed', 'cancelled'].includes(job.state || job.status) ? ['retry'] : ['queued',
      'running'
    ].includes(job.state || job.status) ? ['cancel'] : [])) card.append(button(action === 'retry' ?
    'Tentar novamente' : 'Cancelar', async () => {
      try {
        await apiRequest(`/jobs/${job.id}/${action}`, {
          method: 'POST'
        });
        await load();
      } catch (e) {
        message(status, e.message, true);
      }
    }));
  return card;
}
async function load() {
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
  results.forEach((r, i) => {
    const container = document.getElementById(['documents', 'jobs', 'drafts'][i]);
    container.replaceChildren();
    if (r.status === 'rejected') {
      container.append(node('p', r.reason.message));
      return;
    }
    const rows = asList(r.value);
    if (!rows.length) container.append(node('p', 'Nenhum registro disponível.'));
    for (const item of rows) {
      if (i < 2) container.append(i === 0 ? documentCard(item) : jobCard(item));
      else {
        const card = node('article');
        card.append(node('h3', item.title || item.key), node('p',
          `${labels[item.state]||item.state} · versão ${item.version}`));
        const link = node('a', 'Abrir contribuição', 'button');
        link.href = `case-curation.html?id=${encodeURIComponent(item.id)}`;
        card.append(link);
        container.append(card);
      }
    }
  });
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
load();

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
  } catch (e) {
    message(status, e.message, true);
  }
};
