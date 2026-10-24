// Integração de UI com API real e base temporária. Apenas heartbeat e resposta de
// orçamento usam fixtures HTTP explícitas: nenhum worker ou modelo é iniciado.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),net=require('node:net');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repo=path.resolve(__dirname,'../..');
const bin=process.env.DEVSPHERE_TEST_BINARY || path.join(repo,'build/backend/devsphere-api');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pv-mac-protected-ui-'));
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
  const doc=await upload('fonte-ui-sintetica.pdf'),retired=await upload('fonte-retirada-sintetica.pdf');
  const extracted=await context.request.put(`${origin}/api/v1/documents/${doc.id}`,{headers:{'X-PV-Request':'1',Origin:origin},data:{markdown:'## Página 2\nFonte sintética autorizada para teste de interface.\n## Página 3\nContinuação sintética.'}});assert.equal(extracted.status(),200);
  const withdraw=await context.request.post(`${origin}/api/v1/documents/${retired.id}/withdraw`,{headers:{'X-PV-Request':'1',Origin:origin}});assert.equal(withdraw.status(),200);
  await page.goto(`${origin}/pages/contributions.html`);await page.getByText('Consulta atualizada.',{exact:true}).waitFor();
  assert.match(await page.locator('#inferencePolicyStatus').textContent(),/Modo protegido/);
  assert.equal(await page.locator('#documents article').count(),1);
  const card=()=>page.locator(`[data-record-key="document-${doc.id}"]`);
  await card().getByLabel('Páginas do documento',{exact:true}).fill('2,3');
  await card().getByLabel('Orientações pedagógicas',{exact:true}).fill('Orientações sintéticas preservadas');
  await card().getByLabel('Tema para recuperar referências aprovadas',{exact:true}).fill('referência sintética');
  await page.locator('#refreshContributions').click();await page.getByText('Consulta atualizada.',{exact:true}).waitFor();
  assert.equal(await card().getByLabel('Páginas do documento',{exact:true}).inputValue(),'2,3');
  assert.equal(await card().getByLabel('Orientações pedagógicas',{exact:true}).inputValue(),'Orientações sintéticas preservadas');
  assert.equal(await card().getByLabel('Tema para recuperar referências aprovadas',{exact:true}).inputValue(),'referência sintética');
  await page.locator('#documentFilter').selectOption('withdrawn');await page.getByText('Consulta atualizada.',{exact:true}).waitFor();assert.equal(await page.locator('#documents article').count(),1);assert.match(await page.locator('#documents').textContent(),/Retirado/);
  const retiredCard=page.locator(`[data-record-key="document-${retired.id}"]`);await retiredCard.getByRole('button',{name:'Verificar possibilidade de exclusão',exact:true}).click();await retiredCard.getByText(/Exclusão bloqueada:/).waitFor();assert.equal(await retiredCard.getByRole('button',{name:'Excluir definitivamente',exact:true}).count(),0);
  await page.locator('#documentFilter').selectOption('active');await page.getByText('Consulta atualizada.',{exact:true}).waitFor();assert.equal(await card().getByLabel('Páginas do documento',{exact:true}).inputValue(),'2,3');
  // Fixtures identificadas de heartbeat e orçamento; não representam inferência.
  let configHash='config-sintetica-A',policy=false,runtimeStatus='alive',previewLifetime=120,resolvePreview,jobPosted;
  await page.route('**/api/v1/runtime',route=>route.fulfill({json:{apiInferenceEnabled:policy,worker:{status:runtimeStatus,instanceId:'fixture-worker',configHash,heartbeatAt:Math.floor(Date.now()/1000),inferenceEnabled:policy,config:{generatorModel:'fixture-only',criticModel:'fixture-only',generation:{context:8192,output:6000},review:{context:8192,output:768}}}}}));
  await page.route(`**/api/v1/documents/${doc.id}/jobs`,async route=>{const body=route.request().postDataJSON();assert.equal(body.operation,'budget','UI não pode disparar inferência nesta prova.');jobPosted=body;await route.fulfill({status:201,json:{id:'fixture-budget-job'}});});
  await page.route('**/api/v1/jobs/fixture-budget-job',async route=>{if(resolvePreview)await resolvePreview;await route.fulfill({json:{id:'fixture-budget-job',status:'completed',result:{budgetPreview:true,fits:true,inferenceEnabled:policy,configHash,inputHash:'fixture-input',diagnosedAt:Math.floor(Date.now()/1000),validUntil:Math.floor(Date.now()/1000)+previewLifetime,budget:{estimatedInputTokens:1800,reservedOutputTokens:6000,totalEstimatedTokens:7800,contextTokens:8192,remainingTokens:392,templateReserveTokens:512,messageReserveTokens:32}}}});});
  await page.locator('#refreshContributions').click();await page.getByText('Consulta atualizada.',{exact:true}).waitFor();await card().getByRole('button',{name:'Conferir orçamento',exact:true}).click();await card().getByText(/Estimativa de entrada:/).waitFor();assert.equal(jobPosted.operation,'budget');assert.equal(await card().getByRole('button',{name:'Gerar rascunho',exact:true}).isDisabled(),true);
  await page.locator('#refreshContributions').click();await page.getByText('Consulta atualizada.',{exact:true}).waitFor();await card().getByText(/Estimativa de entrada:/).waitFor();
  // Mudança de entrada durante resposta atrasada não reaproveita o orçamento anterior.
  let release;resolvePreview=new Promise(ok=>release=ok);const pending=card().getByRole('button',{name:'Conferir orçamento',exact:true}).click();await delay(200);await card().getByLabel('Orientações pedagógicas',{exact:true}).fill('Orientações alteradas durante consulta');release();await pending;
  await card().getByText(/Entrada ou fonte alterada durante a consulta/).waitFor();assert.equal(await card().getByRole('button',{name:'Gerar rascunho',exact:true}).isDisabled(),true);
  resolvePreview=null;await card().getByRole('button',{name:'Conferir orçamento',exact:true}).click();await card().getByText(/Estimativa de entrada:/).waitFor();
  configHash='config-sintetica-B';await page.locator('#refreshContributions').click();await page.getByText('Consulta atualizada.',{exact:true}).waitFor();await card().getByText(/Prévia vencida ou configuração\/worker alterado/).waitFor();
  // Relógio/heartbeat são fixtures explícitas: expiração sem esperar dois minutos.
  previewLifetime=-1;await card().getByRole('button',{name:'Conferir orçamento',exact:true}).click();
  await card().getByText(/Prévia incompatível|Prévia vencida/).waitFor();assert.equal(await card().getByRole('button',{name:'Gerar rascunho',exact:true}).isDisabled(),true);
  for(const state of ['stale','absent']) {runtimeStatus=state;await page.locator('#refreshContributions').click();await page.getByText('Consulta atualizada.',{exact:true}).waitFor();assert.match(await page.locator('#workerDiagnosticFields').textContent(),new RegExp(state));assert.equal(await card().getByRole('button',{name:'Gerar rascunho',exact:true}).isDisabled(),true);}
  await page.unroute('**/api/v1/runtime');await page.locator('#refreshContributions').click();await page.getByText('Consulta atualizada.',{exact:true}).waitFor();
  const blocked=await context.request.post(`${origin}/api/v1/documents/${doc.id}/jobs`,{headers:{'X-PV-Request':'1',Origin:origin},data:{operation:'generate',pages:[2,3],instructions:'Teste sintético',idempotencyKey:'protected-browser-direct'}});assert.equal(blocked.status(),403);assert.equal((await blocked.json()).error.code,'inference_disabled');
  assert.deepEqual(errors,[]);console.log('PASS interface protegida, API real bloqueada, formulários preservados, filtros/retirados, retenção bloqueada, prévia sem inferência, respostas fora de ordem e invalidação de configuração.');
  console.log('Heartbeat e orçamento: fixtures HTTP explícitas. Login, upload, retirada, elegibilidade e bloqueio direto: API real com banco sintético. Nenhum modelo executado.');
  await context.close();
 } finally {if(browser)await browser.close();if(server && server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
