import { chromium } from '@playwright/test';

const filePath = '/Users/mac/Desktop/参考/nso_sample_paper_class-1_2025-26.pdf';
const baseURL = process.env.BASE_URL || 'http://localhost:3011';
const targetStem = 'Select the odd one out on the basis of natural and man-made things.';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ baseURL });
let processScan = null;

page.on('response', async (response) => {
  const url = response.url();
  if (response.request().method() === 'POST' && url.includes('/api/pdf/process-scan')) {
    processScan = await response.json().catch(() => null);
  }
});

console.log('[debug] goto agent');
await page.goto('/main/agent', { waitUntil: 'domcontentloaded' });
console.log('[debug] attach file');
await page.locator('input[type="file"]').first().setInputFiles(filePath);
console.log('[debug] submit scan prompt');
await page.locator('[data-testid="agent-composer"]').fill('拆解题目');
await page.locator('[data-testid="agent-composer"]').press('Enter');

console.log('[debug] wait process-scan response');
await page.waitForResponse(
  (response) =>
    response.request().method() === 'POST' &&
    response.url().includes('/api/pdf/process-scan') &&
    response.status() < 400,
  { timeout: 240000 },
);
console.log('[debug] open scan artifact');
const artifactReference = page.locator('[data-testid="agent-artifact-reference"]').last();
await artifactReference.waitFor({ state: 'visible', timeout: 240000 });
await artifactReference.click();

console.log('[debug] wait structured result in canvas');
await page.locator('[data-testid="agent-artifact-canvas"]').waitFor({ state: 'visible', timeout: 240000 });
const structuredResult = page.locator('[data-testid="agent-artifact-canvas"] [data-testid="scan-structured-result"]').last();
await structuredResult.waitFor({ state: 'visible', timeout: 240000 });
await structuredResult.locator('[data-testid^="scan-question-"]').first().waitFor({ state: 'visible', timeout: 240000 });
await page.screenshot({ path: 'tmp/debug-repro-target-scan.png', fullPage: true });
await page.waitForTimeout(2500);

console.log('[debug] collect target question');
const articles = structuredResult.locator('[data-testid^="scan-question-"]');
const count = await articles.count();
console.log(`[debug] found ${count} question-like cards`);
const matchedDomQuestions = [];
for (let i = 0; i < count; i += 1) {
  const article = articles.nth(i);
  const text = (await article.textContent()) || '';
  if (!text.includes(targetStem)) continue;

  const optionCards = article.locator('[data-testid^="scan-question-option-"]');
  const optionCount = await optionCards.count();
  const options = [];
  for (let j = 0; j < optionCount; j += 1) {
    const card = optionCards.nth(j);
    options.push({
      cardText: ((await card.textContent()) || '').trim(),
      richImageCount: await card.locator('[data-testid="scan-rich-image"]').count(),
      imgCount: await card.locator('img').count(),
      imgSrcs: await card.locator('img').evaluateAll((els) => els.map((el) => el.getAttribute('src'))),
    });
  }
  matchedDomQuestions.push({ index: i, text, options });
}

const processScanQuestions = Array.isArray(processScan?.questions)
  ? processScan.questions
      .filter((q) => String(q?.content || '').includes(targetStem))
      .map((q) => ({
        questionNumber: q.questionNumber,
        rawQuestionNumber: q.rawQuestionNumber,
        sourcePageNumber: q.sourcePageNumber,
        content: q.content,
        options: q.options,
        linkedFigures: q.linkedFigures,
      }))
  : [];

console.log(JSON.stringify({ targetStem, matchedDomQuestions, processScanQuestions }, null, 2));

await browser.close();
