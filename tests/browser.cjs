'use strict';
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8000';
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--no-sandbox']
  });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  let externalRequests = 0;
  await page.route('**/*', route => { if (!route.request().url().startsWith(base)) externalRequests++; return route.continue(); });
  await page.goto(base);
  const go = async route => { await page.goto(`${base}/#${route}`); await page.locator(`[data-page="${route}"]:visible`).waitFor(); };
  const fill = async (form, values) => { for (const [key, value] of Object.entries(values)) await page.locator(`#${form} [name="${key}"]`).fill(String(value)); };
  const download = async (button, read) => {
    const promise = page.waitForEvent('download'); await button.click();
    const item = await promise; assert.equal(await item.failure(), null);
    const stream = await item.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk);
    return read(Buffer.concat(chunks).toString('utf8'));
  };
  // Navigation, tools, search, favorites.
  assert.equal(await page.locator('.tool-card[data-tool]:visible').count(), 5);
  await page.getByRole('button', { name: '电商工具', exact: true }).click();
  assert.equal(await page.locator('.tool-card[data-tool]:visible').count(), 2);
  await page.locator('[data-filter="all"]').click();
  await page.locator('#tool-search').fill('不存在'); await page.locator('#tools-empty:visible').waitFor();
  await page.locator('#tool-search').fill('利润'); assert.equal(await page.locator('.tool-card[data-tool]:visible').count(), 1);
  await page.locator('[data-favorite="profit"]').click();
  await page.locator('#tool-search').fill(''); await page.locator('[data-filter="favorites"]').click();
  assert.equal(await page.locator('.tool-card[data-tool]:visible').count(), 1);
  await page.reload(); assert.equal(await page.locator('[data-favorite="profit"]').getAttribute('aria-pressed'), 'true');
  console.log('PASS tool search, categories, favorites and persistence');
  // No AI calls or fake output. Prompt and request export must match the inputs.
  await go('article');
  await fill('article-form', { topic: 'AI 效率', audience: '创业者', length: 1200, keywords: '不要编造数据' });
  await page.locator('#article-form button[type="submit"]').click();
  assert.match(await page.locator('#article-output').inputValue(), /AI 效率/);
  assert.equal(await page.getByRole('button', { name: '生成文章（未接入 API）' }).isDisabled(), true);
  await download(page.locator('[data-request="article"]'), body => { const r = JSON.parse(body); assert.equal(r.tool, 'article'); assert.equal(r.parameters.length, '1200'); assert.match(r.messages[0].content, /创业者/); });
  await page.locator('#article-form [name="topic"]').fill('更改主题'); assert.equal(await page.locator('#article-output').inputValue(), '');
  await go('title');
  await fill('title-form', { product: '保温杯', sellingPoints: '500ml，防漏', keywords: '通勤', count: 3, maxLength: 40 });
  await page.locator('#title-form button[type="submit"]').click();
  assert.match(await page.locator('#title-output').inputValue(), /3 条.*40 个字符/);
  assert.equal(await page.getByRole('button', { name: '生成标题（未接入 API）' }).isDisabled(), true);
  await download(page.locator('[data-request="title"]'), body => { assert.equal(JSON.parse(body).parameters.product, '保温杯'); });
  const apiError = await page.evaluate(() => window.LingganAI.generate({}).catch(e => e.message)); assert.match(apiError, /尚未接入/);
  assert.equal(externalRequests, 0);
  console.log('PASS AI forms, invalidation, JSON exports and no AI requests');
  // Profit, losses, zero costs, fee boundary and rounding.
  await go('profit');
  await fill('profit-form', { cost: 40, price: 100, shipping: 10, rate: 5 });
  await page.locator('#profit-form button[type="submit"]').click();
  assert.equal(await page.locator('#profit-value').innerText(), '¥45.00');
  assert.equal(await page.locator('#profit-margin').innerText(), '45.00%');
  assert.equal(await page.locator('#profit-fee').innerText(), '¥5.00');
  assert.equal(await page.locator('#profit-total').innerText(), '¥55.00');
  assert.equal(await page.locator('#profit-break-even').innerText(), '¥52.63');
  await download(page.locator('#profit-export'), body => assert.match(body, /40.00,100.00,10.00,5.00,5.00,55.00,45.00,45.00,52.63/));
  await fill('profit-form', { cost: 120 }); assert.equal(await page.locator('#profit-value').innerText(), '—');
  await page.locator('#profit-form button[type="submit"]').click();
  assert.equal(await page.locator('#profit-value').innerText(), '¥-35.00');
  await fill('profit-form', { rate: 100 }); await page.locator('#profit-form button[type="submit"]').click();
  assert.match(await page.locator('#profit-break-even').innerText(), /无法保本/);
  await fill('profit-form', { cost: 0, shipping: 0 }); await page.locator('#profit-form button[type="submit"]').click();
  assert.equal(await page.locator('#profit-margin').innerText(), '0.00%');
  assert.match(await page.locator('#profit-break-even').innerText(), /任意正售价/);
  await fill('profit-form', { cost: '0.10', price: '0.30', shipping: '0.10', rate: 0 }); await page.locator('#profit-form button[type="submit"]').click();
  assert.equal(await page.locator('#profit-value').innerText(), '¥0.10');
  await fill('profit-form', { price: 0 }); assert.equal(await page.locator('#profit-form').evaluate(form => form.checkValidity()), false);
  await page.locator('#profit-form button[type="reset"]').click(); assert.equal(await page.locator('#profit-value').innerText(), '—');
  console.log('PASS profit calculations, losses, boundaries, validation and CSV export');
  // All local text options and literal replacement with Unicode.
  await go('text');
  await page.locator('#text-input').fill('  Apple  \n\nApple\n banana \nBANANA\n😀');
  await page.locator('[name="dedupe"]').check(); await page.locator('[name="number"]').check();
  await page.locator('[name="letterCase"]').selectOption('upper');
  await page.locator('#text-form button[type="submit"]').click();
  assert.equal(await page.locator('#text-output').inputValue(), '1. APPLE\n2. BANANA\n3. 😀');
  await download(page.locator('#text-export'), body => assert.equal(body, '1. APPLE\n2. BANANA\n3. 😀'));
  await page.locator('#text-form button[type="reset"]').click();
  await page.locator('#text-input').fill('x.*x\nx.*x');
  await page.locator('[name="find"]').fill('.*'); await page.locator('[name="replacement"]').fill('$&');
  await page.locator('#text-form button[type="submit"]').click(); assert.equal(await page.locator('#text-output').inputValue(), 'x$&x\nx$&x');
  await page.locator('[name="blank"]').uncheck(); await page.locator('[name="trim"]').uncheck();
  await page.locator('[name="find"]').fill(''); await page.locator('#text-input').fill(' A \n\nA');
  await page.locator('[name="letterCase"]').selectOption('lower'); await page.locator('#text-form button[type="submit"]').click();
  assert.equal(await page.locator('#text-output').inputValue(), ' a \n\na');
  await page.locator('#text-form button[type="reset"]').click(); assert.equal(await page.locator('#text-output').inputValue(), '');
  console.log('PASS text pipeline, literal replacement, Unicode, reset and TXT export');
  // Prompt CRUD, XSS-safe output, backup import/export, duplicate and invalid import.
  await go('prompts');
  assert.equal(await page.locator('.prompt-card').count(), 0);
  await fill('prompt-form', { name: '文章助手', content: '<img src=x onerror="window.xss=true">\n请润色文章' });
  await page.locator('#prompt-form button[type="submit"]').click();
  assert.equal(await page.locator('.prompt-card').count(), 1); assert.equal(await page.evaluate(() => !!window.xss), false);
  const backup = await download(page.locator('#prompt-export'), body => { assert.equal(JSON.parse(body).prompts.length, 1); return body; });
  await page.locator('[data-action="edit"]').click(); await page.locator('#prompt-form [name="name"]').fill('修改后的助手');
  await page.locator('#prompt-form button[type="submit"]').click(); assert.equal(await page.locator('.prompt-card h3').innerText(), '修改后的助手');
  await page.reload(); assert.equal(await page.locator('.prompt-card h3').innerText(), '修改后的助手');
  await page.locator('#prompt-search').fill('不存在'); assert.equal(await page.locator('.prompt-card').count(), 0);
  await page.locator('#prompt-search').fill(''); await page.locator('#prompt-category').selectOption('电商'); assert.equal(await page.locator('.prompt-card').count(), 0);
  await page.locator('#prompt-category').selectOption('all');
  await page.locator('#prompt-import').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.waitForFunction(() => document.querySelectorAll('.prompt-card').length === 2);
  await page.locator('#prompt-import').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('已导入 0 条'));
  await page.locator('#prompt-import').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{nope') });
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('导入失败'));
  assert.equal(await page.locator('.prompt-card').count(), 2);
  page.once('dialog', dialog => dialog.accept()); await page.locator('[data-action="delete"]').first().click(); assert.equal(await page.locator('.prompt-card').count(), 1);
  console.log('PASS prompt CRUD, safe rendering, persistence, search and JSON import/export');
  // Profile and truthful stats.
  await go('account'); assert.equal(await page.locator('#account-prompts').innerText(), '1'); assert.equal(await page.locator('#account-favorites').innerText(), '1');
  await fill('profile-form', { name: '小林' }); await page.locator('#profile-form [name="role"]').selectOption('开发者'); await page.locator('#profile-form button').click();
  await page.reload(); assert.equal(await page.locator('#profile-form [name="name"]').inputValue(), '小林');
  assert.equal(await page.locator('.avatar').innerText(), '小');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await go('prompts'); await page.locator('[data-action="copy"]').click(); assert.match(await page.evaluate(() => navigator.clipboard.readText()), /润色文章/);
  // Responsive routes, overflow, mobile menu, and anchor targets.
  for (const width of [1440, 1024, 768, 720, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['home', 'article', 'title', 'profit', 'text', 'prompts', 'account']) {
      await go(route);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow ${width}px / ${route}`);
    }
    if (width <= 720) {
      await page.locator('.menu-toggle').click(); assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('Escape'); assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
      await page.locator('.menu-toggle').click(); await page.locator('[data-route="profit"]').click();
      await page.locator('[data-page="profit"]:visible').waitFor(); assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
    }
    console.log(`PASS ${width}px all 7 routes and mobile navigation`);
  }
  await page.setViewportSize({width:1440,height:1100}); await go('home');
  const links = await page.locator('a').evaluateAll(nodes => nodes.map(a => a.getAttribute('href')));
  const routes = ['home','article','title','profit','text','prompts','account','tools','main'];
  assert.ok(links.every(href => href?.startsWith('https://github.com/') || (href?.startsWith('#') && routes.includes(href.slice(1)))));
  await page.goto(`${base}/#invalid`); await page.waitForURL('**/#home');
  await page.goto(`${base}/#tools`); await page.locator('#tools').waitFor(); assert.equal(await page.locator('[data-page="home"]').isVisible(), true);
  await go('account'); page.once('dialog', dialog => dialog.dismiss()); await page.locator('#clear-data').click(); assert.equal(await page.locator('#account-prompts').innerText(), '1');
  page.once('dialog', dialog => dialog.accept()); await page.locator('#clear-data').click();
  assert.equal(await page.locator('#account-prompts').innerText(), '0'); assert.equal(await page.locator('#account-favorites').innerText(), '0');
  await page.reload(); assert.equal(await page.locator('#account-prompts').innerText(), '0');
  console.log('PASS clipboard, profile, links, hash routing, clear-data confirm/cancel');
  // Denied storage: tools remain functional, warning prevents persistence claim.
  const denied = await browser.newContext();
  await denied.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage denied'); } }); });
  const deniedPage = await denied.newPage(); await deniedPage.goto(`${base}/#profit`);
  assert.equal(await deniedPage.locator('#storage-warning').isVisible(), true);
  await deniedPage.locator('[name="cost"]').fill('40'); await deniedPage.locator('[name="price"]').fill('100'); await deniedPage.locator('[name="shipping"]').fill('10'); await deniedPage.locator('[name="rate"]').fill('5');
  await deniedPage.locator('#profit-form button[type="submit"]').click(); assert.equal(await deniedPage.locator('#profit-value').innerText(), '¥45.00');
  await denied.close();
  assert.deepEqual(errors, []); assert.equal(externalRequests, 0);
  console.log('PASS storage denial resilience, no browser/resource errors or external AI calls');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
