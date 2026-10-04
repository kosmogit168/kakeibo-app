'use strict';

/* ---------- Categories ---------- */

const EXPENSE_CATEGORY_GROUPS = {
  '固定費': ['家賃orローン', '電気代', '水道代', '通信費(携帯)', '通信費(ネット・他)', '生命保険', '医療保険', '自動車保険', 'その他'],
  '変動費': ['食費', '外食費', '医療費', '被服費', '雑費', '交際費', 'その他費用'],
};
const INCOME_CATEGORIES = ['給与', '副収入', 'その他'];

const CATEGORY_TO_GROUP = {};
for (const [group, cats] of Object.entries(EXPENSE_CATEGORY_GROUPS)) {
  for (const c of cats) CATEGORY_TO_GROUP[c] = group;
}
const ALL_EXPENSE_CATEGORIES = Object.values(EXPENSE_CATEGORY_GROUPS).flat();

/* ---------- Storage ---------- */

const STORAGE = {
  tx: 'kakeibo.transactions.v1',
  person: 'kakeibo.person.v1',
  theme: 'kakeibo.theme.v1',
};

function loadTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE.tx);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveTransactions(list) {
  localStorage.setItem(STORAGE.tx, JSON.stringify(list));
  populateStoreSuggestions();
  renderQuickFixedList();
}

let transactions = loadTransactions();

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

/* ---------- Helpers ---------- */

function yen(n) {
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function monthOf(dateStr) {
  return dateStr.slice(0, 7);
}
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${y}年${Number(m)}月`;
}
function addMonths(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function niceCeil(value) {
  if (value <= 0) return 1000;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const fraction = value / base;
  let niceFraction;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * base;
}
function compactYen(n) {
  if (Math.abs(n) >= 10000) {
    const man = Math.round((n / 10000) * 10) / 10;
    return (Number.isInteger(man) ? man : man.toFixed(1)) + '万円';
  }
  return yen(n);
}

/* ---------- Tabs ---------- */

const tabs = document.querySelectorAll('.tab');
const tabButtons = document.querySelectorAll('.tabbar-btn');

function showTab(name) {
  tabs.forEach((t) => { t.hidden = t.dataset.tab !== name; });
  tabButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.tabTarget === name));
  if (name === 'summary') renderAnnualTable();
  if (name === 'graphs') renderGraphs();
  if (name === 'list') renderList();
}
tabButtons.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tabTarget)));

/* ---------- Theme ---------- */

const themeToggle = document.getElementById('themeToggle');
function applyStoredTheme() {
  const stored = localStorage.getItem(STORAGE.theme);
  if (stored) document.documentElement.setAttribute('data-theme', stored);
}
themeToggle.addEventListener('click', () => {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const current = document.documentElement.getAttribute('data-theme') || (prefersDark ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE.theme, next);
});
applyStoredTheme();

/* ---------- Entry form ---------- */

const entryForm = document.getElementById('entryForm');
const fType = document.getElementById('f-type');
const fDate = document.getElementById('f-date');
const fAmount = document.getElementById('f-amount');
const fStore = document.getElementById('f-store');
const fStoreLabel = document.getElementById('f-store-label');
const fCategory = document.getElementById('f-category');
const fMemo = document.getElementById('f-memo');
const fPerson = document.getElementById('f-person');
const fId = document.getElementById('f-id');
const entryTitle = document.getElementById('entryFormTitle');
const entrySubmitBtn = document.getElementById('entrySubmitBtn');
const entryCancelBtn = document.getElementById('entryCancelBtn');
const entryToast = document.getElementById('entryToast');
const storeAutocompleteBox = document.getElementById('storeAutocomplete');
const storeSuggestionList = document.getElementById('storeSuggestionList');

let storeNameHistory = [];

function populateStoreSuggestions() {
  const counts = new Map();
  const lastUsedDate = new Map();
  for (const t of transactions) {
    const name = (t.store || '').trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
    if (!lastUsedDate.has(name) || t.date > lastUsedDate.get(name)) {
      lastUsedDate.set(name, t.date);
    }
  }
  // よく使う店ほど上に（回数優先）。回数が同じ場合は最近使った方を上に。
  storeNameHistory = [...counts.keys()].sort((a, b) => {
    const diff = counts.get(b) - counts.get(a);
    if (diff !== 0) return diff;
    return lastUsedDate.get(a) < lastUsedDate.get(b) ? 1 : -1;
  });
}
populateStoreSuggestions();

function renderStoreSuggestionList(filterText) {
  const q = filterText.trim().toLowerCase();
  const matches = (q ? storeNameHistory.filter((n) => n.toLowerCase().includes(q)) : storeNameHistory).slice(0, 20);
  if (matches.length === 0) {
    storeSuggestionList.hidden = true;
    storeSuggestionList.innerHTML = '';
    return;
  }
  storeSuggestionList.innerHTML = matches.map((n) => `<li class="autocomplete-item">${escapeHtml(n)}</li>`).join('');
  storeSuggestionList.hidden = false;
}

fStore.addEventListener('input', () => renderStoreSuggestionList(fStore.value));
fStore.addEventListener('focus', () => renderStoreSuggestionList(fStore.value));
fStore.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') storeSuggestionList.hidden = true;
});
// iPhone のタップでも確実に選べるよう click で拾う（リスト内のクリックでは下の処理で閉じない）
storeSuggestionList.addEventListener('click', (e) => {
  const item = e.target.closest('.autocomplete-item');
  if (!item) return;
  fStore.value = item.textContent;
  storeSuggestionList.hidden = true;
});
document.addEventListener('click', (e) => {
  if (!storeAutocompleteBox.contains(e.target)) storeSuggestionList.hidden = true;
});

function populateCategorySelect(select, type) {
  select.innerHTML = '';
  if (type === 'income') {
    const og = document.createElement('optgroup');
    og.label = '収入';
    for (const c of INCOME_CATEGORIES) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      og.appendChild(opt);
    }
    select.appendChild(og);
  } else {
    for (const [group, cats] of Object.entries(EXPENSE_CATEGORY_GROUPS)) {
      const og = document.createElement('optgroup');
      og.label = group;
      for (const c of cats) {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        og.appendChild(opt);
      }
      select.appendChild(og);
    }
  }
}

function setEntryType(type, { selectCategory } = {}) {
  fType.value = type;
  document.querySelectorAll('#typeToggle .type-btn').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.type === type);
  });
  populateCategorySelect(fCategory, type);
  if (selectCategory) fCategory.value = selectCategory;
  if (type === 'income') {
    fStoreLabel.textContent = '内容（任意）';
    fStore.placeholder = '例）〇〇株式会社';
  } else {
    fStoreLabel.textContent = '購入店名';
    fStore.placeholder = '例）〇〇スーパー';
  }
}
document.querySelectorAll('#typeToggle .type-btn').forEach((btn) => {
  btn.addEventListener('click', () => setEntryType(btn.dataset.type));
});
setEntryType('expense');

function resetEntryForm(keepPerson = true) {
  fId.value = '';
  setEntryType('expense');
  fDate.value = todayStr();
  fAmount.value = '';
  fStore.value = '';
  fMemo.value = '';
  if (!keepPerson) fPerson.value = '';
  else fPerson.value = localStorage.getItem(STORAGE.person) || '';
  entryTitle.textContent = '記録する';
  entrySubmitBtn.textContent = '記録する';
  entryCancelBtn.hidden = true;
}
resetEntryForm();

/* ---------- 固定費のワンタップ登録 ---------- */

function renderQuickFixedList() {
  const wrap = document.getElementById('quickFixedList');
  const rows = EXPENSE_CATEGORY_GROUPS['固定費'].map((cat) => {
    const last = transactions
      .filter((t) => t.type !== 'income' && t.category === cat)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
    return { cat, last };
  });

  wrap.innerHTML = rows.map(({ cat, last }) => `
    <div class="quick-fixed-row">
      <span class="quick-fixed-name">${escapeHtml(cat)}</span>
      <span class="quick-fixed-meta">${last ? `前回 ${yen(last.amount)}（${last.date}）` : '記録なし'}</span>
      <button type="button" class="btn btn-secondary quick-fixed-btn" data-category="${escapeHtml(cat)}" ${last ? '' : 'disabled'}>この内容で入力</button>
    </div>`).join('');

  wrap.querySelectorAll('.quick-fixed-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = rows.find((r) => r.cat === btn.dataset.category);
      if (!row || !row.last) return;
      setEntryType('expense', { selectCategory: row.cat });
      fId.value = '';
      fDate.value = todayStr();
      fAmount.value = row.last.amount;
      fStore.value = row.last.store || '';
      fMemo.value = '';
      entryTitle.textContent = '記録する';
      entrySubmitBtn.textContent = '記録する';
      entryCancelBtn.hidden = true;
      entryForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      fAmount.focus();
      fAmount.select();
    });
  });
}
renderQuickFixedList();

function startEdit(tx) {
  setEntryType(tx.type === 'income' ? 'income' : 'expense', { selectCategory: tx.category });
  fId.value = tx.id;
  fDate.value = tx.date;
  fAmount.value = tx.amount;
  fStore.value = tx.store || '';
  fMemo.value = tx.memo || '';
  fPerson.value = tx.person || '';
  entryTitle.textContent = '記録を編集';
  entrySubmitBtn.textContent = '更新する';
  entryCancelBtn.hidden = false;
  showTab('entry');
  entryForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

entryCancelBtn.addEventListener('click', () => resetEntryForm());

entryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const amount = Number(fAmount.value);
  if (!fDate.value || !fCategory.value || !(amount > 0)) {
    entryToast.textContent = '日付・金額・カテゴリを正しく入力してください。';
    entryToast.classList.add('is-error');
    return;
  }
  entryToast.classList.remove('is-error');

  const person = fPerson.value.trim();
  if (person) localStorage.setItem(STORAGE.person, person);

  const type = fType.value === 'income' ? 'income' : 'expense';
  const group = type === 'income' ? '収入' : CATEGORY_TO_GROUP[fCategory.value];

  if (fId.value) {
    const idx = transactions.findIndex((t) => t.id === fId.value);
    if (idx !== -1) {
      transactions[idx] = {
        ...transactions[idx],
        date: fDate.value,
        amount,
        store: fStore.value.trim(),
        category: fCategory.value,
        group,
        type,
        memo: fMemo.value.trim(),
        person,
      };
    }
    saveTransactions(transactions);
    entryToast.textContent = '更新しました。';
    resetEntryForm();
  } else {
    transactions.push({
      id: uid(),
      date: fDate.value,
      amount,
      store: fStore.value.trim(),
      category: fCategory.value,
      group,
      type,
      memo: fMemo.value.trim(),
      person,
      createdAt: new Date().toISOString(),
    });
    saveTransactions(transactions);
    entryToast.textContent = '保存しました。';
    resetEntryForm();
  }
  setTimeout(() => { entryToast.textContent = ''; }, 1500);
});

/* ---------- レシート写真からのOCR読み取り（任意機能） ----------
 * ブラウザ内で完結するTesseract.js（Google製OCRエンジン）を使用。
 * サーバーには何も送信しない。初回はライブラリ・言語データの取得に
 * ネット接続が必要（写真そのものは送信されない）。認識精度は完璧ではないため、
 * 抽出結果はあくまで下書きとして入力欄に反映し、必ずユーザーの確認を挟む。
 */

const CATEGORY_HINTS = [
  { words: ['スーパー', 'マート', 'マーケット', '青果', '鮮魚', '精肉', 'クリーニング'], category: '食費' },
  { words: ['カフェ', '珈琲', 'コーヒー', '食堂', 'レストラン', '麺', '丼', '弁当', 'うどん', 'そば', '寿司', '焼肉', 'ラーメン', '喫茶', 'ファミレス'], category: '外食費' },
  { words: ['薬局', '薬店', 'ドラッグ', 'クリニック', '病院', '歯科', '医院'], category: '医療費' },
  { words: ['衣料', '洋服', 'アパレル', 'ユニクロ', 'しまむら'], category: '被服費' },
];

function guessCategoryFromStore(store) {
  if (!store) return null;
  for (const hint of CATEGORY_HINTS) {
    if (hint.words.some((w) => store.includes(w)) && ALL_EXPENSE_CATEGORIES.includes(hint.category)) {
      return hint.category;
    }
  }
  return null;
}

function parseReceiptDateFromText(text) {
  let m = text.match(/(20\d{2})[\/\-年]\s*(\d{1,2})[\/\-月]\s*(\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  m = text.match(/令和\s*(\d{1,2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (m) {
    const y = 2018 + Number(m[1]);
    return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  return '';
}

function parseReceiptAmountFromText(text) {
  const lines = text.split('\n');
  const keyPattern = /(合計|お会計|お買上|ご利用金額|お支払|total)/i;
  const candidates = [];
  for (const line of lines) {
    if (keyPattern.test(line)) {
      const nums = line.match(/[\d,]{3,}/g);
      if (nums) {
        for (const n of nums) {
          const val = Number(n.replace(/,/g, ''));
          if (val > 0) candidates.push(val);
        }
      }
    }
  }
  if (candidates.length) return Math.max(...candidates);
  const allNums = (text.match(/[\d,]{3,}/g) || []).map((n) => Number(n.replace(/,/g, ''))).filter((n) => n > 0);
  return allNums.length ? Math.max(...allNums) : null;
}

function guessStoreFromText(text) {
  const line = text.split('\n').map((l) => l.trim()).find(Boolean);
  return line || '';
}

const receiptPhotoInput = document.getElementById('f-receipt-photo');
const ocrStatus = document.getElementById('ocrStatus');

receiptPhotoInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  ocrStatus.classList.remove('is-error');

  if (typeof Tesseract === 'undefined') {
    ocrStatus.classList.add('is-error');
    ocrStatus.textContent = 'OCR機能の読み込みに失敗しました。インターネット接続を確認してください。';
    e.target.value = '';
    return;
  }

  ocrStatus.textContent = '読み取り中…（初回はOCRエンジンの準備に時間がかかることがあります）';
  try {
    const worker = await Tesseract.createWorker('jpn');
    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();

    const date = parseReceiptDateFromText(text);
    const amount = parseReceiptAmountFromText(text);
    const store = guessStoreFromText(text);
    const category = guessCategoryFromStore(store);

    setEntryType('expense', { selectCategory: category || undefined });
    if (date) fDate.value = date;
    if (amount) fAmount.value = amount;
    if (store) fStore.value = store;

    ocrStatus.textContent = '読み取りました。内容が正しいか確認してから「記録する」を押してください（読み間違いがあるかもしれません）。';
  } catch (err) {
    ocrStatus.classList.add('is-error');
    ocrStatus.textContent = '読み取りに失敗しました。お手数ですが手入力してください。';
  } finally {
    e.target.value = '';
  }
});

/* ---------- List tab ---------- */

const listMonth = document.getElementById('list-month');
const listCategory = document.getElementById('list-category');
const listKeyword = document.getElementById('list-keyword');
const listBody = document.getElementById('list-body');
const listTotal = document.getElementById('list-total');
const listEmpty = document.getElementById('list-empty');

listMonth.value = todayStr().slice(0, 7);
(function populateListCategoryFilter() {
  for (const [group, cats] of Object.entries(EXPENSE_CATEGORY_GROUPS)) {
    const og = document.createElement('optgroup');
    og.label = group;
    for (const c of cats) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      og.appendChild(opt);
    }
    listCategory.appendChild(og);
  }
  const ogIncome = document.createElement('optgroup');
  ogIncome.label = '収入';
  for (const c of INCOME_CATEGORIES) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    ogIncome.appendChild(opt);
  }
  listCategory.appendChild(ogIncome);
})();

[listMonth, listCategory, listKeyword].forEach((el) => el.addEventListener('input', renderList));

function renderList() {
  const month = listMonth.value;
  const cat = listCategory.value;
  const kw = listKeyword.value.trim().toLowerCase();

  let rows = transactions.filter((t) => {
    if (month && monthOf(t.date) !== month) return false;
    if (cat && t.category !== cat) return false;
    if (kw && !(`${t.store || ''} ${t.memo || ''}`.toLowerCase().includes(kw))) return false;
    return true;
  });
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  listBody.innerHTML = '';
  let total = 0;
  for (const t of rows) {
    total += t.amount;
    const isIncome = t.type === 'income';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.date}</td>
      <td>${escapeHtml(t.store || '')}</td>
      <td>${escapeHtml(t.category)}</td>
      <td class="num ${isIncome ? 'income-amount' : ''}">${isIncome ? '+' : ''}${yen(t.amount)}</td>
      <td>${escapeHtml(t.person || '')}</td>
      <td>
        <button class="row-btn" data-edit="${t.id}">編集</button>
        <button class="row-btn danger" data-del="${t.id}">削除</button>
      </td>`;
    listBody.appendChild(tr);
  }
  listTotal.textContent = yen(total);
  listEmpty.hidden = rows.length !== 0;

  listBody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tx = transactions.find((t) => t.id === btn.dataset.edit);
      if (tx) startEdit(tx);
    });
  });
  listBody.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm('この記録を削除しますか？')) return;
      transactions = transactions.filter((t) => t.id !== btn.dataset.del);
      saveTransactions(transactions);
      renderList();
    });
  });
}

/* ---------- Monthly breakdown (shared by 集計 / グラフ) ---------- */

function monthlyBreakdown(ym) {
  const rows = transactions.filter((t) => monthOf(t.date) === ym);
  const incomeByCategory = {};
  const expenseByCategory = {};
  const expenseByGroup = { '固定費': 0, '変動費': 0 };
  let incomeTotal = 0;
  let expenseTotal = 0;
  for (const t of rows) {
    if (t.type === 'income') {
      incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + t.amount;
      incomeTotal += t.amount;
    } else {
      expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
      expenseByGroup[t.group] = (expenseByGroup[t.group] || 0) + t.amount;
      expenseTotal += t.amount;
    }
  }
  return { incomeByCategory, incomeTotal, expenseByCategory, expenseByGroup, expenseTotal, balance: incomeTotal - expenseTotal };
}

/* ---------- 集計タブ：年間の一覧表 ---------- */

let summaryYear = Number(todayStr().slice(0, 4));

function changeSummaryYear(delta) {
  summaryYear += delta;
  renderAnnualTable();
  renderYearChart();
}
document.getElementById('annualYearPrev').addEventListener('click', () => changeSummaryYear(-1));
document.getElementById('annualYearNext').addEventListener('click', () => changeSummaryYear(1));
document.getElementById('yearPrev').addEventListener('click', () => changeSummaryYear(-1));
document.getElementById('yearNext').addEventListener('click', () => changeSummaryYear(1));

function renderAnnualTable() {
  document.getElementById('annualYearLabel').textContent = `${summaryYear}年`;

  const months = [];
  for (let m = 1; m <= 12; m++) {
    months.push(monthlyBreakdown(`${summaryYear}-${String(m).padStart(2, '0')}`));
  }

  function rowsFor(categories, kind, groupLabel, groupClass) {
    return categories.map((cat, idx) => {
      const values = months.map((mo) => (kind === 'income' ? mo.incomeByCategory[cat] : mo.expenseByCategory[cat]) || 0);
      const total = values.reduce((a, b) => a + b, 0);
      const groupCell = idx === 0
        ? `<th rowspan="${categories.length}" class="annual-group ${groupClass}">${escapeHtml(groupLabel)}</th>`
        : '';
      return `<tr>
        ${groupCell}
        <td class="annual-item">${escapeHtml(cat)}</td>
        ${values.map((v) => `<td class="num">${v ? yen(v) : ''}</td>`).join('')}
        <td class="num annual-grand">${yen(total)}</td>
      </tr>`;
    }).join('');
  }

  function totalRow(label, values, opts = {}) {
    const total = values.reduce((a, b) => a + b, 0);
    const cellCls = (v) => (opts.colorBySign ? (v > 0 ? 'balance-pos' : v < 0 ? 'balance-neg' : '') : '');
    return `<tr class="annual-total-row ${opts.extraClass || ''}">
      <td colspan="2" class="annual-item">${escapeHtml(label)}</td>
      ${values.map((v) => `<td class="num ${cellCls(v)}">${yen(v)}</td>`).join('')}
      <td class="num annual-grand ${cellCls(total)}">${yen(total)}</td>
    </tr>`;
  }

  const incomeTotals = months.map((mo) => mo.incomeTotal);
  const expenseTotals = months.map((mo) => mo.expenseTotal);
  const balances = months.map((mo) => mo.balance);

  const html =
    rowsFor(INCOME_CATEGORIES, 'income', '収入', 'group-income') +
    totalRow('収入計', incomeTotals, { extraClass: 'row-income-total' }) +
    rowsFor(EXPENSE_CATEGORY_GROUPS['固定費'], 'expense', '固定費', 'group-fixed') +
    rowsFor(EXPENSE_CATEGORY_GROUPS['変動費'], 'expense', '変動費', 'group-variable') +
    totalRow('支出計', expenseTotals, { extraClass: 'row-expense-total' }) +
    totalRow('月間貯蓄or赤字', balances, { extraClass: 'row-balance', colorBySign: true });

  document.getElementById('annualTableBody').innerHTML = html;
}

/* ---------- グラフタブ ---------- */

let summaryMonth = todayStr().slice(0, 7);
const summaryMonthLabel = document.getElementById('summaryMonthLabel');
document.getElementById('summaryPrev').addEventListener('click', () => {
  summaryMonth = addMonths(summaryMonth, -1);
  renderGraphs();
});
document.getElementById('summaryNext').addEventListener('click', () => {
  summaryMonth = addMonths(summaryMonth, 1);
  renderGraphs();
});

function renderGraphs() {
  summaryMonthLabel.textContent = monthLabel(summaryMonth);
  const current = monthlyBreakdown(summaryMonth);
  const prevYm = addMonths(summaryMonth, -1);
  const prev = monthlyBreakdown(prevYm);

  renderStatRow(current, prev);
  renderDayCalendar();
  renderGroupBar(current);
  renderCategoryBars(current);
  renderSummaryTable(current);
  renderYearChart();
}

function renderDayCalendar() {
  const wrap = document.getElementById('dayCalendar');
  const [y, m] = summaryMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startWeekday = new Date(y, m - 1, 1).getDay();

  const dailyExpense = {};
  const dailyHasIncome = {};
  for (const t of transactions) {
    if (monthOf(t.date) !== summaryMonth) continue;
    const day = Number(t.date.slice(8, 10));
    if (t.type === 'income') {
      dailyHasIncome[day] = true;
    } else {
      dailyExpense[day] = (dailyExpense[day] || 0) + t.amount;
    }
  }
  const maxDaily = Math.max(0, ...Object.values(dailyExpense));

  const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'];
  let html = weekdayLabels.map((w) => `<div class="day-calendar-weekday">${w}</div>`).join('');
  for (let i = 0; i < startWeekday; i++) html += '<div class="day-calendar-cell is-empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const amount = dailyExpense[d] || 0;
    const intensity = maxDaily > 0 ? amount / maxDaily : 0;
    const hasIncome = !!dailyHasIncome[d];
    const bg = amount > 0
      ? `background-color: color-mix(in srgb, var(--series-1) ${Math.round(10 + intensity * 55)}%, var(--surface-1));`
      : '';
    const title = `${m}月${d}日：支出 ${yen(amount)}${hasIncome ? ' ／ 収入あり' : ''}`;
    html += `
      <div class="day-calendar-cell" style="${bg}" title="${escapeHtml(title)}">
        <span class="day-calendar-daynum">${d}</span>
        ${amount > 0 ? `<span class="day-calendar-amount">${compactYen(amount)}</span>` : ''}
        ${hasIncome ? '<span class="day-calendar-income-dot"></span>' : ''}
      </div>`;
  }
  wrap.innerHTML = html;
}

function deltaInfo(curr, prevVal, biggerIsGood = false) {
  if (prevVal === 0) {
    return curr === 0
      ? { text: '先月と比較データなし', cls: 'flat' }
      : { text: '先月は記録なし', cls: 'flat' };
  }
  const diff = curr - prevVal;
  const pct = Math.round((diff / prevVal) * 100);
  if (diff === 0) return { text: '先月と同額', cls: 'flat' };
  const sign = diff > 0 ? '+' : '';
  const isGood = biggerIsGood ? diff > 0 : diff < 0;
  const cls = isGood ? 'up-good' : 'up-bad';
  return { text: `先月比 ${sign}${pct}%（${sign}${yen(diff)}）`, cls };
}

function renderStatRow(current, prev) {
  const statRow = document.getElementById('statRow');
  const incomeDelta = deltaInfo(current.incomeTotal, prev.incomeTotal, true);
  const expenseDelta = deltaInfo(current.expenseTotal, prev.expenseTotal, false);
  const balanceCls = current.balance > 0 ? 'up-good' : current.balance < 0 ? 'up-bad' : '';
  const tiles = [
    { label: '今月の収入', value: yen(current.incomeTotal), delta: incomeDelta },
    { label: '今月の支出', value: yen(current.expenseTotal), delta: expenseDelta },
    { label: '収支（黒字/赤字）', value: yen(current.balance), delta: null, valueCls: balanceCls },
  ];
  statRow.innerHTML = tiles.map((t) => `
    <div class="stat-tile">
      <div class="stat-label">${t.label}</div>
      <div class="stat-value ${t.valueCls || ''}">${t.value}</div>
      ${t.delta ? `<div class="stat-delta ${t.delta.cls}">${t.delta.text}</div>` : ''}
    </div>
  `).join('');
}

function renderGroupBar(current) {
  const bar = document.getElementById('groupBar');
  const legend = document.getElementById('groupLegend');
  const v = current.expenseByGroup['変動費'] || 0;
  const f = current.expenseByGroup['固定費'] || 0;
  const total = v + f;

  legend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch variable"></span>変動費 ${yen(v)}</span>
    <span class="legend-item"><span class="legend-swatch fixed"></span>固定費 ${yen(f)}</span>`;

  if (total === 0) {
    bar.innerHTML = `<div class="seg" style="width:100%;background:var(--grid);color:var(--muted)">この月の記録はまだありません</div>`;
    return;
  }
  const vPct = (v / total) * 100;
  const fPct = (f / total) * 100;
  bar.innerHTML = `
    ${v > 0 ? `<div class="seg variable" style="width:${vPct}%">${vPct >= 12 ? Math.round(vPct) + '%' : ''}</div>` : ''}
    ${f > 0 ? `<div class="seg fixed" style="width:${fPct}%">${fPct >= 12 ? Math.round(fPct) + '%' : ''}</div>` : ''}
  `;
}

function renderCategoryBars(current) {
  const wrap = document.getElementById('categoryBars');
  const entries = ALL_EXPENSE_CATEGORIES
    .map((c) => ({ category: c, amount: current.expenseByCategory[c] || 0 }))
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  if (entries.length === 0) {
    wrap.innerHTML = `<p class="hint" style="margin:0">この月の記録はまだありません。</p>`;
    return;
  }
  const max = Math.max(...entries.map((e) => e.amount));

  wrap.innerHTML = entries.map((e) => {
    const widthPct = max > 0 ? Math.max((e.amount / max) * 100, 1.5) : 0;
    return `
      <div class="cat-bar-row">
        <div class="cat-bar-top">
          <span class="cat-bar-name">${escapeHtml(e.category)}</span>
          <span class="cat-bar-amount">${yen(e.amount)}</span>
        </div>
        <div class="cat-bar-track" title="${escapeHtml(e.category)}: ${yen(e.amount)}">
          <div class="cat-bar-fill" style="width:${widthPct}%"></div>
        </div>
      </div>`;
  }).join('');
}

function renderSummaryTable(current) {
  const body = document.getElementById('summaryTableBody');
  const entries = ALL_EXPENSE_CATEGORIES
    .map((c) => ({ category: c, amount: current.expenseByCategory[c] || 0 }))
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="2" class="muted">この月の記録はまだありません。</td></tr>`;
    return;
  }
  body.innerHTML = entries.map((e) => `
    <tr>
      <td>${escapeHtml(e.category)}</td>
      <td class="num">${yen(e.amount)}</td>
    </tr>`).join('');
}

function renderYearChart() {
  document.getElementById('yearLabel').textContent = `${summaryYear}年`;

  const months = [];
  for (let m = 1; m <= 12; m++) {
    const ym = `${summaryYear}-${String(m).padStart(2, '0')}`;
    const mo = monthlyBreakdown(ym);
    months.push({
      m,
      variable: mo.expenseByGroup['変動費'] || 0,
      fixed: mo.expenseByGroup['固定費'] || 0,
      total: mo.expenseTotal,
    });
  }

  const legend = document.getElementById('yearLegend');
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch variable"></span>変動費</span>
    <span class="legend-item"><span class="legend-swatch fixed"></span>固定費</span>`;

  const chartWrap = document.getElementById('yearChart');
  const maxTotal = Math.max(...months.map((mo) => mo.total));

  if (maxTotal === 0) {
    chartWrap.innerHTML = `<p class="hint" style="margin:0">${summaryYear}年の記録はまだありません。</p>`;
    return;
  }

  const niceMax = niceCeil(maxTotal);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  let maxIdx = 0;
  months.forEach((mo, i) => { if (mo.total > months[maxIdx].total) maxIdx = i; });

  chartWrap.innerHTML = `
    <div class="year-chart-plot">
      <div class="year-gridlines">
        ${ticks.map((f) => `
          <div class="gridline" style="bottom:${f * 100}%">
            <span>${compactYen(Math.round(niceMax * f))}</span>
          </div>`).join('')}
      </div>
      <div class="year-columns">
        ${months.map((mo, i) => {
          const totalPct = (mo.total / niceMax) * 100;
          const vPct = (mo.variable / niceMax) * 100;
          const fPct = (mo.fixed / niceMax) * 100;
          const fixedOnTop = mo.fixed > 0;
          const tooltip = `${mo.m}月：変動費 ${yen(mo.variable)} ／ 固定費 ${yen(mo.fixed)} ／ 合計 ${yen(mo.total)}`;
          return `
          <div class="year-col" title="${escapeHtml(tooltip)}">
            ${i === maxIdx ? `<span class="year-col-value" style="bottom:calc(${totalPct}% + 6px)">${compactYen(mo.total)}</span>` : ''}
            <div class="year-col-stack ${mo.total === 0 ? 'is-empty' : ''}">
              ${mo.total === 0 ? '' : `
                <div class="seg variable" style="height:${vPct}%; ${!fixedOnTop ? 'border-radius:4px 4px 0 0;' : ''}"></div>
                <div class="seg fixed" style="height:${fPct}%; ${fixedOnTop ? 'border-radius:4px 4px 0 0;' : ''}"></div>
              `}
            </div>
            <span class="year-col-label">${mo.m}月</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

/* ---------- Data tab (export / import / reset) ---------- */

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('exportJsonBtn').addEventListener('click', () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    transactions,
  };
  const stamp = todayStr().replace(/-/g, '');
  downloadFile(`kakeibo_${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
});

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  const header = ['日付', '種別', '金額', '店舗名／内容', 'カテゴリ', 'グループ', 'メモ', '入力者'];
  const lines = [header.join(',')];
  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const t of sorted) {
    lines.push([t.date, t.type === 'income' ? '収入' : '支出', t.amount, t.store || '', t.category, t.group, t.memo || '', t.person || '']
      .map(csvField).join(','));
  }
  const stamp = todayStr().replace(/-/g, '');
  downloadFile(`kakeibo_${stamp}.csv`, '﻿' + lines.join('\n'), 'text/csv');
});

document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const toast = document.getElementById('importToast');
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.transactions)) throw new Error('invalid');

    const existingIds = new Set(transactions.map((t) => t.id));
    let added = 0;
    for (const t of data.transactions) {
      if (!t || !t.id || !t.date || !t.category || typeof t.amount !== 'number') continue;
      if (existingIds.has(t.id)) continue;
      const type = t.type === 'income' ? 'income' : 'expense';
      transactions.push({
        id: t.id,
        date: t.date,
        amount: t.amount,
        store: t.store || '',
        category: t.category,
        group: type === 'income' ? '収入' : (CATEGORY_TO_GROUP[t.category] || t.group || '固定費'),
        type,
        memo: t.memo || '',
        person: t.person || '',
        createdAt: t.createdAt || new Date().toISOString(),
      });
      existingIds.add(t.id);
      added++;
    }
    saveTransactions(transactions);

    toast.classList.remove('is-error');
    toast.textContent = `${added}件の記録を追加しました。`;
    renderList();
  } catch (err) {
    toast.classList.add('is-error');
    toast.textContent = '読み込みに失敗しました。正しいJSONファイルか確認してください。';
  } finally {
    e.target.value = '';
  }
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('本当にすべてのデータを削除しますか？この操作は元に戻せません。')) return;
  if (!confirm('もう一度確認します。全ての記録を削除します。よろしいですか？')) return;
  transactions = [];
  saveTransactions(transactions);
  renderList();
  resetEntryForm();
});

/* ---------- Service worker ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/* ---------- Init ---------- */

renderList();
