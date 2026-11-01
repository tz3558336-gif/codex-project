'use strict';
const assert = require('node:assert/strict');

module.exports = async function testProfitHistory(browser, base) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage(); const errors = [];
  context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
  page.on('pageerror', error => errors.push(error.message));
  const go = async route => { await page.goto(`${base}/#${route}`); await page.locator(`[data-page="${route}"]:visible`).waitFor(); };
  const add = async values => {
    await page.locator('#batch-add').click(); const row = page.locator('.batch-row').last();
    for (const [key, value] of Object.entries(values)) await row.locator(`[data-field="${key}"]`).fill(String(value));
  };
  const records = () => page.evaluate(() => JSON.parse(localStorage.getItem(historyStorageKey))?.records || []);
  const batch = () => page.evaluate(() => localStorage.getItem(batchStorageKey));
  const valid = { name: '<img src=x onerror="window.historyXss=true">', cost: '40', price: '100', shipping: '10', rate: '5' };
  await go('batch-profit'); assert.equal(await page.locator('#batch-save-history').isDisabled(), true);
  await add(valid);
  await add({ name: '亏损商品', cost: '80', price: '60', shipping: '8', rate: '5' });
  const originalBatch = await batch();
  await page.locator('#batch-save-history').click();
  const saved = (await records())[0];
  assert.equal(saved.productCount, 2); assert.equal(saved.totalProfit, 14); assert.equal(saved.rows[0].name, valid.name);
  assert.ok(Number.isFinite(Date.parse(saved.createdAt))); assert.equal(await batch(), originalBatch);
  const projectKey = await page.evaluate(() => historyStorageKey);
  await page.goto(`${base}/index.html#history`);
  assert.equal(await page.evaluate(() => historyStorageKey), projectKey);
  assert.equal(await page.locator('.history-card').count(), 1);
  await go('batch-profit');
  await page.locator('.batch-row').first().locator('[data-field="cost"]').fill('90');
  assert.equal((await records())[0].rows[0].cost, '40');
  await go('history'); assert.equal(await page.locator('.history-card').count(), 1);
  assert.equal(await page.locator('time').getAttribute('datetime'), saved.createdAt);
  await page.locator('[data-history-action="view"]').click();
  assert.equal(await page.locator('.history-product').count(), 2);
  assert.equal(await page.locator('#history-detail img').count(), 0); assert.equal(await page.evaluate(() => !!window.historyXss), false);
  assert.match(await page.locator('#history-detail-summary').innerText(), /14.00/);
  assert.match(await page.locator('#history-detail-items').innerText(), /45.00%/);
  assert.match(await page.locator('#history-detail-items').innerText(), /52.63/);
  assert.equal(await page.locator('.history-loss').count(), 1);
  await page.reload(); assert.equal(await page.locator('.history-card').count(), 1);
  page.once('dialog', dialog => dialog.dismiss()); await page.locator('[data-history-action="restore"]').click();
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem(batchStorageKey)))).rows[0].cost, '90');
  page.once('dialog', dialog => dialog.accept()); await page.locator('[data-history-action="restore"]').click();
  await page.locator('[data-page="batch-profit"]:visible').waitFor();
  assert.equal(await page.locator('.batch-row').first().locator('[data-field="cost"]').inputValue(), '40');
  assert.equal(await page.locator('#batch-total').innerText(), '¥14.00'); assert.equal((await records()).length, 1);
  const dlPromise = page.waitForEvent('download'); await page.locator('#batch-export').click();
  const dl = await dlPromise; assert.equal(await dl.failure(), null);
  const stream = await dl.createReadStream(); const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  assert.match(Buffer.concat(chunks).toString('utf8'), /"45.00"/);
  await page.reload(); assert.equal(await page.locator('#batch-total').innerText(), '¥14.00');
  await page.locator('#batch-save-history').click(); assert.equal((await records()).length, 2);
  await page.locator('.batch-row').last().locator('[data-field="price"]').fill('0');
  assert.equal(await page.locator('#batch-save-history').isDisabled(), true);
  await page.locator('.batch-row').last().locator('[data-field="price"]').fill('60');
  await go('history');
  page.once('dialog', dialog => dialog.dismiss()); await page.locator('[data-history-action="delete"]').first().click();
  assert.equal((await records()).length, 2);
  page.once('dialog', dialog => dialog.accept()); await page.locator('[data-history-action="delete"]').first().click();
  assert.equal(await page.locator('.history-card').count(), 1);
  await page.evaluate(() => localStorage.setItem('history-unrelated', 'retain'));
  const beforeClear = await batch();
  page.once('dialog', dialog => dialog.dismiss()); await page.locator('#history-clear').click(); assert.equal((await records()).length, 1);
  page.once('dialog', dialog => dialog.accept()); await page.locator('#history-clear').click(); assert.equal((await records()).length, 0);
  assert.equal(await batch(), beforeClear); assert.equal(await page.evaluate(() => localStorage.getItem('history-unrelated')), 'retain');
  await go('batch-profit'); await page.locator('#batch-save-history').click();
  await go('history'); await page.locator('[data-history-action="view"]').click();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `history overflow ${width}`);
    assert.equal(await page.locator('#history-detail').isVisible(), true);
  }
  await page.setViewportSize({width:1440,height:900});
  // Re-read before mutations and refresh other tabs through the storage event.
  const other = await context.newPage(); await other.goto(`${base}/#history`);
  await go('batch-profit'); await page.locator('#batch-save-history').click();
  await other.waitForFunction(() => document.querySelectorAll('.history-card').length === 2);
  await other.close();
  // A failed history write does not create a phantom successful record.
  await page.evaluate(() => {
    const native = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if(key === historyStorageKey) throw new DOMException('quota','QuotaExceededError'); return native.call(this,key,value); };
  });
  await page.locator('#batch-save-history').click();
  assert.equal((await records()).length, 2); assert.match(await page.locator('#toast').innerText(), /未保存/);
  await go('history'); // load persisted data; no in-memory fake record is shown.
  assert.equal(await page.locator('.history-card').count(), 2);
  // Restore must leave the draft unchanged if its own auto-save fails.
  await page.evaluate(() => {
    const native = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if(key === batchStorageKey) throw new DOMException('quota','QuotaExceededError'); return native.call(this,key,value); };
  });
  const beforeFailedRestore = await batch(); page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-history-action="restore"]').first().click();
  assert.equal(await batch(), beforeFailedRestore); assert.match(await page.locator('#toast').innerText(), /恢复未完成/);
  await page.reload();
  // Structural, arithmetic and date corruption must not be silently overwritten.
  const sample = (await records())[0];
  for (const corrupt of ['{broken', JSON.stringify({version:1,records:[{...sample,totalProfit:999}]}),
    JSON.stringify({version:1,records:[{...sample,createdAt:'not-a-date'}]}),
    JSON.stringify({version:1,records:[{...sample,productCount:999}]}),
    JSON.stringify({version:1,records:[{...sample,rows:[{...sample.rows[0],price:'0'}]}]})]) {
    await page.evaluate(raw => localStorage.setItem(historyStorageKey, raw), corrupt);
    await go('history'); await page.reload();
    assert.equal(await page.locator('#history-warning').isVisible(), true);
    await go('batch-profit'); await page.locator('#batch-save-history').click();
    assert.equal(await page.evaluate(() => localStorage.getItem(historyStorageKey)), corrupt);
    await go('history'); page.once('dialog', dialog => dialog.accept()); await page.locator('#history-clear').click();
    assert.equal(await page.locator('#history-warning').isVisible(), false);
  }
  // Retention is explicit: the 101st save never evicts a snapshot.
  await page.evaluate(record => localStorage.setItem(historyStorageKey, JSON.stringify({version:1,records:Array.from({length:100},(_,i)=>({...record,id:`history-${i}`}))})), sample);
  await go('batch-profit'); await page.locator('#batch-save-history').click();
  assert.equal((await records()).length, 100); assert.match(await page.locator('#toast').innerText(), /已达 100/);
  // A normal platform-wide clear removes history, but a history-only clear never clears the draft.
  await go('account'); page.once('dialog', dialog => dialog.accept()); await page.locator('#clear-data').click();
  assert.equal(await page.evaluate(() => localStorage.getItem(historyStorageKey)), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('history-unrelated')), 'retain');
  await go('batch-profit');
  await add({name:'零费率记录',cost:'10',price:'20',shipping:'2',rate:'0'});
  await add({name:'100%费率记录',cost:'10',price:'20',shipping:'2',rate:'100'});
  await page.locator('#batch-save-history').click();
  assert.equal((await records())[0].totalProfit, -4);
  await go('history'); await page.locator('[data-history-action="view"]').click();
  assert.match(await page.locator('#history-detail-items').innerText(), /无法保本/);
  assert.ok(!/NaN|Infinity/.test(await page.locator('#history-detail-items').innerText()));
  await go('batch-profit'); page.once('dialog', dialog => dialog.accept()); await page.locator('#batch-clear').click();
  await go('history'); await page.locator('[data-history-action="restore"]').click();
  await page.locator('[data-page="batch-profit"]:visible').waitFor();
  assert.equal(await page.locator('#batch-total').innerText(), '¥-4.00');
  assert.deepEqual(errors, []);
  await context.close();
  const denied = await browser.newContext();
  await denied.addInitScript(() => { Object.defineProperty(window,'localStorage',{get(){throw new Error('denied');}}); });
  const deniedPage = await denied.newPage(); await deniedPage.goto(`${base}/#history`);
  assert.equal(await deniedPage.locator('#history-warning').isVisible(), true);
  await denied.close();
  console.log('PASS history snapshots, details, restoration/CSV, immutable data, deletion, persistence, invalid data, quota, XSS, 4 viewports and old-tool isolation');
};
