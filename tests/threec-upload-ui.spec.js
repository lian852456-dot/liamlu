const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pageSource = fs.readFileSync(path.join(__dirname, '../gas/ReportUpload.html'), 'utf8');

test('正式內嵌資產可載入真實 SheetJS 與 Work 解析器，保留中文 XLSX roundtrip', async ({page}) => {
  const code = fs.readFileSync(path.join(__dirname, '../gas/Code.gs'), 'utf8');
  const include = code.slice(code.indexOf('function reportUploadInclude_('), code.indexOf('function report_upload_preview('));
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

async function setup(page) {
  await page.route('**/*', route => route.abort());
  const mocks = `
    window.rpcCalls = [];
    window.nextPublishStatus = 'published';
    window.delayParse = false;
    window.XLSX = {};
    window.TradeInImportCore = {
      parseFile: async (file, xlsx, kind) => {
        if (window.delayParse) await new Promise(resolve => { window.resolveParse = resolve; });
        return { kind, fileName:file.name };
      },
      buildPublishSnapshot: (kind, parsed) => ({
        kind, source_file_name:parsed.fileName, source_version_date:'2026-09-29',
        source_file_sha256:'a'.repeat(64), row_count:3, excluded_no_price_count:0, quote_conflict_count:0
      })
    };
  `;
  // Use a tiny isolated google.script.run mock with one handler chain per RPC.
  const mockRpc = `window.google={script:{get run(){let success;const chain=new Proxy({}, {get(_,name){
    if(name==='withSuccessHandler')return fn=>{success=fn;return chain};
    if(name==='withFailureHandler')return ()=>chain;
    return payload=>{window.rpcCalls.push({name,payload});const result=name==='report_upload_log'?{entries:[],live:null}:name==='threec_publish'?{status:window.nextPublishStatus,registry:{}}:name==='threec_status'?{registry:{}}:{ok:false};queueMicrotask(()=>success(result));};
  }});return chain;}}};`;
  const html = pageSource.replace(/<script><\?!=[\s\S]*?\?><\/script>/g, '')
    .replace('    const auth', mocks + mockRpc + '\n    const auth');
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
