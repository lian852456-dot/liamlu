const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const api=require('../patrol-inspection-export.js');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Zp0AAAAASUVORK5CYII=';
const row={checkId:'2026-11-04|測試甲|H1',date:'2026-11-04',store:'測試甲',inspector:'測試督導',item:1,result:'abnormal',note:'缺失<script>alert(1)</script>',improvement:'待改善',savedAt:'2026/11/04 10:00',media:[]};
function snap(extra={}){return {status:'ok',contract:api.CONTRACT,month:'2026-11',stores:['測試甲','測試乙'],rows:[{...row}],revision:'r1',readAt:'2026-11-04T02:00:00Z',...extra};}
test('standalone export projects only display fields, escapes content, and includes pending questions',()=>{
  const html=api.buildHTML(snap({token:'DO_NOT_EXPORT_TOKEN',rows:[{...row,apiUrl:'DO_NOT_EXPORT_ENDPOINT',media:[{name:'示範.png',mimeType:'image/png',dataUrl:png,id:'DO_NOT_EXPORT_ID'}]}]}));
  assert.ok(html.includes(png));assert.ok(html.includes('缺失&lt;script&gt;alert(1)&lt;/script&gt;'));
  for(const value of ['DO_NOT_EXPORT_TOKEN','DO_NOT_EXPORT_ENDPOINT','DO_NOT_EXPORT_ID'])assert.ok(!html.includes(value));
  assert.equal((html.match(/class="item /g)||[]).length,9);
  assert.ok(html.includes('connect-src &#39;none&#39;')||html.includes("connect-src 'none'"));
  assert.ok(html.includes('本月尚無已儲存紀錄'));assert.ok(!html.includes('<form'));
});
test('legacy checks have 18 questions; September onwards has 9',()=>{
  const html=api.buildHTML(snap({month:'2026-08',rows:[{...row,date:'2026-08-04',result:'ok',item:18}]}));
  assert.equal((html.match(/class="item /g)||[]).length,18);
});
test('rejects cross-scope data and incomplete or unsafe photo payloads',()=>{
  assert.throws(()=>api.buildHTML(snap({rows:[{...row,store:'範圍外'}]})),/範圍/);
  assert.throws(()=>api.buildHTML(snap({rows:[{...row,media:[{mimeType:'image/png',dataUrl:'https://private.example/photo'}]}]})),/完整嵌入/);
  assert.throws(()=>api.buildHTML(snap({rows:[{...row,media:[{mimeType:'image/svg+xml',dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'}]}]})),/完整嵌入/);
  const html=api.buildHTML(snap({rows:[{...row,media:[{name:'附件',viewUrl:'javascript:alert(1)'}]}]}));assert.ok(!html.includes('javascript:'));
});
test('collects authorized photos then verifies the same cloud revision',async()=>{
  const calls=[];let auth=0;
  const result=await api.collect({scope:{month:'2026-11',store:'測試甲'},assertActive:()=>auth++,titleFor:()=> '正式題目',request:async(action,args)=>{
    calls.push({action,args});return action==='half_export_photo'?{status:'ok',contract:api.CONTRACT,mimeType:'image/png',dataUrl:png}:snap({stores:['測試甲'],rows:[{...row,media:[{id:'photo_id_123',kind:'image',mimeType:'image/png',name:'照片'}]}]});
  }});
  assert.equal(calls.length,3);assert.equal(calls[1].args.checkId,row.checkId);assert.equal(calls[1].args.revision,'r1');assert.ok(auth>=5);assert.equal(result.rows[0].media[0].dataUrl,png);assert.equal(result.rows[0].title,'正式題目');
});
test('failed photos, changed revision, and logout all stop export',async()=>{
  const withPhoto=snap({rows:[{...row,media:[{id:'photo_id_123',kind:'image',mimeType:'image/png',name:'照片'}]}]});
  await assert.rejects(api.collect({scope:{month:'2026-11'},assertActive:()=>{},request:async action=>action==='half_export_photo'?{status:'error',message:'denied'}:withPhoto}),/denied/);
  let n=0;await assert.rejects(api.collect({scope:{month:'2026-11'},assertActive:()=>{},request:async()=>snap({revision:++n===1?'r1':'r2'})}),/已更新/);
  let loggedOut=false;await assert.rejects(api.collect({scope:{month:'2026-11'},assertActive:()=>{if(loggedOut)throw Error('登出');},request:async()=>{loggedOut=true;return snap();}}),/登出/);
});
function backend(options={}){
  let fileReads=0;
  const root={getId:()=> 'media_root_1'};
  const file={getMimeType:()=>options.mime||'image/png',getSize:()=>42,isTrashed:()=>false,getParents:()=>({hasNext:()=>!options.outside,next:()=>{options.outside=true;return root;}}),getBlob:()=>({getBytes:()=>Buffer.from('png')})};
  const context={PT_STORES:[{name:'台北測試甲'},{name:'台北測試乙'}],ptRequireSession_:(token)=>{if(token!=='valid')throw Error('unauthorized');},readHalfCheck:()=>options.rows||[{...row,evidenceNames:JSON.stringify([{id:'photo_id_123',name:'原始照片',mimeType:'image/png'}])}],ptHashHex_:v=>crypto.createHash('sha256').update(v).digest('hex'),PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'media_root_1'})},DriveApp:{getFileById:()=>{fileReads++;return file;}},Utilities:{base64Encode:v=>Buffer.from(v).toString('base64')}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../gas/PatrolInspectionExport.gs'),'utf8'),context);
  return {context,reads:()=>fileReads};
}
test('backend checks session and server-side store/month scope',()=>{
  const {context:c}=backend({rows:[{...row},{...row,store:'測試乙'},{...row,date:'2026-10-04'},{...row,store:'其他區'},{...row,item:10}]});
  assert.throws(()=>c.halfExportSnapshot_({token:'wrong',month:'2026-11'}),/unauthorized/);
  assert.throws(()=>c.halfExportSnapshot_({token:'valid',month:'2026-11',store:'其他區'}),/未獲授權/);
  const s=c.halfExportSnapshot_({token:'valid',month:'2026-11',store:'測試甲'});assert.equal(s.rows.length,1);assert.equal(s.stores.length,1);
});
test('backend denies arbitrary Drive IDs before file access and refuses out-of-root evidence',()=>{
  const {context:c,reads}=backend();const scope={token:'valid',month:'2026-11',store:'測試甲'};const s=c.halfExportSnapshot_(scope);
  assert.throws(()=>c.halfExportPhoto_({...scope,revision:s.revision,checkId:row.checkId,item:1,fileId:'arbitrary_123'}),/不屬於/);assert.equal(reads(),0);
  const result=c.halfExportPhoto_({...scope,revision:s.revision,checkId:row.checkId,item:1,fileId:'photo_id_123'});assert.equal(result.dataUrl,'data:image/png;base64,cG5n');
  const b=backend({outside:true});const other=b.context.halfExportSnapshot_(scope);
  assert.throws(()=>b.context.halfExportPhoto_({...scope,revision:other.revision,checkId:row.checkId,item:1,fileId:'photo_id_123'}),/資料夾/);
});
test('backend refuses stale revisions before Drive access',()=>{
  const {context:c,reads}=backend();assert.throws(()=>c.halfExportPhoto_({token:'valid',month:'2026-11',store:'測試甲',revision:'old'}),/已更新/);assert.equal(reads(),0);
});

test('page integration downloads a snapshot only after cloud export succeeds',async()=>{
  const page=fs.readFileSync(require.resolve('../patrol.html'),'utf8');
  const start=page.indexOf('let halfHtmlExportRunning=false;'),end=page.indexOf('function exportHalfChecksExcel(){',start);
  let download=0,revoked=0,lastMsg='';
  const controls={halfExportHtml:{disabled:false},halfExportMonth:{value:'2026-11'},halfExportStore:{value:'測試甲'}};
  const context={PT_TOKEN:'valid',secureUnlocked:true,privateAccount:{},window:{PortalLogout:{assertActive:()=>{}}},document:{getElementById:id=>controls[id],createElement:()=>({click:()=>download++,remove:()=>{}}),body:{appendChild:()=>{}}},PatrolInspectionExport:api,privateCloudCall:async()=>snap(),halfItemText:()=> '檢查項目',showHalfMsg:text=>lastMsg=text,URL:{createObjectURL:()=> 'blob:local',revokeObjectURL:()=>revoked++},Blob,setTimeout:fn=>fn()};
  vm.createContext(context);vm.runInContext(page.slice(start,end),context);
  await context.exportHalfChecksHTML();assert.equal(download,1);assert.equal(revoked,1);assert.equal(controls.halfExportHtml.disabled,false);assert.match(lastMsg,/已匯出 HTML/);
  context.PT_TOKEN='';await context.exportHalfChecksHTML();assert.equal(download,1);assert.match(lastMsg,/未完成/);
});

test('metadata-only videos stay private links, never require photo data',async()=>{
  const result=await api.collect({scope:{month:'2026-11'},assertActive:()=>{},request:async()=>snap({rows:[{...row,media:[{id:'video_123456',kind:'video',mimeType:'video/mp4',name:'影片',viewUrl:'https://drive.google.com/file/d/video_123456/view'}]}]})});
  const html=api.buildHTML(result);assert.ok(html.includes('需網路與權限'));assert.ok(!html.includes('<iframe'));
});
