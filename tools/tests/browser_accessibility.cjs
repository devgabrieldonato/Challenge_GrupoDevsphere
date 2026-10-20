// Auditoria real Windows/Chrome com API C++20 isolada no WSL e dados sintéticos.
// Relatórios ficam ignorados; nenhuma senha, cookie, fonte privada ou inferência é registrada.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const readline=require('node:readline');
const repo=path.resolve(__dirname,'../..'),isWindows=process.platform==='win32';
const runtime=process.env.A11Y_RUNTIME||path.join(repo,'.local/a11y-runtime/node_modules');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const axeSource=fs.readFileSync(path.join(runtime,'axe-core/axe.min.js'),'utf8');
const chrome=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port=Number(process.env.BROWSER_TEST_PORT||8087),origin=`http://127.0.0.1:${port}`;
assert.ok(Number.isInteger(port)&&port>=1024&&port<=65535,'Porta de teste inválida');
const serve=process.argv.includes('--serve'),skipLighthouse=process.argv.includes('--skip-lighthouse'),statesOnly=process.argv.includes('--states-and-lighthouse');
const reportDir=path.join(repo,'validation-reports',`accessibility-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
const report={startedAt:new Date().toISOString(),syntheticOnly:true,inferencePerformed:false,audits:[],checks:[],lighthouse:[],errors:[],limitations:['Auditoria automatizada não substitui revisão WCAG manual nem uso real com leitor de tela.']};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const password=crypto.randomBytes(30).toString('base64url')+'@Aa1';
// TOTP aleatório exclusivo desta fixture; segue só por stdin ao controlador Linux.
const secret=[...crypto.randomBytes(20)].map(b=>b.toString(2).padStart(8,'0')).join('').match(/.{5}/g).map(bits=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(bits,2)]).join('');
let controller,browser,reservation,controllerLines=[],waiters=[],stopping=false;
function otp(){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret)bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const bytes=Buffer.from(bits.match(/.{8}/g).map(x=>parseInt(x,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=crypto.createHmac('sha1',bytes).update(counter).digest();const offset=h[19]&15;return String((h.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');}
async function reserve(p){const s=net.createServer();await new Promise((r,j)=>{s.once('error',j);s.listen({host:'127.0.0.1',port:p,exclusive:true},r)});return s;}
async function release(s){if(s?.listening)await new Promise(r=>s.close(r));}
function nextLine(timeout=30000){if(controllerLines.length)return Promise.resolve(controllerLines.shift());return new Promise((resolve,reject)=>{const entry={resolve,reject};waiters.push(entry);entry.timer=setTimeout(()=>{waiters=waiters.filter(x=>x!==entry);reject(Error('Controle WSL não respondeu no prazo'));},timeout);});}
// O controlador não repassa ambiente pessoal: segredos de fixture chegam somente por stdin.
const pythonController=String.raw`
import sys,json,os,tempfile,subprocess,sqlite3,socket,time,hashlib
from pathlib import Path
cfg=json.loads(sys.stdin.readline()); root=cfg['repo']; binary=cfg['binary']; child=None
with tempfile.TemporaryDirectory(prefix='pv-a11y-') as folder:
 try:
  env={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':str(Path.home()),'LANG':'C.UTF-8','DEVSPHERE_ENV':'development','DEVSPHERE_HOST':'127.0.0.1','DEVSPHERE_PORT':str(cfg['port']),'DEVSPHERE_ALLOWED_ORIGINS':'http://127.0.0.1:'+str(cfg['port']),'DEVSPHERE_DB_PATH':folder+'/fixture.db','DEVSPHERE_SOURCE_DIR':folder+'/sources','DEVSPHERE_MIGRATIONS_DIR':root+'/backend/migrations','DEVSPHERE_CASE_SEED':root+'/backend/seeds/legacy-cases.json','DEVSPHERE_FRONTEND_DIR':root+'/frontend','DEVSPHERE_PYTHON':sys.executable,'DEVSPHERE_PDF_RENDERER':root+'/tools/render_official_report.py','DEVSPHERE_SEED_PASSWORD':cfg['password']}
  def run(args):
   subprocess.run([binary]+args,env=env,cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True,timeout=45)
  with socket.socket() as guard: guard.bind(('127.0.0.1',cfg['port']))
  run(['--allow-domain','devsphere.local'])
  run(['--create-admin','Administrador sintetico','admin.a11y@devsphere.local','admin.a11y@devsphere.local'])
  for role in ['student','teacher']:run(['--create-user','Conta sintetica '+role,role+'.a11y@devsphere.local',role])
  con=sqlite3.connect(env['DEVSPHERE_DB_PATH']); ids=dict(con.execute('SELECT email,id FROM users'))
  for email,uid in ids.items():
   if not email.startswith('student.'):env['DEVSPHERE_MFA_SECRET_'+str(uid)]=cfg['secret']
  con.execute('UPDATE submission_settings SET default_reviewer_id=?',(ids['teacher.a11y@devsphere.local'],))
  os.makedirs(env['DEVSPHERE_SOURCE_DIR'],mode=0o700,exist_ok=True)
  from reportlab.pdfgen import canvas
  pdfpath=folder+'/sources/synthetic.pdf'; doc=canvas.Canvas(pdfpath);doc.drawString(30,700,'Documento sintetico para auditoria de acessibilidade.');doc.save()
  digest=hashlib.sha256(Path(pdfpath).read_bytes()).hexdigest()
  con.execute("INSERT INTO source_documents(id,owner_id,storage_path,original_name,sha256,status,authorized_use,deidentified,markdown) VALUES(?,?,?,?,?,'converted',1,1,?)",('a11e0000000000000000000000000001',ids['student.a11y@devsphere.local'],pdfpath,'sintetico.pdf',digest,'## Página 1\n\nMaterial exclusivamente sintetico de acessibilidade.'))
  con.commit();con.close()
  env.pop('DEVSPHERE_SEED_PASSWORD',None)
  child=subprocess.Popen([binary],env=env,cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  def owns():
   if child.poll() is not None:return False
   links=[]
   for f in Path('/proc/'+str(child.pid)+'/fd').iterdir():
    try:links.append(os.readlink(f))
    except OSError:pass
   found=False
   for line in Path('/proc/net/tcp').read_text().splitlines()[1:]:
    row=line.split();address,p=row[1].split(':')
    if row[3]=='0A' and int(p,16)==cfg['port']:
     if address!='0100007F' or 'socket:['+row[9]+']' not in links:return False
     found=True
   return found
  for _ in range(150):
   if owns():break
   if child.poll() is not None:raise RuntimeError('API terminou antes de escutar')
   time.sleep(.1)
  if not owns():raise RuntimeError('Listener proprio nao confirmado')
  print(json.dumps({'ready':True,'pid':child.pid}),flush=True)
  for line in sys.stdin:
   if line.strip()=='stop':break
   if line.strip()=='check':print(json.dumps({'owned':owns()}),flush=True)
 except Exception as exc:
  print(json.dumps({'error':type(exc).__name__}),flush=True)
 finally:
  if child and child.poll() is None:
   child.terminate()
   try:child.wait(timeout=10)
   except subprocess.TimeoutExpired:child.kill();child.wait(timeout=5)
`;
async function owns(){assert.ok(controller&&controller.exitCode===null,'Controlador próprio ativo');controller.stdin.write('check\n');assert.equal((await nextLine()).owned,true,'API deve possuir listener loopback exclusivo');}
async function goto(page,url){await owns();await page.goto(origin+url,{waitUntil:'networkidle'});await page.locator('body.auth-pending').waitFor({state:'hidden',timeout:12000}).catch(()=>{});await pause(100);}
async function tabUntil(page,selector){for(let n=0;n<100;n++){if(await page.locator(selector).evaluate(e=>e===document.activeElement))return;await page.keyboard.press('Tab');}throw Error('Teclado não alcançou '+selector);}
async function axTree(page,label){await check(label+':arvoreAX',async()=>{const cdp=await page.context().newCDPSession(page);try{const {nodes}=await cdp.send('Accessibility.getFullAXTree');assert.ok(nodes.some(n=>!n.ignored&&n.role?.value==='main'),'Marco main exposto');assert.ok(nodes.some(n=>!n.ignored&&n.role?.value==='button'&&n.name?.value==='Tema escuro'&&n.properties?.some(p=>p.name==='pressed')),'Tema com nome e estado');report.checks.push({name:label+':AXroles',passed:true,roles:[...new Set(nodes.filter(n=>!n.ignored).map(n=>n.role?.value))]});}finally{await cdp.detach()}});}
async function login(context,role){const page=await context.newPage();await goto(page,`/pages/${role}-login.html`);await tabUntil(page,'#email');await page.keyboard.type(`${role}.a11y@devsphere.local`);await tabUntil(page,'#password');await page.keyboard.type(password);if(role!=='student'){await tabUntil(page,'[name=otp]');await page.keyboard.type(otp());}await tabUntil(page,'[type=submit]');await page.keyboard.press('Enter');try{await page.waitForURL(role==='admin'?'**/admin-dashboard.html':role==='teacher'?'**/teacher-dashboard.html':'**/student-cases.html');}catch{throw Error('Login sintético '+role+': '+await page.locator('#formStatus').textContent());}return page;}
async function check(name,action){try{await action();report.checks.push({name,passed:true});}catch(e){report.checks.push({name,passed:false,error:e.name+': '+e.message.slice(0,250)});}}
async function theme(page,value){await page.evaluate(v=>{localStorage.setItem('pacientevirtual.theme',v);},value);await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('html').getAttribute('data-theme'),value);}
async function audit(page,label){await owns();await check(label+':identidade-institucional',async()=>{
  // O link de salto fica fora da tela até receber foco; o rótulo do tema só ocupa espaço na árvore AX.
  if (!await page.locator('dialog[open]').count()) {
  const skip=page.locator('.skip-link');
  await skip.evaluate(el=>el.blur());
  assert.ok(await skip.evaluate(el=>el.getBoundingClientRect().bottom<=0),'Link de salto oculto sem foco');
  await skip.focus();assert.ok(await skip.evaluate(el=>el.getBoundingClientRect().top>=0),'Link de salto visível com foco');
  await skip.press('Enter');
  assert.ok(await page.evaluate(()=>document.activeElement===document.getElementById(document.querySelector('.skip-link').hash.slice(1))),'Link de salto transfere foco ao conteúdo');
  }
  assert.ok(await page.locator('#themeToggle .visually-hidden').evaluate(el=>el.getBoundingClientRect().width<=1&&el.getBoundingClientRect().height<=1),'Rótulo acessível não aparece ao lado do ícone');
  if(label==='student:/pages/student-cases.html:dark')await page.screenshot({path:path.join(reportDir,'student-skip-link-dark.png'),fullPage:true});
  assert.equal(await page.locator('.brand-lockup').count(),1);
  assert.equal(await page.locator('.brand-product-institutions, .page-context').count(),0);
  const marks=await page.locator('.partner-marks').evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopWidth,hidden:el.getAttribute('aria-hidden')}));
  assert.equal(marks.background,'rgba(0, 0, 0, 0)');assert.equal(marks.border,'0px');assert.notEqual(marks.hidden,'true');
  const logos=await page.locator('.partner-marks img').evaluateAll(images=>images.map(img=>({loaded:img.complete&&img.naturalWidth>0,fit:getComputedStyle(img).objectFit,alt:img.alt})));
  assert.equal(logos.length,2);assert.ok(logos.every(img=>img.loaded&&img.fit==='contain'&&img.alt));
  const footer=page.locator('body > footer.site-footer');assert.equal(await footer.count(),1);assert.equal(await footer.isVisible(),true);
  assert.equal((await footer.innerText()).trim(),'© 2026 Paciente Virtual · Todos os direitos reservados · Ambiente educacional · Casos fictícios sujeitos à validação docente');
  assert.equal(await page.locator('h1').count(),1);
  assert.equal(await page.locator('#themeToggle').getAttribute('aria-pressed'),String(await page.locator('html').getAttribute('data-theme')==='dark'));
  const dark=await page.locator('html').getAttribute('data-theme')==='dark';assert.equal(await page.locator(dark?'.theme-icon-sun':'.theme-icon-moon').isVisible(),true);
});await page.evaluate(axeSource);const a=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));report.audits.push({label,url:new URL(page.url()).pathname,theme:await page.locator('html').getAttribute('data-theme'),violations:a.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,failureSummary:n.failureSummary}))})),incomplete:a.incomplete.map(v=>({id:v.id,count:v.nodes.length,nodes:v.nodes.map(n=>({target:n.target,failureSummary:n.failureSummary}))})),passes:a.passes.length});fs.writeFileSync(path.join(reportDir,'partial.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({audit:label,violations:a.violations.length}));}
async function layout(page,label){for(const width of [320,640])await check(`${label}:reflow${width}`,async()=>{await page.setViewportSize({width,height:900});const m=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,width:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)}));assert.ok(m.width<=m.viewport+1,`Overflow ${m.width-m.viewport}px`)});await page.setViewportSize({width:1280,height:900});await check(`${label}:fontes-rem200percent`,async()=>{await page.evaluate(()=>{document.documentElement.style.fontSize='200%'});const m=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,width:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)}));assert.ok(m.width<=m.viewport+1,`Overflow ${m.width-m.viewport}px`)});await page.evaluate(()=>{document.documentElement.style.fontSize=''});}
async function fixtureSubmission(page){await goto(page,'/pages/student-cases.html');await page.locator('#caseSelect option[value=joao]').waitFor({state:'attached'});await tabUntil(page,'#caseSelect');await page.keyboard.press('j');await page.keyboard.press('Enter');await tabUntil(page,'#caseForm [type=submit]');await page.keyboard.press('Enter');await page.locator('#caseSession').waitFor({state:'visible'});await check('investigacao:focus-visible-filtro',async()=>{await tabUntil(page,'[data-filter=all]');const selected=page.locator('[data-filter=all]');const before=await selected.evaluate(e=>({width:getComputedStyle(e).outlineWidth,offset:getComputedStyle(e).outlineOffset}));assert.equal(before.width,'3px');assert.equal(before.offset,'3px');await page.keyboard.press('Tab');const after=await selected.evaluate(e=>({width:getComputedStyle(e).outlineWidth,offset:getComputedStyle(e).outlineOffset}));assert.notDeepEqual(before,after,'Filtro ativo deve diferenciar seleção de foco')});await tabUntil(page,'#blocks [data-id=pain]');await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#count').textContent==='01');await check('investigacao:focoaposacao',async()=>assert.ok(await page.evaluate(()=>document.activeElement.matches('#blocks button[data-id]:not(:disabled), #diagnose'))));await audit(page,'student:investigacao-iniciada');await axTree(page,'investigacao');await check('investigacao:live-status',async()=>{const status=page.locator('#investigationStatus');assert.equal(await status.getAttribute('role'),'status');assert.equal(await status.getAttribute('aria-live'),'polite')});await page.locator('#diagnose').click();await page.locator('#hypothesis').selectOption({index:1});await page.locator('#reason').fill('Justificativa inteiramente sintetica de acessibilidade.');await page.locator('#diagnosisForm [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#submissionStatus').textContent.startsWith('Atendimento enviado'),{timeout:30000});}
async function cleanup(){if(stopping)return;stopping=true;if(browser)await browser.close().catch(()=>{});if(controller?.exitCode===null){controller.stdin.end('stop\n');await Promise.race([new Promise(r=>controller.once('exit',r)),pause(15000)]);if(controller.exitCode===null){report.cleanupFailure=true;controller.kill();}}await release(reservation);}
async function main(){fs.mkdirSync(reportDir,{recursive:true});let contexts={};try{
 reservation=await reserve(port);
 const linuxRepo=process.env.DEVSPHERE_WSL_REPO||'/mnt/c/Users/vinic/Projetos/Challenge_GrupoDevsphere';
 const linuxPython=process.env.DEVSPHERE_LINUX_PYTHON||'/home/pacientevirtual/.venvs/pacientevirtual/bin/python';
 const binary=process.env.DEVSPHERE_TEST_API_BIN||'/home/pacientevirtual/build/pacientevirtual/backend/devsphere-api';
 assert.ok(isWindows,'Este harness usa Node Windows e API WSL; não presume compatibilidade nativa POSIX');
 controller=cp.spawn('wsl.exe',['-d',process.env.DEVSPHERE_WSL_DISTRO||'PacienteVirtual-Ubuntu2404','-u',process.env.DEVSPHERE_WSL_USER||'pacientevirtual','--exec',linuxPython,'-u','-c',pythonController],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 const lines=readline.createInterface({input:controller.stdout});lines.on('line',line=>{try{const value=JSON.parse(line);if(waiters.length){const w=waiters.shift();clearTimeout(w.timer);w.resolve(value)}else controllerLines.push(value)}catch{}});
 controller.stderr.on('data',()=>{});await release(reservation);reservation=null;controller.stdin.write(JSON.stringify({repo:linuxRepo,binary,port,password,secret})+'\n');
 const ready=await nextLine(180000);assert.equal(ready.ready,true,'Falha no preparo sintético WSL: '+(ready.error||'unknown'));report.apiListenerOwned=true;
 await release(reservation);reservation=null;let healthy=false;for(let attempt=0;attempt<100;attempt++){await owns();try{healthy=(await fetch(origin+'/api/v1/health',{signal:AbortSignal.timeout(1500)})).status===200;}catch{}if(healthy)break;await pause(200);}assert.ok(healthy,'Encaminhamento localhost WSL não ficou disponível');
 browser=await chromium.launch({executablePath:chrome,headless:!serve});report.browser=browser.version();report.axeVersion=require(path.join(runtime,'axe-core/package.json')).version;
 for(const role of ['student','teacher','admin']){contexts[role]=await browser.newContext({viewport:{width:1280,height:900}});await login(contexts[role],role)}
 contexts.public=await browser.newContext({viewport:{width:1280,height:900}});
 const student=await contexts.student.newPage();await fixtureSubmission(student);
 const teacher=await contexts.teacher.newPage();const response=await contexts.teacher.request.post(origin+'/api/v1/contributions',{headers:{'X-PV-Request':'1','Origin':origin},data:{key:'a11y-synthetic',title:'Caso sintetico de acessibilidade',content:JSON.parse(fs.readFileSync(path.join(repo,'backend/seeds/legacy-cases.json'),'utf8'))[0],metadata:{area:'cardiologia'}}});assert.equal(response.ok(),true);const data=await response.json();const version=(data.data||data).id;assert.ok(version);
 const pages=[['public','/index.html'],...['student-login','teacher-login','admin-login','student-register','teacher-register'].map(p=>['public',`/pages/${p}.html`]),['student','/pages/student-cases.html'],['student','/pages/student-history.html'],['student','/pages/contributions.html'],...['teacher-dashboard','teacher-cases','teacher-case-editor','teacher-pdf-import'].map(p=>['teacher',`/pages/${p}.html`]),['teacher','/pages/teacher-review.html?id=1'],['teacher','/pages/teacher-feedback.html?id=1'],['teacher',`/pages/case-curation.html?id=${version}`],['admin','/pages/admin-dashboard.html']];
 for(const [role,url]of (statesOnly?[]:pages)){const page=await contexts[role].newPage();await goto(page,url);assert.equal(new URL(page.url()).pathname,new URL(origin+url).pathname,'Página não deve ser redirecionada por sessão ausente');for(const mode of ['light','dark']){await theme(page,mode);await audit(page,`${role}:${url}:${mode}`);await layout(page,`${role}:${url}:${mode}`)}await check(`${url}:skiplink`,async()=>{await page.reload({waitUntil:'networkidle'});await page.locator('.skip-link').focus();assert.equal(await page.locator('.skip-link').evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'conteudo')});await page.close();}
 await goto(student,'/pages/contributions.html');await student.locator('#contributionStatus').filter({hasText:'Consulta atualizada.'}).waitFor();const open=student.getByRole('button',{name:/Abrir|Visualizar|Markdown/i}).first();await open.focus();await student.keyboard.press('Enter');await student.locator('#documentDialog').waitFor({state:'visible'});await audit(student,'student:dialog-aberto');await check('dialog:AXnome',async()=>{const cdp=await student.context().newCDPSession(student);try{const {nodes}=await cdp.send('Accessibility.getFullAXTree');assert.ok(nodes.some(n=>!n.ignored&&n.role?.value==='dialog'&&n.name?.value?.trim()),'Diálogo nomeado na árvore AX');}finally{await cdp.detach()}});await check('dialog:tab-contido',async()=>{for(let n=0;n<12;n++){await student.keyboard.press(n%2?'Shift+Tab':'Tab');assert.ok(await student.evaluate(()=>document.querySelector('#documentDialog').contains(document.activeElement)));}});await check('dialog:escape-retorno',async()=>{await student.keyboard.press('Escape');assert.equal(await student.locator('#documentDialog').isVisible(),false);assert.equal(await open.evaluate(e=>e===document.activeElement),true)});
 await check('tema:persistencia',async()=>{await theme(student,'dark');await goto(student,'/pages/student-history.html');assert.equal(await student.locator('html').getAttribute('data-theme'),'dark')});
 const osContext=await browser.newContext({colorScheme:'dark'}),osPage=await osContext.newPage();await goto(osPage,'/index.html');await check('tema:preferenciaSO',async()=>assert.equal(await osPage.locator('html').getAttribute('data-theme'),'dark'));await osPage.emulateMedia({colorScheme:'light'});await osPage.waitForFunction(()=>document.documentElement.dataset.theme==='light');await check('tema:mudancaSO',async()=>assert.equal(await osPage.locator('html').getAttribute('data-theme'),'light'));await osContext.close();
 const blocked=await browser.newContext();await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Bloqueado','SecurityError')}})});const blockedPage=await blocked.newPage();await goto(blockedPage,'/index.html');await check('tema:storagebloqueado',async()=>{const before=await blockedPage.locator('html').getAttribute('data-theme');await blockedPage.locator('#themeToggle').click();assert.notEqual(await blockedPage.locator('html').getAttribute('data-theme'),before)});await blocked.close();
 if(!skipLighthouse){const {default:lighthouse}=await import(require('node:url').pathToFileURL(path.join(runtime,'lighthouse/core/index.js')).href);report.lighthouseVersion=require(path.join(runtime,'lighthouse/package.json')).version;for(const [role,url]of [['public','/index.html'],['student','/pages/student-history.html'],['teacher','/pages/teacher-dashboard.html'],['admin','/pages/admin-dashboard.html']]){const reserveDebug=await reserve(0),debugPort=reserveDebug.address().port;await release(reserveDebug);const profile=fs.mkdtempSync(path.join(os.tmpdir(),'pv-a11y-chrome-'));let persistent;try{persistent=await chromium.launchPersistentContext(profile,{executablePath:chrome,headless:true,args:[`--remote-debugging-port=${debugPort}`],viewport:{width:1280,height:900}});const page=role==='public'?await persistent.newPage():await login(persistent,role);await goto(page,url);await axTree(page,'lighthouse:'+role);for(const mode of ['light','dark']){await theme(page,mode);await owns();const result=await lighthouse(origin+url,{port:debugPort,hostname:'127.0.0.1',onlyCategories:['accessibility'],output:['json','html'],disableStorageReset:true,formFactor:'desktop',screenEmulation:{mobile:false,width:1280,height:900,deviceScaleFactor:1,disabled:false},emulatedUserAgent:false,enableErrorReporting:false});assert.equal(new URL(result.lhr.finalDisplayedUrl).pathname,new URL(origin+url).pathname);const base=path.join(reportDir,`lighthouse-${role}-${mode}`);fs.writeFileSync(base+'.json',result.report[0],{flag:'wx'});fs.writeFileSync(base+'.html',result.report[1],{flag:'wx'});report.lighthouse.push({role,theme:mode,score:result.lhr.categories.accessibility.score,report:path.basename(base),failedAudits:Object.entries(result.lhr.audits).filter(([,a])=>a.score===0).map(([id])=>id)});}}finally{if(persistent)await persistent.close();const resolvedProfile=path.resolve(profile);assert.ok(path.dirname(resolvedProfile)===path.resolve(os.tmpdir())&&path.basename(resolvedProfile).startsWith('pv-a11y-chrome-'),'Limpeza restrita ao perfil temporário próprio');fs.rmSync(resolvedProfile,{recursive:true,force:true})}}}
 if(serve){report.serve=true;console.log('SERVE sintético em '+origin+'; Ctrl+C encerra somente os processos próprios.');await new Promise(resolve=>process.once('SIGINT',resolve));}
 }catch(e){report.errors.push({name:e.name,message:e.message.replaceAll(password,'[redacted]').slice(0,500)});process.exitCode=1;}finally{await cleanup();report.finishedAt=new Date().toISOString();report.summary={axeScenarios:report.audits.length,violations:report.audits.reduce((n,a)=>n+a.violations.length,0),failedChecks:report.checks.filter(c=>!c.passed).length,lighthouseRuns:report.lighthouse.length};fs.writeFileSync(path.join(reportDir,'summary.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({report:path.join(reportDir,'summary.json'),...report.summary,errors:report.errors}));if(report.summary.violations||report.summary.failedChecks||report.lighthouse.some(x=>x.score<1)||report.cleanupFailure)process.exitCode=1;}}
process.once('SIGTERM',()=>{cleanup().finally(()=>process.exit(143))});
process.once('SIGINT',()=>{if(!serve)cleanup().finally(()=>process.exit(130))});
main();
