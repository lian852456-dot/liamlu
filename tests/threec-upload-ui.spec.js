const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pageSource = fs.readFileSync(path.join(__dirname, '../gas/ReportUpload.html'), 'utf8');
const diffCore = fs.readFileSync(path.join(__dirname, '../gas/ReportUploadThreecDiffCore.html'), 'utf8');

test('正式內嵌資產可載入真實 SheetJS 與 Work 解析器，保留中文 XLSX roundtrip', async ({page}) => {
  const code = fs.readFileSync(path.join(__dirname, '../gas/Code.gs'), 'utf8');
  const include = code.slice(code.indexOf('function reportUploadInclude_('), code.indexOf('\n}', code.indexOf('function reportUploadInclude_('))+2);
  const context = vm.createContext({HtmlService:{createTemplateFromFile(name){return {
    getRawContent:()=>fs.readFileSync(path.join(__dirname, '../gas', name+'.html'), 'utf8')
  };}}});
  vm.runInContext(include,context);
  const assets = ['ReportUploadSheetJs','ReportUploadTradeInCore'].map(name=>context.reportUploadInclude_(name));
  for(const source of assets) expect(source).not.toMatch(/[\x00-\x08\x0b\x0c\x0e-\x1f]/);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.abort());
  await page.setContent(assets.map(source=>'<script>'+source+'</script>').join(''));
  const actual=await page.evaluate(()=>{
    const book=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['商品型號','價格'],['中文商品',0]]),'中文工作表');
    const bytes=XLSX.write(book,{type:'array',bookType:'xlsx'});
    const read=XLSX.read(bytes,{type:'array'});
    return {parser:typeof TradeInImportCore.parseFile,rows:XLSX.utils.sheet_to_json(read.Sheets['中文工作表'],{header:1})};
  });
  expect(errors).toEqual([]);
  expect(actual).toEqual({parser:'function',rows:[['商品型號','價格'],['中文商品',0]]});
});

test('整份正式上傳模板經白名單評估後可載入，匿名維持驗證入口', async ({page}) => {
  const root = process.env.REPORT_UPLOAD_RUNTIME_DIR || path.join(__dirname, '../gas');
  const file = process.env.REPORT_UPLOAD_RUNTIME_DIR ? '程式碼.js' : 'Code.gs';
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  const include = code.slice(code.indexOf('function reportUploadInclude_('), code.indexOf('\n}', code.indexOf('function reportUploadInclude_('))+2);
  const context = vm.createContext({HtmlService:{createTemplateFromFile(name){return {
    getRawContent:()=>fs.readFileSync(path.join(root, name+'.html'), 'utf8')
  };}}});
  vm.runInContext(include, context);
  expect(()=>context.reportUploadInclude_('PrivateDashboard')).toThrow('report-upload-include-not-allowed');
  expect(()=>context.reportUploadInclude_('../Code')).toThrow('report-upload-include-not-allowed');
  // Evaluate every include in the complete template through the production guard.
  // A missing allowlist entry must fail before any browser content is installed.
  let includeCount = 0;
  const html = fs.readFileSync(path.join(root, 'ReportUpload.html'), 'utf8')
    .replace(/<\?!=\s*reportUploadInclude_\('([^']+)'\)\s*;?\s*\?>/g, (_, name)=>{
      includeCount++; return context.reportUploadInclude_(name);
    });
  expect(includeCount).toBe(3);
  expect(html).not.toContain('<?!= reportUploadInclude_');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.abort());
  await page.setContent(html);
  await expect(page.locator('#authCard')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  expect(await page.evaluate(()=>({xlsx:typeof XLSX.read,parser:typeof TradeInImportCore.parseFile,diff:typeof ThreecPriceDiffCore.diffSnapshots})))
    .toEqual({xlsx:'function',parser:'function',diff:'function'});
  await page.locator('#loginBtn').click();
  await expect(page.locator('#authMessage')).toContainText('請輸入員編與管理者密碼');
  await expect(page.locator('#app')).toBeHidden();
  expect(errors).toEqual([]);
});

async function setup(page) {
  await page.route('**/*', route => route.abort());
  const mocks = `
    window.rpcCalls = [];
    window.nextPublishStatus = 'published';
    window.delayParse = false;
    window.noopMode = false;
    window.XLSX = {};
    window.TradeInImportCore = {
      parseFile: async (file, xlsx, kind) => {
        if (window.delayParse) await new Promise(resolve => { window.resolveParse = resolve; });
        return { kind, fileName:file.name };
      },
      buildPublishSnapshot: (kind, parsed) => {
        const rows = window.noopMode ? [
          {source_sheet:'iPhone 24期',source_row_number:3,brand:'Apple',code:'TEST-B',model:'iPhone test B 256G(黑)',colorless_model:'iPhone test B 256G',retail_price:'28,900',project_prices:{'999H 24期':'1,199'}},
          {source_sheet:'iPhone 24期',source_row_number:2,brand:'Apple',code:'TEST-A',model:'iPhone test A 256G(黑)',colorless_model:'iPhone test A 256G',retail_price:'29,900',project_prices:{'999H 24期':'1,299'}}
        ] : [{source_sheet:'iPhone 24期',source_row_number:2,brand:'Apple',code:'TEST',model:'iPhone test 256G(黑)',colorless_model:'iPhone test 256G',retail_price:'29,900',project_prices:{'999H 24期':'1,299','1399H 36期':'0','1799H':''}}];
        return {kind, source_file_name:parsed.fileName, source_version_date:window.noopMode?'2026-10-02':'2026-09-29', source_file_sha256:window.noopMode?'b'.repeat(64):'a'.repeat(64), row_count:window.noopMode?2:3, excluded_no_price_count:0, quote_conflict_count:0, rows};
      }
    };
  `;
  // Use a tiny isolated google.script.run mock with one handler chain per RPC.
  const mockRpc = `window.google={script:{get run(){let success;const chain=new Proxy({}, {get(_,name){
    if(name==='withSuccessHandler')return fn=>{success=fn;return chain};
    if(name==='withFailureHandler')return ()=>chain;
    return payload=>{window.rpcCalls.push({name,payload});if(name==='threec_publish')window.lastSnapshot=JSON.parse(payload.snapshotJson);let result={ok:false};if(name==='threec_diff_preview'){const active=window.noopMode?{snapshot_hash:'active-hash',source_version_date:'2026-09-29',source_file_sha256:'a'.repeat(64),row_count:2}:null;result={status:'ok',basis:{snapshot_hash:active?active.snapshot_hash:'',date:active?active.source_version_date:'',source_sha:active?active.source_file_sha256:''},registry:{shopping:{active}},changeSet:{kind:'shopping',counts:{added:0,changed:0,unchanged:window.noopMode?6:0,removed:0},addedCount:0,changedCount:0,unchangedCount:window.noopMode?6:0,removedCount:0,changeCount:0,offset:0,limit:100,hasMore:false,changes:[]}};}else if(name==='threec_readback'){let snapshot=window.lastSnapshot;if(window.noopMode&&window.nextPublishStatus==='already_current')snapshot={...window.lastSnapshot,source_version_date:'2026-09-29',source_file_sha256:'a'.repeat(64),snapshot_hash:'active-hash',rows:[...window.lastSnapshot.rows].reverse()};const updateCheck=window.noopMode&&window.nextPublishStatus==='already_current'?{status:'already_current',snapshot_hash:'active-hash',source_version_date:window.lastSnapshot.source_version_date,source_file_sha256:window.lastSnapshot.source_file_sha256,row_count:window.lastSnapshot.row_count}:null;result={snapshot:window.failReadback?{...snapshot,rows:[]} : snapshot,registry:{},updateCheck};}else if(name==='report_upload_log')result={entries:[],live:null};else if(name==='threec_publish')result={status:window.nextPublishStatus,registry:{}};else if(name==='threec_status')result={registry:{}};queueMicrotask(()=>success(result));};
  }});return chain;}}};`;
  const html = pageSource.replace(/<script><\?!=[\s\S]*?\?><\/script>/g, '')
    .replace('    const auth', mocks + diffCore + mockRpc + '\n    const auth');
  await page.setContent(html);
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#employeeId').fill('TEST01');
  await page.locator('#adminSecret').fill('test-secret');
  await page.locator('#loginBtn').click();
  await expect(page.locator('#app')).toBeVisible();
}

async function choose(page, name = 'shopping20260929.xlsx') {
  await page.locator('#shoppingFile').setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('local-only-test')});
}

test('登入後可選檔，解析不傳送原始 Excel，發布需要明確確認', async ({page}) => {
  await setup(page);
  await expect(page.locator('#shoppingFile')).toBeEnabled();
  await expect(page.locator('#tradeinFile')).toBeEnabled();
  await choose(page);
  await page.locator('#shoppingPreviewBtn').click();
  await expect(page.locator('#threecRows')).toHaveText('3 筆');
  await expect(page.locator('#threecPublishBtn')).toBeDisabled();
  expect(await page.evaluate(()=>window.rpcCalls.filter(c=>c.name==='threec_publish').length)).toBe(0);
  await page.locator('#threecConfirm').check();
  await page.locator('#threecPublishBtn').click();
  await expect(page.locator('#threecMessage')).toContainText('已發布');
  await expect(page.locator('#threecPublishBtn')).toBeDisabled();
  const calls=await page.evaluate(()=>window.rpcCalls.filter(c=>c.name==='threec_publish'));
  expect(calls).toHaveLength(1);
  expect(calls[0].payload.confirmPublish).toBe(true);
  expect(calls[0].payload).not.toHaveProperty('fileBase64');
  expect(JSON.parse(calls[0].payload.snapshotJson).source_file_name).toBe('shopping20260929.xlsx');
});

test('換檔清除舊預覽及確認，不能發布之前的快照', async ({page}) => {
  await setup(page); await choose(page);
  await page.locator('#shoppingPreviewBtn').click();
  await expect(page.locator('#threecPreview')).toBeVisible();
  await page.locator('#threecConfirm').check();
  await choose(page,'shopping20260930.xlsx');
  await expect(page.locator('#threecPreview')).toBeHidden();
  await expect(page.locator('#threecConfirm')).not.toBeChecked();
  await expect(page.locator('#threecPublishBtn')).toBeDisabled();
});

test('換檔後較晚完成的解析不得恢復舊快照', async ({page}) => {
  await setup(page); await choose(page);
  await page.evaluate(()=>{window.delayParse=true;});
  await page.locator('#shoppingPreviewBtn').click();
  await choose(page,'shopping20260930.xlsx');
  await page.evaluate(()=>window.resolveParse());
  await expect(page.locator('#shoppingPreviewBtn')).toBeEnabled();
  await expect(page.locator('#threecPreview')).toBeHidden();
  await expect(page.locator('#threecPublishBtn')).toBeDisabled();
});

test('同日異雜湊必須再確認，成功後發布按鈕保持停用', async ({page}) => {
  await setup(page); await choose(page);
  await page.locator('#shoppingPreviewBtn').click();
  await page.evaluate(()=>{window.nextPublishStatus='confirmation_required';});
  await page.locator('#threecConfirm').check();
  await page.locator('#threecPublishBtn').click();
  await expect(page.locator('#threecSameDateWrap')).toBeVisible();
  await expect(page.locator('#threecPublishBtn')).toBeDisabled();
  await page.locator('#threecSameDateConfirm').check();
  await page.evaluate(()=>{window.nextPublishStatus='published';});
  await page.locator('#threecPublishBtn').click();
  await expect(page.locator('#threecMessage')).toContainText('已發布');
  await expect(page.locator('#threecPublishBtn')).toBeDisabled();
  const calls=await page.evaluate(()=>window.rpcCalls.filter(c=>c.name==='threec_publish'));
  expect(calls[0].payload.confirmSameDateHashChange).toBe(false);
  expect(calls[1].payload.confirmSameDateHashChange).toBe(true);
});


test('來源預覽显示千分位、零元与缺價，正式讀回不一致不能宣稱成功', async ({page}) => {
  await setup(page); await choose(page);
  await page.locator('#shoppingPreviewBtn').click();
  await expect(page.locator('#threecPricePreview')).toContainText('1,299 元');
  await expect(page.locator('#threecPricePreview')).toContainText('0 元');
  await expect(page.locator('#threecPricePreview')).toContainText('無報價');
  await page.evaluate(()=>{window.failReadback=true;});
  await page.locator('#threecConfirm').check();
  await page.locator('#threecPublishBtn').click();
  await expect(page.locator('#threecMessage')).toContainText('正式讀回與來源預覽不一致');
  await expect(page.locator('#threecMessage')).not.toContainText('已發布');
  const calls=await page.evaluate(()=>window.rpcCalls.map(c=>c.name));
  expect(calls.indexOf('threec_readback')).toBeGreaterThan(calls.indexOf('threec_publish'));
});

test('already_current 以來源核對欄位與語意價格差異驗證，容許日期／列序更新', async ({page}) => {
  await setup(page);
  await page.evaluate(() => { window.noopMode = true; window.nextPublishStatus = 'already_current'; });
  await choose(page, 'shopping20261002.xlsx');
  await page.locator('#shoppingPreviewBtn').click();
  await expect(page.locator('#threecVersion')).toHaveText('2026-10-02');
  const preview = await page.evaluate(() => window.rpcCalls.find(call => call.name === 'threec_diff_preview'));
  expect(preview.payload).not.toHaveProperty('fileBase64');
  expect(JSON.parse(preview.payload.snapshotJson).source_version_date).toBe('2026-10-02');
  await page.locator('#threecConfirm').check();
  await page.locator('#threecPublishBtn').click();
  await expect(page.locator('#threecMessage')).toContainText('正式版本已是同日期同雜湊，未產生新寫入');
  await expect(page.locator('#threecMessage')).not.toContainText('正式讀回與來源預覽不一致');
  const calls = await page.evaluate(() => window.rpcCalls.map(call => call.name));
  expect(calls.indexOf('threec_readback')).toBeGreaterThan(calls.indexOf('threec_publish'));
});
