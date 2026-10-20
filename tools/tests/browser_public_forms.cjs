// Regressão pública em Chrome real, sem API, banco ou serviços existentes.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fs.realpathSync(path.resolve(__dirname, '../../frontend'));
const expectBlocked = process.argv.includes('--expect-blocked');
const reportArg = process.argv.find(value => value.startsWith('--report='));
const report = { scope: 'validacao_nativa_publica_sem_backend', expected: expectBlocked ? 'bug_reproduced' : 'corrected', cases: [] };
let browser, server, apiRequests = 0;
const errors = [];

async function main() {
  // Porta efêmera de loopback e raiz apenas frontend; não lê banco nem atende uma API simulada.
  server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/')) apiRequests++;
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
      const requested = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      const file = fs.realpathSync(requested);
      if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
      const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--disable-gpu'] });
  report.browser = browser.version();
  const start = Date.now();
  for (const width of [320, 375, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    for (const role of ['student', 'teacher']) {
      for (const correction of ['confirmation', 'password']) {
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${origin}/pages/${role}-register.html`);
        // A captura abaixo observa somente a aceitação nativa do segundo submit e impede envio de credenciais.
        // Não substitui fetch/AuthService nem fornece resposta falsa de cadastro.
        await page.evaluate(() => {
          window.acceptedNativeSubmits = 0;
          const form = document.getElementById('registerForm');
          form.addEventListener('submit', event => {
            if (form.password.value === form.passwordConfirmation.value && form.checkValidity()) {
              event.preventDefault();
              event.stopImmediatePropagation();
              window.acceptedNativeSubmits++;
            }
          }, true);
        });
        await page.locator('#name').fill('Pessoa Sintetica Teste');
        await page.locator('#email').fill('public-form@example.invalid');
        const secret = randomBytes(24).toString('base64url');
        await page.locator('#password').fill(secret);
        await page.locator('#passwordConfirmation').fill(secret + 'different');
        await page.locator('[type=submit]').click();
        assert.equal(await page.locator('#passwordConfirmation').evaluate(input => input.validity.customError), true);
        if (correction === 'confirmation') await page.locator('#passwordConfirmation').fill(secret);
        else await page.locator('#password').fill(secret + 'different');
        const validAfterCorrection = await page.locator('#registerForm').evaluate(form => form.checkValidity());
        assert.equal(validAfterCorrection, !expectBlocked, 'A correção deve remover o erro nativo anterior.');
        await page.locator('#passwordConfirmation').focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('[type=submit]').evaluate(button => button === document.activeElement), true);
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => window.acceptedNativeSubmits), expectBlocked ? 0 : 1);
        const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
        assert.ok(layout.document <= layout.viewport + 1, 'Formulário público não deve transbordar horizontalmente.');
        report.cases.push({ role, width, correction, mismatchRejected: true, validAfterCorrection, nativeSecondSubmit: !expectBlocked, keyboardSubmitReached: true, horizontalOverflow: false });
        await page.close();
      }
    }
    await context.close();
  }
  assert.equal(apiRequests, 0, 'Esta regressão não deve enviar solicitações à API.');
  assert.deepEqual(errors, []);
  report.status = 'passed';
  report.apiRequests = apiRequests;
  report.elapsedSeconds = (Date.now() - start) / 1000;
}
main().catch(error => { report.status = 'failed'; report.error = error.message; process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  // O relatório guarda apenas resultados, nunca senhas, corpos HTTP ou conteúdo privado.
  if (reportArg) {
    const destination = path.resolve(reportArg.slice('--report='.length));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  console.log(JSON.stringify(report, null, 2));
});
