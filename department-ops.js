(function () {
  'use strict';

  const CORE = window.DepartmentOpsCore;
  const PATROL_URL = 'https://script.google.com/macros/s/AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax/exec';
  const SESSION_KEY = 'bei12b_patrol_session_token_v2';
  const GOLD_HISTORY_KEY = 'north12_department_gold_history_v1';
  const GOLD_REVIEW_KEY = 'north12_department_gold_reviews_v1';
  let goldData = null;
  let goldSourceName = '';
  let storeData = null;
  let patrolToken = '';

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  const formatNumber = (value) => Number(value || 0).toLocaleString('zh-TW', { maximumFractionDigits: 1 });

  function setMessage(id, text, type) {
    const target = $(id);
    target.textContent = text || '';
    target.className = `message${type ? ` ${type}` : ''}`;
  }

  async function authRequest(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(PATROL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`驗證服務 HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function unlockWithPasscode(passcode) {
    const result = await authRequest({ action: 'ptauth', key: passcode });
    if (result?.status !== 'ok' || !result.token) throw new Error('通行碼驗證未成功');
    patrolToken = result.token;
    sessionStorage.setItem(SESSION_KEY, patrolToken);
    unlockWorkspace();
  }

  async function restoreSession() {
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) return;
    try {
      const result = await authRequest({ action: 'ptauth', token });
      if (result?.status !== 'ok' || !result.token) throw new Error('expired');
      patrolToken = result.token;
      sessionStorage.setItem(SESSION_KEY, patrolToken);
      unlockWorkspace();
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  function unlockWorkspace() {
    $('authPanel').hidden = true;
    $('workspace').hidden = false;
    $('securityBadge').textContent = '督導權限已驗證';
    $('securityBadge').classList.add('ok');
  }

  function readLocalJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function arrayBufferFrom(value) {
    if (value instanceof ArrayBuffer) return value;
    if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    throw new Error('解密後的 Excel 格式不正確。');
  }

  async function readWorkbook(file, password) {
    let bytes = await file.arrayBuffer();
    try {
      if (window.OfficeCrypto?.isEncrypted(bytes)) {
        if (!password) throw new Error('請輸入 Excel 開啟密碼。');
        bytes = arrayBufferFrom(await window.OfficeCrypto.decrypt(bytes, { password }));
      }
      return XLSX.read(bytes, { type: 'array', cellDates: true });
    } catch (error) {
      if (/password|密碼|incorrect/i.test(String(error?.message || error))) throw new Error('Excel 密碼不正確，請重新輸入。');
      throw error;
    }
  }

  function currentQuarterKey() {
    const latest = goldData.months[goldData.months.length - 1]?.monthKey || '';
    const match = latest.match(/^(\d{4})-(\d{2})$/);
    if (!match) return '';
    const quarter = Math.ceil(Number(match[2]) / 3);
    return `${match[1]}-Q${quarter}`;
  }

  function quarterMonths(key) {
    const match = String(key).match(/^(\d{4})-Q([1-4])$/);
    if (!match) return [];
    const start = (Number(match[2]) - 1) * 3 + 1;
    return Array.from({ length: 3 }, (_, index) => `${match[1]}-${String(start + index).padStart(2, '0')}`);
  }

  function selectedMonths() {
    const value = $('monthFilter').value;
    if (value.startsWith('quarter:')) {
      const allowed = new Set(quarterMonths(value.slice(8)));
      return goldData.months.filter((month) => allowed.has(month.monthKey));
    }
    if (value === 'all') return goldData.months;
    return goldData.months.filter((month) => month.monthKey === value);
  }

  function filters() {
    return { region: $('regionFilter').value, store: $('storeFilter').value, employee: $('employeeFilter').value };
  }

  function setOptions(select, options, firstLabel) {
    const current = select.value;
    select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>${options.map((item) => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join('')}`;
    if (Array.from(select.options).some((option) => option.value === current)) select.value = current;
  }

  function initializeFilters() {
    const quarter = currentQuarterKey();
    $('monthFilter').innerHTML = [
      quarter ? `<option value="quarter:${quarter}">${quarter.replace('-', ' ')} 季度結算</option>` : '',
      ...goldData.months.slice().reverse().map((month) => `<option value="${month.monthKey}">${month.sheetName}（至 ${month.dateRange.cutoff || '—'}）</option>`),
      '<option value="all">全部月份</option>'
    ].join('');
    setOptions($('regionFilter'), CORE.REGIONS.map((region) => ({ value: region, label: region })), 'A–D 全部');
    updateDependentFilters();
  }

  function updateDependentFilters() {
    const months = selectedMonths();
    const region = $('regionFilter').value;
    const allRows = months.flatMap((month) => month.records).filter((row) => !region || row.region === region);
    const stores = Array.from(new Set(allRows.map((row) => row.store))).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    setOptions($('storeFilter'), stores.map((store) => ({ value: store, label: store })), '全部店點');
    const store = $('storeFilter').value;
    const people = Array.from(new Map(allRows.filter((row) => !store || row.store === store).map((row) => [row.employeeId || row.employeeName, row])).values())
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'zh-Hant'));
    setOptions($('employeeFilter'), people.map((row) => ({ value: row.employeeId || row.employeeName, label: `${row.employeeName}｜${row.store}` })), '全部人員');
  }

  function renderSummary(months, rows) {
    const latestRows = months.length ? CORE.filterRecords(months[months.length - 1].records, filters()) : [];
    const latest = CORE.summarizeRecords(latestRows);
    const cumulative = rows.reduce((sum, row) => sum + row.total, 0);
    const cards = [
      ['期間累計', formatNumber(cumulative), `${months.length} 個月份`, ''],
      ['最新 Final 人數', latest.people, `${latest.stores} 個店點`, ''],
      ['正金牌人數', latest.positive, '最新月份', 'positive'],
      ['負金牌人數', latest.negative, '最新月份', 'negative'],
      ['SPE 加分總計', formatNumber(latest.speTotal), '最新 Final', latest.speTotal < 0 ? 'negative' : 'positive']
    ];
    $('goldSummary').innerHTML = cards.map(([label, value, note, className]) => `<article class="summary-card ${className}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
  }

  function renderPeople(months, people) {
    $('peopleCount').textContent = `${people.length} 人`;
    $('peopleHead').innerHTML = `<tr><th>排名</th><th>部區</th><th>店點</th><th>同仁</th><th>職稱</th>${months.map((month) => `<th class="number">${escapeHtml(month.sheetName)}</th>`).join('')}<th class="number">累計</th><th>季度門檻</th></tr>`;
    $('peopleBody').innerHTML = people.length ? people.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row.region)}</td><td>${escapeHtml(row.store)}</td><td><strong>${escapeHtml(row.employeeName)}</strong></td><td>${escapeHtml(row.role)}</td>${months.map((month) => `<td class="number ${Number(row.months[month.monthKey] || 0) < 0 ? 'down' : Number(row.months[month.monthKey] || 0) > 0 ? 'up' : 'neutral'}">${formatNumber(row.months[month.monthKey] || 0)}</td>`).join('')}<td class="number ${row.total < 0 ? 'down' : row.total > 0 ? 'up' : ''}">${formatNumber(row.total)}</td><td><span class="thresholds">${CORE.QUARTER_THRESHOLDS.map((threshold) => `<span class="threshold ${row.total >= threshold ? 'hit' : ''}">${threshold}</span>`).join('')}</span></td></tr>`).join('') : '<tr><td colspan="20">目前篩選沒有資料。</td></tr>';
  }

  function renderQuarter(people) {
    $('quarterStrip').innerHTML = CORE.QUARTER_THRESHOLDS.map((threshold) => {
      const count = people.filter((row) => row.total >= threshold).length;
      return `<article class="quarter-card"><strong>${count} 人</strong><span>累計達 ${threshold} 金牌</span></article>`;
    }).join('');
  }

  function reviewKey(row) {
    return `${row.cutoff}|${row.employeeId || `${row.store}|${row.employeeName}`}`;
  }

  function reviewSelect(kind, row, value) {
    const lists = kind === 'reason'
      ? ['', '過關／成交', '動員加扣', '休假免扣', '上課免扣', '金牌折抵', '資料修正', '其他']
      : ['待複核', '正常', '已確認'];
    return `<select class="review-select" data-review-kind="${kind}" data-review-key="${escapeHtml(reviewKey(row))}">${lists.map((item) => `<option value="${escapeHtml(item)}"${item === value ? ' selected' : ''}>${escapeHtml(item || '尚未註記')}</option>`).join('')}</select>`;
  }

  function renderDaily() {
    const history = readLocalJson(GOLD_HISTORY_KEY, []);
    const reviews = readLocalJson(GOLD_REVIEW_KEY, {});
    const changes = CORE.dailyChanges(history, $('dateFrom').value, $('dateTo').value);
    $('dailyBody').innerHTML = changes.length ? changes.map((row) => {
      const review = reviews[reviewKey(row)] || {};
      return `<tr><td>${escapeHtml(row.cutoff)}</td><td>${escapeHtml(row.store)}</td><td>${escapeHtml(row.employeeName)}</td><td class="number">${formatNumber(row.previousMedal)}</td><td class="number">${formatNumber(row.medal)}</td><td class="number ${row.delta > 0 ? 'up' : 'down'}">${row.delta > 0 ? '+' : ''}${formatNumber(row.delta)}</td><td>${reviewSelect('reason', row, review.reason || '')}</td><td>${reviewSelect('status', row, review.status || '待複核')}</td></tr>`;
    }).join('') : '<tr><td colspan="8">目前只有一個截止日，需再匯入下一日 Final 才能產生每日增減。</td></tr>';
  }

  function renderGold() {
    const months = selectedMonths();
    const people = CORE.aggregatePeople(months, filters());
    renderSummary(months, people);
    renderPeople(months, people);
    renderQuarter(people);
    renderDaily();
    const latest = goldData.months[goldData.months.length - 1];
    $('goldSourceMeta').textContent = `${goldSourceName}｜${goldData.months.length} 個月份｜最新截止 ${latest.dateRange.cutoff}`;
  }

  function saveGoldHistory(fileName) {
    const latest = goldData.months[goldData.months.length - 1];
    if (!latest.dateRange.cutoff) return;
    const rows = latest.records.filter((row) => row.region === '北一二B');
    const history = CORE.upsertSnapshot(readLocalJson(GOLD_HISTORY_KEY, []), {
      cutoff: latest.dateRange.cutoff,
      importedAt: new Date().toISOString(),
      sourceName: fileName,
      rows
    });
    localStorage.setItem(GOLD_HISTORY_KEY, JSON.stringify(history));
  }

  async function importGold() {
    const file = $('goldFile').files?.[0];
    if (!file) return setMessage('goldMessage', '請先選擇「北一二部金牌.xlsx」。', 'error');
    $('goldImport').disabled = true;
    setMessage('goldMessage', '正在解密並讀取 Final…');
    try {
      const workbook = await readWorkbook(file, $('excelPassword').value);
      goldData = CORE.parseGoldWorkbook(workbook);
      goldSourceName = file.name;
      saveGoldHistory(file.name);
      initializeFilters();
      renderGold();
      $('goldDashboard').hidden = false;
      setMessage('goldMessage', `已讀取 ${goldData.months.length} 個月份；Final 數字未重新計算。`, 'success');
    } catch (error) {
      setMessage('goldMessage', error.message || '金牌檔讀取失敗。', 'error');
    } finally {
      $('goldImport').disabled = false;
    }
  }

  async function importStore() {
    const file = $('storeFile').files?.[0];
    if (!file) return setMessage('storeMessage', '請先選擇店務原始 Excel。', 'error');
    $('storeImport').disabled = true;
    setMessage('storeMessage', '正在辨識月份與店點欄位…');
    try {
      const workbook = await readWorkbook(file, '');
      storeData = CORE.parseStoreWorkbook(workbook);
      $('storeBody').innerHTML = storeData.records.map((row) => `<tr><td>${escapeHtml(row.month)}</td><td>${escapeHtml(row.store)}</td><td class="number">${row.score == null ? '—' : formatNumber(row.score)}</td><td>${escapeHtml(row.status || '—')}</td><td>${escapeHtml(row.sheetName)}</td></tr>`).join('');
      $('storeSourceMeta').textContent = `${file.name}｜${storeData.records.length} 筆`;
      $('storeDashboard').hidden = false;
      $('storeEmpty').hidden = true;
      setMessage('storeMessage', `已辨識 ${storeData.records.length} 筆店務資料。`, 'success');
    } catch (error) {
      setMessage('storeMessage', error.message || '店務檔讀取失敗。', 'error');
    } finally {
      $('storeImport').disabled = false;
    }
  }

  function exportGold() {
    const months = selectedMonths();
    const people = CORE.aggregatePeople(months, filters());
    const headers = ['排名', '部區', '店點', '同仁', '職稱', ...months.map((month) => month.sheetName), '累計', '達成門檻', '下一門檻'];
    const rows = people.map((row, index) => [index + 1, row.region, row.store, row.employeeName, row.role, ...months.map((month) => row.months[month.monthKey] || 0), row.total, row.reached.join('/'), row.nextThreshold || '已達180']);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), '季度結算');
    XLSX.writeFile(workbook, `北一二部_金牌結算_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function publishGold() {
    if (!goldData) return setMessage('publishMessage', '請先讀取金牌 Final。', 'error');
    if (!patrolToken) return setMessage('publishMessage', '督導 session 已失效，請重新開啟頁面驗證。', 'error');
    const button = $('publishGold');
    button.disabled = true;
    setMessage('publishMessage', '正在同步受保護的金牌資料…');
    try {
      const result = await authRequest({
        action: 'department_ops_publish',
        token: patrolToken,
        sourceName: goldSourceName,
        gold: goldData,
        reviews: readLocalJson(GOLD_REVIEW_KEY, {})
      });
      if (result?.status !== 'ok') throw new Error(result?.message || '同步失敗');
      setMessage('publishMessage', `已同步給核准裝置；最新截止 ${result.cutoff}，北一二B ${result.people} 人。`, 'success');
    } catch (error) {
      setMessage('publishMessage', error.name === 'AbortError' ? '同步服務回應逾時，請先勿重複操作並重新整理確認。' : (error.message || '同步失敗。'), 'error');
    } finally {
      button.disabled = false;
    }
  }

  function bindEvents() {
    $('authForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.submitter;
      button.disabled = true;
      setMessage('authMessage', '正在驗證…');
      try {
        await unlockWithPasscode($('passcode').value.trim());
        $('passcode').value = '';
      } catch (error) {
        setMessage('authMessage', error.name === 'AbortError' ? '驗證服務回應較慢，請再試一次。' : (error.message || '驗證失敗。'), 'error');
      } finally {
        button.disabled = false;
      }
    });
    document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach((item) => { item.classList.toggle('active', item === button); item.setAttribute('aria-selected', item === button ? 'true' : 'false'); });
      document.querySelectorAll('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== button.dataset.tab; });
    }));
    $('goldImport').addEventListener('click', importGold);
    $('storeImport').addEventListener('click', importStore);
    $('publishGold').addEventListener('click', publishGold);
    $('exportGold').addEventListener('click', exportGold);
    $('monthFilter').addEventListener('change', () => { updateDependentFilters(); renderGold(); });
    $('regionFilter').addEventListener('change', () => { updateDependentFilters(); renderGold(); });
    $('storeFilter').addEventListener('change', () => { updateDependentFilters(); renderGold(); });
    $('employeeFilter').addEventListener('change', renderGold);
    $('dateFrom').addEventListener('change', renderDaily);
    $('dateTo').addEventListener('change', renderDaily);
    $('dailyBody').addEventListener('change', (event) => {
      const select = event.target.closest('[data-review-key]');
      if (!select) return;
      const reviews = readLocalJson(GOLD_REVIEW_KEY, {});
      const row = reviews[select.dataset.reviewKey] || {};
      row[select.dataset.reviewKind] = select.value;
      reviews[select.dataset.reviewKey] = row;
      localStorage.setItem(GOLD_REVIEW_KEY, JSON.stringify(reviews));
    });
  }

  bindEvents();
  restoreSession();
})();
