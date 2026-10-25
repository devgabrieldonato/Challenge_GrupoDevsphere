// Exercita funções reais da extensão instalada em Chromium Linux e perfil descartável.
// Não controla o Chrome pessoal nem envia a página a validadores externos.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=path.resolve(__dirname,'../..');
const extension=process.env.WEB_DEVELOPER_EXTENSION;
assert.ok(extension,'Informe WEB_DEVELOPER_EXTENSION com a pasta instalada oficial.');
const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8'));
assert.equal(manifest.homepage_url,'https://chrispederick.com/work/web-developer/','Extensão deve ser a Web Developer oficial.');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pv-web-developer-'));
const report={startedAt:new Date().toISOString(),extensionVersion:manifest.version,syntheticOnly:true,externalValidatorUsed:false,score:null,method:'Funções oficiais executadas por chrome.scripting no contexto da extensão; não usa UI do Chrome pessoal.',checks:[]};
const reportPath=path.join(repo,'validation-reports',`web-developer-${Date.now()}.json`);
let server,context;
(async()=>{try{
  assert.equal(process.platform,'linux','Este ensaio usa Chromium Linux; não altera o perfil Chrome Windows.');
  const copied=path.join(temp,'extension');fs.cpSync(extension,copied,{recursive:true});
  const root=fs.realpathSync(path.join(repo,'frontend'));
  server=http.createServer((req,res)=>{try{const pathname=new URL(req.url,'http://127.0.0.1').pathname;const real=fs.realpathSync(path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname)));if(!real.startsWith(root+path.sep)||!fs.statSync(real).isFile())throw Error();res.setHeader('Content-Type',real.endsWith('.html')?'text/html; charset=utf-8':real.endsWith('.css')?'text/css':real.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(real));}catch{res.writeHead(404);res.end();}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const origin=`http://127.0.0.1:${server.address().port}`;
  context=await chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${copied}`,`--load-extension=${copied}`]});
  let worker=context.serviceWorkers()[0];if(!worker)worker=await context.waitForEvent('serviceworker',{timeout:15000});
  report.extensionId=new URL(worker.url()).hostname;report.browser=context.browser()?.version()||'Chromium';
  const page=await context.newPage();
  async function command(file,feature,args=[]){return worker.evaluate(async({url,file,feature,args})=>{const tabs=await chrome.tabs.query({url});if(tabs.length!==1)throw Error('Aba local não é exclusiva');const target={tabId:tabs[0].id};await chrome.scripting.executeScript({target,files:[file]});return chrome.scripting.executeScript({target,func:(feature,args)=>{if(feature==='headings')WebDeveloper.Outline.outlineHeadings([document],true);if(feature==='forms')WebDeveloper.Forms.displayFormDetails(true,[document]);if(feature==='css')WebDeveloper.CSS.toggleAllStyles(true,[document]);if(feature==='images')WebDeveloper.Images.displayAltAttributes(true,[document]);return true;},args:[feature,args]});},{url:page.url(),file,feature,args})}
  for(const route of ['/index.html','/pages/student-register.html','/pages/teacher-register.html']){
    await page.goto(origin+route,{waitUntil:'networkidle'});
    // Zoom real do navegador, via API da extensão no perfil descartável.
    const zoomChecks=[];
    for(const mode of ['light','dark']) {
      await page.evaluate(mode=>{localStorage.setItem('pacientevirtual.theme',mode)},mode);
      await page.reload({waitUntil:'networkidle'});
      for(const factor of [2,4]) {
        const actual=await worker.evaluate(async({url,factor})=>{const tabs=await chrome.tabs.query({url});if(tabs.length!==1)throw Error('Aba de zoom ambígua');await chrome.tabs.setZoom(tabs[0].id,factor);return chrome.tabs.getZoom(tabs[0].id)},{url:page.url(),factor});
        await page.waitForTimeout(150);
        const dimensions=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,width:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),pixelRatio:devicePixelRatio}));
        assert.ok(Math.abs(actual-factor)<0.000001,'Fator de zoom real confirmado com precisão numérica');assert.ok(dimensions.width<=dimensions.viewport+1,'Zoom não deve gerar rolagem horizontal global');
        await page.locator('#themeToggle').focus();await page.keyboard.press('Space');
        assert.equal(await page.locator('#themeToggle').evaluate(e=>e===document.activeElement),true,'Troca de tema conserva foco no zoom');
        assert.equal(await page.locator('html').getAttribute('data-theme'),mode==='dark'?'light':'dark','Tema alternou durante o teste de zoom');
        await page.keyboard.press('Space');
        assert.equal(await page.locator('html').getAttribute('data-theme'),mode,'Restaura e confirma o tema antes do próximo fator');
        zoomChecks.push({mode,factor,actual,...dimensions});
      }
    }
    await worker.evaluate(async url=>{const tabs=await chrome.tabs.query({url});await chrome.tabs.setZoom(tabs[0].id,1)},page.url());
    await page.reload({waitUntil:'networkidle'});
    await command('/features/js/outline.js','headings');
    assert.equal(await page.locator('#web-developer-outline-headings').count(),1,'Outline real deve ser inserido pela extensão');
    const before=await page.locator('h1').innerText();
    await command('/features/js/forms.js','forms');
    const detail=await page.evaluate(()=>({headings:document.querySelectorAll('h1,h2,h3,h4,h5,h6').length,formDetails:document.querySelectorAll('[class*="web-developer-display-form-details"], [id*="web-developer-display-form-details"]').length,unlabeled:[...document.querySelectorAll('input,select,textarea')].filter(e=>!e.labels?.length&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')).length}));
    assert.equal(detail.unlabeled,0,'Campos têm identificação persistente');
    await command('/features/js/images.js','images');
    const missingAlt=await page.locator('img:not([alt])').count();assert.equal(missingAlt,0);
    await command('/features/js/css.js','css');
    assert.equal(await page.locator('h1').innerText(),before,'Título continua disponível sem CSS');
    const disabled=await page.evaluate(()=>[...document.styleSheets].filter(s=>s.disabled).length);assert.ok(disabled>0,'Extensão desabilitou estilos da página');
    await page.screenshot({path:path.join(repo,'validation-reports',`${path.basename(reportPath,'.json')}-${route.includes('register')?route.split('/').pop().replace('.html',''):'index'}-without-css.png`),fullPage:true});
    report.checks.push({route,passed:true,outlineApplied:true,zoomChecks,stylesDisabled:disabled,missingAlt,...detail});
  }
}catch(e){report.error={name:e.name,message:e.message};process.exitCode=1;}finally{await context?.close();if(server)await new Promise(r=>server.close(r));const resolved=path.resolve(temp);assert.ok(resolved.startsWith(path.join(os.tmpdir(),'pv-web-developer-')),'Limpeza limitada à pasta temporária própria');fs.rmSync(resolved,{recursive:true,force:true});report.finishedAt=new Date().toISOString();fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({reportPath,checks:report.checks,error:report.error,score:null}));}})();
