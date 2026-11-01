'use strict';
// Static Pages never stores API keys. Wire a trusted backend into this adapter later.
window.LingganAI = Object.freeze({
  endpoint: '',
  async generate(request, { signal } = {}) {
    if (!this.endpoint) throw new Error('尚未接入 AI API。请先配置可信后端。');
    const response = await fetch(this.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request), signal
    });
    if (!response.ok) throw new Error(`AI 服务请求失败（${response.status}）`);
    const data = await response.json();
    if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('AI 服务未返回有效文本');
    return data.text;
  }
});
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const toolNames = { article: 'AI 文章生成器', title: '电商标题生成器', profit: '商品利润计算器', 'batch-profit': '批量商品利润分析器', text: '批量文本处理', prompts: 'AI 提示词管理' };
const categories = ['写作', '电商', '效率', '其他'];
const storageKey = 'linggan-workspace-v1';
const emptyData = () => ({ prompts: [], favorites: [], profile: { name: '', role: '内容创作者' } });
let state = emptyData();
let storageBroken = false;
let toastTimer;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000);
}
function storageWarning() {
  storageBroken = true;
  $('#storage-warning').hidden = false;
}
function isPrompt(item) {
  return item && typeof item === 'object' && typeof item.name === 'string' && !!item.name.trim() && item.name.length <= 100 &&
    typeof item.content === 'string' && !!item.content.trim() && item.content.length <= 20000 && categories.includes(item.category);
}
function uid() { return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
try {
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    const saved = JSON.parse(raw);
    if (!saved || !Array.isArray(saved.prompts) || !Array.isArray(saved.favorites) || saved.prompts.length > 200 || !saved.prompts.every(isPrompt)) throw new Error('Invalid local data');
    state.prompts = saved.prompts.map(item => ({ id: uid(), name: item.name, category: item.category, content: item.content }));
    state.favorites = [...new Set(saved.favorites.filter(id => Object.hasOwn(toolNames, id)))];
    if (saved.profile && typeof saved.profile.name === 'string') state.profile.name = saved.profile.name.slice(0, 40);
    if (['内容创作者', '电商经营者', '开发者', '其他'].includes(saved.profile?.role)) state.profile.role = saved.profile.role;
  }
} catch { storageWarning(); }
function save() {
  // Never overwrite malformed/unreadable existing storage; export remains available.
  if (storageBroken) return false;
  try { localStorage.setItem(storageKey, JSON.stringify(state)); return true; }
  catch { storageWarning(); return false; }
}
function savedMessage(message) { toast(storageBroken ? `${message}（仅本次页面有效，请导出备份）` : message); }
function download(filename, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copy(value, fallback) {
  if (!value) { toast('还没有可复制的内容'); return; }
  try { await navigator.clipboard.writeText(value); toast('已复制'); }
  catch {
    if (fallback) { fallback.focus(); fallback.select(); }
    toast('剪贴板不可用，请选中文本后手动复制');
  }
}
$$('[data-copy]').forEach(button => button.addEventListener('click', () => { const input = document.getElementById(button.dataset.copy); copy(input.value, input); }));
const menu = $('.menu-toggle');
function closeMenu() { $('#sidebar').classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', '打开工具导航'); }
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  $('#sidebar').classList.toggle('open', open); menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? '关闭工具导航' : '打开工具导航');
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); } });
document.addEventListener('click', event => { if (!event.target.closest('#sidebar, .menu-toggle')) closeMenu(); });
window.matchMedia('(min-width: 721px)').addEventListener('change', closeMenu);
const pageNames = { home: '工具广场', ...toolNames, account: '用户中心' };
function route() {
  let target = location.hash.slice(1) || 'home';
  const toolsAnchor = target === 'tools';
  if (toolsAnchor) target = 'home';
  if (!Object.hasOwn(pageNames, target)) { location.replace('#home'); return; }
  $$('.page').forEach(page => { page.hidden = page.dataset.page !== target; });
  $$('[data-route]').forEach(link => {
    const active = link.dataset.route === target; link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  $$('.desktop-nav a').forEach(link => { if (link.hash === `#${target}`) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  document.title = `${pageNames[target]} · 灵感 AI`;
  closeMenu(); renderAccount();
  $('#main').focus({ preventScroll: true });
  if (toolsAnchor) $('#tools').scrollIntoView(); else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
let filter = 'all';
function filterTools() {
  const query = $('#tool-search').value.trim().toLowerCase(); let count = 0;
  $$('.tool-card[data-tool]').forEach(card => {
    const categoryMatch = filter === 'all' || (filter === 'favorites' ? state.favorites.includes(card.dataset.tool) : card.dataset.category.split(' ').includes(filter));
    card.hidden = !(categoryMatch && card.dataset.search.toLowerCase().includes(query));
    if (!card.hidden) count++;
  });
  $('.suggestion-card').hidden = filter !== 'all' || !!query;
  $('#tools-empty').hidden = count !== 0;
  $('#tools-status').textContent = `显示 ${count} 个工具`;
}
$$('[data-filter]').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  $$('[data-filter]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  filterTools();
}));
$('#tool-search').addEventListener('input', filterTools);
function renderFavorites() {
  $$('[data-favorite]').forEach(button => {
    const active = state.favorites.includes(button.dataset.favorite);
    button.textContent = active ? '★' : '☆'; button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', `${active ? '取消收藏' : '收藏'} ${toolNames[button.dataset.favorite]}`);
  }); filterTools(); renderAccount();
}
$$('[data-favorite]').forEach(button => button.addEventListener('click', () => {
  const id = button.dataset.favorite;
  state.favorites = state.favorites.includes(id) ? state.favorites.filter(item => item !== id) : [...state.favorites, id];
  save(); renderFavorites(); savedMessage('收藏已更新');
}));
const aiRequests = {};
for (const tool of ['article', 'title']) {
  const form = $(`#${tool}-form`);
  form.addEventListener('input', () => { delete aiRequests[tool]; $(`#${tool}-output`).value = ''; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    for (const key of Object.keys(values)) values[key] = values[key].trim();
    if ((tool === 'article' && (!values.topic || !values.audience)) || (tool === 'title' && (!values.product || !values.sellingPoints))) { toast('请填写有效内容，不能只有空格'); return; }
    let content;
    if (tool === 'article') {
      content = `请围绕「${values.topic}」撰写一篇约 ${values.length} 字的中文文章。\n目标读者：${values.audience}\n风格：${values.tone}\n补充要求：${values.keywords || '无'}\n请提供清晰标题、引言、分节正文与结尾；避免编造事实、引用与数据，不确定的内容请注明。`;
    } else {
      content = `请为以下商品撰写 ${values.count} 条中文电商标题，每条不超过 ${values.maxLength} 个字符。\n商品：${values.product}\n真实卖点：${values.sellingPoints}\n平台：${values.platform}\n目标人群与关键词：${values.keywords || '无'}\n仅根据已提供的信息写作，不虚构品牌授权、销量、功效或评价，避免绝对化用语；逐行输出。`;
    }
    $(`#${tool}-output`).value = content;
    aiRequests[tool] = { tool, messages: [{ role: 'user', content }], parameters: values };
    toast('已在本地整理提示词，未调用 AI 服务');
  });
}
$$('[data-request]').forEach(button => button.addEventListener('click', () => {
  const request = aiRequests[button.dataset.request];
  if (!request) { toast('请先填写并整理提示词'); return; }
  download(`${button.dataset.request}-request.json`, JSON.stringify(request, null, 2), 'application/json;charset=utf-8');
}));
const money = value => `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
let profitResult = null;
function clearProfit() {
  profitResult = null;
  for (const id of ['value', 'margin', 'fee', 'total', 'break-even']) $(`#profit-${id}`).textContent = '—';
  $('#profit-value').classList.remove('loss'); $('#profit-state').textContent = '等待输入'; $('#profit-export').disabled = true;
}
$('#profit-form').addEventListener('input', clearProfit);
$('#profit-form').addEventListener('reset', clearProfit);
$('#profit-form').addEventListener('submit', event => {
  event.preventDefault();
  const { cost, price, shipping, rate } = Object.fromEntries([...new FormData(event.target)].map(([key, value]) => [key, Number(value)]));
  if (![cost, price, shipping, rate].every(Number.isFinite) || cost < 0 || price <= 0 || shipping < 0 || rate < 0 || rate > 100) { toast('请输入有效金额与 0–100% 的费率'); return; }
  // Retain full precision for calculation; round only for display/export.
  const fee = price * rate / 100;
  const profit = price - cost - shipping - fee;
  const margin = profit / price * 100;
  const total = cost + shipping + fee;
  const breakEven = rate < 100 ? (cost + shipping) / (1 - rate / 100) : null;
  profitResult = { cost, price, shipping, rate, fee, profit, margin, total, breakEven };
  $('#profit-value').textContent = money(profit);
  $('#profit-value').classList.toggle('loss', profit < -1e-8);
  $('#profit-state').textContent = profit < -1e-8 ? '当前为亏损' : profit > 1e-8 ? '当前为盈利' : '刚好保本';
  $('#profit-margin').textContent = `${margin.toFixed(2)}%`;
  $('#profit-fee').textContent = money(fee); $('#profit-total').textContent = money(total);
  $('#profit-break-even').textContent = breakEven === null ? (cost + shipping === 0 ? '任意正售价均保本' : '无法保本（费率 100%）') : money(breakEven);
  $('#profit-export').disabled = false;
});
$('#profit-export').addEventListener('click', () => {
  if (!profitResult) return;
  const r = profitResult;
  download('商品利润计算.csv', `\uFEFF成本,售价,运费,平台费率(%),平台费用,总成本,利润,利润率(%),保本售价\r\n${[r.cost, r.price, r.shipping, r.rate, r.fee, r.total, r.profit, r.margin].map(v => v.toFixed(2)).join(',')},${r.breakEven === null ? '费率100%（详见页面）' : r.breakEven.toFixed(2)}\r\n`, 'text/csv;charset=utf-8');
});
function counts(text) { return `${Array.from(text).length.toLocaleString()} 字符 · ${text ? text.split(/\r\n|\r|\n/).length.toLocaleString() : 0} 行`; }
$('#text-input').addEventListener('input', () => { $('#input-count').textContent = counts($('#text-input').value); $('#text-output').value = ''; $('#output-count').textContent = counts(''); });
$('#text-form').addEventListener('submit', event => {
  event.preventDefault(); const f = event.target.elements; const source = f.source.value;
  if (!source) { toast('请先输入文本'); return; }
  if (source.length > 200000) { toast('文本超过 200,000 个字符，请拆分后处理'); return; }
  let lines = source.replace(/\r\n|\r/g, '\n').split('\n');
  if (f.trim.checked) lines = lines.map(line => line.trim());
  if (f.find.value) lines = lines.map(line => line.split(f.find.value).join(f.replacement.value));
  if (f.letterCase.value !== 'keep') lines = lines.map(line => f.letterCase.value === 'upper' ? line.toUpperCase() : line.toLowerCase());
  if (f.blank.checked) lines = lines.filter(line => line.trim() !== '');
  if (f.dedupe.checked) lines = [...new Set(lines)];
  if (f.number.checked) lines = lines.map((line, index) => `${index + 1}. ${line}`);
  $('#text-output').value = lines.join('\n'); $('#output-count').textContent = counts($('#text-output').value);
  toast('文本已在本地处理完成');
});
$('#text-form').addEventListener('reset', () => { $('#text-output').value = ''; $('#input-count').textContent = counts(''); $('#output-count').textContent = counts(''); });
$('#text-export').addEventListener('click', () => { if (!$('#text-output').value) { toast('没有可下载的结果'); return; } download('处理后的文本.txt', $('#text-output').value); });
function resetPromptForm() { $('#prompt-form-title').textContent = '新建提示词'; $('#prompt-form').elements.id.value = ''; }
$('#prompt-form').addEventListener('reset', resetPromptForm);
function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function renderPrompts() {
  const list = $('#prompt-list'); list.replaceChildren();
  const query = $('#prompt-search').value.trim().toLowerCase(); const category = $('#prompt-category').value;
  const items = state.prompts.filter(item => (category === 'all' || item.category === category) && `${item.name}\n${item.content}`.toLowerCase().includes(query));
  if (!items.length) list.append(element('p', state.prompts.length ? '没有匹配的提示词，试试其他关键词或分类。' : '提示词库还是空的。\n保存第一条提示词，或导入你的 JSON 备份。', 'empty'));
  for (const item of items) {
    const card = element('article', undefined, 'prompt-card'); const heading = element('div', undefined, 'panel-heading');
    heading.append(element('h3', item.name), element('span', item.category, 'badge neutral'));
    const actions = element('div', undefined, 'button-row');
    for (const [action, label] of [['copy', '复制'], ['edit', '编辑'], ['delete', '删除']]) {
      const button = element('button', label, `button ${action === 'delete' ? 'danger' : 'secondary'}`);
      button.type = 'button'; button.dataset.action = action; button.dataset.id = item.id;
      button.setAttribute('aria-label', `${label} ${item.name}`); actions.append(button);
    }
    card.append(heading, element('p', item.content), actions); list.append(card);
  }
  $('#prompt-count').textContent = `显示 ${items.length} 条 / 共 ${state.prompts.length} 条`;
  renderAccount();
}
$('#prompt-search').addEventListener('input', renderPrompts);
$('#prompt-category').addEventListener('change', renderPrompts);
$('#prompt-form').addEventListener('submit', event => {
  event.preventDefault(); const f = event.target.elements;
  const item = { id: f.id.value || uid(), name: f.name.value.trim(), category: f.category.value, content: f.content.value.trim() };
  if (!isPrompt(item)) { toast('名称和内容不能为空或只有空格'); return; }
  const index = state.prompts.findIndex(prompt => prompt.id === item.id);
  if (index === -1 && state.prompts.length >= 200) { toast('最多保存 200 条，请先导出或删除旧条目'); return; }
  if (index >= 0) state.prompts[index] = item; else state.prompts.unshift(item);
  save(); event.target.reset(); renderPrompts(); savedMessage('提示词已保存');
});
$('#prompt-list').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const item = state.prompts.find(prompt => prompt.id === button.dataset.id); if (!item) return;
  if (button.dataset.action === 'copy') copy(item.content);
  if (button.dataset.action === 'edit') {
    const f = $('#prompt-form').elements;
    for (const key of ['id', 'name', 'category', 'content']) f[key].value = item[key];
    $('#prompt-form-title').textContent = '编辑提示词'; f.name.focus();
  }
  if (button.dataset.action === 'delete' && confirm(`确定删除「${item.name}」吗？`)) {
    state.prompts = state.prompts.filter(prompt => prompt.id !== item.id); save();
    if ($('#prompt-form').elements.id.value === item.id) $('#prompt-form').reset();
    renderPrompts(); savedMessage('提示词已删除');
  }
});
$('#prompt-export').addEventListener('click', () => download('灵感AI-提示词备份.json', JSON.stringify({ version: 1, prompts: state.prompts.map(({ name, category, content }) => ({ name, category, content })) }, null, 2), 'application/json;charset=utf-8'));
$('.file-label').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('#prompt-import').click(); } });
$('#prompt-import').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 5000000) throw new Error('文件过大，最多支持 5 MB');
    const parsed = JSON.parse(await file.text());
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.prompts) || !parsed.prompts.every(isPrompt)) throw new Error('备份格式无效，需要 version: 1 与有效 prompts 数组');
    const unique = new Map(state.prompts.map(item => [JSON.stringify([item.name, item.category, item.content]), item]));
    let added = 0;
    for (const item of parsed.prompts) {
      const clean = { name: item.name.trim(), category: item.category, content: item.content.trim() };
      const key = JSON.stringify([clean.name, clean.category, clean.content]);
      if (!unique.has(key)) { unique.set(key, { ...clean, id: uid() }); added++; }
    }
    if (unique.size > 200) throw new Error('导入后将超过 200 条，请先整理已有内容');
    state.prompts = [...unique.values()]; save(); renderPrompts(); savedMessage(`已导入 ${added} 条，重复条目已跳过`);
  } catch (error) { toast(`导入失败：${error instanceof SyntaxError ? '文件不是有效 JSON' : error.message}`); }
  finally { event.target.value = ''; }
});
function renderAccount() {
  $('#account-prompts').textContent = state.prompts.length; $('#account-favorites').textContent = state.favorites.length;
  const list = $('#account-favorite-list'); list.replaceChildren();
  if (!state.favorites.length) list.append(element('p', '还没有收藏工具，点击工具卡片上的星标即可添加。', 'hint'));
  for (const id of state.favorites) { const link = element('a', `${toolNames[id]} ↗`, 'favorite-link'); link.href = `#${id}`; list.append(link); }
  $('.avatar').textContent = state.profile.name ? Array.from(state.profile.name)[0] : '我';
}
$('#profile-form').elements.name.value = state.profile.name;
$('#profile-form').elements.role.value = state.profile.role;
$('#profile-form').addEventListener('submit', event => {
  event.preventDefault(); const name = event.target.elements.name.value.trim();
  if (!name) { toast('请输入显示名称'); return; }
  state.profile = { name, role: event.target.elements.role.value }; save(); renderAccount(); savedMessage('个人资料已保存到本地');
});
$('#clear-data').addEventListener('click', () => {
  if (!confirm('确定清除本平台的全部本地提示词、收藏、个人资料和批量商品分析数据吗？此操作不可撤销，请先导出提示词备份。')) return;
  try { localStorage.removeItem(storageKey); storageBroken = false; $('#storage-warning').hidden = true; } catch { storageWarning(); }
  clearBatchData();
  state = emptyData(); $('#profile-form').reset(); $('#profile-form').elements.name.value = ''; $('#profile-form').elements.role.value = state.profile.role;
  $('#prompt-form').reset(); renderFavorites(); renderPrompts(); savedMessage('平台本地数据已清除');
});
// Batch analysis has its own storage key: legacy workspace data remains compatible.
const batchStorageKey = 'linggan-batch-profit-v1';
const batchFields = [
  ['name', '商品名称', '例如：保温杯'], ['cost', '商品成本（元）', '0.00'],
  ['price', '销售价格（元）', '0.00'], ['shipping', '运费（元）', '0.00'],
  ['rate', '平台费率（%）', '0–100']
];
let batchRows = [];
let batchStorageBroken = false;
function warnBatchStorage() {
  batchStorageBroken = true;
  $('#batch-warning').hidden = false;
  $('#batch-warning').textContent = '本地存储不可用、已满或保存的数据损坏。修改仅保留在本次页面；请及时导出 CSV。损坏的原始数据不会被自动覆盖。';
  $('#batch-save-status').textContent = '尚未持久保存 · 仅本次页面有效';
}
function validBatchDraft(row) {
  return row && batchFields.every(([key]) => typeof row[key] === 'string' && row[key].length <= (key === 'name' ? 100 : 32));
}
try {
  const raw = localStorage.getItem(batchStorageKey);
  if (raw !== null) {
    const saved = JSON.parse(raw);
    if (saved?.version !== 1 || !Array.isArray(saved.rows) || saved.rows.length > 200 || !saved.rows.every(validBatchDraft)) throw new Error('Invalid batch data');
    batchRows = saved.rows.map(row => ({ id: uid(), ...Object.fromEntries(batchFields.map(([key]) => [key, row[key]])) }));
    $('#batch-save-status').textContent = '已恢复此浏览器保存的商品草稿';
  }
} catch { warnBatchStorage(); }
function saveBatch() {
  if (batchStorageBroken) return;
  try {
    localStorage.setItem(batchStorageKey, JSON.stringify({ version: 1, rows: batchRows.map(row => Object.fromEntries(batchFields.map(([key]) => [key, row[key]]))) }));
    $('#batch-save-status').textContent = '商品草稿已自动保存到当前浏览器（含待完善行）';
  } catch { warnBatchStorage(); }
}
function analyzeBatchRow(row) {
  const errors = {};
  if (!row.name.trim() || row.name.length > 100) errors.name = '请填写 1–100 字符的商品名称';
  const values = {};
  for (const [key, label] of batchFields.slice(1)) {
    const raw = row[key].trim();
    const value = Number(raw);
    const max = key === 'rate' ? 100 : 1000000000;
    if (!/^(?:\d+|\d*\.\d{1,2})$/.test(raw) || !Number.isFinite(value) || value < 0 || value > max || (key === 'price' && value === 0)) {
      errors[key] = `${label}须${key === 'price' ? '大于 0 且' : ''}在 0–${max === 100 ? '100' : '10亿元'}范围，最多两位小数`;
    } else { values[key] = Math.round(value * 100); }
  }
  if (Object.keys(errors).length) return { errors };
  const { cost, price, shipping, rate } = values;
  // Cents × fee basis points fit safely in integers under the validated limits.
  // Profit units are millionths of a yuan; compare before display rounding.
  const profitUnits = price * (10000 - rate) - (cost + shipping) * 10000;
  const fee = price * rate / 1000000;
  const profit = profitUnits / 1000000;
  const margin = profitUnits / (price * 10000) * 100;
  const breakEven = rate === 10000 ? null : (cost + shipping) * 100 / (10000 - rate);
  if (![fee, profit, margin].every(Number.isFinite) || (breakEven !== null && !Number.isFinite(breakEven))) return { errors: { price: '金额超出可计算范围' } };
  return { errors, fee, profit, profitUnits, margin, breakEven,
    breakEvenText: breakEven === null ? (cost + shipping === 0 ? '任意正售价均保本' : '无法保本（费率 100%）') : money(breakEven) };
}
function renderBatchRows() {
  const list = $('#batch-rows'); list.replaceChildren();
  batchRows.forEach((row, index) => {
    const card = element('article', undefined, 'panel batch-row'); card.dataset.id = row.id;
    card.setAttribute('aria-label', `商品 ${index + 1}`);
    const heading = element('div', undefined, 'panel-heading');
    heading.append(element('h2', `商品 ${index + 1}`));
    const remove = element('button', '删除商品', 'button danger'); remove.type = 'button'; remove.dataset.batchDelete = row.id;
    remove.setAttribute('aria-label', `删除商品 ${index + 1}`); heading.append(remove);
    const fields = element('div', undefined, 'batch-fields');
    for (const [key, label, placeholder] of batchFields) {
      const field = element('label', label); const input = element('input');
      input.type = 'text'; input.dataset.field = key; input.value = row[key]; input.placeholder = placeholder;
      input.maxLength = key === 'name' ? 100 : 32; input.required = true;
      if (key !== 'name') input.inputMode = 'decimal';
      input.setAttribute('aria-describedby', `batch-error-${row.id}`); field.append(input); fields.append(field);
    }
    const error = element('p', undefined, 'batch-error'); error.id = `batch-error-${row.id}`;
    const results = element('dl', undefined, 'batch-results');
    for (const [key, label] of [['profit', '单件利润'], ['margin', '利润率'], ['fee', '平台费用'], ['breakEven', '保本售价']]) {
      const cell = element('div'); const output = element('dd', '—'); output.dataset.result = key;
      cell.append(element('dt', label), output); results.append(cell);
    }
    const badge = element('span', '', 'badge neutral'); badge.dataset.batchState = '';
    card.append(heading, fields, error, results, badge); list.append(card);
  });
  updateBatch();
}
function updateBatch() {
  const valid = [];
  for (const row of batchRows) {
    const result = analyzeBatchRow(row);
    const card = [...$('#batch-rows').children].find(node => node.dataset.id === row.id);
    const isValid = !Object.keys(result.errors).length;
    for (const input of card.querySelectorAll('[data-field]')) {
      const error = result.errors[input.dataset.field] || '';
      input.setAttribute('aria-invalid', String(!!error)); input.setCustomValidity(error);
    }
    card.querySelector('.batch-error').textContent = Object.values(result.errors).join('；');
    const outputs = { profit: isValid ? money(result.profit) : '—', margin: isValid ? `${result.margin.toFixed(2)}%` : '—', fee: isValid ? money(result.fee) : '—', breakEven: isValid ? result.breakEvenText : '—' };
    for (const [key, value] of Object.entries(outputs)) card.querySelector(`[data-result="${key}"]`).textContent = value;
    const loss = isValid && result.profitUnits < 0;
    card.classList.toggle('batch-row-loss', loss);
    card.querySelector('[data-result="profit"]').classList.toggle('loss', loss);
    card.querySelector('[data-batch-state]').textContent = isValid ? (loss ? '亏损商品' : result.profitUnits > 0 ? '盈利商品' : '刚好保本') : '待完善 · 不计入汇总';
    if (isValid) valid.push({ row, result });
  }
  const total = valid.reduce((sum, item) => sum + item.result.profit, 0);
  $('#batch-total').textContent = valid.length ? money(total) : '—';
  $('#batch-total').classList.toggle('loss', total < 0);
  $('#batch-count').textContent = `${valid.length} / ${batchRows.length} 行有效${batchRows.length > valid.length ? ` · ${batchRows.length - valid.length} 行待完善，未计入` : ''}`;
  $('#batch-loss-count').textContent = valid.filter(item => item.result.profitUnits < 0).length;
  if (valid.length) {
    const bestUnits = Math.max(...valid.map(item => item.result.profitUnits));
    const best = valid.filter(item => item.result.profitUnits === bestUnits);
    $('#batch-best').textContent = best.map(item => item.row.name.trim()).join('、');
    $('#batch-best-profit').textContent = `${money(best[0].result.profit)} / 件${best.length > 1 ? ` · ${best.length} 款并列` : ''}${bestUnits < 0 ? ' · 全部有效商品均亏损' : ''}`;
  } else { $('#batch-best').textContent = '—'; $('#batch-best-profit').textContent = '添加完整有效的商品，开始比较'; }
  $('#batch-export').disabled = !valid.length || valid.length !== batchRows.length;
  $('#batch-clear').disabled = batchRows.length === 0;
  $('#batch-add').disabled = batchRows.length >= 200;
  $('#batch-empty').hidden = batchRows.length !== 0;
}
$('#batch-add').addEventListener('click', () => {
  if (batchRows.length >= 200) return;
  batchRows.push({ id: uid(), name: '', cost: '', price: '', shipping: '', rate: '' });
  renderBatchRows(); saveBatch(); $('#batch-rows').lastElementChild.querySelector('input').focus();
});
$('#batch-rows').addEventListener('input', event => {
  const input = event.target.closest('[data-field]'); if (!input) return;
  const row = batchRows.find(item => item.id === input.closest('.batch-row').dataset.id); if (!row) return;
  row[input.dataset.field] = input.value; updateBatch(); saveBatch();
});
$('#batch-rows').addEventListener('click', event => {
  const button = event.target.closest('[data-batch-delete]'); if (!button) return;
  const index = batchRows.findIndex(item => item.id === button.dataset.batchDelete);
  batchRows = batchRows.filter(item => item.id !== button.dataset.batchDelete); renderBatchRows(); saveBatch();
  const next = $('#batch-rows').children[Math.min(index, batchRows.length - 1)];
  (next?.querySelector('input') || $('#batch-add')).focus(); toast('已删除该商品');
});
function clearBatchData() {
  batchRows = [];
  try { localStorage.removeItem(batchStorageKey); batchStorageBroken = false; $('#batch-warning').hidden = true; $('#batch-save-status').textContent = '分析数据已清空，仅保存在当前浏览器。'; }
  catch { warnBatchStorage(); }
  renderBatchRows();
}
$('#batch-clear').addEventListener('click', () => {
  if (confirm('确定清空全部商品分析数据吗？此操作不可撤销，建议先导出 CSV。')) { clearBatchData(); $('#batch-add').focus(); toast('批量商品分析数据已清空'); }
});
// Quote every CSV field and neutralize spreadsheet formula prefixes in names.
function batchCsvCell(value, userText = false) {
  let text = String(value);
  if (userText && /^[\s\uFEFF]*[=+@\-]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
$('#batch-export').addEventListener('click', () => {
  const analyzed = batchRows.map(row => ({ row, result: analyzeBatchRow(row) }));
  if (!analyzed.length || analyzed.some(item => Object.keys(item.result.errors).length)) { toast('请先完善全部商品数据再导出'); return; }
  const header = ['商品名称', '商品成本(元)', '销售价格(元)', '运费(元)', '平台费率(%)', '单件利润(元)', '利润率(%)', '平台费用(元)', '保本售价(元)', '状态'];
  const records = analyzed.map(({ row, result: r }) => [
    batchCsvCell(row.name.trim(), true), ...['cost', 'price', 'shipping', 'rate'].map(key => batchCsvCell(Number(row[key]).toFixed(2))),
    ...[r.profit, r.margin, r.fee].map(value => batchCsvCell(value.toFixed(2))),
    batchCsvCell(r.breakEven === null ? r.breakEvenText : r.breakEven.toFixed(2)),
    batchCsvCell(r.profitUnits < 0 ? '亏损' : r.profitUnits > 0 ? '盈利' : '保本')
  ].join(','));
  const total = analyzed.reduce((sum, item) => sum + item.result.profit, 0);
  const summary = ['总利润（每种商品各一件）', '', '', '', '', total.toFixed(2), '', '', '', ''].map(value => batchCsvCell(value)).join(',');
  download('批量商品利润分析.csv', `\uFEFF${header.map(value => batchCsvCell(value)).join(',')}\r\n${records.join('\r\n')}\r\n${summary}\r\n`, 'text/csv;charset=utf-8');
});
renderBatchRows();

$('#year').textContent = new Date().getFullYear();
renderFavorites(); renderPrompts(); route();
