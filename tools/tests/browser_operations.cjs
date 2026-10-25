// Integração de UI com API real e base temporária. Apenas heartbeat e resposta de
// orçamento usam fixtures HTTP explícitas: nenhum worker ou modelo é iniciado.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),net=require('node:net');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repo=path.resolve(__dirname,'../..');
const bin=process.env.DEVSPHERE_TEST_BINARY || path.join(repo,'build/backend/devsphere-api');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pv-operations-ui-'));
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
  const doc=await upload('fonte-operacao-sintetica.pdf');
  const headers={'X-PV-Request':'1',Origin:origin};
  const r=await context.request.post(`${origin}/api/v1/documents/${doc.id}/jobs`,{headers,data:{operation:'convert',idempotencyKey:'ops-browser-queued'}});assert.equal(r.status(),202);const job=await r.json();
  // Estado de espera antigo e erros são fixtures apenas no SQLite descartável.
  cp.execFileSync(env.DEVSPHERE_PYTHON || 'python3',['-c',`import sqlite3,sys,json,secrets
with sqlite3.connect(sys.argv[1]) as db:
 db.execute("UPDATE worker_jobs SET created_at='2020-01-01 00:00:00' WHERE id=?",(sys.argv[2],))
 owner,document=db.execute("SELECT owner_id,document_id FROM worker_jobs WHERE id=?",(sys.argv[2],)).fetchone()
 for _ in range(3):
  identifier=secrets.token_hex(16)
  db.execute("INSERT INTO worker_jobs(id,owner_id,document_id,operation,status,idempotency_key,error_json) VALUES(?,?,?,'convert','failed',?,?)",(identifier,owner,document,identifier,json.dumps({'code':'synthetic','message':'Nao divulgar no diagnostico'})))
`,env.DEVSPHERE_DB_PATH,job.id],{stdio:'pipe'});
  await page.goto(`${origin}/pages/admin-dashboard.html`);
  await page.getByRole('heading',{name:'Operação e recuperação',exact:true}).waitFor();
  await page.locator('#operationsAlerts').getByText('Há trabalho na fila acima do limite de espera configurado.',{exact:true}).waitFor();
  assert.match(await page.locator('#operationsAlerts').textContent(),/Falhas recorrentes/);
  assert.match(await page.locator('#operationsAlerts').textContent(),/heartbeat/);
  assert.match(await page.locator('#operationsMetrics').textContent(),/PDFs da instituição/);
  assert.doesNotMatch(await page.locator('#operationsAlerts').textContent(),/Nao divulgar/);
  await page.locator('#refreshOperations').click();
  await page.waitForFunction(()=>!document.getElementById('refreshOperations').disabled);
  assert.match(await page.locator('#operationsStatus').textContent(),/alerta/);
  assert.equal(await page.locator('[aria-labelledby="operationsTitle"] button').count(),1,'Painel não deve executar reparos, exclusão ou inferência.');
  assert.deepEqual(errors,[]);console.log('PASS painel operacional com API real: fila acima da espera, worker ausente, falhas recorrentes, métricas, atualização e ausência de conteúdo privado/modelos.');
  await context.close();
 } finally {if(browser)await browser.close();if(server && server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
