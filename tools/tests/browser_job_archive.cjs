// Integração de UI com API real e base temporária. Apenas heartbeat e resposta de
// orçamento usam fixtures HTTP explícitas: nenhum worker ou modelo é iniciado.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),net=require('node:net');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repo=path.resolve(__dirname,'../..');
const bin=process.env.DEVSPHERE_TEST_BINARY || path.join(repo,'build/backend/devsphere-api');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pv-job-archive-ui-'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let server,browser;
 try {
  const probe=net.createServer();await new Promise((ok,no)=>probe.listen(0,'127.0.0.1',ok).once('error',no));
  const port=probe.address().port;await new Promise(ok=>probe.close(ok));
  const origin=`http://127.0.0.1:${port}`;
  const env={...process.env,DEVSPHERE_DB_PATH:path.join(temp,'test.db'),DEVSPHERE_MIGRATIONS_DIR:path.join(repo,'backend/migrations'),DEVSPHERE_CASE_SEED:path.join(repo,'backend/seeds/legacy-cases.json'),DEVSPHERE_FRONTEND_DIR:path.join(repo,'frontend'),DEVSPHERE_HOST:'127.0.0.1',DEVSPHERE_PORT:String(port),DEVSPHERE_ALLOWED_ORIGINS:origin,DEVSPHERE_INFERENCE_ENABLED:'0',DEVSPHERE_SEED_PASSWORD:randomBytes(24).toString('base64url')+'@Aa1'};
  const seed=cp.spawnSync(bin,['--create-admin','Admin UI protegido','mac.ui@devsphere.local','mac.ui@devsphere.local'],{env,cwd:repo,encoding:'utf8'});assert.equal(seed.status,0,seed.stderr);
  server=cp.spawn(bin,[],{env,cwd:repo,stdio:['ignore','pipe','pipe']});let logs='';server.stderr.on('data',d=>logs+=d);server.stdout.on('data',d=>logs+=d);
  let ready=false;for(let n=0;n<100;n++) {if(server.exitCode!==null)throw Error(logs);try{if((await fetch(`${origin}/api/v1/health`)).ok){ready=true;break;}}catch{}await delay(100);}assert(ready,'API não iniciou.');
  browser=await chromium.launch({headless:process.env.DEVSPHERE_VISIBLE_BROWSER!=='1',executablePath:process.env.CHROME_PATH || (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${origin}/pages/student-login.html`);await page.locator('#email').fill('mac.ui@devsphere.local');await page.locator('#password').fill(env.DEVSPHERE_SEED_PASSWORD);await page.locator('[type=submit]').click();await page.waitForURL('**/student-cases.html');
  const runtimeReply=await context.request.get(`${origin}/api/v1/runtime`);assert.equal(runtimeReply.status(),200);assert.equal((await runtimeReply.json()).apiInferenceEnabled,false);
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
  async function upload(name){const r=await context.request.post(`${origin}/api/v1/documents`,{headers:{'X-PV-Request':'1',Origin:origin},multipart:{authorized:'true',deidentified:'true',area:'general',pdf:{name,mimeType:'application/pdf',buffer:pdf}}});assert.equal(r.status(),201,await r.text());return r.json();}
  const doc=await upload('fonte-arquivamento-sintetica.pdf');
  const headers={'X-PV-Request':'1',Origin:origin};
  const prepared=await context.request.put(`${origin}/api/v1/documents/${doc.id}`,{headers,data:{markdown:'## Página 1\nFonte sintética preservada após remoção de trabalho.'}});assert.equal(prepared.status(),200);
  const queued=await context.request.post(`${origin}/api/v1/documents/${doc.id}/jobs`,{headers,data:{operation:'convert',idempotencyKey:'archive-browser-first'}});assert.equal(queued.status(),202);const job=await queued.json();
  const active=await context.request.post(`${origin}/api/v1/jobs/${job.id}/archive`,{headers});assert.equal(active.status(),409);assert.equal((await active.json()).error.code,'job_active');
  await page.goto(`${origin}/pages/contributions.html`);await page.getByText('Consulta atualizada.',{exact:true}).waitFor();
  const jobCard=()=>page.locator(`[data-record-key="job-${job.id}"]`);
  const sourceCard=()=>page.locator(`[data-record-key="document-${doc.id}"]`);
  await sourceCard().getByLabel('Orientações pedagógicas',{exact:true}).fill('Texto mantido durante limpeza de trabalhos');
  assert.equal(await jobCard().getByRole('button',{name:'Remover da lista',exact:true}).count(),0);
  await jobCard().getByRole('button',{name:'Cancelar',exact:true}).click();await jobCard().getByText('Cancelado',{exact:true}).waitFor();
  // Cancelar a confirmação não modifica a lista nem o servidor.
  page.once('dialog',dialog=>dialog.dismiss());await jobCard().getByRole('button',{name:'Remover da lista',exact:true}).click();assert.equal(await jobCard().count(),1);
  page.once('dialog',dialog=>dialog.accept());await jobCard().getByRole('button',{name:'Remover da lista',exact:true}).click();await jobCard().waitFor({state:'detached'});
  assert.match(await page.locator('#jobCounts').textContent(),/1 removidos da lista/);
  assert.equal(await sourceCard().getByLabel('Orientações pedagógicas',{exact:true}).inputValue(),'Texto mantido durante limpeza de trabalhos');
  await page.reload();await page.getByText('Consulta atualizada.',{exact:true}).waitFor();assert.equal(await jobCard().count(),0);
  await page.locator('#jobFilter').selectOption('archived');await jobCard().waitFor();
  assert.match(await jobCard().textContent(),/Removido da lista principal/);
  assert.equal(await jobCard().getByRole('button',{name:'Tentar novamente',exact:true}).count(),0);
  await page.locator('#jobFilter').selectOption('all');await jobCard().waitFor();
  await jobCard().getByRole('button',{name:'Restaurar na lista',exact:true}).click();await jobCard().getByRole('button',{name:'Remover da lista',exact:true}).waitFor();
  await page.locator('#jobFilter').selectOption('visible');await jobCard().waitFor();
  const detail=await context.request.get(`${origin}/api/v1/documents/${doc.id}`);assert.equal(detail.status(),200);assert.match((await detail.json()).markdown,/Fonte sintética preservada/);
  // O documento continua reutilizável; nenhum worker ou modelo é iniciado.
  const again=await context.request.post(`${origin}/api/v1/documents/${doc.id}/jobs`,{headers,data:{operation:'convert',idempotencyKey:'archive-browser-next'}});assert.equal(again.status(),202);assert.notEqual((await again.json()).id,job.id);
  assert.deepEqual(errors,[]);console.log('PASS Chrome/API reais: cancelamento, confirmação recusada/aceita, remoção persistente, filtros, restauração, formulário e Markdown preservados, nova solicitação do mesmo documento. Nenhuma inferência.');
  await context.close();
 } finally {if(browser)await browser.close();if(server && server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
