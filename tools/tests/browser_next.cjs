// Teste E2E com contas sintéticas, senha aleatória e banco temporário.
// A origem Live Server é servida pelo roteamento de teste; chamadas de API vão à instância isolada.
// Não usa nem reinicia a API pessoal da porta 8080.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const {
  chromium
} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {
  randomBytes
} = require('node:crypto');
const repo = path.resolve(__dirname, '../..');
const port = process.env.BROWSER_TEST_PORT || '8083';
const origin = `http://127.0.0.1:${port}`;
const bin = process.env.DEVSPHERE_TEST_BINARY || path.join(repo, 'build/backend/devsphere-api');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-browser-next-'));
const env = {
  ...process.env,
  DEVSPHERE_DB_PATH: path.join(temp, 'test.db'),
  DEVSPHERE_MIGRATIONS_DIR: path.join(repo, 'backend/migrations'),
  DEVSPHERE_CASE_SEED: path.join(repo, 'backend/seeds/legacy-cases.json'),
  DEVSPHERE_FRONTEND_DIR: path.join(repo, 'frontend'),
  DEVSPHERE_HOST: '127.0.0.1',
  DEVSPHERE_PORT: port,
  DEVSPHERE_ALLOWED_ORIGINS: `${origin},http://127.0.0.1:5501`,
  DEVSPHERE_PYTHON: process.env.DEVSPHERE_PYTHON || 'python3',
  DEVSPHERE_PDF_RENDERER: path.join(repo, 'tools/render_official_report.py'),
  DEVSPHERE_SEED_PASSWORD: randomBytes(24).toString('base64url') + '@Aa1'
};
for (const args of [
    ['--create-admin', 'Admin UI', 'admin.ui@devsphere.local', 'admin.ui@devsphere.local'],
    ['--create-user', 'Aluno UI', 'aluno.ui@devsphere.local', 'student'],
    ['--create-user', 'Professor UI', 'professor.ui@devsphere.local', 'teacher']
  ]) {
  const r = cp.spawnSync(bin, args, {
    env,
    cwd: repo,
    encoding: 'utf8'
  });
  if (r.status) throw Error(r.stderr);
}
cp.spawnSync('python3', ['-c',
  "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute(\"UPDATE submission_settings SET default_reviewer_id=(SELECT id FROM users WHERE email='professor.ui@devsphere.local')\"); c.commit()",
  env.DEVSPHERE_DB_PATH
]);
const server = cp.spawn(bin, [], {
  env,
  cwd: repo,
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', d => serverLog += d);
server.stderr.on('data', d => serverLog += d);
(async () => {
  let browser;
  try {
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) throw Error('API de teste não iniciou: ' + serverLog);
      try {
        if ((await fetch(`${origin}/api/v1/health`)).ok) break;
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROME_PATH || (fs.existsSync(
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ?
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined)
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${origin}/pages/student-login.html`);
    await page.locator('#email').fill('aluno.ui@devsphere.local');
    await page.locator('#password').fill(env.DEVSPHERE_SEED_PASSWORD);
    await page.locator('[type=submit]').click();
    await page.waitForURL('**/student-cases.html');
    await page.locator('#caseSelect option[value="joao"]').waitFor({
      state: 'attached'
    });
    assert.equal(await page.locator('#caseSelect option').count(), 3);
    await page.locator('#caseSelect').selectOption('joao');
    await page.locator('#caseForm [type=submit]').click();
    await page.locator('#caseSession').waitFor({
      state: 'visible'
    });
    await page.locator('#blocks [data-id="pain"]').click();
    await page.waitForFunction(() => document.getElementById('count').textContent === '01');
    assert.match(await page.locator('#branches').textContent(), /aperto/);
    await page.locator('#diagnose').click();
    await page.locator('#hypothesis').selectOption({
      index: 1
    });
    await page.locator('#reason').fill('Justificativa sintética de teste da integração da interface.');
    await page.locator('#diagnosisForm [type=submit]').click();
    await page.waitForFunction(() => {
      const s = document.getElementById('submissionStatus').textContent;
      return s.startsWith('Atendimento enviado') || (!s.includes('Gerando') && !s.includes(
        'Finalize'));
    }, {
      timeout: 20000
    });
    const submissionStatus = await page.locator('#submissionStatus').textContent();
    console.log('SUBMISSION', submissionStatus);
    assert.match(submissionStatus, /Atendimento enviado/);
    await page.goto(`${origin}/pages/student-history.html`);
    await page.waitForFunction(() => document.getElementById('historyStatus').textContent ===
      'Histórico atualizado.');
    assert.equal(await page.locator('#studentSubmissions article').count(), 1);
    assert.match(await page.locator('#studentFeedback').textContent(), /Nenhuma devolutiva/);
    await page.goto(`${origin}/pages/contributions.html`);
    await page.waitForFunction(() => document.getElementById('contributionStatus').textContent ===
      'Consulta atualizada.');
    assert.equal(await page.locator('#uploadForm').count(), 1);
    assert.equal(await page.locator('[data-teacher-only]').isVisible(), false);
    // Assigned teacher saves a draft; the student cannot retrieve it until completion.
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    teacher.on('pageerror', e => errors.push(e.message));
    await teacher.goto(`${origin}/pages/teacher-login.html`);
    await teacher.locator('#email').fill('professor.ui@devsphere.local');
    await teacher.locator('#password').fill(env.DEVSPHERE_SEED_PASSWORD);
    await teacher.locator('[type=submit]').click();
    await teacher.waitForURL('**/teacher-dashboard.html');
    await teacher.goto(`${origin}/pages/teacher-feedback.html?id=1`);
    await teacher.locator('#feedbackForm').waitFor({
      state: 'visible'
    });
    for (const [name, text] of Object.entries({
        strengths: 'Boa organização <img src=x onerror=alert(1)>',
        difficulties: 'Comparar as hipóteses com as evidências.',
        missedEvidence: 'Conferir evidências disponíveis.',
        prioritizationComment: 'Priorizar dados iniciais.',
        justificationComment: 'Justificar as relações.',
        nextAttemptGuidance: 'Praticar novamente.',
        generalObservation: 'Devolutiva sintética para teste.'
      })) await teacher.locator(`[name="${name}"]`).fill(text);
    await teacher.locator('button[value="draft"]').click();
    await teacher.waitForFunction(() => document.getElementById('feedbackStatus').textContent ===
      'Rascunho salvo.');
    await page.goto(`${origin}/pages/student-history.html`);
    await page.waitForFunction(() => document.getElementById('historyStatus').textContent ===
      'Histórico atualizado.');
    assert.equal(await page.locator('#studentFeedback article').count(), 0);
    await teacher.locator('button[value="complete"]').click();
    await teacher.waitForFunction(() => document.getElementById('feedbackStatus').textContent ===
      'Devolutiva concluída.');
    await page.reload();
    await page.waitForFunction(() => document.getElementById('historyStatus').textContent ===
      'Histórico atualizado.');
    assert.equal(await page.locator('#studentFeedback article').count(), 1);
    assert.match(await page.locator('#studentFeedback').textContent(), /Priorizar dados iniciais/);
    assert.equal(await page.locator('#studentFeedback img').count(), 0);
    assert.equal(await page.locator('#notifications article').count(), 1);
    await page.getByRole('button', {
      name: 'Marcar como lida'
    }).click();
    await page.waitForFunction(() => document.getElementById('notifications').textContent.includes(
      'Lida'));
    await teacherContext.close();
    const hidden = await context.request.get(`${origin}/scripts/cases/clinical-cases.js`);
    assert.equal(hidden.status(), 404);
    assert.deepEqual(errors, []);
    console.log(
      'PASS login, catálogo dinâmico, ação autoritativa, hipótese, PDF/submissão, histórico, contribuições, catálogo privado ausente; runtime sem erros.'
    );
    const liveContext = await browser.newContext();
    await liveContext.route('http://127.0.0.1:5501/**', async route => {
      const url = new URL(route.request().url());
      let file = path.resolve(repo, 'frontend', '.' + url.pathname);
      if (!file.startsWith(path.join(repo, 'frontend') + path.sep)) return route.fulfill({
        status: 404,
        body: 'Not found'
      });
      try {
        const body = fs.readFileSync(file);
        const contentType = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ?
          'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ?
          'image/png' : 'application/octet-stream';
        await route.fulfill({
          status: 200,
          body,
          contentType
        });
      } catch {
        await route.fulfill({
          status: 404,
          body: 'Not found'
        });
      }
    });
    await liveContext.route('http://127.0.0.1:8080/api/**', async route => {
      const response = await route.fetch({
        url: route.request().url().replace(':8080/', `:${port}/`)
      });
      await route.fulfill({
        response
      });
    });
    const live = await liveContext.newPage();
    live.on('pageerror', e => errors.push(e.message));
    await live.goto('http://127.0.0.1:5501/pages/student-login.html');
    await live.locator('#email').fill('aluno.ui@devsphere.local');
    await live.locator('#password').fill(env.DEVSPHERE_SEED_PASSWORD);
    await live.locator('[type=submit]').click();
    await live.waitForURL('**/student-cases.html');
    await live.locator('#caseSelect option[value="marina"]').waitFor({
      state: 'attached'
    });
    await live.locator('#caseSelect').selectOption('marina');
    await live.locator('#caseForm [type=submit]').click();
    await live.locator('#caseSession').waitFor({
      state: 'visible'
    });
    await live.locator('#blocks [data-id="glucose"]').click();
    await live.waitForFunction(() => document.getElementById('count').textContent === '01');
    assert.match(await live.locator('.patient h3').textContent(), /Marina/);
    assert.deepEqual(errors, []);
    console.log(
      'PASS professor draft isolation, full completed feedback, XSS-safe text, notification read; Live origin5501 authenticated API proxy8083 and Marina action.'
    );
    await liveContext.close();

    // Guided clinical editor: modify authorized draft without requiring JSON and preserve extensions.
    const authorContext = await browser.newContext();
    const author = await authorContext.newPage();
    author.on('pageerror', error => errors.push(error.message));
    await author.goto(`${origin}/pages/admin-login.html`);
    await author.locator('#email').fill('admin.ui@devsphere.local');
    await author.locator('#password').fill(env.DEVSPHERE_SEED_PASSWORD);
    await author.locator('[type=submit]').click();
    await author.waitForURL('**/admin-dashboard.html');
    const fixture = JSON.parse(fs.readFileSync(path.join(repo, 'backend/seeds/legacy-cases.json'),
      'utf8'))[0];
    // Fixture sintética no formato canônico adaptado; não é geração nem aprovação por modelo.
    fixture.hypothesisDefinitions = fixture.hypotheses.map((label, index) => ({
      id: `synthetic-h${index}`,
      label,
      extensions: {
        sentinel: 'keep-definition'
      }
    }));
    fixture.patient.displayName = fixture.patient.name;
    fixture.patient.chiefComplaint = fixture.patient.complaint;
    fixture.outcome = {
      hypothesisId: fixture.hypothesisDefinitions.find(definition => definition.label === fixture
        .correctHypothesis).id,
      explanation: 'Explicação sintética original.',
      extensions: {
        sentinel: 'keep-outcome'
      }
    };
    fixture.rationale = fixture.outcome.explanation;
    const createdResponse = await authorContext.request.post(`${origin}/api/v1/contributions`, {
      headers: {
        'X-PV-Request': '1',
        Origin: origin
      },
      data: {
        key: 'guided-editor-fixture',
        title: 'Caso fictício do editor',
        content: fixture,
        metadata: fixture.metadata
      }
    });
    assert.equal(createdResponse.status(), 201);
    const createdVersion = await createdResponse.json();
    const originalVersionId = createdVersion.id;
    await author.goto(`${origin}/pages/case-curation.html?id=${originalVersionId}`);
    await author.locator('#curationDetails').waitFor({
      state: 'visible'
    });
    assert.equal(await author.locator('#clinicalItemEditors details').count(), 40);
    // Proposta opcional: não classifica legado até decisão explícita de quem revisa.
    assert.equal(await author.locator('#useDifficultyRubric').isChecked(), false);
    await author.locator('#useDifficultyRubric').check();
    for(const key of ['clueAmbiguity','evidenceIntegration','competingHypotheses','prioritization']) await author.locator(`#difficulty-${key}`).selectOption('1');
    assert.match(await author.locator('#difficultyRubricSuggestion').textContent(),/4\/8/);
    await author.locator('#revisionDifficulty').selectOption('advanced');
    assert.equal(await author.locator('#difficultyOverrideReason').getAttribute('required'),'');
    await author.locator('#difficultyOverrideReason').fill('Divergência sintética para testar justificativa por público-alvo.');

    await author.locator('summary').filter({
      hasText: 'Conteúdo estruturado avançado'
    }).click();
    const originalContent = JSON.parse(await author.locator('#revisionContent').inputValue());
    originalContent.extensions = {
      syntheticSentinel: 'preserved'
    };
    await author.locator('#revisionContent').fill(JSON.stringify(originalContent));
    await author.locator('#applyAdvancedContent').click();
    assert.equal(await author.locator('#clinicalOutcome').inputValue(), 'Explicação sintética original.');
    await author.locator('#clinicalOutcome').fill('Explicação sintética revisada.');
    const revisedHypotheses = [...fixture.hypotheses];
    revisedHypotheses[0] += ' — alternativa sintética revisada';
    await author.locator('#clinicalHypotheses').fill(revisedHypotheses.join('\n'));
    await author.locator('#clinicalCorrect').selectOption(revisedHypotheses[0]);
    await author.locator('#patientName').fill('Paciente fictício do editor');
    await author.locator('#patientComplaint').fill('Queixa fictícia revisada no formulário.');
    await author.locator('#clinicalItemEditors details').first().locator('summary').click();
    await author.locator('#item-answer-0').fill('Resposta sintética corrigida pelo formulário.');
    await author.locator('#item-score-0').selectOption('inappropriate');
    assert.equal(await author.locator('#item-points-0').inputValue(), '-12');
    await author.locator('#revisionForm [type=submit]').click();
    await author.waitForURL(url => url.searchParams.get('id') !== String(originalVersionId));
    await author.locator('#curationDetails').waitFor({
      state: 'visible'
    });
    assert.equal(await author.locator('#patientName').inputValue(), 'Paciente fictício do editor');
    const savedContent = JSON.parse(await author.locator('#revisionContent').inputValue());
    assert.equal(savedContent.extensions.syntheticSentinel, 'preserved');
    assert.equal(savedContent.patient.displayName, savedContent.patient.name);
    assert.equal(savedContent.patient.chiefComplaint, savedContent.patient.complaint);
    assert.equal(savedContent.patient.chiefComplaint, 'Queixa fictícia revisada no formulário.');
    assert.equal(typeof savedContent.outcome, 'object');
    assert.equal(savedContent.outcome.hypothesisId, fixture.hypothesisDefinitions[0].id);
    assert.equal(savedContent.hypothesisDefinitions[0].label, revisedHypotheses[0]);
    assert.equal(savedContent.hypothesisDefinitions[0].extensions.sentinel, 'keep-definition');
    assert.equal(savedContent.outcome.explanation, 'Explicação sintética revisada.');
    assert.equal(savedContent.outcome.extensions.sentinel, 'keep-outcome');
    assert.equal(savedContent.rationale, savedContent.outcome.explanation);
    assert.equal(savedContent.items[0].answer, 'Resposta sintética corrigida pelo formulário.');
    assert.equal(savedContent.scoring.items[savedContent.items[0].id].basePoints, -12);
    const rubricSaved=await (await authorContext.request.get(`${origin}/api/v1/contributions/${new URL(author.url()).searchParams.get('id')}`)).json();
    assert.equal(rubricSaved.metadata.rubricVersion,'pv-difficulty-v1');
    assert.equal(rubricSaved.metadata.difficultyAssessment.suggestedLevel,'intermediate');
    assert.equal(rubricSaved.metadata.difficulty,'advanced');
    assert.match(rubricSaved.metadata.difficultyAssessment.overrideReason,/Divergência/);
    assert.equal(await author.locator('#useDifficultyRubric').isChecked(),true);

    const originalResponse = await authorContext.request.get(
      `${origin}/api/v1/contributions/${originalVersionId}`);
    const originalVersion = await originalResponse.json();
    assert.equal(originalVersion.content.patient.name, 'João');
    assert.equal(originalVersion.metadata.difficultyAssessment,undefined);
    const validHypothesesText = await author.locator('#clinicalHypotheses').inputValue();
    await author.locator('#clinicalHypotheses').fill(validHypothesesText + '\nAlternativa extra sem ID');
    await author.locator('#revisionForm [type=submit]').click();
    await author.waitForFunction(() => document.getElementById('curationStatus').textContent.includes(
      'quantidade de alternativas'));
    await author.locator('#clinicalHypotheses').fill(validHypothesesText);
    await author.locator('#patientName').fill('Alteração ainda não salva');
    await author.getByRole('button', {
      name: 'Solicitar revisão',
      exact: true
    }).click();
    await author.waitForFunction(() => document.getElementById('curationStatus').textContent.includes(
      'alterações não salvas'));
    assert.deepEqual(errors, []);
    // Administração pode preparar um novo rascunho legado, sem aprovar ou publicar conteúdo clínico.
    await author.goto(`${origin}/pages/case-curation.html?id=1`);
    await author.locator('#curationDetails').waitFor({
      state: 'visible'
    });
    await author.locator('#revisionTitle').fill('Rascunho legado de teste da interface');
    await author.locator('#revisionForm [type=submit]').click();
    await author.waitForURL(url => url.searchParams.get('id') !== '1');
    await author.waitForFunction(() => document.getElementById('curationTitle').textContent ===
      'Rascunho legado de teste da interface');
    assert.match(await author.locator('#curationState').textContent(), /draft/);
    const publicCatalogResponse = await authorContext.request.get(`${origin}/api/v1/cases`);
    const publicCatalog = await publicCatalogResponse.json();
    assert.notEqual(publicCatalog.find(entry => entry.key === 'joao').title,
      'Rascunho legado de teste da interface');
    assert.deepEqual(errors, []);
    console.log(
      'PASS administração cria rascunho legado e título versionado sem mudar o catálogo publicado.');
    // Painel consulta a autoridade atual e permite revogar sem apagar pareceres.
    await author.goto(`${origin}/pages/admin-dashboard.html`);
    await author.locator('#reviewerUserId').fill('3');
    await author.locator('#reviewerArea').fill('general');
    await author.locator('#reviewerAreaEnabled').selectOption('true');
    await author.locator('#reviewerAreaForm [type=submit]').click();
    await author.waitForFunction(()=>document.getElementById('reviewerStatus').textContent==='Configuração registrada.');
    assert.match(await author.locator('#reviewerAreasList').textContent(),/Professor UI/);
    await author.locator('#reviewerAreaEnabled').selectOption('false');
    await author.locator('#reviewerAreaForm [type=submit]').click();
    await author.waitForFunction(()=>document.getElementById('reviewerStatus').textContent==='Habilitação revogada.');
    assert.match(await author.locator('#reviewerAreasList').textContent(),/Nenhuma habilitação/);
    // PDF sintético real para exercitar somente a interface de permissões.
    const sourcePath=path.join(temp,'governance.pdf');
    const generated=cp.spawnSync(env.DEVSPHERE_PYTHON,['-c',"from reportlab.pdfgen import canvas; import sys; p=canvas.Canvas(sys.argv[1]); p.drawString(20,700,'Fonte sintetica autorizada para teste de permissoes'); p.save()",sourcePath],{encoding:'utf8'});
    assert.equal(generated.status,0,generated.stderr);
    const uploaded=await authorContext.request.post(`${origin}/api/v1/documents`,{headers:{'X-PV-Request':'1',Origin:origin},multipart:{authorized:'true',deidentified:'true',area:'general',pdf:{name:'governance.pdf',mimeType:'application/pdf',buffer:fs.readFileSync(sourcePath)}}});
    assert.equal(uploaded.status(),201);
    const sourceDoc=await uploaded.json();
    await author.goto(`${origin}/pages/contributions.html`);
    const sourceCard=author.locator('#documents article').filter({hasText:'governance.pdf'});
    await sourceCard.locator('[aria-label="ID do usuário para acesso à fonte"]').fill('3');
    await sourceCard.getByRole('button',{name:'Aplicar permissão da fonte',exact:true}).click();
    await author.waitForFunction(()=>document.getElementById('contributionStatus').textContent==='Acesso concedido.');
    await sourceCard.getByRole('button',{name:'Consultar acessos concedidos',exact:true}).click();
    await sourceCard.getByText('Professor UI · ID 3 · teacher',{exact:true}).waitFor();
    await sourceCard.locator('[aria-label="Operação de acesso à fonte"]').selectOption('revoke');
    await sourceCard.locator('[aria-label="Motivo administrativo da revogação"]').fill('Fim da colaboração sintética.');
    await sourceCard.getByRole('button',{name:'Aplicar permissão da fonte',exact:true}).click();
    await author.waitForFunction(()=>document.getElementById('contributionStatus').textContent.startsWith('Acesso revogado.'));
    const grantsAfter=await (await authorContext.request.get(`${origin}/api/v1/documents/${sourceDoc.id}/grants`)).json();
    assert.deepEqual(grantsAfter,[]);
    await sourceCard.getByRole('button',{name:'Casos que utilizam esta fonte',exact:true}).click();
    await sourceCard.getByText('Nenhum vínculo registrado.',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS rubrica opt-in com divergência justificada, versão preservada, painel de habilitação/revogação e permissões da fonte.');
    await authorContext.close();
    console.log(
      'PASS guided clinical editor: 40 labeled items, score mapping, new version, preserved unknown fields, original unchanged, dirty changes blocked.'
    );
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
    console.log('Temporary database:', path.join(temp, 'test.db'));
    if (serverLog.includes('Falha')) console.log(serverLog);
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
