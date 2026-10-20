// Ensaios sintéticos de pontuação legada e retomada da devolutiva pela API real.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const {randomBytes} = require('node:crypto');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repo = path.resolve(__dirname, '../..');
const expectMissing = process.argv.includes('--expect-missing-draft');
const expectFocusLoss = process.argv.includes('--expect-focus-loss');
const report = {startedAt: new Date().toISOString(), source: 'synthetic_only', inferencePerformed: false};
const reportPath = path.join(repo, 'validation-reports', `pending-usability-${Date.now()}-${randomBytes(4).toString('hex')}.json`);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-pending-ui-'));
let browser, api, staticServer;
function ownedListener(pid, port) {
  const rows = fs.readFileSync('/proc/net/tcp', 'utf8').trim().split('\n').slice(1);
  const listeners = rows.map(row => row.trim().split(/\s+/)).filter(row => row[3] === '0A' && parseInt(row[1].split(':')[1],16) === port);
  if (!listeners.length) return false;
  const links = fs.readdirSync(`/proc/${pid}/fd`).map(fd => {try {return fs.readlinkSync(`/proc/${pid}/fd/${fd}`);} catch {return '';}});
  assert.equal(listeners.length,1,'Listener exclusivo');
  assert.equal(listeners[0][1].split(':')[0],'0100007F','Listener somente loopback');
  assert.ok(links.includes(`socket:[${listeners[0][9]}]`),'Listener pertence ao processo filho');
  return true;
}
(async () => {
  try {
    browser = await chromium.launch({headless:true});
    // Servidor estático restrito aos arquivos públicos legados; jamais expõe a raiz do projeto.
    const root = fs.realpathSync(path.join(repo,'backend/tests/legacy-assets'));
    staticServer = http.createServer((req,res) => {
      const requested = path.resolve(root,'.'+new URL(req.url,'http://127.0.0.1').pathname);
      try {
        const real = fs.realpathSync(requested);
        if (!real.startsWith(root+path.sep) || !fs.statSync(real).isFile()) throw Error();
        res.setHeader('Content-Type', real.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');
        res.end(fs.readFileSync(real));
      } catch {res.statusCode=404;res.end('Not found');}
    });
    await new Promise(resolve=>staticServer.listen(0,'127.0.0.1',resolve));
    const legacy = await browser.newPage();
    const pageErrors=[]; legacy.on('pageerror', e=>pageErrors.push(e.message));
    await legacy.goto(`http://127.0.0.1:${staticServer.address().port}/tests/clinical-scoring.test.html`);
    await legacy.waitForFunction(()=>document.querySelector('#test-summary').dataset.status);
    report.legacyScoring = await legacy.locator('#test-results li').evaluateAll(items=>({passed:items.filter(i=>i.dataset.status==='passed').length,failed:items.filter(i=>i.dataset.status==='failed').map(i=>i.textContent)}));
    assert.deepEqual(report.legacyScoring.failed,[]);
    assert.deepEqual(pageErrors,[]);
    await legacy.close(); await new Promise(resolve=>staticServer.close(resolve)); staticServer=null;
    const bin=process.env.DEVSPHERE_TEST_BINARY;
    assert.ok(bin,'Defina o binário Linux C++20 testado');
    const origin='http://127.0.0.1:8085';
    const password=randomBytes(24).toString('base64url')+'@Aa1';
    const env={...process.env,DEVSPHERE_DB_PATH:path.join(temp,'test.db'),DEVSPHERE_MIGRATIONS_DIR:path.join(repo,'backend/migrations'),DEVSPHERE_CASE_SEED:path.join(repo,'backend/seeds/legacy-cases.json'),DEVSPHERE_FRONTEND_DIR:path.join(repo,'frontend'),DEVSPHERE_HOST:'127.0.0.1',DEVSPHERE_PORT:'8085',DEVSPHERE_ALLOWED_ORIGINS:origin,DEVSPHERE_SEED_PASSWORD:password,DEVSPHERE_PDF_RENDERER:path.join(repo,'tools/render_official_report.py')};
    for (const [name,email,role] of [['Aluno UI','aluno.pending@devsphere.local','student'],['Professor UI','professor.pending@devsphere.local','teacher']]) {
      const result=cp.spawnSync(bin,['--create-user',name,email,role],{env,cwd:repo,encoding:'utf8'}); assert.equal(result.status,0,'Criar usuário sintético');
    }
    const adminCreated=cp.spawnSync(bin,['--create-admin','Administrador UI','admin.pending@devsphere.local','admin.pending@devsphere.local'],{env,cwd:repo,encoding:'utf8'});assert.equal(adminCreated.status,0,'Administrador sintético');
    const setup=cp.spawnSync(process.env.DEVSPHERE_PYTHON||'python3',['-c',"import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute(\"UPDATE submission_settings SET default_reviewer_id=(SELECT id FROM users WHERE email='professor.pending@devsphere.local')\"); c.commit()",env.DEVSPHERE_DB_PATH]); assert.equal(setup.status,0);
    api=cp.spawn(bin,[],{env,cwd:repo,stdio:['ignore','ignore','ignore']});
    for(let i=0;i<100;i++){assert.equal(api.exitCode,null,'API própria ativa');if(ownedListener(api.pid,8085)){const r=await fetch(origin+'/api/v1/health');if(r.ok)break;}await new Promise(r=>setTimeout(r,100));}
    assert.ok(ownedListener(api.pid,8085));
    const studentContext=await browser.newContext(); const student=await studentContext.newPage();
    const teacherContext=await browser.newContext(); const teacher=await teacherContext.newPage();
    const feedbackMutations=[];
    teacher.on('request', request=>{const url=new URL(request.url());if(url.pathname.includes('/feedback')&&['POST','PUT'].includes(request.method()))feedbackMutations.push({method:request.method(),path:url.pathname});});
    for(const [page,email,role] of [[student,'aluno.pending@devsphere.local','student'],[teacher,'professor.pending@devsphere.local','teacher']]){
      page.on('pageerror',e=>pageErrors.push(e.message));await page.goto(`${origin}/pages/${role}-login.html`);await page.locator('#email').fill(email);await page.locator('#password').fill(password);await page.locator('[type=submit]').click();await page.waitForURL(role==='student'?'**/student-cases.html':'**/teacher-dashboard.html');
    }
    await student.locator('#caseSelect option[value="joao"]').waitFor({state:'attached'});await student.locator('#caseSelect').selectOption('joao');await student.locator('#caseForm [type=submit]').click();await student.locator('#caseSession').waitFor({state:'visible'});await student.locator('[data-filter="exam"]').focus();await student.keyboard.press('Tab');
    assert.equal(await student.evaluate(()=>document.activeElement?.matches('#blocks button')),true,'Tab alcança primeira ação');
    await student.keyboard.press('Enter');await student.waitForFunction(()=>document.querySelector('#count').textContent==='01'&&!document.querySelector('#diagnose').disabled);
    const retainedFocus=await student.evaluate(()=>document.activeElement?.matches('#blocks button'));
    report.keyboardInvestigation={focusRetainedAfterAction:retainedFocus,consecutiveActions:1};
    if(expectFocusLoss){assert.equal(retainedFocus,false,'Reprodução exige perda de foco');report.keyboardInvestigation.expectedBaselineDefect=true;}
    else {
      assert.equal(retainedFocus,true,'Atualização da ação mantém foco na investigação');
      for(const count of ['02','03']){await student.keyboard.press('Tab');assert.equal(await student.evaluate(()=>document.activeElement?.matches('#blocks button')),true,'Tab continua na biblioteca');await student.keyboard.press('Enter');await student.waitForFunction(expected=>document.querySelector('#count').textContent===expected&&!document.querySelector('#diagnose').disabled,count);assert.equal(await student.evaluate(()=>document.activeElement?.matches('#blocks button')),true);}
      report.keyboardInvestigation.consecutiveActions=3;
    }
    await student.locator('#diagnose').click();await student.locator('#hypothesis').selectOption({index:1});await student.locator('#reason').fill('Justificativa inteiramente sintética para testar devolutiva retomada.');await student.locator('#diagnosisForm [type=submit]').click();await student.waitForFunction(()=>document.querySelector('#submissionStatus').textContent.startsWith('Atendimento enviado'),{timeout:30000});
    const submissionResponse=await studentContext.request.get(origin+'/api/v1/submissions/1');assert.equal(submissionResponse.status(),200);
    const submissionBody=await submissionResponse.json();const studentId=(submissionBody.data||submissionBody).studentId;
    const feedbackList=async(context)=>{const response=await context.request.get(`${origin}/api/v1/students/${studentId}/feedback`);assert.equal(response.status(),200);const body=await response.json();return body.data||body;};
    await teacher.goto(origin+'/pages/teacher-feedback.html?id=1');await teacher.locator('#feedbackForm').waitFor({state:'visible'});
    if(!expectMissing){
      await teacher.locator('[name="strengths"]').fill('Rascunho sintético ainda incompleto.');
      await teacher.locator('button[value="draft"]').click();await teacher.waitForFunction(()=>document.querySelector('#feedbackStatus').textContent==='Rascunho salvo.');
      await teacher.reload();await teacher.locator('#feedbackForm').waitFor({state:'visible'});
      assert.equal(await teacher.locator('[name="strengths"]').inputValue(),'Rascunho sintético ainda incompleto.');
      assert.equal(await teacher.locator('[name="difficulties"]').inputValue(),'');report.incompleteDraftSavedAndRestored=true;
    }
    const fields={strengths:'Organização sintética adequada.',difficulties:'Comparação sintética de hipóteses.',missedEvidence:'Evidência sintética pendente.',prioritizationComment:'Prioridade sintética inicial.',justificationComment:'Justificativa sintética fundamentada.',nextAttemptGuidance:'Orientação sintética para próxima tentativa.',generalObservation:'Observação sintética de retomada.'};
    for(const [name,value] of Object.entries(fields))await teacher.locator(`[name="${name}"]`).fill(value);
    await teacher.locator('button[value="draft"]').click();await teacher.waitForFunction(()=>document.querySelector('#feedbackStatus').textContent==='Rascunho salvo.');
    const savedFeedback=await feedbackList(teacherContext);assert.equal(savedFeedback.length,1);const feedbackId=savedFeedback[0].id;
    assert.equal((await feedbackList(studentContext)).length,0,'Rascunho privado para aluno');
    const forbidden=await studentContext.request.put(`${origin}/api/v1/feedback/${feedbackId}`,{headers:{'X-PV-Request':'1','Origin':origin},data:{strengths:'Tentativa sintética não autorizada.'}});assert.equal(forbidden.status(),403,'Aluno não altera devolutiva');
    report.draftHiddenAndStudentUpdateDenied=true;
    if(!expectMissing){
      const adminContext=await browser.newContext();const admin=await adminContext.newPage();admin.on('pageerror',e=>pageErrors.push(e.message));
      await admin.goto(origin+'/pages/admin-login.html');await admin.locator('#email').fill('admin.pending@devsphere.local');await admin.locator('#password').fill(password);await admin.locator('[type=submit]').click();await admin.waitForURL('**/admin-dashboard.html');
      await admin.goto(origin+'/pages/teacher-feedback.html?id=1');await admin.locator('#feedbackForm').waitFor({state:'visible'});
      for(const [name,value] of Object.entries(fields))assert.equal(await admin.locator(`[name="${name}"]`).inputValue(),value,'Administrador autorizado restaura campos');
      for(const name of Object.keys(fields))assert.equal(await admin.locator(`[name="${name}"]`).evaluate(element=>element.readOnly),true,'Administrador não assume autoria');
      assert.equal(await admin.locator('button[value="draft"]').isDisabled(),true);assert.equal(await admin.locator('button[value="complete"]').isDisabled(),true);
      assert.match(await admin.locator('#feedbackStatus').textContent(),/somente para consulta/);
      report.adminCanRestoreSevenDraftFields=true;report.adminOtherAuthorReadOnly=true;await adminContext.close();
    }

    await teacher.reload();await teacher.locator('#feedbackForm').waitFor({state:'visible'});
    const restored={};for(const name of Object.keys(fields))restored[name]=await teacher.locator(`[name="${name}"]`).inputValue();
    report.draftReopen={fieldsChecked:7,restoredFields:Object.entries(fields).filter(([name,value])=>restored[name]===value).length};
    if(expectMissing){assert.equal(report.draftReopen.restoredFields,0,'Reprodução exige sete campos vazios');report.draftReopen.expectedBaselineDefect=true;}
    else {
      assert.deepEqual(restored,fields,'Rascunho preservado ao recarregar');
      await teacher.locator('[name="generalObservation"]').fill('Observação sintética atualizada após reabrir.');
      await teacher.locator('button[value="draft"]').click();await teacher.waitForFunction(()=>document.querySelector('#feedbackStatus').textContent==='Rascunho salvo.');
      await teacher.reload();await teacher.locator('#feedbackForm').waitFor({state:'visible'});assert.equal(await teacher.locator('[name="generalObservation"]').inputValue(),'Observação sintética atualizada após reabrir.');
      await teacher.locator('button[value="complete"]').click();await teacher.waitForFunction(()=>document.querySelector('#feedbackStatus').textContent==='Devolutiva concluída.');
      await teacher.reload();await teacher.locator('#feedbackForm').waitFor({state:'visible'});assert.equal(await teacher.locator('button[value="draft"]').isDisabled(),true);assert.equal(await teacher.locator('button[value="complete"]').isDisabled(),true);
      for(const name of Object.keys(fields))assert.equal(await teacher.locator(`[name="${name}"]`).evaluate(element=>element.readOnly),true,'Concluído somente leitura');
      const finalFeedback=await feedbackList(teacherContext);assert.equal(finalFeedback.length,1);assert.equal(finalFeedback[0].id,feedbackId);assert.equal(finalFeedback[0].status,'completed');
      const visibleFeedback=await feedbackList(studentContext);assert.equal(visibleFeedback.length,1);assert.equal(visibleFeedback[0].status,'completed');
      assert.equal(feedbackMutations.filter(item=>item.method==='POST'&&item.path.endsWith('/feedback')).length,1,'Uma única criação');
      assert.equal(feedbackMutations.filter(item=>item.method==='PUT'&&item.path===`/api/v1/feedback/${feedbackId}`).length,3,'Atualizações reutilizam o rascunho');
      report.draftReopen.editSaveCompleteReopen=true;report.draftReopen.completedReadOnly=true;report.draftReopen.sameFeedbackIdAndThreeUpdates=true;report.draftReopen.completedVisibleToStudent=true;
    }
    assert.deepEqual(pageErrors,[]);report.pageErrors=0;report.status='passed';
  }catch(error){report.status='failed';report.error=error.message;process.exitCode=1;}
  finally {
    if(browser)await browser.close();if(staticServer)await new Promise(resolve=>staticServer.close(resolve));
    if(api&&api.exitCode===null){api.kill('SIGTERM');await Promise.race([new Promise(resolve=>api.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);if(api.exitCode===null)api.kill('SIGKILL');}
    fs.rmSync(temp,{recursive:true,force:true});report.finishedAt=new Date().toISOString();fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:report.status,legacyScoring:report.legacyScoring,draftReopen:report.draftReopen,reportPath}));
  }
})();
