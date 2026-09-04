const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs/promises');
const { stores:defaultPatrolStores, patrolSummaryResponse } = require('./fixtures/patrol-summary-response.cjs');

// 模擬 GAS 後端：每日回報、巡店、班表與半月督導檢查（含通行碼驗證）
// 驗證「電腦貼上 → 上雲 → 另一裝置載入」的跨裝置同步流程
const PT_KEY = 'test123';
const PT_TOKEN = 'test-session-token';
const LEGACY_TEST_NOW = '2026-08-31T12:00:00+08:00';
let cloudRows;
let halfRows;
let writeCalls;
let ptReadCalls;
let ptDetailCalls;
let ptMileageCalls;
let ptMileageDelayMs;
let ptDetailDelayMs;
let ptMileageContract;
let cloudConfig; // 模擬各區 GAS 回傳的 PT_STORES / PT_TITLE
let mediaUploads;
let failPtwrite; // 測試用：強制 ptwrite 回錯，模擬雲端寫入失敗
let expireHalfWriteAt;
let halfWriteCalls;
let omitPtdetailKeys;
let omitPtdetailRow;
let ptwritePayloads;
let interviewRows;
let interviewWriteCalls;

function privateScheduleFixture() {
  const names = ['酒泉', '萬大', '大稻埕', '復興', '三創', '杭州', '永吉', '通化', '六張犁'];
  return {
    generatedAt: '2026-07-15T00:00:00+08:00',
    month: '2026-07',
    rocMonth: '115/07',
    stores: names.map(store => ({
      store,
      title: `台北${store}`,
      staff: [{ name: '測試主管', role: '店長' }, { name: '測試副店', role: '副店長' }, { name: '測試同仁', role: '業務代表' }],
      days: [{
        date: '2026-07-15', day: 15, weekday: '三',
        staff: [
          { name: '測試主管', role: '店長', status: '全', working: true },
          { name: '測試副店', role: '副店長', status: '休假', working: false },
          { name: '測試同仁', role: '業務代表', status: '早1', working: true },
        ],
        workingStaff: [
          { name: '測試主管', role: '店長', status: '全', working: true },
          { name: '測試同仁', role: '業務代表', status: '早1', working: true },
        ],
        managers: [{ name: '測試主管', role: '店長', status: '全', working: true }],
      }],
    })),
  };
}

async function stubGas(page) {
  await page.addInitScript(({ schedule, nowIso }) => {
    const NativeDate = Date;
    const fixedTime = new NativeDate(nowIso).getTime();
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixedTime])); }
      static now() { return fixedTime; }
    }
    window.Date = FixedDate;
    window.PATROL_LEGACY_GAS_URL = 'https://script.google.com/macros/s/test/exec';
  }, { schedule:privateScheduleFixture(), nowIso:LEGACY_TEST_NOW });
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      if (payload.action === 'ptauth') {
        const authed = payload.key === PT_KEY || payload.token === PT_TOKEN;
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(authed
            ? { status: 'ok', token: PT_TOKEN, expiresIn: 1800, sessionContract:'patrol-session-v2' }
            : { status: 'error', message: 'unauthorized', reason:'AUTH_CREDENTIAL_INVALID' }),
        });
      }
      if (payload.action === 'ptlogout') {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
      }
      if (payload.action === 'ptsummary') {
        ptReadCalls++;
        const configured=(cloudConfig&&cloudConfig.stores)||defaultPatrolStores;
        const month=payload.month||'2026-08';
        const summary=patrolSummaryResponse(month,cloudRows,new Date(`${month}-13T12:00:00+08:00`),configured);
        summary.title=(cloudConfig&&cloudConfig.title)||summary.title;
        return route.fulfill({ contentType:'application/json', body:JSON.stringify(payload.token===PT_TOKEN ? summary : {status:'error',message:'unauthorized'}) });
      }
      if (payload.action === 'ptdetail') {
        if (payload.token !== PT_TOKEN) {
          return route.fulfill({ contentType:'application/json', body:JSON.stringify({status:'error',message:'unauthorized'}) });
        }
        const month=String(payload.month||'');
        const store=String(payload.store||'');
        const pageNumber=Number(payload.page||1);
        const limit=Math.min(100,Number(payload.limit||50));
        const storeKey=store.replace(/^台北/,'');
        const matchingRows=cloudRows.filter(row=>String(row.month||'').slice(0,7)===month &&
          (String(row.store||'')===store || String(row.store||'').includes(storeKey)))
          .filter(row=>!omitPtdetailKeys.has(`${row.fillTime}|${row.store}|${row.item}`));
        const rows=omitPtdetailRow&&matchingRows.length?matchingRows.slice(0,-1):matchingRows;
        const start=(pageNumber-1)*limit;
        ptDetailCalls.push({month,store,page:pageNumber,limit});
        if (ptDetailDelayMs) await new Promise(resolve=>setTimeout(resolve,ptDetailDelayMs));
        return route.fulfill({ contentType:'application/json', body:JSON.stringify({
          status:'ok',month,store,page:pageNumber,limit,totalRows:rows.length,rows:rows.slice(start,start+limit)
        }) });
      }
      if (payload.action === 'ptmileage' || payload.action === 'ptmileage2') {
        if (payload.token !== PT_TOKEN) {
          return route.fulfill({ contentType:'application/json', body:JSON.stringify({status:'error',message:'unauthorized'}) });
        }
        const month=String(payload.month||'');
        const raw=cloudRows.filter(row=>String(row.month||'').slice(0,7)===month);
        const byVisit=new Map();
        raw.forEach((row,index)=>{
          const arriveTime=String(row.arriveTime||row.fillTime||'');
          const date=(arriveTime.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)||[]).slice(1).map((value,i)=>i?String(value).padStart(2,'0'):value).join('-');
          const store=String(row.store||''); const code=String(row.code||'');
          const key=date&&store?`${date}|${code||store}`:`invalid:${index}`;
          const value={fillTime:String(row.fillTime||''),arriveTime,code,store,month};
          if(!byVisit.has(key)||value.arriveTime<byVisit.get(key).arriveTime) byVisit.set(key,value);
        });
        const visits=[...byVisit.values()].sort((a,b)=>a.arriveTime.localeCompare(b.arriveTime)||a.store.localeCompare(b.store));
        ptMileageCalls.push({month});
        if(ptMileageDelayMs) await new Promise(resolve=>setTimeout(resolve,ptMileageDelayMs));
        if(payload.action==='ptmileage' || ptMileageContract==='patrol-mileage-month-v1'){
          return route.fulfill({contentType:'application/json',body:JSON.stringify({
            status:'ok',contract:'patrol-mileage-month-v1',fields:['fillTime','arriveTime','code','store','month'],
            month,page:1,limit:500,totalRows:raw.length,totalPages:Math.max(1,Math.ceil(raw.length/500)),rows:raw.slice(0,500),
            diagnostics:{sourceRows:cloudRows.length,matchedRows:raw.length,sheetScans:1,serverDurationMs:12}
          })});
        }
        return route.fulfill({contentType:'application/json',body:JSON.stringify({
          status:'ok',contract:'patrol-mileage-visits-v2',fields:['fillTime','arriveTime','code','store','month'],
          month,page:1,limit:279,totalVisits:visits.length,totalPages:1,visits,
          diagnostics:{sourceRows:cloudRows.length,matchedRows:raw.length,uniqueVisits:visits.length,sheetScans:1,serverDurationMs:12}
        })});
      }
      if (payload.action === 'interview_read') {
        if (payload.token !== PT_TOKEN) return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'error',message:'unauthorized'})});
        const schedule=privateScheduleFixture();
        const roster=[];const seen=new Set();
        schedule.stores.forEach(store=>store.staff.forEach(person=>{if(!seen.has(person.name)){seen.add(person.name);roster.push({name:person.name,store:store.store,role:person.role});}}));
        return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'ok',quarter:'2026-Q3',rosterMonth:schedule.month,roster,records:interviewRows})});
      }
      if (payload.action === 'interview_write') {
        interviewWriteCalls++;
        if (payload.token !== PT_TOKEN) return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'error',message:'unauthorized'})});
        let written=0,updated=0;
        (payload.rows||[]).forEach(row=>{
          const key=[row.interviewDate,row.organization,row.interviewee,row.reason].join('|');
          const index=interviewRows.findIndex(item=>[item.interviewDate,item.organization,item.interviewee,item.reason].join('|')===key);
          const clean={...row};delete clean.employeeId;
          if(index>=0){interviewRows[index]=clean;updated++;}else{interviewRows.push(clean);written++;}
        });
        return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'ok',quarter:'2026-Q3',written,updated})});
      }
      if (payload.action === 'half_media_upload') {
        const authed = payload.token === PT_TOKEN;
        if (!authed) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'unauthorized' }) });
        const file = payload.file || {};
        const id = `media-${mediaUploads.length + 1}`;
        const media = {
          id,
          name: file.name,
          mimeType: file.type,
          viewUrl: `https://drive.google.com/file/d/${id}/view`,
          previewUrl: /^image\//.test(file.type) ? `https://drive.google.com/uc?export=view&id=${id}` : `https://drive.google.com/file/d/${id}/preview`,
        };
        mediaUploads.push(media);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ok', media }) });
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'unknown action' }) });
    }
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action');
    const cb = url.searchParams.get('callback');
    const authed = url.searchParams.get('token') === PT_TOKEN;
    let body;
    if (action === 'ping') {
      body = JSON.stringify({ status: 'ok' });
    } else if (action === 'pthealth') {
      body = JSON.stringify({ status: 'ok', configured: true, contract: 'patrol-auth-v3', sessionContract:'patrol-session-v2', authDeployment:'test' });
    } else if (action === 'ptsummary') {
      ptReadCalls++;
      const configured=(cloudConfig&&cloudConfig.stores)||defaultPatrolStores;
      const month=url.searchParams.get('month')||'2026-08';
      const summary=patrolSummaryResponse(month,cloudRows,new Date(`${month}-13T12:00:00+08:00`),configured);
      summary.title=(cloudConfig&&cloudConfig.title)||summary.title;
      body = authed ? JSON.stringify(summary) : JSON.stringify({ status: 'error', message: 'unauthorized' });
    } else if (action === 'ptwrite') {
      writeCalls++;
      if (failPtwrite) {
        body = JSON.stringify({ status: 'error', message: '伺服器忙碌，請稍後再試' });
      } else if (!authed) {
        body = JSON.stringify({ status: 'error', message: 'unauthorized', reason:'AUTH_SESSION_EXPIRED' });
      } else {
        const rows = JSON.parse(url.searchParams.get('payload'));
        ptwritePayloads.push(rows);
        const seen = new Set(cloudRows.map(r => `${r.fillTime}|${r.store}|${r.item}`));
        let written = 0;
        rows.forEach(r => {
          const k = `${r.fillTime}|${r.store}|${r.item}`;
          if (seen.has(k)) return;
          seen.add(k);
          cloudRows.push({ ...r, savedAt: new Date().toISOString() });
          written++;
        });
        body = JSON.stringify({ status: 'ok', written });
      }
    } else if (action === 'hread') {
      body = authed
        ? JSON.stringify({ status: 'ok', rows: halfRows })
        : JSON.stringify({ status: 'error', message: 'unauthorized' });
    } else if (action === 'hwrite') {
      halfWriteCalls++;
      if (expireHalfWriteAt === halfWriteCalls) {
        expireHalfWriteAt = null;
        body = JSON.stringify({ status: 'error', message: 'unauthorized', reason:'AUTH_SESSION_EXPIRED' });
      } else if (!authed) {
        body = JSON.stringify({ status: 'error', message: 'unauthorized' });
      } else {
        const rows = JSON.parse(url.searchParams.get('payload'));
        const keys = new Set(halfRows.map(r => `${r.checkId}|${r.item}`));
        let written = 0;
        rows.forEach(r => {
          const key = `${r.checkId}|${r.item}`;
          const index = halfRows.findIndex(x => `${x.checkId}|${x.item}` === key);
          if (index >= 0) halfRows[index] = r;
          else { halfRows.push(r); keys.add(key); }
          written++;
        });
        body = JSON.stringify({ status: 'ok', written });
      }
    } else if (action === 'sread') {
      body = authed
        ? JSON.stringify({ status: 'ok', schedule: privateScheduleFixture() })
        : JSON.stringify({ status: 'error', message: 'unauthorized' });
    } else {
      body = JSON.stringify({ status: 'error', message: 'unknown action' });
    }
    route.fulfill({
      contentType: cb ? 'application/javascript' : 'application/json',
      body: cb ? `${cb}(${body})` : body,
    });
  });
}

async function openAndUnlock(page, answer = PT_KEY, month = '') {
  await page.goto(PAGE_URL);
  await page.locator('#patrolPasscode').fill(answer);
  await page.getByRole('button', { name: '驗證並進入' }).click();
  if (answer === PT_KEY) {
    await expect(page.locator('#patrolAuthGate')).toBeHidden();
    if (month) {
      await page.locator('#monthInput').evaluate((input, value) => {
        input.value = value;
        input.dispatchEvent(new Event('change', { bubbles:true }));
      }, month);
    }
  }
}

async function parseAndConfirm(page) {
  await page.getByRole('button', { name:'解析並預覽' }).click();
  await expect(page.locator('#patrolConfirmWriteBtn')).toBeVisible();
  await page.getByRole('button', { name:'確認寫入雲端' }).click();
  await expect(page.locator('#patrolConfirmWriteBtn')).toBeHidden();
}

const PAGE_URL = 'file://' + path.resolve(__dirname, '../patrol.html');

function pasteLine(d, store, code, item, result, reason) {
  const { line } = currentMonthFixture(d, store, code, item, result, reason);
  return line;
}

function currentMonthFixture(day, store, code, item, result, reason) {
  const month = LEGACY_TEST_NOW.slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    line: `${year}/${monthNumber}/${day} 16:43\t${year}/${monthNumber}/${day} 16:00\t${year}/${monthNumber}/${day} 18:00\t北一二B\t${code}\t${store}\t測試督導\t${item}\t內容\t${result}\t${reason}`,
    month,
    fillDate: `${year}/${monthNumber}/${day}`,
  };
}

function patrolLocalCsv(lines) {
  const header = ['填表時間','到店時間','離店時間','區處別','營業點代碼','檢查店點','檢查人員','題號','檢查內容','是否合格','未查／不合格原因'];
  const quote = value => `"${String(value == null ? '' : value).replaceAll('"','""')}"`;
  return [header, ...lines.map(line => line.split('\t'))].map(row => row.map(quote).join(',')).join('\n');
}

async function selectPatrolLocalCsv(page, name, lines) {
  await page.locator('#patrolLocalFileInput').setInputFiles({
    name,
    mimeType:'text/csv',
    buffer:Buffer.from(patrolLocalCsv(lines),'utf8'),
  });
}

function august20PasteBatch() {
  const header = '填表時間\t到店時間\t離店時間\t區處別\t營業點代碼\t檢查店點\t檢查人員\t題號\t檢查內容\t是否合格\t未查／不合格原因';
  const lines = [header];
  for (let item = 1; item <= 33; item++) {
    lines.push(`2026/8/20 16:43\t2026/8/20 16:00\t2026/8/20 18:00\t北一二B\tDNB10307\t台北三創\t測試督導\t${item}\t檢查內容\t${item <= 2 ? 'na' : 'v'}\t${item === 2 ? '原始非 NA 原因' : ''}`);
    lines.push(`2026/8/20 17:43\t2026/8/20 17:00\t2026/8/20 19:00\t北一二B\tDNB10440\t台北六張犁\t測試督導\t${item}\t檢查內容\t${item === 1 ? '' : 'v'}\t${item === 1 ? 'na' : ''}`);
  }
  return lines.join('\n');
}

function item18EightStoreRows() {
  return [
    ['2026/7/6 15:44', '台北大稻埕', 'DNB10284'],
    ['2026/7/13 18:27', '台北三創', 'DNB10307'],
    ['2026/7/14 18:28', '台北萬大', 'DNB10168'],
    ['2026/7/16 19:24', '台北酒泉', 'DNB10062'],
    ['2026/7/27 17:51', '台北六張犁', 'DNB10440'],
    ['2026/8/4 18:14', '台北復興南', 'DNB10094'],
    ['2026/8/5 19:33', '台北杭州南', 'DNB10146'],
    ['2026/8/10 17:30', '台北永吉', 'DNB10082'],
  ].map(([fillTime, store, code]) => ({
    fillTime, arriveTime:fillTime, leaveTime:fillTime, district:'北一二B', code, store,
    inspector:'測試督導', item:18, result:'v', reason:'', month:fillTime.startsWith('2026/7/')?'2026-07':'2026-08',
  }));
}

function versionedPatrolRows(month, store = '台北通化', code = 'DNB10059', items = []) {
  const [year, monthNumber] = month.split('-').map(Number);
  return items.map(item => ({
    fillTime:`${year}/${monthNumber}/5 10:00`, arriveTime:`${year}/${monthNumber}/5 09:30`, leaveTime:`${year}/${monthNumber}/5 11:00`,
    district:'北一二B', code, store, inspector:'測試督導', item, content:'版本測試', result:'v', reason:'', month,
  }));
}

function item18Panel(page) {
  return page.locator('#invPanels .panel').filter({ hasText:'到店全盤提醒' });
}

test.beforeEach(() => { cloudRows = []; halfRows = []; writeCalls = 0; ptReadCalls = 0; ptDetailCalls = []; ptMileageCalls = []; ptMileageDelayMs = 0; ptDetailDelayMs = 0; ptMileageContract = 'patrol-mileage-visits-v2'; cloudConfig = null; mediaUploads = []; failPtwrite = false; expireHalfWriteAt = null; halfWriteCalls = 0; omitPtdetailKeys = new Set(); omitPtdetailRow = false; ptwritePayloads = []; interviewRows = []; interviewWriteCalls = 0; });

test('填表時間為 ######## 時整批拒絕，不寫雲端、不改 rawDetails、不清除貼上內容', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  await page.evaluate(() => {
    rawDetails = [{
      fillTime:'2026/8/19 16:43', arriveTime:'2026/8/19 16:00', leaveTime:'2026/8/19 18:00',
      district:'北一二B', code:'DNB10059', store:'台北通化', inspector:'既有督導', item:1,
      content:'既有內容', result:'v', reason:'', month:'2026-08',
    }];
    rebuildFromRaw();
  });
  const beforeRaw = await page.evaluate(() => JSON.stringify(rawDetails));
  const beforeWrites = writeCalls;
  const pasted = [
    '2026/8/20 16:43\t2026/8/20 16:00\t2026/8/20 18:00\t北一二B\tDNB10307\t台北三創\t測試督導\t1\t檢查內容\tv\t',
    '########\t2026/8/20 17:00\t2026/8/20 19:00\t北一二B\tDNB10440\t台北六張犁\t測試督導\t1\t檢查內容\tv\t',
  ].join('\n');

  await page.fill('#pasteBox', pasted);
  await page.getByRole('button', { name:'解析並預覽' }).click();

  await expect(page.locator('#parseMsg')).toContainText('第 2 列');
  await expect(page.locator('#parseMsg')).toContainText('台北六張犁');
  await expect(page.locator('#parseMsg')).toContainText('填表時間');
  await expect(page.locator('#parseMsg')).toContainText('########');
  expect(writeCalls).toBe(beforeWrites);
  expect(await page.evaluate(() => JSON.stringify(rawDetails))).toBe(beforeRaw);
  await expect(page.locator('#pasteBox')).toHaveValue(pasted);
  expect(cloudRows).toEqual([]);
});

test('有效 8/20 資料完整解析 66 筆，三創與六張犁各 33 筆並相容新舊 NA', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  await page.fill('#pasteBox', august20PasteBatch());
  await parseAndConfirm(page);
  await expect(page.locator('#parseMsg')).toHaveText(/readback 一致/);
  await expect.poll(() => cloudRows.length).toBe(66);

  const state = await page.evaluate(() => {
    const find = (store, item) => rawDetails.find(row => row.store === store && row.item === item);
    const newNa = find('台北三創', 1);
    const oldNa = find('台北六張犁', 1);
    const preserved = find('台北三創', 2);
    return {
      total:rawDetails.length,
      sanchuang:rawDetails.filter(row => row.store === '台北三創').length,
      liuzhangli:rawDetails.filter(row => row.store === '台北六張犁').length,
      newNa:{result:newNa.result,reason:newNa.reason},
      oldNa:{result:oldNa.result,reason:oldNa.reason},
      preserved:{result:preserved.result,reason:preserved.reason},
    };
  });
  expect(state).toEqual({
    total:66,
    sanchuang:33,
    liuzhangli:33,
    newNa:{result:'na',reason:'na'},
    oldNa:{result:'na',reason:'na'},
    preserved:{result:'na',reason:'原始非 NA 原因'},
  });
});

test('2026/08 歷史月份維持原 33 題顯示與完成計算', async ({ page }) => {
  cloudRows = [
    ...versionedPatrolRows('2026-08', '台北通化', 'DNB10059', Array.from({length:33}, (_, index) => index + 1)),
    ...versionedPatrolRows('2026-08', '台北通化', 'DNB10059', Array.from({length:12}, (_, index) => index + 2))
      .map(row => ({...row, fillTime:'2026/8/20 10:00', arriveTime:'2026/8/20 09:30', leaveTime:'2026/8/20 11:00'})),
  ];
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('#monthInput').evaluate(input => {
    input.value = '2026-08';
    input.dispatchEvent(new Event('change', { bubbles:true }));
  });

  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);
  await expect(page.locator('#subTitle')).toHaveText('北一二B區 · 33 項檢核追蹤');
  await expect(page.locator('#sep25Dashboard')).toBeHidden();
  await expect(page.locator('#overview')).toBeVisible();
  await expect(page.locator('#overview')).toContainText('全項完成店數');
  await expect(page.locator('#content')).toContainText('本月已完成');
  await expect(page.locator('#content')).toContainText('台北通化');
  await expect(page.locator('#invPanels')).toContainText('知悉宣導提醒（題 19–33・每月20日前）');
});

test('2026/09 起顯示三群新版 25 題並由 9–10 月共用第 10 題', async ({ page }) => {
  cloudRows = [
    ...versionedPatrolRows('2026-09', '台北通化', 'DNB10059', [1,2,3,4,5,6,7,8,9,10,...Array.from({length:15}, (_, index) => index + 11)]),
    {...versionedPatrolRows('2026-09', '台北通化', 'DNB10059', [1])[0], fillTime:'2026/9/12 10:00', arriveTime:'2026/9/12 09:30', leaveTime:'2026/9/12 11:00'},
    ...Array.from({length:101}, (_, index) => ({
      ...versionedPatrolRows('2026-09', '台北通化', 'DNB10059', [1])[0],
      fillTime:`2026/9/${String((index % 25) + 1)} 12:${String(index % 60).padStart(2, '0')}`,
    })),
  ];
  await stubGas(page);
  await openAndUnlock(page, PT_KEY, '2026-09');

  await expect(page.locator('#sep25LoadState')).toContainText('正式 ptdetail 唯讀驗證完成');
  await expect(page.locator('#subTitle')).toHaveText('北一二B區 · 新版 25 項檢核追蹤');
  await expect(page.locator('#sep25Dashboard')).toBeVisible();
  await expect(page.locator('#overview')).toBeHidden();
  await expect(page.locator('#sep25GroupSummary')).toContainText('每月到店檢查・第 1–9 項');
  await expect(page.locator('#sep25GroupSummary')).toContainText('到店全盤・第 10 項');
  await expect(page.locator('#sep25GroupSummary')).toContainText('9–10月共用進度');
  await expect(page.locator('#sep25GroupSummary')).toContainText('NCC 知悉宣導・第 11–25 項');
  await expect(page.locator('#sep25Content')).toContainText('本月已完成');
  await expect(page.locator('#sep25Content')).toContainText('巡店完成');
  await expect(page.locator('#sep25Content')).toContainText('相隔 7 天');
  await expect(page.locator('#sep25Overview')).toContainText('25 項完成店數');
  await expect(page.locator('#sep25Overview')).toContainText('8');
  await page.locator('.sep25-catalog summary').click();
  await expect(page.locator('#sep25QuestionCatalog .item')).toHaveCount(25);
  await expect(page.locator('#sep25QuestionCatalog')).toContainText('督導打卡');
  await expect(page.locator('#sep25QuestionCatalog')).toContainText('NCC每月宣導1次');
  expect(ptDetailCalls).toEqual(expect.arrayContaining([
    expect.objectContaining({month:'2026-09', store:'台北通化', page:1, limit:100}),
    expect.objectContaining({month:'2026-09', store:'台北通化', page:2, limit:100}),
  ]));
  expect(ptDetailCalls.some(call => call.month === '2026-10')).toBe(false);
  expect(new Set(ptDetailCalls.map(call => call.store))).toEqual(new Set(['台北通化']));
});

test('新版 25 項明細更新逾時時保留上次成功看板', async ({ page }) => {
  cloudRows = versionedPatrolRows('2026-09', '台北通化', 'DNB10059', Array.from({length:25}, (_, index) => index + 1));
  await stubGas(page);
  await openAndUnlock(page, PT_KEY, '2026-09');
  await expect(page.locator('#sep25LoadState')).toContainText('正式 ptdetail 唯讀驗證完成');
  await expect(page.locator('#sep25Content')).toContainText('台北通化');

  await page.evaluate(async () => {
    const original=window.cloudCall;
    window.cloudCall=(action,params)=>action==='ptdetail'
      ? Promise.reject(new Error('巡店資料讀取逾時'))
      : original(action,params);
    await cloudLoad();
  });

  await expect(page.locator('#sep25LoadState')).toContainText('巡店資料讀取逾時；顯示上次成功資料');
  await expect(page.locator('#sep25Content')).toContainText('台北通化');
  expect(await page.evaluate(() => ({status:sep25State.status,hasModel:Boolean(sep25State.model),rowCount:sep25State.rows.length})))
    .toMatchObject({status:'error',hasModel:true,rowCount:25});
});

test('新版 25 題缺第 25 題時只計缺 1 項，NCC 為 14/15', async ({ page }) => {
  cloudRows = versionedPatrolRows('2026-09', '台北通化', 'DNB10059', Array.from({length:24}, (_, index) => index + 1));
  await stubGas(page);
  await openAndUnlock(page, PT_KEY, '2026-09');

  await expect(page.locator('#sep25LoadState')).toContainText('正式 ptdetail 唯讀驗證完成');
  const card = page.locator('#sep25Content .store-card').filter({ hasText:'台北通化' });
  await expect(card).toContainText('缺 1 項');
  await card.click();
  await expect(card).toContainText('14/15');
  await expect(card.locator('.miss-group .item .no')).toHaveText(['25']);
});

test('新版 25 題只有 V 完成，NA 的第 1、3、10 題維持缺項', async ({ page }) => {
  cloudRows = versionedPatrolRows('2026-09', '台北通化', 'DNB10059', Array.from({length:25}, (_, index) => index + 1));
  cloudRows[0] = {...cloudRows[0], result:'na'};
  cloudRows[2] = {...cloudRows[2], result:'', reason:'NA'};
  cloudRows[9] = {...cloudRows[9], result:'NA'};
  cloudRows.push({...cloudRows[1], fillTime:'2026/9/12 10:00', arriveTime:'2026/9/12 09:30', leaveTime:'2026/9/12 11:00'});
  await stubGas(page);
  await openAndUnlock(page, PT_KEY, '2026-09');

  await expect(page.locator('#sep25LoadState')).toContainText('正式 ptdetail 唯讀驗證完成');
  await expect(page.locator('#sep25Overview')).toContainText('尚缺檢核項次');
  await expect(page.locator('#sep25Overview')).toContainText('3');
  const card = page.locator('#sep25Content .store-card').filter({ hasText:'台北通化' });
  await expect(card).toContainText('缺 3 項');
  await expect(card.locator('.pill')).toHaveClass(/partial/);
  await expect(card.locator('.pill')).not.toHaveClass(/done/);
  await card.click();
  await expect(card.locator('.sep25-group strong')).toHaveText(['7/9','0/1','15/15']);
  await expect(card.locator('.miss-group .item .no')).toHaveText(['1','3','10']);
});

test('解析預覽先做 Server Preflight，不寫雲端、不改 rawDetails；確認後才逐店讀回', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  const pasted=[
    pasteLine(7, '台北通化', 'DNB10059', 1, 'v', ''),
    pasteLine(7, '台北酒泉', 'DNB10062', 2, 'v', ''),
  ].join('\n');
  await page.fill('#pasteBox', pasted);
  await page.getByRole('button', { name:'解析並預覽' }).click();

  await expect(page.locator('#patrolConfirmWriteBtn')).toBeVisible();
  expect(writeCalls).toBe(0);
  expect(ptDetailCalls).toEqual(expect.arrayContaining([
    expect.objectContaining({store:'台北通化',page:1,limit:100}),
    expect.objectContaining({store:'台北酒泉',page:1,limit:100}),
  ]));
  expect(await page.evaluate(() => rawDetails.length)).toBe(0);
  await expect(page.locator('#pasteBox')).toHaveValue(pasted);
  await expect(page.locator('#patrolPastePreview')).toContainText('本次預計寫入店點：台北通化、台北酒泉（2 筆）');

  await page.getByRole('button', { name:'確認寫入雲端' }).click();
  await expect(page.locator('#parseMsg')).toContainText('雲端寫入與 readback 一致');
  expect(writeCalls).toBe(1);
  expect(ptDetailCalls).toEqual(expect.arrayContaining([
    expect.objectContaining({store:'台北通化',page:1,limit:100}),
    expect.objectContaining({store:'台北酒泉',page:1,limit:100}),
  ]));
  expect(await page.evaluate(() => rawDetails.length)).toBe(2);
  await expect(page.locator('#pasteBox')).toHaveValue('');
});

test('write 後 readback 缺 key 時不得顯示成功，保留原始貼上與本地資料', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  const first=pasteLine(8, '台北通化', 'DNB10059', 1, 'v', '');
  const second=pasteLine(8, '台北通化', 'DNB10059', 2, 'v', '');
  const pasted=[first,second].join('\n');
  await page.fill('#pasteBox', pasted);
  await page.getByRole('button', { name:'解析並預覽' }).click();
  omitPtdetailRow=true;
  await page.getByRole('button', { name:'確認寫入雲端' }).click();

  await expect(page.locator('#parseMsg')).toContainText('雲端未完整寫入，已保留原始資料，請勿重複操作');
  await expect(page.locator('#parseMsg')).toContainText('解析 2 筆');
  await expect(page.locator('#parseMsg')).toContainText('written 2 筆');
  await expect(page.locator('#parseMsg')).toContainText('readback 1 筆');
  await expect(page.locator('#parseMsg')).toContainText('missing keys');
  expect(writeCalls).toBe(1);
  expect(cloudRows).toHaveLength(2);
  expect(ptDetailCalls).toHaveLength(2);
  expect(await page.evaluate(() => rawDetails.length)).toBe(0);
  await expect(page.locator('#pasteBox')).toHaveValue(pasted);
  await expect(page.locator('#patrolConfirmWriteBtn')).toBeHidden();

  await page.getByRole('button', { name:'解析並預覽' }).click();
  await expect(page.locator('#parseMsg')).toContainText('禁止重複寫入');
  expect(writeCalls).toBe(1);
});

test('Server Preflight 僅送新增缺失，既有內容差異 fail-closed', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  const existing=pasteLine(6,'台北通化','DNB10059',1,'v','');
  const addition=pasteLine(6,'台北通化','DNB10059',2,'v','');
  const fixture=currentMonthFixture(6,'台北通化','DNB10059',1,'v','');
  cloudRows=[{
    fillTime:`${fixture.fillDate} 16:43`,arriveTime:`${fixture.fillDate} 16:00`,leaveTime:`${fixture.fillDate} 18:00`,
    district:'北一二B',code:'DNB10059',store:'台北通化',inspector:'測試督導',item:1,content:'內容',result:'v',reason:'',month:fixture.month
  }];
  await page.fill('#pasteBox',[existing,addition].join('\n'));
  await page.getByRole('button',{name:'解析並預覽'}).click();
  await expect(page.locator('#patrolPastePreview')).toContainText('正式已存在且內容相同 1 筆');
  await expect(page.locator('#patrolPastePreview')).toContainText('新增缺失 1 筆');
  await page.getByRole('button',{name:'確認寫入雲端'}).click();
  await expect(page.locator('#parseMsg')).toContainText('解析 2 筆／寫入 1 筆／讀回 1 筆');
  expect(ptwritePayloads).toHaveLength(1);
  expect(ptwritePayloads[0]).toHaveLength(1);
  expect(ptwritePayloads[0][0].item).toBe(2);

  await page.fill('#pasteBox',pasteLine(6,'台北通化','DNB10059',1,'na','na'));
  await page.getByRole('button',{name:'解析並預覽'}).click();
  await expect(page.locator('#parseMsg')).toContainText('既有內容差異');
  await expect(page.locator('#patrolConfirmWriteBtn')).toBeHidden();
  expect(writeCalls).toBe(1);
});

test('本機選檔後顯示檔名與預覽，尚未確認前不呼叫 ptwrite', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  expect(await page.evaluate(()=>({xlsx:Boolean(window.XLSX),parser:Boolean(window.PatrolLocalFileImport),dependencies:document.querySelectorAll('script[data-patrol-local-import-dependency]').length}))).toEqual({xlsx:false,parser:false,dependencies:0});
  const lines=[
    pasteLine(7,'台北通化','DNB10174',1,'v',''),
    pasteLine(7,'台北酒泉','DNB10062',2,'v',''),
  ];
  await selectPatrolLocalCsv(page,'巡店紀錄_20260825.csv',lines);

  await expect(page.locator('#patrolLocalImportStatus')).toContainText('巡店紀錄_20260825.csv');
  await expect(page.locator('#patrolLocalImportStatus')).toContainText('有效資料');
  await expect(page.locator('#patrolLocalImportStatus')).toContainText('Server Preflight');
  await expect(page.locator('#patrolConfirmWriteBtn')).toBeVisible();
  expect(writeCalls).toBe(0);
  expect(await page.evaluate(()=>rawDetails.length)).toBe(0);
  await expect(page.locator('#content')).toContainText('台北通化');
  await page.locator('.secure-tab[data-view="mileage"]').click();
  await expect(page.locator('#miCoverage')).toContainText('本機預估里程');
  await expect(page.locator('#miSummary')).toContainText('台北通化');
  await page.getByRole('button',{name:'匯出公司報銷 Excel'}).click();
  await expect(page.locator('#miExportDlg')).toContainText('正式匯出尚未開放');
  await page.getByRole('button',{name:'取消'}).click();
  await page.locator('.secure-tab[data-view="patrol"]').click();
  expect(await page.evaluate(()=>({version:window.XLSX&&window.XLSX.version,parser:Boolean(window.PatrolLocalFileImport),dependencies:document.querySelectorAll('script[data-patrol-local-import-dependency]').length}))).toEqual({version:'0.20.3',parser:true,dependencies:2});

  await selectPatrolLocalCsv(page,'第二份.csv',[pasteLine(7,'台北永吉','DNB10082',3,'v','')]);
  await expect(page.locator('#patrolLocalImportStatus')).toContainText('第二份.csv');
  expect(await page.evaluate(()=>document.querySelectorAll('script[data-patrol-local-import-dependency]').length)).toBe(2);
  expect(writeCalls).toBe(0);
});

test('本機選檔的 code／store 矛盾在 dedupe 與 Preflight 前整批封鎖', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await selectPatrolLocalCsv(page,'店碼矛盾.csv',[pasteLine(6,'台北酒泉','DNB10174',1,'v','')]);

  await expect(page.locator('#patrolLocalImportStatus')).toContainText('營業點代碼與店名矛盾');
  await expect(page.locator('#parseMsg')).toContainText('正式 STORES 雙欄驗證');
  await expect(page.locator('#patrolConfirmWriteBtn')).toBeHidden();
  expect(ptDetailCalls).toHaveLength(0);
  expect(writeCalls).toBe(0);
});

test('本機選檔遇到雲端衝突時不顯示確認寫入', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  const fixture=currentMonthFixture(6,'台北通化','DNB10059',1,'v','');
  cloudRows=[{
    fillTime:`${fixture.fillDate} 16:43`,arriveTime:`${fixture.fillDate} 16:00`,leaveTime:`${fixture.fillDate} 18:00`,
    district:'北一二B',code:'DNB10059',store:'台北通化',inspector:'測試督導',item:1,content:'內容',result:'v',reason:'',month:fixture.month
  }];
  await selectPatrolLocalCsv(page,'有衝突.csv',[pasteLine(6,'台北通化','DNB10174',1,'na','na')]);

  await expect(page.locator('#patrolLocalImportStatus')).toContainText('衝突');
  await expect(page.locator('#parseMsg')).toContainText('雲端同鍵異內容');
  await expect(page.locator('#patrolConfirmWriteBtn')).toBeHidden();
  expect(writeCalls).toBe(0);
});

test('本機選檔確認後才 ptwrite，readback 成功後刷新看板與移動里程', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  const lines=[
    pasteLine(8,'通化','dnb10174',1,'v',''),
    pasteLine(8,'酒泉','dnb10062',2,'v',''),
    pasteLine(8,'萬大','dnb10168',3,'v',''),
  ];
  await selectPatrolLocalCsv(page,'確認後寫入.csv',lines);
  expect(writeCalls).toBe(0);
  await page.getByRole('button',{name:'確認寫入雲端'}).click();

  await expect(page.locator('#parseMsg')).toContainText('本機檔案寫入與雲端讀回一致');
  await expect(page.locator('#parseMsg')).toContainText('解析 3 筆／新增 3 筆／已存在 0 筆／讀回 3 筆');
  await expect(page.locator('#patrolLocalImportStatus')).toBeHidden();
  await expect(page.locator('#content')).toContainText('台北通化');
  await expect(page.locator('#content')).toContainText('台北酒泉');
  expect(writeCalls).toBe(1);
  expect(ptwritePayloads[0].map(row=>({code:row.code,store:row.store}))).toEqual([
    {code:'DNB10174',store:'台北通化'},
    {code:'DNB10062',store:'台北酒泉'},
    {code:'DNB10168',store:'台北萬大'},
  ]);
  await expect.poll(()=>ptMileageCalls.length).toBeGreaterThan(0);
});

test('本機解析元件動態載入失敗時 fail-closed 且零寫入', async ({ page }) => {
  await page.route('**/assets/vendor/xlsx.full.min.js*', route=>route.abort());
  await stubGas(page);
  await openAndUnlock(page);
  await selectPatrolLocalCsv(page,'載入失敗.csv',[pasteLine(8,'台北通化','DNB10174',1,'v','')]);

  await expect(page.locator('#patrolLocalImportStatus')).toContainText('本機解析元件');
  await expect(page.locator('#patrolLocalImportStatus')).toContainText('未呼叫 ptwrite');
  await expect(page.locator('#patrolConfirmWriteBtn')).toBeHidden();
  expect(await page.evaluate(()=>pendingPatrolWrite)).toBeNull();
  expect(ptDetailCalls).toHaveLength(0);
  expect(writeCalls).toBe(0);
});

test('本機選檔 readback 暫時缺漏時自動核對且不重複寫入', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  const lines=[
    pasteLine(9,'台北通化','DNB10174',1,'v',''),
    pasteLine(9,'台北通化','DNB10174',2,'v',''),
  ];
  await selectPatrolLocalCsv(page,'保留重試.csv',lines);
  omitPtdetailRow=true;
  await page.getByRole('button',{name:'確認寫入雲端'}).click();

  await expect(page.locator('#parseMsg')).toContainText('正在自動重試讀回核對');
  await expect(page.locator('#patrolConfirmWriteBtn')).toBeHidden();
  expect(writeCalls).toBe(1);
  omitPtdetailRow=false;
  await expect(page.locator('#parseMsg')).toContainText('本機檔案寫入與雲端讀回一致',{timeout:10000});
  expect(writeCalls).toBe(1);
});

test('九月看板先顯示正式摘要，不把店別明細載入誤報成逾時', async ({ page }) => {
  cloudRows=[{
    fillTime:'2026/9/4 16:43',arriveTime:'2026/9/4 16:00',leaveTime:'2026/9/4 18:00',
    district:'北一二B',code:'DNB10174',store:'台北通化',inspector:'測試督導',
    item:1,content:'內容',result:'v',reason:'',month:'2026-09'
  }];
  ptDetailDelayMs=800;
  await stubGas(page);
  await openAndUnlock(page,PT_KEY,'2026-09');
  await expect.poll(()=>ptDetailCalls.filter(call=>call.month==='2026-09').length).toBeGreaterThan(0);
  await expect(page.locator('#sep25Overview')).toContainText('摘要已讀取');
  await expect(page.locator('#sep25Content')).toContainText('店別明細正在背景載入');
  await expect(page.locator('#sep25Content')).not.toContainText('巡店資料讀取逾時');
  await expect(page.locator('#sep25LoadState')).toContainText('正式 ptdetail 唯讀驗證完成',{timeout:10000});
});

test('督導面談紀錄可解析十一欄、排除員編並寫入獨立雲端後讀回', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('button[data-view="halfDashboard"]').click();
  await expect(page.locator('#halfDashboardView')).toContainText('督導面談紀錄');
  await page.locator('#supervisorInterviewFileInput').setInputFiles({
    name:'督導面談範例.csv',mimeType:'text/csv',
    buffer:Buffer.from('填報人員,面談人員組織,面談人員編號,面談人員,面談原因,表單狀態,面談日期,填表日期,結案日期,建議與指導,同仁回饋\n測試督導,台北通化,123456,測試同仁,例行人員訪談,已結案,2026/8/4,2026/8/4,2026/8/5,績效追蹤,收到')
  });
  await expect(page.locator('#supervisorInterviewImportStatus')).toContainText('本機檢查完成');
  await expect(page.locator('#supervisorInterviewPreview')).toContainText('面談日期');
  await expect(page.locator('#supervisorInterviewPreview')).toContainText('績效追蹤');
  await expect(page.locator('#supervisorInterviewPreview')).not.toContainText('123456');
  await page.getByRole('button',{name:'確認儲存本季紀錄'}).click();
  await expect(page.locator('#supervisorInterviewImportStatus')).toContainText('雲端儲存並讀回完成');
  await expect(page.locator('#supervisorInterviewProgress')).toContainText('已完成');
  await expect(page.locator('#supervisorInterviewCompleted')).toContainText('測試同仁');
  expect(interviewWriteCalls).toBe(1);
  expect(JSON.stringify(interviewRows)).not.toContain('123456');
  expect(writeCalls).toBe(0);
});

test('本機選檔錯誤檔案不污染下一次正確匯入', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('#patrolLocalFileInput').setInputFiles({name:'錯誤.csv',mimeType:'text/csv',buffer:Buffer.from('姓名,金額\n測試,100')});
  await expect(page.locator('#patrolLocalImportStatus')).toContainText('缺少必要表頭');
  await expect(page.locator('#patrolConfirmWriteBtn')).toBeHidden();

  await selectPatrolLocalCsv(page,'正確.csv',[pasteLine(10,'台北永吉','DNB10082',3,'v','')]);
  await expect(page.locator('#patrolLocalImportStatus')).toContainText('正確.csv');
  await expect(page.locator('#patrolLocalImportStatus')).not.toContainText('錯誤.csv');
  await expect(page.locator('#patrolConfirmWriteBtn')).toBeVisible();
  expect(writeCalls).toBe(0);
});

test('本機選檔按鈕在 iPhone 尺寸不溢出或遮住', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await stubGas(page);
  await openAndUnlock(page);
  const layout=await page.evaluate(()=>{
    const button=document.getElementById('patrolLocalFileButton').getBoundingClientRect();
    return {buttonLeft:button.left,buttonRight:button.right,viewport:window.innerWidth,scrollWidth:document.documentElement.scrollWidth};
  });
  expect(layout.buttonLeft).toBeGreaterThanOrEqual(0);
  expect(layout.buttonRight).toBeLessThanOrEqual(layout.viewport);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);
});

test('readback 在同一店超過 100 列時完整走第二頁', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  const month=[2026,8];
  const lines=[];
  for(let visit=0;visit<4;visit++){
    for(let item=1;item<=33;item++){
      lines.push(`${month[0]}/${month[1]}/9 ${12+visit}:43\t${month[0]}/${month[1]}/9 ${12+visit}:00\t${month[0]}/${month[1]}/9 ${12+visit}:30\t北一二B\tDNB10059\t台北通化\t測試督導\t${item}\t內容\tv\t`);
    }
  }
  await page.fill('#pasteBox', lines.join('\n'));
  await parseAndConfirm(page);
  await expect(page.locator('#parseMsg')).toContainText('解析 132 筆／寫入 132 筆／讀回 132 筆');
  expect(ptDetailCalls).toEqual(expect.arrayContaining([
    expect.objectContaining({store:'台北通化',page:1,limit:100}),
    expect.objectContaining({store:'台北通化',page:2,limit:100}),
  ]));
});

test('電腦確認寫入且 readback 一致後，另一裝置輸入通行碼看得到', async ({ browser }) => {
  // ── 裝置一（電腦）：輸入通行碼、解析預覽、確認寫入 ──
  const desktop = await browser.newPage();
  await stubGas(desktop);
  await openAndUnlock(desktop);
  await expect(desktop.locator('#cloudStatus')).toHaveText(/已連線/);

  const lines = [
    pasteLine(1, '台北通化', 'DNB10059', 1, '', 'na'),
    pasteLine(1, '台北通化', 'DNB10059', 14, 'v', ''),
    pasteLine(2, '台北酒泉', 'DNB10062', 15, 'v', ''),
  ].join('\n');
  await desktop.fill('#pasteBox', lines);
  await parseAndConfirm(desktop);
  await expect(desktop.locator('#parseMsg')).toHaveText(/readback 一致/);
  expect(cloudRows.length).toBe(3);

  // ── 裝置二（手機）：全新頁面，輸入通行碼後直接看到雲端資料 ──
  const mobile = await browser.newPage();
  await stubGas(mobile);
  await openAndUnlock(mobile);
  await expect(mobile.locator('#cloudStatus')).toHaveText(/已連線/);
  await expect(mobile.locator('#parseMsg')).toHaveText(/巡店摘要已更新 · 2\/9 店/);
  await expect(mobile.locator('#content')).toContainText('台北通化');
  await expect(mobile.locator('#content')).toContainText('台北酒泉');

  await desktop.close();
  await mobile.close();
});

test('通行碼錯誤時拿不到資料', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page, '猜錯的密碼');
  await expect(page.locator('#patrolAuthGate')).toBeVisible();
  await expect(page.locator('#patrolAuthMessage')).toHaveText(/通行碼錯誤/);
  await expect(page.locator('#patrolAppHost')).toBeEmpty();
});

test('重複貼上同一批資料，雲端自動去重', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  const line = pasteLine(3, '台北永吉', 'DNB10082', 16, 'v', '');
  await page.fill('#pasteBox', line);
  await parseAndConfirm(page);
  await expect.poll(() => cloudRows.length).toBe(1);
  const callsAfterFirst = writeCalls;

  await page.fill('#pasteBox', line);
  await page.getByRole('button', { name:'解析並預覽' }).click();
  await expect(page.locator('#parseMsg')).toHaveText(/沒有新候選/);
  expect(writeCalls).toBe(callsAfterFirst);
  expect(cloudRows.length).toBe(1);
  await expect(page.locator('#patrolPastePreview')).toContainText('本次貼上：0 筆');
  await expect(page.locator('#patrolPastePreview')).toContainText('本頁去重候選共 1 筆');
});

// ── 解析狀態訊息與雲端同步防呆（2026-08-03 修 showMsg inline display:none 蓋住訊息）──
test.describe('解析狀態訊息', () => {
  test('訊息自動隱藏後，第二次解析仍看得到（防 inline display:none 蓋住）', async ({ page }) => {
    await stubGas(page);
    await openAndUnlock(page);
    await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

    await page.fill('#pasteBox', pasteLine(1, '台北通化', 'DNB10059', 1, 'v', ''));
    await parseAndConfirm(page);
    await expect(page.locator('#parseMsg')).toHaveText(/readback 一致/);

    // 模擬自動隱藏計時器把 inline display 設成 none 之後的狀態
    await page.evaluate(() => { document.getElementById('parseMsg').style.display = 'none'; });
    await expect(page.locator('#parseMsg')).toBeHidden();

    // 第二批：修好前 inline none 會蓋住新訊息，這裡必須重新看得到
    await page.fill('#pasteBox', pasteLine(2, '台北酒泉', 'DNB10062', 2, 'v', ''));
    await parseAndConfirm(page);
    await expect(page.locator('#parseMsg')).toBeVisible();
    await expect(page.locator('#parseMsg')).toHaveText(/readback 一致/);
  });

  test('新資料顯示新增筆數；重複貼上顯示新增 0 筆（不是沒反應）', async ({ page }) => {
    await stubGas(page);
    await openAndUnlock(page);
    await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

    const line = pasteLine(3, '台北永吉', 'DNB10082', 16, 'v', '');
    await page.fill('#pasteBox', line);
    await parseAndConfirm(page);
    await expect(page.locator('#parseMsg')).toHaveText(/解析 1 筆／寫入 1 筆／讀回 1 筆/);

    await page.fill('#pasteBox', line);
    await page.getByRole('button', { name:'解析並預覽' }).click();
    await expect(page.locator('#parseMsg')).toBeVisible();
    await expect(page.locator('#parseMsg')).toHaveText(/新增 0 筆/);
  });

  test('雲端寫入失敗時，紅色錯誤訊息保持顯示、不自動消失', async ({ page }) => {
    await stubGas(page);
    await openAndUnlock(page);
    await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

    failPtwrite = true;
    await page.fill('#pasteBox', pasteLine(4, '台北萬大', 'DNB10063', 5, 'v', ''));
    await parseAndConfirm(page);
    await expect(page.locator('#parseMsg')).toHaveText(/雲端寫入失敗/);
    await expect(page.locator('#parseMsg')).toHaveClass(/err/);

    // 錯誤訊息不會自動消失
    await page.waitForTimeout(1200);
    await expect(page.locator('#parseMsg')).toBeVisible();
    await expect(page.locator('#parseMsg')).toHaveText(/雲端寫入失敗/);
  });

  test('看板渲染失敗時，仍會送出雲端且資料不靜默消失', async ({ page }) => {
    await stubGas(page);
    await openAndUnlock(page);
    await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

    // 讓看板渲染拋錯
    await page.evaluate(() => { window.render = () => { throw new Error('render 壞了'); }; });

    const before = writeCalls;
    await page.fill('#pasteBox', pasteLine(6, '台北三創', 'DNB10064', 7, 'v', ''));
    await parseAndConfirm(page);

    // render 拋錯仍呼叫 ptwrite，資料成功進雲端（不因畫面壞掉而遺失）
    await expect.poll(() => writeCalls).toBeGreaterThan(before);
    await expect.poll(() => cloudRows.length).toBe(1);

    // 明確告知使用者：資料進了雲端、但看板沒畫出來（不是靜默消失）
    await expect(page.locator('#parseMsg')).toHaveText(/看板更新失敗/);
    await expect(page.locator('#parseMsg')).toBeVisible();
  });
});

test('貼上明細後切到督導面談紀錄不重讀巡店或班表', async ({ page }) => {
  cloudRows = item18EightStoreRows();
  await stubGas(page);
  await openAndUnlock(page);
  await expect(item18Panel(page)).toContainText('8/9 店完成');

  const julyOnly = item18EightStoreRows().slice(0, 3).map(row =>
    `${row.fillTime}\t${row.arriveTime}\t${row.leaveTime}\t${row.district}\t${row.code}\t${row.store}\t${row.inspector}\t18\t內容\tv\t`
  ).join('\n');
  await page.fill('#pasteBox', julyOnly);
  await page.getByRole('button',{name:'解析並預覽'}).click();
  await expect(page.locator('#parseMsg')).toHaveText(/本輪沒有新增缺失/);
  await expect(page.locator('#patrolConfirmWriteBtn')).toBeHidden();
  await expect(item18Panel(page)).toContainText('8/9 店完成');
  await expect(page.locator('#patrolPastePreview')).toContainText('本次貼上：3 筆');
  const readsBeforeSwitch = ptReadCalls;

  await page.click('[data-view="halfDashboard"]');
  await expect(page.locator('#halfDashboardView')).toContainText('督導面談紀錄');
  await expect(page.locator('#halfDashboardView')).toContainText('尚未選擇檔案');
  expect(ptReadCalls).toBe(readsBeforeSwitch);
});

test.describe('巡店貼上正式摘要來源回歸', () => {
  test('正式 8/9 時貼上只有 3 店的局部批次仍維持 8/9', async ({ page }) => {
    cloudRows = item18EightStoreRows();
    await stubGas(page);
    await openAndUnlock(page);
    await expect(item18Panel(page)).toContainText('8/9 店完成');

    const batch = item18EightStoreRows().slice(0, 3).map(row =>
      `${row.fillTime}\t${row.arriveTime}\t${row.leaveTime}\t${row.district}\t${row.code}\t${row.store}\t${row.inspector}\t18\t內容\tv\t`
    ).join('\n');
    await page.fill('#pasteBox', batch);
    await page.getByRole('button',{name:'解析並預覽'}).click();

    await expect(page.locator('#parseMsg')).toHaveText(/本輪沒有新增缺失/);
    await expect(item18Panel(page)).toContainText('8/9 店完成');
    const state = await page.evaluate(() => ({ summary:patrolSummary.item18.completedStores, local:rawDetails.length, source:patrolSummaryState }));
    expect(state).toEqual({ summary:8, local:0, source:'ok' });
  });

  test('成功寫入後只以 fresh ptsummary 將 7/9 更新為 8/9', async ({ page }) => {
    cloudRows = item18EightStoreRows().slice(0, 7);
    await stubGas(page);
    await openAndUnlock(page);
    await expect(item18Panel(page)).toContainText('7/9 店完成');
    const readsBefore = ptReadCalls;

    const row = item18EightStoreRows()[7];
    await page.fill('#pasteBox', `${row.fillTime}\t${row.arriveTime}\t${row.leaveTime}\t${row.district}\t${row.code}\t${row.store}\t${row.inspector}\t18\t內容\tv\t`);
    await parseAndConfirm(page);

    await expect(page.locator('#parseMsg')).toHaveText(/正式摘要已更新/);
    await expect(item18Panel(page)).toContainText('8/9 店完成');
    expect(ptReadCalls).toBeGreaterThan(readsBefore);
  });

  test('寫入失敗時保留 last-good 8/9，不顯示局部摘要', async ({ page }) => {
    cloudRows = item18EightStoreRows();
    await stubGas(page);
    await openAndUnlock(page);
    await expect(item18Panel(page)).toContainText('8/9 店完成');
    failPtwrite = true;

    await page.fill('#pasteBox', pasteLine(12, '台北通化', 'DNB10059', 14, 'v', ''));
    await parseAndConfirm(page);

    await expect(page.locator('#parseMsg')).toHaveText(/雲端寫入失敗/);
    await expect(item18Panel(page)).toContainText('8/9 店完成');
    expect(await page.evaluate(() => patrolSummary.item18.completedStores)).toBe(8);
  });

  test('ptsummary refresh 失敗時保留 last-good 並明示正式摘要更新失敗', async ({ page }) => {
    cloudRows = item18EightStoreRows();
    await stubGas(page);
    await openAndUnlock(page);
    await expect(item18Panel(page)).toContainText('8/9 店完成');
    await page.evaluate(() => {
      const original=window.cloudCall;
      window.cloudCall=(action,params)=>action==='ptsummary'
        ? Promise.reject(new Error('巡店資料讀取逾時'))
        : original(action,params);
    });

    await page.fill('#pasteBox', pasteLine(13, '台北通化', 'DNB10059', 15, 'v', ''));
    await parseAndConfirm(page);

    await expect(page.locator('#parseMsg')).toHaveText(/正式摘要更新失敗/);
    await expect(page.locator('#parseMsg')).toHaveText(/保留上次成功正式摘要/);
    await expect(item18Panel(page)).toContainText('8/9 店完成');
    expect(await page.evaluate(() => ({count:patrolSummary.item18.completedStores,state:patrolSummaryState}))).toEqual({count:8,state:'stale'});
  });

  test('沒有 rawDetails 的 ptsummary 頁面匯入局部檔案仍維持正式 8/9', async ({ page }) => {
    cloudRows = item18EightStoreRows();
    await stubGas(page);
    await openAndUnlock(page);
    expect(await page.evaluate(() => rawDetails.length)).toBe(0);
    await expect(item18Panel(page)).toContainText('8/9 店完成');

    const partial=item18EightStoreRows().slice(0,3);
    await page.locator('#importFile').setInputFiles({
      name:'patrol-partial.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(partial)),
    });

    await expect(page.locator('#patrolPastePreview')).toContainText('本次匯入：3 筆');
    await expect(item18Panel(page)).toContainText('8/9 店完成');
    expect(await page.evaluate(() => ({local:rawDetails.length,state:patrolSummaryState}))).toEqual({local:3,state:'ok'});
    expect(writeCalls).toBe(0);
  });
});

test('盤點提醒框：題14-17每月與題18兩個月獨立顯示進度', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  // 通化完成 14-17 全部＋本期(7月)做過 18；酒泉只完成 14；
  // 三創 6/20 做過 18 → 屬「5–6月期」，在 7 月（7–8月期）應顯示未完成、記在上期
  const lines = [
    pasteLine(5, '台北通化', 'DNB10059', 14, 'v', ''),
    pasteLine(5, '台北通化', 'DNB10059', 15, 'v', ''),
    pasteLine(5, '台北通化', 'DNB10059', 16, 'v', ''),
    pasteLine(5, '台北通化', 'DNB10059', 17, 'v', ''),
    pasteLine(5, '台北通化', 'DNB10059', 18, 'v', ''),
    pasteLine(6, '台北酒泉', 'DNB10062', 14, 'v', ''),
    `2026/6/20 10:00\t2026/6/20 09:00\t2026/6/20 12:00\t北一二B\tDNB10307\t台北三創\t測試督導\t18\t內容\tv\t`,
  ].join('\n');
  await page.fill('#pasteBox', lines);
  await parseAndConfirm(page);
  await expect(page.locator('#parseMsg')).toHaveText(/readback 一致/);

  const panels = page.locator('#invPanels');
  // 每月盤點：只有通化 4 項全完成 → 1/9
  await expect(panels).toContainText('每月盤點提醒');
  await expect(panels).toContainText('1/9 店完成');
  // 到店全盤：固定週期 7–8月
  await expect(panels).toContainText('本期 7–8月');
  const table18 = panels.locator('table').nth(1);
  // 通化 7/5 完成 → 本期已完成
  await expect(table18.locator('tr', { hasText: '通化' })).toContainText('✓ 已完成');
  // 三創 6/20 是上一期（5–6月）→ 本期未完成，但上期紀錄看得到
  const sanchuang = table18.locator('tr', { hasText: '三創' });
  await expect(sanchuang).toContainText('✗ 未完成');
  // 寫入後正式大盤改以 ptsummary readback 為準；canonical 日期格式是 ISO。
  await expect(sanchuang).toContainText('✓ 2026-06-20');
});

test('知悉宣導提醒：題19-33只看總進度與20日前完成狀態', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  // 通化 7/5 完成全部 19-33；酒泉只完成題 19
  const lines = [];
  for (let i = 19; i <= 33; i++) lines.push(pasteLine(5, '台北通化', 'DNB10059', i, 'v', ''));
  lines.push(pasteLine(6, '台北酒泉', 'DNB10062', 19, 'v', ''));
  await page.fill('#pasteBox', lines.join('\n'));
  await parseAndConfirm(page);
  await expect(page.locator('#parseMsg')).toHaveText(/readback 一致/);

  const panels = page.locator('#invPanels');
  await expect(panels).toContainText('知悉宣導提醒');
  const table = panels.locator('table').nth(2);
  const tonghua = table.locator('tr', { hasText: '通化' });
  await expect(tonghua).toContainText('15/15');
  await expect(tonghua).toContainText('✓ 已完成');
  // ptsummary 的知悉宣導契約只回 completedDay，不以局部貼上列重建日期字串。
  await expect(tonghua).toContainText('5');
  const jiuquan = table.locator('tr', { hasText: '酒泉' });
  await expect(jiuquan).toContainText('1/15');
  // 正式 ptsummary 表格顯示 canonical 未完成狀態；不再以局部貼上批次重算倒數。
  await expect(jiuquan).toContainText('✗ 未完成');
  await expect(jiuquan).toContainText('—');
});

test('其他督導：GAS 回傳自己的標題與門市清單，看板跟著切換', async ({ page }) => {
  cloudConfig = {
    title: '南區A · 王督導 · 33 項檢核追蹤',
    stores: [
      { code: 'DNS20001', name: '高雄夢時代' },
      { code: 'DNS20002', name: '高雄左營' },
    ],
  };
  await stubGas(page);
  await openAndUnlock(page);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  await expect(page.locator('#subTitle')).toHaveText('南區A · 王督導 · 33 項檢核追蹤');
  const panels = page.locator('#invPanels');
  await expect(panels).toContainText('0/2 店完成'); // 門市數變成該區的 2 店
  await expect(panels).toContainText('夢時代');
  await expect(panels).toContainText('左營');
  await expect(panels).not.toContainText('通化'); // 不會出現北一二B 的店

  await page.locator('#monthInput').evaluate(input => {
    input.value = '2026-09';
    input.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await expect(page.locator('#sep25LoadState')).toContainText('正式 ptdetail 唯讀驗證完成');
  await expect(page.locator('#subTitle')).toHaveText('南區A · 王督導 · 新版 25 項檢核追蹤');
  await expect(page.locator('#sep25GroupSummary')).toContainText('0/2');
  await expect(page.locator('#sep25Content')).toContainText('高雄夢時代');
  await expect(page.locator('#sep25Content')).toContainText('高雄左營');
});

test('大量資料會分批上傳且全數送達', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  const lines = [];
  for (let i = 1; i <= 25; i++) {
    lines.push(pasteLine((i % 28) + 1, '台北三創', 'DNB10307', (i % 33) + 1, 'v', ''));
  }
  await page.fill('#pasteBox', lines.join('\n'));
  await parseAndConfirm(page);
  await expect(page.locator('#parseMsg')).toHaveText(/readback 一致/);
  expect(cloudRows.length).toBe(25);
  expect(writeCalls).toBeGreaterThan(1); // 確實有分批
});

test('新版 25 項看板只在巡店頁籤顯示，不滲入里程、班表、到店檢查與督導大盤', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page, PT_KEY, '2026-09');
  await expect(page.locator('#sep25Dashboard')).toBeVisible();
  for (const view of ['mileage','schedule','half','halfDashboard']) {
    await page.locator(`.secure-tab[data-view="${view}"]`).click();
    await expect(page.locator('#sep25Dashboard')).toBeHidden();
  }
  await page.locator('.secure-tab[data-view="patrol"]').click();
  await expect(page.locator('#sep25Dashboard')).toBeVisible();
});

test('公開頁面不載入班表副本，未連線或未輸入通行碼時保持鎖定', async ({ page }) => {
  await page.route('https://script.google.com/**', route => route.abort());
  await page.goto(PAGE_URL);
  await expect(page.locator('script[src="data/schedule.js"]')).toHaveCount(0);
  await expect(page.locator('#patrolAuthGate')).toBeVisible();
  await expect(page.locator('.secure-tab')).toHaveCount(0);
  await expect(page.locator('#scheduleView')).toHaveCount(0);
});

test('加密頁籤：每月班表可切換日週月檢視', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('.secure-tab[data-view="schedule"]').click();
  await expect(page.locator('#scheduleView')).toBeVisible();
  await expect(page.locator('#scheduleContent')).toContainText('通化');
  await page.locator('#scheduleMode').selectOption('week');
  await expect(page.locator('#scheduleContent')).toContainText('每週出勤');
  await page.locator('#scheduleMode').selectOption('month');
  await expect(page.locator('#scheduleContent')).toContainText('每月班表');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 Excel' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/TWM_班表_2026-07\.xls/);
  const xml = await fs.readFile(await download.path(), 'utf8');
  expect(xml).toContain('班表顏色備註');
  expect(xml).toContain('店長：淺膚色');
  expect(xml).toContain('副店長：淺藍色');
  expect(xml).toContain('休假：淺綠色');
  expect(xml).toContain('ss:StyleID="Manager"');
  expect(xml).toContain('ss:StyleID="AssistantManager"');
  expect(xml).toContain('ss:StyleID="Vacation"');
});

test('加密頁籤：督導到店檢查保留舊日期 18 題並可回填缺失', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('.secure-tab[data-view="half"]').click();
  await expect(page.locator('#halfView')).toBeVisible();
  await expect(page.locator('.half-item')).toHaveCount(18);
  await page.locator('#halfInspector').fill('測試督導');
  await page.locator('.half-result').first().selectOption('abnormal');
  await page.locator('.half-note').first().fill('展示機未亮');
  await page.locator('.half-improvement').first().fill('當日完成開機並拍照回存');
  await page.getByRole('button', { name: '只暫存本機' }).click();
  await expect(page.locator('#halfHistory')).toContainText('通化');
  await expect(page.locator('#halfHistory')).toContainText('1 項異常');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 Excel' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/督導到店檢查_.*\.xls/);
  const xml = await fs.readFile(await download.path(), 'utf8');
  expect(xml).toContain('照片影片附件');
  expect(xml).toContain('2026/09 前第 1–18 題');
});

test('督導到店檢查自 2026/09 起改為新版第 1–9 題，舊日期仍為 18 題', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page, PT_KEY, '2026-09');
  await page.locator('.secure-tab[data-view="half"]').click();
  await expect(page.getByRole('button', { name:'督導到店檢查' })).toHaveClass(/active/);
  await page.locator('#halfDate').fill('2026-09-01');
  await page.locator('#halfDate').dispatchEvent('change');
  await expect(page.locator('.half-item')).toHaveCount(9);
  await expect(page.locator('.half-item').first()).toContainText('督導打卡');
  await page.locator('#halfDate').fill('2026-08-31');
  await page.locator('#halfDate').dispatchEvent('change');
  await expect(page.locator('.half-item')).toHaveCount(18);
  await expect(page.locator('.half-item').last()).toContainText('到店全盤');
});

test('半月同步 token 逾時時保留本機資料，重新驗證後只續傳一次', async ({ page }) => {
  // 18 題依既有 URL 長度限制切成 3 個 hwrite；讓第 2 段失效，
  // 驗證不會從頭重送已成功的第 1 段。
  expireHalfWriteAt = 2;
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('.secure-tab[data-view="half"]').click();
  await page.locator('#halfInspector').fill('測試督導');
  await page.locator('.half-result').first().selectOption('abnormal');
  await page.locator('.half-note').first().fill('展示機未亮');
  await page.locator('.half-improvement').first().fill('當日完成開機並拍照回存');

  await page.getByRole('button', { name: '儲存並同步本期檢查' }).click();
  await expect(page.locator('#patrolReauthModal')).toBeVisible();
  await expect(page.locator('#patrolReauthModal')).toContainText('督導驗證已逾時，請重新驗證後繼續同步');
  await expect(page.locator('#halfInspector')).toHaveValue('測試督導');
  await expect(page.locator('.half-note').first()).toHaveValue('展示機未亮');
  expect(await page.evaluate(() => sessionStorage.getItem('bei12b_patrol_session_token_v2'))).toBeNull();
  expect(halfRows).toHaveLength(7);
  expect(new Set(halfRows.map(row => `${row.checkId}|${row.item}`)).size).toBe(7);

  await page.locator('#patrolReauthPasscode').fill(PT_KEY);
  await page.getByRole('button', { name: '重新驗證並繼續同步' }).click();
  await expect.poll(() => halfRows.length).toBe(18);
  await expect(page.locator('#halfMsg')).toContainText('已同步雲端');
  expect(halfWriteCalls).toBe(4); // 第 1 段成功 + 第 2 段失敗／續傳 + 第 3 段成功
  expect(new Set(halfRows.map(row => `${row.checkId}|${row.item}`)).size).toBe(18);

  await page.reload();
  await expect(page.locator('#patrolAuthGate')).toBeHidden();
  await page.locator('.secure-tab[data-view="half"]').click();
  await expect(page.locator('#halfHistory')).toContainText('測試督導');
  await expect(page.locator('#halfHistory')).toContainText('1 項異常');
});

test('加密頁籤：半月督導檢查可上傳照片影片並在歷史回放', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('.secure-tab[data-view="half"]').click();
  await page.locator('#halfInspector').fill('測試督導');
  const mediaInput = page.locator('.half-evidence-file').first();
  await mediaInput.setInputFiles({ name: '展示機.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('photo') });
  await expect(page.locator('.half-media-card .pending')).toHaveCount(1);
  await mediaInput.setInputFiles({ name: '展示機說明.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video') });
  await expect(page.locator('.half-media-card .pending')).toHaveCount(2);
  await page.getByRole('button', { name: '上傳選取的照片／影片' }).first().click();
  await expect.poll(() => mediaUploads.length).toBe(2);
  await expect(page.locator('.half-media-card img').first()).toBeVisible();
  await expect(page.locator('.half-media-card iframe').first()).toBeVisible();

  await page.getByRole('button', { name: '儲存並同步本期檢查' }).click();
  await expect.poll(() => halfRows.length).toBe(18);
  expect(halfRows[0].evidenceNames).toContain('media-1');
  await page.getByRole('button', { name: /預覽／回放 2 個檔案/ }).click();
  await expect(page.locator('#halfMediaModal')).toBeVisible();
  await expect(page.locator('#halfMediaModal img')).toBeVisible();
  await expect(page.locator('#halfMediaModal iframe')).toBeVisible();
  await page.locator('#halfMediaModal .half-media-modal-close').click();
  await expect(page.locator('#halfMediaModal')).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 Excel' }).click();
  const xml = await fs.readFile(await (await downloadPromise).path(), 'utf8');
  expect(xml).toContain('開啟私有附件');
  expect(xml).toContain('ss:HRef="https://drive.google.com/file/d/media-1/view"');
});

test('督導面談紀錄取代舊大盤且不再顯示巡店統計', async ({ page }) => {
  const full = (store, code, date, from, to) => Array.from({ length: to - from + 1 }, (_, index) => ({
    fillTime: `${date} 16:43`, arriveTime: `${date} 16:00`, leaveTime: `${date} 18:00`, district: '北一二B',
    code, store, inspector: '測試督導', item: from + index, result: 'v', reason: '', month: '2026-07',
  }));
  cloudRows = [
    ...full('台北通化', 'DNB10059', '2026/7/10', 2, 13),
    ...full('台北通化', 'DNB10059', '2026/7/20', 2, 13),
    ...full('台北通化', 'DNB10059', '2026/7/20', 14, 18),
    ...full('台北酒泉', 'DNB10062', '2026/7/10', 2, 5),
  ];
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('button[data-view="halfDashboard"]').click();
  const dashboard = page.locator('#halfDashboardView');
  await expect(dashboard).toBeVisible();
  await expect(dashboard).toContainText('督導面談紀錄');
  await expect(dashboard).toContainText('選擇督導面談檔案');
  await expect(dashboard).not.toContainText('巡店異常明細');
  await expect(page.locator('#halfDashboardMonth')).toHaveCount(0);
});

test('督導面談本機上傳不會觸發巡店、到店檢查或班表寫入', async ({ page }) => {
  const fixture = currentMonthFixture(1, '台北通化', 'DNB10059', 1, 'v', '');
  const rows = (store, code, days) => days.flatMap((day, index) => Array.from({ length: 10 }, (_, item) => ({
    fillTime: `${fixture.fillDate.replace(/\/1$/, `/${day}`)} 16:43`, arriveTime: `${fixture.fillDate.replace(/\/1$/, `/${day}`)} 16:00`, leaveTime: `${fixture.fillDate.replace(/\/1$/, `/${day}`)} 18:00`, district: '北一二B',
    code, store, inspector: '測試督導', item: item + 2, result: 'v', reason: '', month: fixture.month,
  })).concat(index === days.length - 1 ? [{
    fillTime: `${fixture.fillDate.replace(/\/1$/, `/${day}`)} 16:43`, arriveTime: `${fixture.fillDate.replace(/\/1$/, `/${day}`)} 16:00`, leaveTime: `${fixture.fillDate.replace(/\/1$/, `/${day}`)} 18:00`, district: '北一二B',
    code, store, inspector: '測試督導', item: 12, result: '', reason: '展示機異常', month: fixture.month,
  }] : []));
  cloudRows = [
    ...rows('台北通化', 'DNB10059', [2, 5, 10, 16, 20]),
    ...rows('台北酒泉', 'DNB10062', [2, 5, 10, 16]),
  ];
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('button[data-view="halfDashboard"]').click();
  const dashboard = page.locator('#halfDashboardView');
  await page.locator('#supervisorInterviewFileInput').setInputFiles({name:'面談.tsv',mimeType:'text/tab-separated-values',buffer:Buffer.from('填報人員\t面談人員組織\t面談人員編號\t面談人員\t面談原因\t表單狀態\t面談日期\t填表日期\t結案日期\t建議與指導\t同仁回饋\n測試督導\t台北通化\t123456\t測試同仁\t例行人員訪談\t已結案\t2026/8/4\t2026/8/4\t2026/8/5\t追蹤\t收到')});
  await expect(dashboard).toContainText('本機檢查完成');
  expect(writeCalls).toBe(0);
  expect(halfWriteCalls).toBe(0);
  expect(interviewWriteCalls).toBe(0);
});

/* =========================================================================
   每日移動里程頁籤
   夾具＝2026-06 實際巡店明細（6/1～6/22，21 次到店）。刻意為部分到店重複
   多列題號，用來驗證「同店只取最早一筆」。
   ========================================================================= */
const JUNE_VISITS = [
  ['2026/6/1 20:13', '2026/6/1 10:11', 'DNB10062', '台北酒泉'],
  ['2026/6/2 17:47', '2026/6/2 10:22', 'DNB10284', '台北大稻埕'],
  ['2026/6/3 16:38', '2026/6/3 10:19', 'DNB10307', '台北三創'],
  ['2026/6/3 19:51', '2026/6/3 17:17', 'DNB10440', '台北六張犁'],
  ['2026/6/4 15:16', '2026/6/4 10:15', 'DNB10062', '台北酒泉'],
  ['2026/6/4 19:39', '2026/6/4 15:53', 'DNB10174', '台北通化'],
  ['2026/6/5 16:10', '2026/6/5 10:21', 'DNB10307', '台北三創'],
  ['2026/6/5 19:54', '2026/6/5 16:46', 'DNB10168', '台北萬大'],
  ['2026/6/8 19:27', '2026/6/8 10:26', 'DNB10284', '台北大稻埕'],
  ['2026/6/9 17:10', '2026/6/9 10:08', 'DNB10307', '台北三創'],
  ['2026/6/9 19:36', '2026/6/9 17:45', 'DNB10094', '台北復興南'],
  ['2026/6/10 19:32', '2026/6/10 10:20', 'DNB10062', '台北酒泉'],
  ['2026/6/15 14:49', '2026/6/15 10:20', 'DNB10307', '台北三創'],
  ['2026/6/15 17:26', '2026/6/15 15:24', 'DNB10082', '台北永吉'],
  ['2026/6/15 19:51', '2026/6/15 18:49', 'DNB10062', '台北酒泉'],
  ['2026/6/16 15:03', '2026/6/16 10:20', 'DNB10062', '台北酒泉'],
  ['2026/6/16 19:30', '2026/6/16 15:41', 'DNB10168', '台北萬大'],
  ['2026/6/18 14:05', '2026/6/18 10:10', 'DNB10284', '台北大稻埕'],
  ['2026/6/18 19:35', '2026/6/18 14:41', 'DNB10440', '台北六張犁'],
  ['2026/6/22 14:21', '2026/6/22 10:20', 'DNB10284', '台北大稻埕'],
  ['2026/6/22 16:38', '2026/6/22 14:50', 'DNB10094', '台北復興南'],
];
function juneDetails() {
  const rows = [];
  JUNE_VISITS.forEach(([fillTime, arriveTime, code, store]) => {
    // 每次到店產生 3 列題號；且第 2 列刻意給「更晚的到店時間」，
    // 驗證去重時取最早那筆、不會被較晚的覆蓋。
    for (let i = 1; i <= 3; i++) {
      const at = i === 2 ? arriveTime.replace(/(\d+):(\d+)$/, (m, h) => `${Number(h) + 1}:59`) : arriveTime;
      rows.push({
        fillTime, arriveTime: at, leaveTime: fillTime, district: '北一二B',
        code, store, inspector: '測試督導', item: String(i), content: '', result: 'v',
        reason: '', month: '2026-06',
      });
    }
  });
  return rows;
}
async function openMileage(page, details) {
  const rows = details || juneDetails();
  cloudRows = rows;
  await stubGas(page);
  await openAndUnlock(page);
  await expect.poll(()=>ptReadCalls).toBeGreaterThan(0);
  await page.evaluate(() => { currentMonth = '2026-06'; const monthInput = document.getElementById('monthInput'); if (monthInput) monthInput.value = '2026-06'; });
  await page.click('.secure-tab[data-view="mileage"]');
  await expect(page.locator('#mileageView')).toHaveClass(/active/);
  await expect(page.locator('#miCoverage')).not.toContainText(/正在載入|正在讀取/);
}

function august20PagedDetails() {
  const rows=Array.from({length:101},(_,index)=>({
    fillTime:`2026/8/20 18:${String(index%60).padStart(2,'0')}`,
    arriveTime:'2026/8/20 10:00',leaveTime:'2026/8/20 12:00',district:'北一二B',
    code:'DNB10307',store:'台北三創',inspector:'測試督導',item:String(index%33+1),
    content:'',result:'v',reason:'',month:'2026-08'
  }));
  rows.push({
    fillTime:'2026/8/20 19:00',arriveTime:'2026/8/20 15:00',leaveTime:'2026/8/20 18:00',district:'北一二B',
    code:'DNB10440',store:'台北六張犁',inspector:'測試督導',item:'1',content:'',result:'v',reason:'',month:'2026-08'
  });
  return rows;
}

function august18VisitRawRows() {
  const codes={
    '台北酒泉':'DNB10062','台北大稻埕':'DNB10284','台北三創':'DNB10307','台北萬大':'DNB10168',
    '台北六張犁':'DNB10440','台北復興南':'DNB10094','台北杭州南':'DNB10146',
  };
  const routes=[
    ['2026/8/3',['台北酒泉','台北大稻埕','台北萬大']],
    ['2026/8/4',['台北三創','台北酒泉','台北大稻埕']],
    ['2026/8/5',['台北三創','台北酒泉','台北大稻埕']],
    ['2026/8/6',['台北三創','台北酒泉','台北大稻埕']],
    ['2026/8/7',['台北三創','台北六張犁']],
    ['2026/8/8',['台北三創','台北復興南']],
    ['2026/8/9',['台北杭州南','台北六張犁']],
  ];
  return routes.flatMap(([date,stores])=>stores.flatMap((store,index)=>Array.from({length:33},(_,item)=>({
    fillTime:`${date} 08:${String(item).padStart(2,'0')}`,arriveTime:`${date} ${String(9+index).padStart(2,'0')}:00`,leaveTime:'',district:'北一二B',
    code:codes[store],store,inspector:'測試督導',item:String(item+1),content:'',result:'v',reason:'',month:'2026-08'
  }))));
}

function august660RawRows() {
  const rows=august18VisitRawRows();
  ['台北三創','台北酒泉'].forEach((store,index)=>{
    const code=store==='台北三創'?'DNB10307':'DNB10062';
    for(let item=1;item<=33;item++) rows.push({
      fillTime:`2026/8/21 08:${String(item).padStart(2,'0')}`,
      arriveTime:`2026/8/21 ${String(9+index).padStart(2,'0')}:00`,leaveTime:'',district:'北一二B',
      code,store,inspector:'測試督導',item:String(item),content:'',result:'v',reason:'',month:'2026-08'
    });
  });
  return rows;
}

function july1179RawRows() {
  const stores=[
    ['DNB10062','台北酒泉'],['DNB10284','台北大稻埕'],['DNB10307','台北三創'],
    ['DNB10168','台北萬大'],['DNB10440','台北六張犁'],['DNB10094','台北復興南'],
    ['DNB10082','台北永吉'],['DNB10059','台北通化'],['DNB10146','台北杭州南']
  ];
  return stores.flatMap(([code,store],storeIndex)=>Array.from({length:131},(_,index)=>({
    fillTime:`2026/7/${String(storeIndex+1).padStart(2,'0')} 08:${String(index%60).padStart(2,'0')}`,
    arriveTime:`2026/7/${String(storeIndex+1).padStart(2,'0')} ${String(9+storeIndex%4).padStart(2,'0')}:00`,
    leaveTime:'',district:'北一二B',code,store,inspector:'測試督導',item:String(index%33+1),content:'',result:'v',reason:'',month:'2026-07'
  })));
}

async function openAugustMileage(page) {
  cloudRows=august20PagedDetails();
  await stubGas(page);
  await openAndUnlock(page);
  await expect.poll(()=>ptReadCalls).toBeGreaterThan(0);
  await page.evaluate(() => { currentMonth='2026-08'; const input=document.getElementById('monthInput'); if(input) input.value='2026-08'; });
  const startedAt=Date.now();
  await page.click('.secure-tab[data-view="mileage"]');
  await expect(page.locator('#miCoverage')).not.toContainText(/正在載入|正在讀取/);
  return Date.now()-startedAt;
}

test('里程由單一月份級 request 恢復，8/20 顯示 2 店／4.5 KM', async ({page})=>{
  const elapsedMs=await openAugustMileage(page);
  await expect(page.locator('#mileageView')).toContainText('不需貼上資料或匯入 JSON');
  await expect(page.getByRole('button',{name:/匯入巡店明細|匯出明細存檔/})).toHaveCount(0);
  await expect(page.locator('#miMonth')).toHaveValue('2026-08');
  await expect(page.locator('#miDate')).toHaveValue('2026-08-20');
  await expect(page.locator('#miStats .mi-card').nth(0)).toContainText('2店');
  await expect(page.locator('#miStats .mi-card').nth(1)).toContainText('4.5KM');
  const state=await page.evaluate(()=>({rawCount:rawDetails.length,plan:MI._monthPlans('2026-08')[0]}));
  expect(state.rawCount).toBe(0);
  expect(state.plan.nodes.map(node=>node.name)).toEqual(['台北三創','台北六張犁']);
  expect(state.plan.km).toBe(4.5);
  expect(ptMileageCalls).toEqual([{month:'2026-08'}]);
  expect(ptDetailCalls).toHaveLength(0);
  expect(elapsedMs).toBeLessThan(10000);
});

test('594 題 raw rows 經月份級 visits contract 顯示 18 visits／37.8 KM／7 個報銷出差日', async ({page})=>{
  cloudRows=august18VisitRawRows();
  expect(cloudRows).toHaveLength(594);
  await stubGas(page); await openAndUnlock(page);
  await page.evaluate(()=>{currentMonth='2026-08';});
  await page.click('.secure-tab[data-view="mileage"]');
  await expect(page.locator('#miCoverage')).not.toContainText(/正在載入|正在讀取/);
  await expect(page.locator('#miCoverage')).toContainText('報銷出差日 7 天');
  await expect(page.locator('#miCoverage')).toContainText('37.8 KM');
  const result=await page.evaluate(()=>{
    const plans=MI._monthPlans('2026-08');
    const bill=plans.filter(plan=>plan.km!=null&&plan.km>0);
    return {health:MI._health('2026-08'),days:plans.length,billDays:bill.length,km:Math.round(bill.reduce((sum,plan)=>sum+plan.km,0)*10)/10};
  });
  expect(result).toMatchObject({health:{patrolRows:18,mileageDetails:18,abnormal:false},days:7,billDays:7,km:37.8});
  expect(ptMileageCalls).toEqual([{month:'2026-08'}]);
});

test('2026/08 正式 660 rows 以單一月份級 read 正常讀取，不受 500 rows 分頁影響', async ({page})=>{
  cloudRows=august660RawRows();
  expect(cloudRows).toHaveLength(660);
  await stubGas(page); await openAndUnlock(page);
  await page.evaluate(()=>{currentMonth='2026-08';});
  await page.click('.secure-tab[data-view="mileage"]');
  await expect(page.locator('#miCoverage')).not.toContainText(/正在載入|正在讀取|MILEAGE_API_ERROR/);
  const report=await page.evaluate(()=>MI._runDiagnostic('2026-08'));
  expect(report).toMatchObject({
    status:'ok',ptdetailRows:660,
    mileage:{status:'ok',contract:'patrol-mileage-visits-v2',matchedRows:660,sheetScans:1}
  });
  expect(report.firstBreak).toBeNull();
  expect(ptMileageCalls).toEqual([{month:'2026-08'},{month:'2026-08'}]);
  expect(writeCalls).toBe(0);
});

test('2026/07 唯讀診斷依序比對 summary、九店 ptdetail、ptmileage2，1,179 rows 不寫入來源', async ({page})=>{
  cloudRows=july1179RawRows();
  expect(cloudRows).toHaveLength(1179);
  await stubGas(page); await openAndUnlock(page);
  const beforeWrites=writeCalls;
  const report=await page.evaluate(()=>MI._runDiagnostic('2026-07'));
  expect(report).toMatchObject({
    contract:'patrol-mileage-read-diagnostic-v2',month:'2026-07',mode:'read-only',status:'ok',
    summary:{status:'ok',visitCount:9,visitedStores:9},ptdetailRows:1179,ptdetailVisits:9,
    mileage:{status:'ok',contract:'patrol-mileage-visits-v2',totalVisits:9,matchedRows:1179,sheetScans:1},firstBreak:null
  });
  expect(report.details).toHaveLength(9);
  report.details.forEach(detail=>expect(detail.pages.map(page=>page.rows)).toEqual([100,31]));
  expect(writeCalls).toBe(beforeWrites);
  expect(ptDetailCalls).toHaveLength(18);
  expect(ptMileageCalls).toEqual([{month:'2026-07'}]);
});

test('2026/07 ptdetail 有資料而 ptmlieage2 錯回 v1 時，唯讀診斷明確停在 contract', async ({page})=>{
  cloudRows=july1179RawRows();
  ptMileageContract='patrol-mileage-month-v1';
  await stubGas(page); await openAndUnlock(page);
  const report=await page.evaluate(()=>MI._runDiagnostic('2026-07'));
  expect(report).toMatchObject({ptdetailRows:1179,ptdetailVisits:9,mileage:{status:'ok',contract:'patrol-mileage-month-v1'},status:'error'});
  expect(report.firstBreak).toMatchObject({action:'ptmileage2',code:'MILEAGE_DATA_FORMAT_ERROR'});
  expect(report.firstBreak.message).toContain('ptdetail 有 1179 筆');
  expect(writeCalls).toBe(0);
});

test('2026/06 沒有正式巡店來源時只讀 OFFICIAL archive，還原 11 日／74.5 KM 且不顯示無巡店', async ({page})=>{
  await openMileage(page, []);
  const result=await page.evaluate(()=>{
    const plans=MI._monthPlans('2026-06'), bill=MI._billable(plans), health=MI._health('2026-06');
    return {health,plans:plans.length,billDays:bill.length,km:Math.round(bill.reduce((sum,plan)=>sum+plan.km,0)*10)/10,rows:MI._buildSheets('2026-06').sheets[0].rows.length-1};
  });
  expect(result).toMatchObject({health:{sourceType:'official-archive',patrolRows:0,archiveRows:11,mileageDetails:11,abnormal:false},plans:11,billDays:11,km:74.5,rows:11});
  await expect(page.locator('#miCoverage')).toContainText('資料來源：2026 年 6 月正式公司報銷表');
  await expect(page.locator('#miCoverage')).not.toContainText('MILEAGE_NO_PATROL');
  expect(writeCalls).toBe(0);
});

test('同月已有正式巡店資料時不混用 OFFICIAL archive', async ({page})=>{
  await openMileage(page, juneDetails());
  const result=await page.evaluate(()=>({
    source:MI._monthSource('2026-06'),
    dates:MI._monthPlans('2026-06').map(plan=>plan.date),
    health:MI._health('2026-06')
  }));
  expect(result.source.type).toBe('patrol');
  expect(result.health).toMatchObject({sourceType:'patrol',patrolRows:21,mileageDetails:21});
  expect(result.dates).toContain('2026-06-01');
  expect(result.dates).not.toContain('2026-06-23');
  expect(result.dates).not.toContain('2026-06-24');
  expect(result.dates).not.toContain('2026-06-30');
  expect(writeCalls).toBe(0);
});

test('月份讀取超過 10 秒門檻會顯示卡點與 MILEAGE_LOAD_SLOW，完成後不會無限 loading', async ({page})=>{
  const base=august20PagedDetails();
  cloudRows=base.concat(Array.from({length:399},(_,index)=>({
    ...base[0], item:String(index+1000), fillTime:`2026/8/20 20:${String(index%60).padStart(2,'0')}`
  })));
  ptMileageDelayMs=120;
  await stubGas(page);
  await openAndUnlock(page);
  await page.evaluate(()=>{
    currentMonth='2026-08';
    const nativeSetTimeout=window.setTimeout.bind(window);
    window.setTimeout=(callback,delay,...args)=>nativeSetTimeout(callback,delay===10000?20:delay,...args);
  });
  await page.click('.secure-tab[data-view="mileage"]');
  await expect(page.locator('#miCoverage')).toContainText('MILEAGE_LOAD_SLOW');
  await expect(page.locator('#miCoverage')).toContainText('正在載入 2026-08：讀取月份巡店事件');
  await expect(page.locator('#miCoverage')).not.toContainText(/正在載入|正在讀取/);
  await expect(page.locator('#miStats .mi-card').nth(1)).toContainText('4.5KM');
  expect(ptMileageCalls).toEqual([{month:'2026-08'}]);
});

test('reload 與登出再登入後仍由月份級明細恢復 8 月里程，月份不跳回 6 月', async ({page})=>{
  await openAugustMileage(page);
  await page.reload();
  await expect(page.locator('#patrolAuthGate')).toBeHidden();
  await page.click('.secure-tab[data-view="mileage"]');
  await expect(page.locator('#miCoverage')).not.toContainText(/正在載入|正在讀取/);
  await expect(page.locator('#miMonth')).toHaveValue('2026-08');
  await expect(page.locator('#miStats .mi-card').nth(1)).toContainText('4.5KM');

  await page.getByRole('button',{name:'登出'}).click();
  await expect(page.locator('#patrolAuthGate')).toBeVisible();
  await page.locator('#patrolPasscode').fill(PT_KEY);
  await page.getByRole('button',{name:'驗證並進入'}).click();
  await expect(page.locator('#patrolAuthGate')).toBeHidden();
  await page.click('.secure-tab[data-view="mileage"]');
  await expect(page.locator('#miCoverage')).not.toContainText(/正在載入|正在讀取/);
  await expect(page.locator('#miMonth')).toHaveValue('2026-08');
  await expect(page.locator('#miStats .mi-card').nth(0)).toContainText('2店');
  await expect(page.locator('#miStats .mi-card').nth(1)).toContainText('4.5KM');
  expect(ptMileageCalls.filter(call=>call.month==='2026-08').length).toBe(3);
});

test('7 月與 8 月分開載入，不互相污染', async ({page})=>{
  cloudRows=[
    {arriveTime:'2026/7/31 10:00',month:'2026-07',code:'DNB10307',store:'台北三創',item:'1'},
    {arriveTime:'2026/7/31 15:00',month:'2026-07',code:'DNB10440',store:'台北六張犁',item:'1'},
    {arriveTime:'2026/8/1 10:00',month:'2026-08',code:'DNB10307',store:'台北三創',item:'1'},
    {arriveTime:'2026/8/1 15:00',month:'2026-08',code:'DNB10440',store:'台北六張犁',item:'1'}
  ];
  await stubGas(page); await openAndUnlock(page);
  await page.evaluate(()=>{currentMonth='2026-08';});
  await page.click('.secure-tab[data-view="mileage"]');
  await expect(page.locator('#miCoverage')).not.toContainText('載入中');
  await expect(page.locator('#miRecentMonths')).toContainText('2026/07');
  await expect(page.locator('#miRecentMonths')).toContainText('2026/08');
  await page.getByRole('button',{name:'2026/07'}).click();
  await expect(page.locator('#miMonth')).toHaveValue('2026-07');
  await expect(page.locator('#miDate')).toHaveValue('2026-07-31');
  await page.getByRole('button',{name:'2026/08'}).click();
  await expect(page.locator('#miMonth')).toHaveValue('2026-08');
  await expect(page.locator('#miDate')).toHaveValue('2026-08-01');
  const result=await page.evaluate(()=>({
    july:MI._monthPlans('2026-07').map(plan=>plan.date),
    august:MI._monthPlans('2026-08').map(plan=>plan.date)
  }));
  expect(result.july).toEqual(['2026-07-31']);
  expect(result.august).toEqual(['2026-08-01']);
});

test('7、8 月里程歷史列缺到店時間時，以填表時間還原而不丟棄', async ({page})=>{
  cloudRows=[
    {fillTime:'2026/7/18 10:00',arriveTime:'',month:'2026-07',code:'DNB10307',store:'台北三創',item:'1'},
    {fillTime:'2026/7/18 15:00',arriveTime:'',month:'2026-07',code:'DNB10440',store:'台北六張犁',item:'1'},
    {fillTime:'2026/8/18 10:00',arriveTime:'',month:'2026-08',code:'DNB10307',store:'台北三創',item:'1'},
    {fillTime:'2026/8/18 15:00',arriveTime:'',month:'2026-08',code:'DNB10440',store:'台北六張犁',item:'1'}
  ];
  await stubGas(page);await openAndUnlock(page);
  await page.evaluate(()=>{currentMonth='2026-08';});
  await page.locator('.secure-tab[data-view="mileage"]').click();
  await page.getByRole('button',{name:'2026/07'}).click();
  await expect(page.locator('#miDate')).toHaveValue('2026-07-18');
  await expect(page.locator('#miStats .mi-card').first()).toContainText('2店');
  await page.getByRole('button',{name:'2026/08'}).click();
  await expect(page.locator('#miDate')).toHaveValue('2026-08-18');
  await expect(page.locator('#miStats .mi-card').first()).toContainText('2店');
});

test('6→7→8→7 切換與 reload 不混用 archive、7 月或 8 月的月份資料', async ({page})=>{
  cloudRows=[
    {fillTime:'2026/7/31 10:00',arriveTime:'2026/7/31 10:00',month:'2026-07',code:'DNB10307',store:'台北三創',item:'1'},
    {fillTime:'2026/7/31 15:00',arriveTime:'2026/7/31 15:00',month:'2026-07',code:'DNB10440',store:'台北六張犁',item:'1'},
    {fillTime:'2026/8/1 10:00',arriveTime:'2026/8/1 10:00',month:'2026-08',code:'DNB10307',store:'台北三創',item:'1'},
    {fillTime:'2026/8/1 15:00',arriveTime:'2026/8/1 15:00',month:'2026-08',code:'DNB10440',store:'台北六張犁',item:'1'}
  ];
  await stubGas(page); await openAndUnlock(page);
  await page.evaluate(()=>{currentMonth='2026-06';});
  await page.click('.secure-tab[data-view="mileage"]');
  await expect(page.locator('#miCoverage')).toContainText('2026 年 6 月正式公司報銷表');
  await page.evaluate(()=>MI.setMonth('2026-07'));
  await page.evaluate(()=>MI.setMonth('2026-08'));
  await page.evaluate(()=>MI.setMonth('2026-07'));
  const beforeReload=await page.evaluate(()=>({
    june:MI._health('2026-06').sourceType,
    july:MI._monthPlans('2026-07').map(plan=>plan.date),
    august:MI._monthPlans('2026-08').map(plan=>plan.date)
  }));
  expect(beforeReload).toEqual({june:'official-archive',july:['2026-07-31'],august:['2026-08-01']});
  await page.reload();
  await expect(page.locator('#patrolAuthGate')).toBeHidden();
  await page.evaluate(()=>MI.setMonth('2026-07'));
  const afterReload=await page.evaluate(()=>({
    june:MI._health('2026-06').sourceType,
    july:MI._monthPlans('2026-07').map(plan=>plan.date)
  }));
  expect(afterReload).toEqual({june:'official-archive',july:['2026-07-31']});
  expect(writeCalls).toBe(0);
});

test('rolling six-month retention 只修剪 Mileage 工作資料，跨年與 cleanup failure 均 fail-open', async ({page})=>{
  await stubGas(page); await openAndUnlock(page);
  const result=await page.evaluate(()=>{
    const key='bei12b_mileage_v1';
    localStorage.setItem(key,JSON.stringify({
      dayEdits:{'2026-03-01':{legs:[]},'2026-04-01':{legs:[]},'2026-09-01':{legs:[]}},
      monthCache:{'2026-03':{stale:true},'2026-04':{live:true},'2026-09':{live:true}},
      routeOverrides:{'2026-03|A':1,'2026-04|B':2},
      manualLegs:[{date:'2026-03-01',km:1},{date:'2026-09-01',km:2}],
      exportLog:[{month:'2026-03'},{month:'2026-09'}],
      costOwner:'保留設定'
    }));
    const sep=MI._cleanupRetention('2026-09','2026-09');
    const afterSep=JSON.parse(localStorage.getItem(key));
    const oct=MI._retentionMonths('2026-10');
    const crossYear=MI._retentionMonths('2027-02');
    localStorage.setItem(key,'{broken');
    const failed=MI._cleanupRetention('2026-09','2026-09');
    return {sep,afterSep,oct,crossYear,failed,rawAfterFailure:localStorage.getItem(key)};
  });
  expect(result.sep.months).toEqual(['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09']);
  expect(result.afterSep.dayEdits).toEqual({'2026-04-01':{legs:[]},'2026-09-01':{legs:[]}});
  expect(result.afterSep.monthCache).toEqual({'2026-04':{live:true},'2026-09':{live:true}});
  expect(result.afterSep.routeOverrides).toEqual({'2026-04|B':2});
  expect(result.afterSep.manualLegs).toEqual([{date:'2026-09-01',km:2}]);
  expect(result.afterSep.exportLog).toEqual([{month:'2026-09'}]);
  expect(result.afterSep.costOwner).toBe('保留設定');
  expect(result.oct).toEqual(['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']);
  expect(result.crossYear).toEqual(['2026-09','2026-10','2026-11','2026-12','2027-01','2027-02']);
  expect(result.failed.cleanupFailed).toBe(true);
  expect(result.rawAfterFailure).toBe('{broken');
  expect(writeCalls).toBe(0);
});

test('同筆正式明細重讀不會重複累加', async ({page})=>{
  await openAugustMileage(page);
  await page.evaluate(()=>MI._hydrateMonth('2026-08',true));
  await page.evaluate(()=>MI._hydrateMonth('2026-08',true));
  const result=await page.evaluate(()=>({health:MI._health('2026-08'),plan:MI._monthPlans('2026-08')[0]}));
  expect(result.health.mileageDetails).toBe(2);
  expect(result.plan.nodes).toHaveLength(2);
  expect(result.plan.km).toBe(4.5);
});

test('無巡店月份維持正常 0 KM 並標示 MILEAGE_NO_PATROL', async ({page})=>{
  await openAugustMileage(page);
  await page.evaluate(()=>MI.setMonth('2026-09'));
  await expect(page.locator('#miCoverage')).toContainText('MILEAGE_NO_PATROL');
  await expect(page.locator('#miCoverage')).toContainText('真的沒有巡店');
  await expect(page.locator('#miStats .mi-card').nth(2)).toContainText('0KM');
  const report=await page.evaluate(()=>MI._health('2026-09'));
  expect(report).toMatchObject({patrolRows:0,mileageDetails:0,abnormal:false});
});

test('有巡店來源但日期無法解析時顯示一致性異常與 reason code', async ({page})=>{
  cloudRows=[{arriveTime:'not-a-date',fillTime:'also-invalid',month:'2026-08',code:'DNB10307',store:'台北三創',item:'1'}];
  await stubGas(page); await openAndUnlock(page);
  await page.evaluate(()=>{currentMonth='2026-08';});
  await page.click('.secure-tab[data-view="mileage"]');
  await expect(page.locator('#miCoverage')).toContainText('巡店已有 1 筆，但里程同步為 0 筆');
  await expect(page.locator('#miCoverage')).toContainText('MILEAGE_DATE_PARSE_ERROR');
  await expect(page.locator('#miCoverage')).toContainText('MILEAGE_SOURCE_MISSING');
});

test('無法辨識店點時顯示 MILEAGE_STORE_MAPPING_ERROR', async ({page})=>{
  cloudRows=[{arriveTime:'2026/8/2 10:00',month:'2026-08',code:'UNKNOWN',store:'台北三創臨時點',item:'1'}];
  await stubGas(page); await openAndUnlock(page);
  await page.evaluate(()=>{currentMonth='2026-08';});
  await page.click('.secure-tab[data-view="mileage"]');
  await expect(page.locator('#miCoverage')).toContainText('MILEAGE_STORE_MAPPING_ERROR');
  const report=await page.evaluate(()=>MI._health('2026-08'));
  expect(report.issues.some(issue=>issue.code==='MILEAGE_STORE_MAPPING_ERROR')).toBe(true);
});

test('timezone 跨日依 Asia/Taipei 歸入正確月份', async ({page})=>{
  cloudRows=[
    {arriveTime:'2026-07-31T16:30:00Z',month:'2026-08',code:'DNB10307',store:'台北三創',item:'1'},
    {arriveTime:'2026-07-31T17:30:00Z',month:'2026-08',code:'DNB10440',store:'台北六張犁',item:'1'}
  ];
  await stubGas(page); await openAndUnlock(page);
  await page.evaluate(()=>{currentMonth='2026-08';});
  await page.click('.secure-tab[data-view="mileage"]');
  await expect(page.locator('#miCoverage')).not.toContainText(/正在載入|正在讀取/);
  await expect(page.locator('#miDate')).toHaveValue('2026-08-01');
  const plan=await page.evaluate(()=>MI._monthPlans('2026-08')[0]);
  expect(plan.date).toBe('2026-08-01');
  expect(plan.km).toBe(4.5);
});

test('里程頁籤可正常開啟，且不影響原有頁籤', async ({ page }) => {
  await openMileage(page);
  await expect(page.locator('#miStats .mi-card')).toHaveCount(4);
  // 切回巡店看板，原功能仍在
  await page.click('.secure-tab[data-view="patrol"]');
  await expect(page.locator('#mileageView')).not.toHaveClass(/active/);
  await expect(page.locator('#patrolInputPanel')).toBeVisible();
  await expect(page.locator('#content')).toContainText('台北酒泉');
});

test('同日巡店依到店時間排序，同店重複只取最早一筆', async ({ page }) => {
  await openMileage(page);
  const plan = await page.evaluate(() => {
    const d = MI._days();
    return { names: d['2026-06-15'].map(n => n.name), times: d['2026-06-15'].map(n => n.time) };
  });
  expect(plan.names).toEqual(['台北三創', '台北永吉', '台北酒泉']);
  expect(plan.times).toEqual(['10:20', '15:24', '18:49']); // 皆為最早一筆，未被 +1 小時那列覆蓋
});

test('單店日公里數為 0 且備註為單店不計', async ({ page }) => {
  await openMileage(page);
  const p = await page.evaluate(() => { const d = MI._days(); return MI._dayPlan('2026-06-01', d['2026-06-01']); });
  expect(p.km).toBe(0);
  expect(p.note).toBe('單店，不計油料里程');
  expect(p.storeCount).toBe(1);
});

test('未知路段不會被填成 0，且維持待查狀態', async ({ page }) => {
  await openMileage(page);
  const r = await page.evaluate(() => {
    const nodes = [{ name: '台北杭州南', time: '10:00', key: '1000' }, { name: '台北通化', time: '15:00', key: '1500' }];
    const p = MI._dayPlan('2026-06-27', nodes);
    return { km: p.km, todo: p.todo, legKm: p.legs[0].km };
  });
  expect(r.km).toBeNull();      // 不是 0
  expect(r.legKm).toBeNull();   // 不是 0
  expect(r.todo).toEqual(['台北杭州南→台北通化']);
});

test('待查路段可在網站補登，8/27 通化至萬大顯示 7.4 KM', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  const rows=[
    {fillTime:'2026/8/27 12:00',arriveTime:'2026/8/27 10:00',leaveTime:'2026/8/27 12:00',district:'北一二B',code:'DNB10307',store:'台北三創',inspector:'測試督導',item:'1',content:'',result:'v',reason:'',month:'2026-08'},
    {fillTime:'2026/8/27 16:00',arriveTime:'2026/8/27 14:00',leaveTime:'2026/8/27 16:00',district:'北一二B',code:'DNB10174',store:'台北通化',inspector:'測試督導',item:'1',content:'',result:'v',reason:'',month:'2026-08'},
    {fillTime:'2026/8/27 19:00',arriveTime:'2026/8/27 17:00',leaveTime:'2026/8/27 19:00',district:'北一二B',code:'DNB10168',store:'台北萬大',inspector:'測試督導',item:'1',content:'',result:'v',reason:'',month:'2026-08'},
  ];
  await openMileage(page,rows);
  await page.evaluate(()=>MI.setMonth('2026-08'));
  await expect(page.locator('#miCoverage')).not.toContainText(/正在載入|正在讀取/);
  await page.evaluate(()=>MI.setDate('2026-08-27'));

  const plan=await page.evaluate(()=>MI._dayPlan('2026-08-27',MI._days()['2026-08-27']));
  expect(plan.legs.map(leg=>leg.km)).toEqual([3.6,7.4]);
  expect(plan.km).toBe(11);
  await expect(page.locator('#miTimeline')).toContainText('7.4 KM');
  await expect(page.locator('#miLegKm-1')).toHaveValue('7.4');
  await expect(page.locator('#miLegKm-1').locator('xpath=following-sibling::button')).toHaveText('更新');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('補登欄位只寫入里程資料層並解除待查', async ({ page }) => {
  const rows=[
    {fillTime:'2026/8/28 12:00',arriveTime:'2026/8/28 10:00',leaveTime:'2026/8/28 12:00',district:'北一二B',code:'DNB10146',store:'台北杭州南',inspector:'測試督導',item:'1',content:'',result:'v',reason:'',month:'2026-08'},
    {fillTime:'2026/8/28 19:00',arriveTime:'2026/8/28 17:00',leaveTime:'2026/8/28 19:00',district:'北一二B',code:'DNB10174',store:'台北通化',inspector:'測試督導',item:'1',content:'',result:'v',reason:'',month:'2026-08'},
  ];
  await openMileage(page,rows);
  await page.evaluate(()=>MI.setMonth('2026-08'));
  await expect(page.locator('#miCoverage')).not.toContainText(/正在載入|正在讀取/);
  await page.evaluate(()=>MI.setDate('2026-08-28'));
  await expect(page.locator('#miTimeline')).toContainText('待查');
  const beforeNodes=await page.evaluate(()=>MI._days()['2026-08-28'].map(node=>({name:node.name,time:node.time,code:node.code})));
  await page.locator('#miLegKm-0').fill('7.1');
  await page.locator('#miLegKm-0').locator('xpath=following-sibling::button').click();

  const result=await page.evaluate(()=>({
    plan:MI._dayPlan('2026-08-28',MI._days()['2026-08-28']),
    saved:MI._store().dayEdits['2026-08-28'].legKm['台北杭州南|台北通化'],
    nodes:MI._days()['2026-08-28'].map(node=>({name:node.name,time:node.time,code:node.code})),
  }));
  expect(result.plan.km).toBe(7.1);
  expect(result.plan.todo).toEqual([]);
  expect(result.saved).toMatchObject({km:7.1,note:'2026-08-28 實際里程／人工補登'});
  expect(result.nodes).toEqual(beforeNodes);
  await expect(page.locator('#miTimeline')).not.toContainText('待查');
  await expect(page.locator('#miTimeline')).toContainText('人工確認');
});

test('三店以上不平均拆分：可拆段就逐段加總，不可拆就不猜', async ({ page }) => {
  await openMileage(page);
  const p = await page.evaluate(() => { const d = MI._days(); return MI._dayPlan('2026-06-15', d['2026-06-15']); });
  expect(p.legs.map(l => l.km)).toEqual([4.4, 10]);   // 逐段各自查表，非 14.4/2
  expect(p.km).toBe(14.4);
  // 有未知段時整日不給總數、也不平均
  const q = await page.evaluate(() => MI._dayPlan('2026-06-28', [
    { name: '台北三創', key: '1000' }, { name: '台北杭州南', key: '1200' }, { name: '台北通化', key: '1500' }]));
  expect(q.legs[0].km).toBe(3);   // 已知段照給
  expect(q.legs[1].km).toBeNull();// 未知段留空
  expect(q.km).toBeNull();        // 不用已知段回推、不平均
});

test('台北電信為特殊地點，不計入巡店門市數但可作里程起訖點', async ({ page }) => {
  await openMileage(page);
  const r = await page.evaluate(() => {
    const nodes = [{ name: '台北電信', time: '09:00', key: '0900' }, { name: '台北萬大', time: '11:00', key: '1100' }];
    const p = MI._dayPlan('2026-06-27', nodes);
    return { isOffice: MI._isOffice('台北電信'), storeCount: p.storeCount, km: p.km, verify: p.legs[0].verify };
  });
  expect(r.isOffice).toBe(true);
  expect(r.storeCount).toBe(1);   // 兩個節點，只有萬大算巡店門市
  expect(r.km).toBe(6.4);         // 仍可作為里程起訖點
  expect(r.verify).toBe('manual');
});

test('1.5KM 路段為台北電信→台北復興南，且不存在萬大→復興南', async ({ page }) => {
  await openMileage(page);
  const r = await page.evaluate(() => ({
    telecom: MI._legFor('台北電信', '台北復興南'),
    wanda: MI._legFor('台北萬大', '台北復興南'),
  }));
  expect(r.telecom.km).toBe(1.5);
  expect(r.telecom.month).toBe('Y2511');
  expect(r.telecom.date).toBe('2025-11-18');
  expect(r.telecom.source).toContain('原文誤植');
  expect(r.wanda).toBeNull();     // 不建立不存在的路段
});

test('Excel 產出「油料」與「距離計算明細」兩張工作表，欄位順序與固定值正確', async ({ page }) => {
  await openMileage(page, []);
  const r = await page.evaluate(() => {
    const b = MI._buildSheets('2026-06');
    const val = c => (c && typeof c === 'object' && 'value' in c) ? c.value : c;
    return {
      names: b.sheets.map(s => s.name),
      fareHead: b.sheets[0].rows[0].map(val),
      detailHead: b.sheets[1].rows[1].map(val),
      row1: b.sheets[0].rows[1].map(val),
      tail: b.sheets[1].rows.slice(-2).map(r => r.map(val)),
      cols: b.sheets.map(s => s.cols),
      merges: b.sheets[1].merges,
      total: b.total,
    };
  });
  expect(r.names).toEqual(['油料', '距離計算明細']);
  // 9 欄，依公司正式報銷表；欄名含換行
  expect(r.fareHead).toEqual(['成本歸屬部門', '成本歸屬者', '出差日期\n(起)', '出差日期\n(迄)', '出差地點',
    '事由及\n洽訪目標', '油料補助\n里程數(KM)', '車號', '備註']);
  expect(r.detailHead).toEqual(['日期', '起點', '迄點', '騎車距離(KM)', '巡店順序', '距離來源', '驗證狀態']);
  // 單店 0 KM 日不列入正式報銷表，首列為 6/3；備註留白
  // 成本歸屬與日期格式依 2026-06 公司正式報銷表；備註留白
  expect(r.row1).toEqual(['北一二區直營部', '盧蔚榮', '2026/6/3', '2026/6/3', '台北三創/台北六張犁', '巡店', 4.5, 'NAS-9666', '']);
  expect(r.tail[0][0]).toBe('全月出差日');
  expect(r.tail[1][0]).toBe('全月油料里程合計');
  expect(r.cols).toEqual([[18, 18, 24, 24, 48, 14, 21, 18, 18], [12, 18, 18, 14, 12, 42, 14]]);
  expect(r.merges).toEqual([{ row: 0, col: 0, across: 6 }]);
  expect(r.total).toBe(74.5);
});

test('單店 0 KM 日不列入正式報銷表，但仍顯示於畫面', async ({ page }) => {
  await openMileage(page);
  const r = await page.evaluate(() => {
    const all = MI._monthPlans('2026-06'), bill = MI._billable(all);
    const b = MI._buildSheets('2026-06');
    const val = c => (c && typeof c === 'object' && 'value' in c) ? c.value : c;
    return {
      allDays: all.length, billDays: bill.length,
      zeroDays: all.filter(p => p.km === 0).map(p => p.date),
      fareDates: b.sheets[0].rows.slice(1).map(r => val(r[2])),
    };
  });
  expect(r.allDays).toBe(12);                 // 有正式巡店來源時只採巡店資料，不混入 archive
  expect(r.billDays).toBe(8);
  expect(r.zeroDays).toEqual(['2026-06-01', '2026-06-02', '2026-06-08', '2026-06-10']);
  r.zeroDays.forEach(d => expect(r.fareDates).not.toContain(d));
  await expect(page.locator('#miSummary')).toContainText('不列入報銷');
  await expect(page.locator('#miSummary')).toContainText('8 個報銷出差日');
});

test('與正式報銷表對帳：11 天／74.5 KM 為基準', async ({ page }) => {
  await openMileage(page);
  const off = await page.evaluate(() => MI.OFFICIAL['2026-06']);
  expect(off.days).toBe(11);
  expect(off.km).toBe(74.5);
  expect(Math.round(off.rows.reduce((a, r) => a + r[2], 0) * 10) / 10).toBe(74.5);
  // 逐日把正式報銷表的路線餵進計算引擎，驗證逐段加總可還原官方里程
  const rep = await page.evaluate(() => MI.OFFICIAL['2026-06'].rows.map(([d, place, km]) => {
    const nodes = place.split('/').map((n, i) => ({ name: n, time: `${10 + i}:00`, key: `${10 + i}00` }));
    const p = MI._dayPlan(d, nodes);
    return { date: d, place, offKm: km, gotKm: p.km, legs: p.legs.map(l => l.km) };
  }));
  const ok = rep.filter(r => r.gotKm === r.offKm);
  expect(ok).toHaveLength(11);            // 11/11 逐日相符
  expect(Math.round(rep.reduce((a, r) => a + r.gotKm, 0) * 10) / 10).toBe(74.5);
  // 6/15 三店：逐段加總 4.4 + 10.0 = 14.4，非平均
  const d15 = rep.find(r => r.date === '2026-06-15');
  expect(d15.legs).toEqual([4.4, 10]);
  expect(d15.gotKm).toBe(14.4);
});

test('對帳面板顯示正式基準與差異，不再出現 18 天', async ({ page }) => {
  await openMileage(page, []);
  const cov = page.locator('#miCoverage');
  await expect(cov).toContainText('正式出差日：11 天');
  await expect(cov).toContainText('74.5 KM');
  await expect(cov).toContainText('已與正式報銷表完成對帳');
  await expect(cov).not.toContainText('18 天');
  await expect(cov).not.toContainText('缺少日期');
  await expect(cov).toContainText('單店 0 KM 日，不列入報銷');
  // 6/22 依正式報銷表照片為台北大稻埕，與巡店明細一致
  const off22 = await page.evaluate(() => MI.OFFICIAL['2026-06'].rows.find(r => r[0] === '2026-06-22'));
  expect(off22[1]).toBe('台北大稻埕/台北復興南');
});

test('待查路段存在時不得產生正式報銷檔，只能匯出標示未完成的測試版', async ({ page }) => {
  await openMileage(page);
  // 製造一個正式 ptdetail 未知路段：新增一天走「杭州南→通化」。
  cloudRows.push(
    { fillTime: '2026/6/27 20:00', arriveTime: '2026/6/27 10:00', code: 'DNB10146', store: '台北杭州南', item: '1', month: '2026-06' },
    { fillTime: '2026/6/27 20:00', arriveTime: '2026/6/27 15:00', code: 'DNB10174', store: '台北通化', item: '1', month: '2026-06' });
  await page.evaluate(() => MI._hydrateMonth('2026-06', true));
  await page.click('button:has-text("匯出公司報銷 Excel")');
  const dlg = page.locator('#miExportDlg');
  await expect(dlg).toContainText('待查路段數');
  await expect(dlg).toContainText('已停用正式匯出');
  await expect(dlg.locator('button:has-text("匯出正式報銷檔")')).toBeDisabled();
  await expect(dlg.locator('button:has-text("匯出測試版")')).toBeEnabled();
  const name = await page.evaluate(() => {
    let f = null;
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { f = this.download; };
    MI.doExport(true);
    HTMLAnchorElement.prototype.click = orig;
    return f;
  });
  expect(name).toContain('未完成請勿報銷');
});

test('無待查路段時可匯出正式報銷檔，檔名不帶測試標記', async ({ page }) => {
  await openMileage(page, []);
  await page.click('button:has-text("匯出公司報銷 Excel")');
  const dlg = page.locator('#miExportDlg');
  await expect(dlg).toContainText('出差日數');
  await expect(dlg.locator('button:has-text("匯出正式報銷檔")')).toBeEnabled();
  const out = await page.evaluate(() => {
    let f = null; const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { f = this.download; };
    MI.doExport(false);
    HTMLAnchorElement.prototype.click = orig;
    return { file: f, log: MI._store().exportLog };
  });
  expect(out.file).toBe('北一二B_巡店車資報銷_202606.xls');
  expect(out.file).not.toContain('未完成');
  expect(out.log[0].totalKm).toBe(74.5);
  expect(out.log[0].days).toBe(11);
});

test('6/23、6/24、6/30 由正式報銷表補入且標為正式受控，不再視為缺漏', async ({ page }) => {
  await openMileage(page, []);
  const r = await page.evaluate(() => ['2026-06-23', '2026-06-24', '2026-06-30'].map(d => {
    const p = MI._dayPlan(d, MI._days()[d]);
    return { date: d, place: p.nodes.map(n => n.name).join('/'), km: p.km, official: !!p.official,
             src: p.legs[0].source, verify: p.legs[0].verify };
  }));
  expect(r[0]).toMatchObject({ place: '台北酒泉/台北萬大', km: 6.6, official: true, verify: 'official' });
  expect(r[1]).toMatchObject({ place: '台北大稻埕/台北永吉', km: 7.2, official: true, verify: 'official' });
  expect(r[2]).toMatchObject({ place: '台北三創/台北通化', km: 3.6, official: true, verify: 'official' });
  r.forEach(x => expect(x.src).toBe('2026 年 6 月正式公司報銷表'));
  // 這三天必須進正式匯出
  const dates = await page.evaluate(() => {
    const b = MI._buildSheets('2026-06');
    const v = c => (c && typeof c === 'object' && 'value' in c) ? c.value : c;
    return b.sheets[0].rows.slice(1).map(r => v(r[2]));
  });
  ['2026/6/23', '2026/6/24', '2026/6/30'].forEach(d => expect(dates).toContain(d));
});

test('Y2606 完整對帳：油料 11 列、合計 74.5 KM、備註留白', async ({ page }) => {
  await openMileage(page, []);
  const r = await page.evaluate(() => {
    const b = MI._buildSheets('2026-06');
    const v = c => (c && typeof c === 'object' && 'value' in c) ? c.value : c;
    const rc = MI._reconcile('2026-06');
    return {
      rows: b.sheets[0].rows.slice(1).map(r => r.map(v)),
      detail: b.sheets[1].rows.slice(2, -3).map(r => r.map(v)),
      tail: b.sheets[1].rows.slice(-2).map(r => r.map(v)),
      total: b.total, match: rc.match, mineDays: rc.mineDays,
    };
  });
  expect(r.rows).toHaveLength(11);
  expect(r.total).toBe(74.5);
  expect(r.match).toBe(true);
  expect(r.mineDays).toBe(11);
  expect(Math.round(r.rows.reduce((a, x) => a + x[6], 0) * 10) / 10).toBe(74.5);
  r.rows.forEach(x => expect(x[8]).toBe(''));            // 備註全部留白
  // 距離計算明細涵蓋 11 天、共 12 段（6/15 拆兩段）
  expect(new Set(r.detail.map(x => x[0])).size).toBe(11);
  expect(r.detail).toHaveLength(12);
  const d15 = r.detail.filter(x => x[0] === '2026/6/15');
  expect(d15.map(x => [x[3], x[4]])).toEqual([[4.4, '第 1 段'], [10, '第 2 段']]);
  expect(r.tail[0]).toEqual(['全月出差日', 11]);
  expect(r.tail[1]).toEqual(['全月油料里程合計', 74.5]);
});

test('人工修改只寫入里程資料層，不改寫原始巡店紀錄', async ({ page }) => {
  await openMileage(page, juneDetails());
  const before = await page.evaluate(() => JSON.stringify(rawDetails));
  await page.evaluate(() => MI.setLegKm('2026-06-03', '台北三創', '台北六張犁', 4.9, '實走修正'));
  const after = await page.evaluate(() => ({
    raw: JSON.stringify(rawDetails),
    plan: MI._dayPlan('2026-06-03', MI._days()['2026-06-03']),
    saved: MI._store().dayEdits['2026-06-03'].legKm['台北三創|台北六張犁'],
  }));
  expect(after.raw).toBe(before);            // 原始明細一字未動
  expect(after.plan.km).toBe(4.9);           // 里程層生效
  expect(after.saved.prev).toBe(4.5);        // 保留修改前數值
  expect(after.saved.note).toBe('實走修正');
});

test('資料涵蓋日期以正式報銷表為完整依據，未列於報銷表者不憑空出現', async ({ page }) => {
  await openMileage(page, []);
  const cov = await page.evaluate(() => MI._coverage('2026-06'));
  expect(cov.first).toBe('2026-06-03');
  // 沒有正式巡店來源時，涵蓋範圍完全由正式報銷表 archive 提供。
  expect(cov.last).toBe('2026-06-30');
  expect(cov.have).toHaveLength(11);
  // 有正式報銷表基準的月份不再列缺漏
  expect(cov.missingTail).toEqual([]);
  await expect(page.locator('#miCoverage')).toContainText('正式出差日：11 天');
  // 未涵蓋日期不得憑空出現在彙整
  const plans = await page.evaluate(() => MI._monthPlans('2026-06').map(p => p.date));
  expect(plans).toContain('2026-06-23');   // 由正式報銷表補入
  expect(plans).not.toContain('2026-06-25'); // 不在報銷表內者仍不憑空出現
  expect(plans).toHaveLength(11);
});
