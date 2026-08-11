const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message || error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('#tabSeedance', { timeout: 30000 });
  await page.click('#tabSeedance');
  await page.waitForSelector('#pSeedance.active .sp-shell', { timeout: 30000 });
  await page.evaluate(() => window.ZippySeedancePlanner.autoFill());
  await page.waitForFunction(() => window.ZippySeedancePlanner.state().items.length > 0);
  const result = await page.evaluate(() => ({
    active: document.getElementById('pSeedance').classList.contains('active'),
    total: window.ZippySeedancePlanner.state().totalSeconds,
    scenes: window.ZippySeedancePlanner.state().items.length,
    prompt: document.getElementById('seedanceSequencePrompt').value,
    references: document.querySelectorAll('.sp-ref').length,
    gtiTasks: document.querySelectorAll('.sp-gti').length,
    hasZip: document.body.textContent.includes('레퍼런스 ZIP 한 번에 다운로드'),
    hasGti: document.body.textContent.includes('부족한 첫 프레임 모두 GTI 생성'),
  }));
  if (!result.active) throw new Error('Seedance panel is not active');
  if (!(result.total > 0 && result.total <= 30)) throw new Error(`invalid total seconds: ${result.total}`);
  if (!result.prompt.includes('[Reference Upload Order]') || !result.prompt.includes('[Timeline]')) throw new Error('multi-scene prompt sections missing');
  if (!result.references || result.gtiTasks !== result.scenes) throw new Error('reference or GTI task rendering mismatch');
  if (!result.hasZip || !result.hasGti) throw new Error('download or GTI controls missing');
  await page.screenshot({ path: '/tmp/seedance-planner-ui.png', fullPage: true });
  const relevantErrors = errors.filter((text) => !/favicon|ERR_FILE_NOT_FOUND|Failed to load resource.*404/i.test(text));
  if (relevantErrors.length) throw new Error(`browser errors: ${relevantErrors.slice(0, 5).join(' | ')}`);
  console.log(JSON.stringify({ ok: true, ...result, prompt: `${result.prompt.length} chars`, screenshot: '/tmp/seedance-planner-ui.png' }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
