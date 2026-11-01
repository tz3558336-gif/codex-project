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
  assert.equal(await page.locator('.tool-card[data-tool]:visible').count(), 6);
  await page.getByRole('button', { name: '电商工具', exact: true }).click();
  assert.equal(await page.locator('.tool-card[data-tool]:visible').count(), 3);
  await page.locator('[data-filter="all"]').click();
  await page.locator('#tool-search').fill('不存在'); await page.locator('#tools-empty:visible').waitFor();
  await page.locator('#tool-search').fill('利润'); assert.equal(await page.locator('.tool-card[data-tool]:visible').count(), 2);
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
  // Batch analyzer: live calculations, invalid drafts, aggregates, persistence and CSV.
  await go('batch-profit');
  const workspaceBeforeBatch = await page.evaluate(() => localStorage.getItem('linggan-workspace-v1'));
  const batchRow = index => page.locator('.batch-row').nth(index);
  const addBatch = async values => {
    await page.locator('#batch-add').click(); const row = page.locator('.batch-row').last();
    for (const [key, value] of Object.entries(values)) await row.locator(`[data-field="${key}"]`).fill(String(value));
  };
  const result = async (index, key) => batchRow(index).locator(`[data-result="${key}"]`).innerText();
  await addBatch({ name: '商品A', cost: 40, price: 100, shipping: 10, rate: 5 });
  assert.equal(await result(0, 'profit'), '¥45.00'); assert.equal(await result(0, 'margin'), '45.00%');
  assert.equal(await result(0, 'fee'), '¥5.00'); assert.equal(await result(0, 'breakEven'), '¥52.63');
  await addBatch({ name: '亏损商品', cost: 120, price: 100, shipping: 10, rate: 5 });
  assert.equal(await result(1, 'profit'), '¥-35.00'); assert.equal(await result(1, 'margin'), '-35.00%');
  await addBatch({ name: '零费率', cost: 10, price: 20, shipping: 2, rate: 0 });
  assert.equal(await result(2, 'profit'), '¥8.00'); assert.equal(await result(2, 'fee'), '¥0.00'); assert.equal(await result(2, 'breakEven'), '¥12.00');
  await addBatch({ name: '百分百费率', cost: 10, price: 20, shipping: 2, rate: 100 });
  assert.equal(await result(3, 'profit'), '¥-12.00'); assert.match(await result(3, 'breakEven'), /无法保本/);
  assert.equal(await page.locator('#batch-total').innerText(), '¥6.00');
  assert.equal(await page.locator('#batch-loss-count').innerText(), '2'); assert.equal(await page.locator('.batch-row-loss').count(), 2);
  assert.equal(await page.locator('#batch-best').innerText(), '商品A');
  await addBatch({ name: '零成本百分百', cost: 0, price: 20, shipping: 0, rate: 100 });
  assert.equal(await result(4, 'profit'), '¥0.00'); assert.match(await result(4, 'breakEven'), /任意正售价均保本/);
  await addBatch({ name: '并列最高', cost: 40, price: 100, shipping: 10, rate: 5 });
  assert.match(await page.locator('#batch-best').innerText(), /商品A、并列最高/);
  await page.locator('[data-batch-delete]').last().click(); assert.equal(await page.locator('#batch-best').innerText(), '商品A');
  await page.locator('#batch-add').click(); assert.equal(await page.locator('#batch-export').isDisabled(), true);
  assert.match(await page.locator('#batch-count').innerText(), /5 \/ 6 行有效/); assert.equal(await page.locator('#batch-total').innerText(), '¥6.00');
  await page.locator('[data-batch-delete]').last().click();
  for (const [key, value] of [['price','0'],['cost','-1'],['rate','101'],['rate','NaN'],['rate','Infinity'],['cost','1000000001'],['rate','1e2'],['cost','0.001'],['name','   ']]) {
    const input = batchRow(0).locator(`[data-field="${key}"]`); const original = await input.inputValue();
    await input.fill(value); assert.equal(await result(0, 'profit'), '—'); assert.equal(await input.getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('#batch-export').isDisabled(), true); await input.fill(original);
  }
  await batchRow(0).locator('[data-field="name"]').fill('=SUM(1,2) "商品"');
  await page.reload(); assert.equal(await page.locator('.batch-row').count(), 5); assert.equal(await page.locator('#batch-total').innerText(), '¥6.00');
  assert.equal(await batchRow(0).locator('[data-field="name"]').inputValue(), '=SUM(1,2) "商品"');
  // Parse the emitted CSV rather than merely checking that a download happened.
  const parseCsv = body => {
    const rows = []; let row = [], cell = '', quoted = false;
    const input = body.replace(/^\uFEFF/, '');
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (c === '"') { if (quoted && input[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
      else if (!quoted && c === ',') { row.push(cell); cell = ''; }
      else if (!quoted && c === '\r' && input[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
      else cell += c;
    }
    return rows;
  };
  await download(page.locator('#batch-export'), body => {
    const rows = parseCsv(body); assert.equal(rows.length, 7); assert.ok(rows.every(row => row.length === 10));
    assert.equal(rows[1][0], '\'=SUM(1,2) "商品"'); assert.equal(rows[1][5], '45.00'); assert.equal(rows[1][8], '52.63');
    assert.equal(rows[2][9], '亏损'); assert.match(rows[4][8], /无法保本/); assert.match(rows[5][8], /任意正售价/); assert.equal(rows[6][5], '6.00');
    assert.ok(!body.includes('NaN')); assert.ok(!body.includes('Infinity'));
  });
  page.once('dialog', dialog => dialog.dismiss()); await page.locator('#batch-clear').click(); assert.equal(await page.locator('.batch-row').count(), 5);
  page.once('dialog', dialog => dialog.accept()); await page.locator('#batch-clear').click();
  assert.equal(await page.locator('.batch-row').count(), 0); assert.equal(await page.locator('#batch-total').innerText(), '—');
  assert.equal(await page.evaluate(() => localStorage.getItem('linggan-workspace-v1')), workspaceBeforeBatch);
  await page.reload(); assert.equal(await page.locator('.batch-row').count(), 0);
  await addBatch({ name: '小数精度', cost: '0.10', price: '0.30', shipping: '0.10', rate: 0 });
  assert.equal(await result(0, 'profit'), '¥0.10');
  await batchRow(0).locator('[data-field="cost"]').fill(''); await page.reload();
  assert.equal(await batchRow(0).locator('[data-field="cost"]').inputValue(), ''); assert.equal(await page.locator('#batch-export').isDisabled(), true);
  await batchRow(0).locator('[data-field="cost"]').fill('0.10');
  // Keep a filled row through every viewport test below.
  await go('home'); await page.locator('[data-filter="all"]').click();
  await page.locator('[data-favorite="batch-profit"]').click(); await go('account');
  await page.locator('#account-favorite-list a[href="#batch-profit"]').waitFor();
  await go('home'); await page.locator('[data-favorite="batch-profit"]').click();
  console.log('PASS batch live profits, losses, zero/100% fee, ties, validation, CSV safety, draft persistence and isolated clearing');

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
    for (const route of ['home', 'article', 'title', 'profit', 'batch-profit', 'text', 'prompts', 'account']) {
      await go(route);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow ${width}px / ${route}`);
    }
    if (width <= 720) {
      await page.locator('.menu-toggle').click(); assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('Escape'); assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
      await page.locator('.menu-toggle').click(); await page.locator('[data-route="profit"]').click();
      await page.locator('[data-page="profit"]:visible').waitFor(); assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
    }
    console.log(`PASS ${width}px all 8 routes and mobile navigation`);
  }
  await page.setViewportSize({width:1440,height:1100}); await go('home');
  const links = await page.locator('a').evaluateAll(nodes => nodes.map(a => a.getAttribute('href')));
  const routes = ['home','article','title','profit','batch-profit','text','prompts','account','tools','main'];
  assert.ok(links.every(href => href?.startsWith('https://github.com/') || (href?.startsWith('#') && routes.includes(href.slice(1)))));
  await page.goto(`${base}/#invalid`); await page.waitForURL('**/#home');
  await page.goto(`${base}/#tools`); await page.locator('#tools').waitFor(); assert.equal(await page.locator('[data-page="home"]').isVisible(), true);
  await go('account'); page.once('dialog', dialog => dialog.dismiss()); await page.locator('#clear-data').click(); assert.equal(await page.locator('#account-prompts').innerText(), '1');
  page.once('dialog', dialog => dialog.accept()); await page.locator('#clear-data').click();
  assert.equal(await page.locator('#account-prompts').innerText(), '0'); assert.equal(await page.locator('#account-favorites').innerText(), '0');
  assert.equal(await page.locator('.batch-row').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('linggan-batch-profit-v1')), null);
  await page.reload(); assert.equal(await page.locator('#account-prompts').innerText(), '0');
  console.log('PASS clipboard, profile, links, hash routing, clear-data confirm/cancel');
  // Denied storage: tools remain functional, warning prevents persistence claim.
  const denied = await browser.newContext();
  await denied.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage denied'); } }); });
  const deniedPage = await denied.newPage(); await deniedPage.goto(`${base}/#profit`);
  assert.equal(await deniedPage.locator('#storage-warning').isVisible(), true);
  await deniedPage.locator('[name="cost"]').fill('40'); await deniedPage.locator('[name="price"]').fill('100'); await deniedPage.locator('[name="shipping"]').fill('10'); await deniedPage.locator('[name="rate"]').fill('5');
  await deniedPage.locator('#profit-form button[type="submit"]').click(); assert.equal(await deniedPage.locator('#profit-value').innerText(), '¥45.00');
  await deniedPage.goto(`${base}/#batch-profit`);
  assert.equal(await deniedPage.locator('#batch-warning').isVisible(), true);
  await deniedPage.locator('#batch-add').click();
  for (const [key, value] of Object.entries({name:'离线商品', cost:'40', price:'100', shipping:'10', rate:'5'})) await deniedPage.locator(`.batch-row [data-field="${key}"]`).fill(value);
  assert.equal(await deniedPage.locator('[data-result="profit"]').innerText(), '¥45.00');
  assert.match(await deniedPage.locator('#batch-save-status').innerText(), /尚未持久保存/);
  await denied.close();
  // Independent edge cases: all-loss ranking, 99.99%, large values and corrupt/quota storage.
  const edgeContext = await browser.newContext();
  const edgePage = await edgeContext.newPage();
  await edgePage.goto(`${base}/#batch-profit`);
  await edgePage.evaluate(() => localStorage.setItem('linggan-batch-profit-v1', JSON.stringify({version:1, rows:[
    {name:'亏损较多',cost:'10',price:'5',shipping:'0',rate:'0'},
    {name:'亏损较少',cost:'6',price:'5',shipping:'0',rate:'0'}
  ]})));
  await edgePage.reload();
  assert.equal(await edgePage.locator('#batch-best').innerText(), '亏损较少');
  assert.match(await edgePage.locator('#batch-best-profit').innerText(), /全部有效商品均亏损/);
  assert.equal(await edgePage.locator('#batch-total').innerText(), '¥-6.00');
  const edgeRow = edgePage.locator('.batch-row').last();
  await edgeRow.locator('[data-field="rate"]').fill('99.99');
  assert.equal(await edgeRow.locator('[data-result="breakEven"]').innerText(), '¥60,000.00');
  for (const key of ['cost','price','shipping']) await edgeRow.locator(`[data-field="${key}"]`).fill('1000000000');
  assert.equal(await edgeRow.locator('[data-result="breakEven"]').innerText(), '¥20,000,000,000,000.00');
  assert.ok(!/NaN|Infinity/.test(await edgePage.locator('.batch-summary').innerText()));
  await edgePage.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key,value) { if(key==='linggan-batch-profit-v1') throw new DOMException('Full','QuotaExceededError'); return original.call(this,key,value); };
  });
  await edgeRow.locator('[data-field="name"]').fill('配额不足时的修改');
  assert.equal(await edgePage.locator('#batch-warning').isVisible(), true);
  assert.match(await edgePage.locator('#batch-save-status').innerText(), /尚未持久保存/);
  await edgeContext.close();
  const corruptContext = await browser.newContext();
  const corruptPage = await corruptContext.newPage();
  await corruptPage.goto(`${base}/#batch-profit`);
  await corruptPage.evaluate(() => localStorage.setItem('linggan-batch-profit-v1', '{broken'));
  await corruptPage.reload();
  assert.equal(await corruptPage.locator('#batch-warning').isVisible(), true);
  await corruptPage.locator('#batch-add').click();
  assert.equal(await corruptPage.evaluate(() => localStorage.getItem('linggan-batch-profit-v1')), '{broken');
  corruptPage.once('dialog', dialog => dialog.accept()); await corruptPage.locator('#batch-clear').click();
  await corruptPage.locator('#batch-add').click();
  assert.notEqual(await corruptPage.evaluate(() => localStorage.getItem('linggan-batch-profit-v1')), '{broken');
  assert.equal(await corruptPage.locator('#batch-warning').isVisible(), false);
  await corruptContext.close();
  console.log('PASS all-loss ranking, 99.99% fee, max amounts, storage quota and corrupted-data recovery');

  assert.deepEqual(errors, []); assert.equal(externalRequests, 0);
  console.log('PASS storage denial resilience, no browser/resource errors or external AI calls');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
