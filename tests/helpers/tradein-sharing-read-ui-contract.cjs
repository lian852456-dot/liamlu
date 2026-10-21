'use strict';
module.exports=function registerReadFallbackChecks(){
const {test,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path');
const {createRuntime,parsed,OPERATOR}=require('./tradein-synthetic-runtime.cjs');
const IMAGE='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aKkAAAAASUVORK5CYII=';
const BASE_ROW={id:'SYNTHETIC_PUBLIC_READ_0001',month:'2026-10',version:1,store:'萬大',author:'合成公開同仁',authorUnverified:true,audience:'public-link/v1',type:'成功成交',scenario:'純合成公開情境',approach:'純合成話術',outcome:'純合成結果',createdAt:'2026-10-20T07:50:00Z',createdDate:'2026-10-20',updatedAt:'2026-10-20T07:50:00Z',featured:false,hidden:false,editable:false,hasImage:true};
const PRIVATE_ROW={...BASE_ROW,id:'SYNTHETIC_PRIVATE_READ_0001',store:'永吉',author:'合成私有同仁',authorUnverified:false,audience:'private',scenario:'純合成私有情境',editable:true,hasImage:false};
async function setup(page,width,{twoDays=false}={}){
 const progress=createRuntime(),source=parsed();progress.configure(source);const plan=progress.a.tradeinPerformancePreview({source,employeeId:OPERATOR,adminSecret:progress.secret}),published=progress.a.tradeinPerformancePublish({source,...plan,employeeId:OPERATOR,adminSecret:progress.secret});progress.a.tradeinPerformancePublicPublish({employeeId:OPERATOR,adminSecret:progress.secret,month:source.month,sourceHash:source.source_sha256,expectedActiveHash:published.snapshotHash});
 const control={publicFail:false,privateMode:'deny',delayPublicDay:'',delayPrivate:false,releasePublic:null,releasePrivate:null,calls:[],errors:[]};
 await page.setViewportSize({width,height:900});await page.clock.install({time:new Date('2026-10-21T04:00:00Z')});
 await page.addInitScript(()=>sessionStorage.setItem('north12b_password_session_v1',JSON.stringify({v:1,owner:'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec',deviceId:'SYNTHETIC_DEVICE',token:'SYNTHETIC_TOKEN',expiresAt:1792569600000+3600000,logoutEpoch:''})));
 page.on('pageerror',e=>control.errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname==='127.0.0.1'){const root=path.resolve(__dirname,'../..'),file=path.resolve(root,'.'+u.pathname);if(path.relative(root,file).startsWith('..'))return route.abort();const contentType={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)];if(!contentType)return route.abort();return route.fulfill({contentType,body:await fs.readFile(file)});}
  if(u.hostname!=='script.google.com')return route.abort();let p;try{p=JSON.parse(route.request().postData());}catch{p=JSON.parse(new URLSearchParams(route.request().postData()).get('payload'));}control.calls.push(p);
  if(/_(create|save|moderate|publish)$/.test(p.action))throw Error('UNEXPECTED_SYNTHETIC_WRITE');
  let body,delayed=false;
  if(p.action==='tradein_sharing_public_list'){
   const rows=twoDays?[BASE_ROW,{...BASE_ROW,id:'SYNTHETIC_NEXT_DATE_0001',author:'合成新日期同仁',createdDate:'2026-10-21'}]:[BASE_ROW];body=control.publicFail?{status:'error',code:'SHARE_RATE_LIMIT'}:{status:'ok',cases:rows.filter(r=>r.createdDate>=p.start&&r.createdDate<=p.end)};
   if(control.delayPublicDay===p.start){delayed=true;await new Promise(resolve=>control.releasePublic=resolve);}
  }else if(p.action==='employee_tradein_sharing_list'){
   body=control.privateMode==='deny'?{status:'error',code:'B_AUTH_DENIED'}:{status:'ok',profile:{supervisor:false},cases:[{...BASE_ROW,version:2,editable:true},PRIVATE_ROW]};
   if(control.delayPrivate){delayed=true;await new Promise(resolve=>control.releasePrivate=resolve);}
  }else if(p.action==='tradein_sharing_public_detail'||p.action==='employee_tradein_sharing_detail')body={status:'ok',item:{...BASE_ROW,image:IMAGE}};
  else body=progress.dispatch(p);
  if(u.searchParams.get('transport')==='iframe'){const message=JSON.stringify({type:'north12b-gas-response-v1',requestId:u.searchParams.get('requestId'),body}).replace(/</g,'\\u003c');return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+message+',"*")</script>'});}
  if(delayed){await route.fulfill({contentType:'application/json',body:JSON.stringify(body)}).catch(()=>{});return;}
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://127.0.0.1:4173/tradein-progress.html');await page.getByRole('tab',{name:'同仁分享',exact:true}).click();await expect(page.locator('#shareMessage')).toContainText('已讀取');return control;
}
async function range(page){await page.locator('#shareView').selectOption('range');await page.locator('#shareEnd').fill('2026-10-21');await expect(page.locator('#shareMessage')).toContainText('2026-10-01 至 2026-10-21');await expect(page.locator('#shareRefresh')).toBeEnabled();}
for(const width of [1280,390,320])test(`${width}px read fallback retains public rows, warnings and public image permissions`,async({page},info)=>{
 const c=await setup(page,width);await range(page);await page.locator('#sharePrivate').check();await expect(page.locator('#shareMessage')).toContainText('登入分享讀取失敗');await expect(page.locator('#shareMessage')).toContainText('已保留本次日期的公開分享');await expect(page.locator('#shareCount')).toHaveText('1 則分享');await expect(page.locator('#shareList')).toContainText('合成公開同仁');await expect(page.getByRole('button',{name:'編輯',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'查看圖片',exact:true}).click();await expect(page.locator('#shareList img')).toBeVisible();expect(c.calls.at(-1).action).toBe('tradein_sharing_public_detail');expect(c.calls.filter(p=>p.action==='employee_tradein_sharing_detail')).toHaveLength(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('SYNTHETIC-read-fallback-'+width+'.png'),fullPage:true});expect(c.errors).toEqual([]);
});
test('read fallback merges successful lists once and retains authenticated editing and detail paths',async({page})=>{
 const c=await setup(page,390);c.privateMode='ok';await range(page);await page.locator('#sharePrivate').check();await expect(page.locator('#shareMessage')).toContainText('公開與登入可見');await expect(page.locator('#shareCount')).toHaveText('2 則分享');await expect(page.getByRole('button',{name:'編輯',exact:true})).toHaveCount(2);await page.getByRole('button',{name:'查看圖片',exact:true}).click();await expect(page.locator('#shareList img')).toBeVisible();expect(c.calls.at(-1).action).toBe('employee_tradein_sharing_detail');await page.locator('#shareStore').selectOption('萬大');await expect(page.locator('#shareCount')).toHaveText('1 則分享');
});
test('read fallback removes previous results when public and optional private reads both fail',async({page})=>{
 const c=await setup(page,390);await range(page);await expect(page.locator('#shareCount')).toHaveText('1 則分享');c.publicFail=true;await page.locator('#sharePrivate').check();await expect(page.locator('#shareMessage')).toContainText('公開分享讀取失敗');await expect(page.locator('#shareMessage')).toContainText('登入分享讀取失敗');await expect(page.locator('#shareList .sharing-card')).toHaveCount(0);await expect(page.locator('#shareCount')).toHaveText('');await expect(page.locator('#shareRefresh')).toBeEnabled();
});
test('read fallback labels authorized results separately if public read fails',async({page})=>{
 const c=await setup(page,390);await range(page);c.publicFail=true;c.privateMode='ok';await page.locator('#sharePrivate').check();await expect(page.locator('#shareMessage')).toContainText('公開分享讀取失敗');await expect(page.locator('#shareMessage')).toContainText('登入可見分享');await expect(page.locator('#shareCount')).toHaveText('2 則分享');
});
test('read fallback date switch discards slow old data and prevents duplicate manual reads',async({page})=>{
 const c=await setup(page,390,{twoDays:true});c.delayPublicDay='2026-10-20';await page.locator('#shareDay').fill('2026-10-20');await expect.poll(()=>typeof c.releasePublic).toBe('function');await expect(page.locator('#shareRefresh')).toBeDisabled();await expect(page.locator('#shareList .sharing-card')).toHaveCount(0);expect(c.calls.filter(p=>p.action==='tradein_sharing_public_list'&&p.start==='2026-10-20')).toHaveLength(1);await page.locator('#shareDay').fill('2026-10-21');await expect(page.locator('#shareMessage')).toContainText('已讀取 2026-10-21 至 2026-10-21');await expect(page.locator('#shareList')).toContainText('合成新日期同仁');c.releasePublic();await expect(page.locator('#shareRefresh')).toBeEnabled();await expect(page.locator('#shareList')).not.toContainText('合成公開同仁');
});
test('read fallback uncheck suppresses late private data and edit controls',async({page})=>{
 const c=await setup(page,390);await range(page);c.privateMode='ok';c.delayPrivate=true;await page.locator('#sharePrivate').check();await expect.poll(()=>typeof c.releasePrivate).toBe('function');await page.locator('#sharePrivate').uncheck();await expect(page.locator('#shareMessage')).toHaveText('已讀取 2026-10-01 至 2026-10-21 的公開分享（台灣時間）。');c.releasePrivate();await expect(page.locator('#shareCount')).toHaveText('1 則分享');await expect(page.locator('#shareList')).not.toContainText('合成私有同仁');await expect(page.getByRole('button',{name:'編輯',exact:true})).toHaveCount(0);
});
};
