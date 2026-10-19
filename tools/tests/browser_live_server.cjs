// Integração opt-in: extensão Live Server real, sem interceptação ou proxy de teste.
// Só inicia serviços próprios depois de reservar ambas as portas; nunca encerra serviços alheios.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const cp = require('node:child_process');
const { randomBytes } = require('node:crypto');
const repo = path.resolve(__dirname, '../..');
const apiOrigin = 'http://127.0.0.1:8080';
const liveOrigin = 'http://127.0.0.1:5501';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Bind exclusivo verifica disponibilidade sem enviar requisições ao processo da porta ocupada.
async function reserve(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
  });
  return server;
}
const release = server => new Promise(resolve => server.close(resolve));
async function guard(ports) {
  const held = [];
  try {
    for (const port of ports) held.push(await reserve(port));
    return held;
  } catch (error) {
    await Promise.all(held.map(release));
    throw error;
  }
}

// Autoteste não usa 8080/5501: prova que a guarda falha sem tocar no serviço existente.
async function selfTest() {
  const owner = await reserve(0);
  const port = owner.address().port;
  try {
    await assert.rejects(() => guard([port]), error => error.code === 'EADDRINUSE');
    assert.equal(owner.listening, true);
    const second = await reserve(0);
    const free = second.address().port;
    await release(second);
    await assert.rejects(() => guard([free, port]), error => error.code === 'EADDRINUSE');
    const reclaimed = await reserve(free);
    await release(reclaimed);
    assert.equal(owner.listening, true);
    console.log('PASS guarda: porta ocupada preservada e reservas parciais liberadas.');
  } finally { await release(owner); }
}

async function stopOwned(child) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, pause(3000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await exited;
  }
}
async function main() {
  if (process.argv.includes('--guard-self-test')) return selfTest();
  let reservations;
  try { reservations = await guard([8080, 5501]); }
  catch (error) {
    console.log(`SKIP: portas 8080/5501 indisponíveis (${error.code || 'bind_failed'}). Nenhuma API existente consultada ou reiniciada.`);
    process.exitCode = 77;
    return;
  }
  let temp, api, live, browser, cleanupPromise;
  // Sinais e exceções seguem a mesma limpeza; browser.close não pode impedir encerrar os filhos.
  const cleanup = () => cleanupPromise ||= (async () => {
    if (browser) await browser.close().catch(() => {});
    await stopOwned(live);
    await stopOwned(api);
    if (reservations?.length) await Promise.all(reservations.map(release));
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
  })();
  const interrupt = () => { cleanup().finally(() => process.exit(130)); };
  const terminate = () => { cleanup().finally(() => process.exit(143)); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  try {
    const binary = process.env.DEVSPHERE_TEST_BINARY || path.join(repo, 'build/backend/devsphere-api');
    const extension = process.env.LIVE_SERVER_MODULE || path.join(os.homedir(), '.vscode/extensions/ritwickdey.liveserver-5.7.10/node_modules/live-server');
    if (!fs.existsSync(binary)) throw Error('Binário de teste ausente; configure DEVSPHERE_TEST_BINARY.');
    if (!fs.existsSync(path.join(extension, 'index.js'))) throw Error('Live Server real ausente; configure LIVE_SERVER_MODULE com o módulo instalado da extensão.');
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-real-live-'));
    const email = `live.${randomBytes(5).toString('hex')}@devsphere.local`;
    const password = randomBytes(24).toString('base64url') + '@Aa1';
    // Ambiente mínimo evita herdar caminhos de bases, produção, MFA ou segredos pessoais.
    const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    Object.assign(env, {
      DEVSPHERE_ENV: 'development', DEVSPHERE_HOST: '127.0.0.1', DEVSPHERE_PORT: '8080',
      DEVSPHERE_DB_PATH: path.join(temp, 'fixture.db'),
      DEVSPHERE_MIGRATIONS_DIR: path.join(repo, 'backend/migrations'),
      DEVSPHERE_CASE_SEED: path.join(repo, 'backend/seeds/legacy-cases.json'),
      DEVSPHERE_FRONTEND_DIR: path.join(repo, 'frontend'),
      DEVSPHERE_ALLOWED_ORIGINS: `${apiOrigin},${liveOrigin}`,
      DEVSPHERE_SEED_PASSWORD: password,
      DEVSPHERE_PYTHON: process.env.DEVSPHERE_PYTHON || 'python3',
      DEVSPHERE_PDF_RENDERER: path.join(repo, 'tools/render_official_report.py')
    });
    const seed = cp.spawnSync(binary, ['--create-user', 'Aluno Live Sintético', email, 'student'], { env, cwd: repo, encoding: 'utf8' });
    if (seed.status !== 0) throw Error('Falha ao criar conta sintética no banco temporário.');
    await Promise.all(reservations.map(release)); reservations = [];
    api = cp.spawn(binary, [], { env, cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
    // O módulo é carregado no processo filho; nenhum pacote é instalado e nenhum navegador é aberto por ele.
    const liveScript = `const live=require(process.argv[1]);const server=live.start({host:'127.0.0.1',port:5501,root:process.argv[2],open:false,logLevel:0});server.once('error',()=>process.exit(1));server.once('listening',()=>process.stdout.write('LIVE_READY\\n'));process.on('SIGTERM',()=>{live.shutdown();setTimeout(()=>process.exit(0),50);});`;
    live = cp.spawn(process.execPath, ['-e', liveScript, extension, path.join(repo, 'frontend')], { env, cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
    let liveReady = false, startupError = false;
    api.once('error', () => { startupError = true; });
    live.once('error', () => { startupError = true; });
    live.stdout.on('data', chunk => { if (String(chunk).includes('LIVE_READY')) liveReady = true; });
    api.stdout.resume(); api.stderr.resume(); live.stderr.resume();
    for (let i = 0; i < 100 && !liveReady; i++) {
      if (startupError || api.exitCode !== null || live.exitCode !== null) throw Error('Um dos serviços próprios falhou ao iniciar; execução abortada.');
      await pause(100);
    }
    assert.ok(liveReady, 'Live Server próprio não confirmou escuta em 5501.');
    for (let i = 0; i < 100; i++) {
      if (api.exitCode !== null) throw Error('API própria encerrou antes da validação.');
      try { if ((await fetch(`${apiOrigin}/api/v1/health`, { signal: AbortSignal.timeout(500) })).ok) break; } catch {}
      if (i === 99) throw Error('API própria não ficou saudável.');
      await pause(100);
    }
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined) });
    const context = await browser.newContext();
    const errors = [], cors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    context.on('response', async response => {
      if (!response.url().startsWith(`${apiOrigin}/api/v1/`)) return;
      cors.push({ url: new URL(response.url()).pathname, status: response.status(), origin: await response.headerValue('access-control-allow-origin'), credentials: await response.headerValue('access-control-allow-credentials') });
    });
    const page = await context.newPage();
    await page.goto(`${liveOrigin}/pages/student-login.html`);
    // Confirma injeção específica do Live Server: não é um servidor estático substituto.
    assert.match(await page.content(), /Code injected by live-server|WebSocket.*\/ws/s);
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('[type=submit]').click();
    await page.waitForURL('**/student-cases.html');
    await page.locator('#caseSelect option[value="joao"]').waitFor({ state: 'attached' });
    await page.locator('#caseSelect').selectOption('joao');
    await page.locator('#caseForm [type=submit]').click();
    await page.locator('#caseSession').waitFor({ state: 'visible' });
    const actionResponse = page.waitForResponse(response => response.url().endsWith('/actions') && response.request().method() === 'POST');
    await page.locator('#blocks [data-id="pain"]').click();
    const accepted = await (await actionResponse).json();
    assert.ok(accepted.id);
    assert.equal(accepted.path.length, 1);
    await page.waitForFunction(() => document.getElementById('count').textContent === '01');
    // Chamada direta pelo navegador, sem route/fetch proxy: CORS e cookie reais da origem 5501.
    const session = await page.evaluate(async () => {
      const response = await fetch('http://127.0.0.1:8080/api/v1/auth/session', { credentials: 'include' });
      return { status: response.status, body: await response.json() };
    });
    assert.equal(session.status, 200);
    assert.ok((await context.cookies(apiOrigin)).some(cookie => cookie.httpOnly));
    await page.close();
    // Reabertura preserva o mesmo cookie e banco: não reinicia API nem recria fixture.
    const reopened = await context.newPage();
    await reopened.goto(`${liveOrigin}/pages/student-cases.html`);
    await reopened.locator('#caseSelect option[value="marina"]').waitFor({ state: 'attached' });
    assert.ok(reopened.url().endsWith('student-cases.html'));
    const persisted = await reopened.evaluate(async id => {
      const response = await fetch(`http://127.0.0.1:8080/api/v1/clinical-sessions/${id}`, { credentials: 'include' });
      return { status: response.status, body: await response.json() };
    }, accepted.id);
    assert.equal(persisted.status, 200);
    assert.equal(persisted.body.id, accepted.id);
    assert.equal(persisted.body.path.length, 1);
    await reopened.reload();
    await reopened.locator('#caseSelect option[value="joao"]').waitFor({ state: 'attached' });
    await pause(100);
    assert.ok(cors.some(item => item.url.endsWith('/auth/login') && item.status === 200));
    assert.ok(cors.some(item => item.url.endsWith('/actions') && item.status === 200));
    for (const item of cors.filter(item => item.status === 200)) {
      assert.equal(item.origin, liveOrigin);
      assert.equal(item.credentials, 'true');
    }
    assert.deepEqual(errors, []);
    assert.equal(api.exitCode, null);
    console.log('PASS extensão Live Server real 5501 → API própria 8080: login, cookie HttpOnly, catálogo, sessão, ação, CORS e reabertura sem reiniciar o banco. Sem interceptação/proxy.');
  } finally {
    await cleanup();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
  }
}
main().catch(error => { console.error(`FAIL: ${error.message}`); process.exitCode = 1; });
