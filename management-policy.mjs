import {createSupervisorAccess} from './tradein-supervisor-auth.mjs?v=20261012-supervisor-1';
import {CONTRACT,normalizePolicy,renderPolicyHTML,policyFilename} from './management-policy-core.mjs?v=20261105-2';
const $ = id => document.getElementById(id);
const fieldIds = ['title','month','version','start','end','audience','source'];
const emptyPreview = '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><body style="font-family:system-ui;color:#6b7179;padding:32px;line-height:1.8">填寫資料後，按「更新預覽」。</body></html>';
let revision = 0, busy = false;
const urls = new Set();
const message = (text, error = false) => { $('status').textContent=text; $('status').className=error?'error':''; };
function controls() {
  const active = access.current();
  $('export').disabled=busy||!active||!$('shareable').checked;
  for (const id of ['preview','saveDraft','addSection','draftFile']) $(id).disabled=busy||!active;
}
function changed() { revision++; $('reviewed').checked=false; $('shareable').checked=false; $('reader').srcdoc=emptyPreview; message('內容已變更，請重新核對並更新預覽。'); controls(); }
function addSection(title='',body='') {
  if ($('sections').children.length >= 12) throw Error('最多 12 個章節。');
  const article=document.createElement('div');article.className='rule-editor';
  const header=document.createElement('div');header.className='rule-header';
  const caption=document.createElement('span');caption.textContent='辦法章節';
  const remove=document.createElement('button');remove.type='button';remove.className='secondary remove';remove.textContent='移除此章節';
  remove.addEventListener('click',()=>{access.requireCurrent();if($('sections').children.length===1){message('請保留至少一個章節。',true);return;}article.remove();changed();});header.append(caption,remove);article.append(header);
  for(const [text,tag,value,key,max] of [['章節名稱','input',title,'section-title',100],['辦法內容','textarea',body,'section-body',6000]]) {const label=document.createElement('label');label.textContent=text;const input=document.createElement(tag);input.className=key;input.value=value;input.maxLength=max;if(tag==='textarea')input.rows=6;input.addEventListener('input',changed);label.append(input);article.append(label);}
  $('sections').append(article);
}
function clearData() {
  revision++;busy=false;fieldIds.forEach(id=>$(id).value='');$('draftFile').value='';$('reviewed').checked=false;$('shareable').checked=false;$('sections').replaceChildren();addSection();$('reader').srcdoc=emptyPreview;
  for(const url of urls) URL.revokeObjectURL(url);urls.clear();message('本頁草稿已清除。');
}
function lock(error) {clearData();$('workspace').hidden=true;$('workspace').inert=true;$('authPanel').hidden=false;$('passcode').value='';$('authStatus').textContent=error?.message||'請重新完成督導驗證；本頁內容已清除。';}
const access=createSupervisorAccess({onRevoke:lock});
function policy() {return normalizePolicy({contract:CONTRACT,...Object.fromEntries(fieldIds.map(id=>[id,$(id).value])),reviewed:$('reviewed').checked,sections:Array.from($('sections').children).map(el=>({title:el.querySelector('.section-title').value,body:el.querySelector('.section-body').value}))});}
async function verify(key) {await access.verify(key===undefined?{}:{key});access.requireCurrent();$('workspace').hidden=false;$('workspace').inert=false;$('authPanel').hidden=true;controls();}
function download(text,type,name) {access.requireCurrent();const url=URL.createObjectURL(new Blob([text],{type}));urls.add(url);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},30000);}
async function exportFile(kind) {
  if(busy)return;
  const ticket=revision;
  try {
    access.requireCurrent();const p=policy();if(kind==='html'&&!$('shareable').checked)throw Error('請先確認門市版的提供範圍與個資。');
    busy=true;controls();await access.verify();if(ticket!==revision)return;access.requireCurrent();
    if(kind==='html'){const html=renderPolicyHTML(p);$('reader').srcdoc=html;download(html,'text/html;charset=utf-8',policyFilename(p));message('門市唯讀 HTML 已交給瀏覽器下載，可離線閱讀。');}
    else {download(JSON.stringify(p,null,2),'application/json;charset=utf-8',policyFilename(p,'json'));message('編輯草稿已交給瀏覽器下載；可稍後載入繼續編輯。');}
  }catch(error){if(ticket===revision)message(error.message,true);}finally{busy=false;controls();}
}
$('authForm').addEventListener('submit',async event=>{event.preventDefault();$('verify').disabled=true;const key=$('passcode').value;$('passcode').value='';try{await verify(key);}catch(error){$('authStatus').textContent=error.message;}finally{$('verify').disabled=false;}});
fieldIds.forEach(id=>$(id).addEventListener('input',changed));
$('reviewed').addEventListener('change',()=>{revision++;$('shareable').checked=false;$('reader').srcdoc=emptyPreview;controls();});
$('shareable').addEventListener('change',()=>{revision++;controls();});
$('addSection').addEventListener('click',()=>{try{access.requireCurrent();addSection();changed();}catch(error){message(error.message,true);}});
$('clear').addEventListener('click',()=>{clearData();controls();});
$('preview').addEventListener('click',()=>{try{access.requireCurrent();$('reader').srcdoc=renderPolicyHTML(policy());message('預覽已更新。請核對適用期間、版本與辦法內容。');if(window.matchMedia('(max-width:950px)').matches)$('reader').scrollIntoView({block:'start'});}catch(error){message(error.message,true);}});
$('saveDraft').addEventListener('click',()=>exportFile('json'));
$('export').addEventListener('click',()=>exportFile('html'));
$('draftFile').addEventListener('change',async()=>{
  const file=$('draftFile').files[0];$('draftFile').value='';if(!file||busy)return;const ticket=revision;
  try {access.requireCurrent();if(file.size>160000||!file.name.toLowerCase().endsWith('.json'))throw Error('請選擇 160 KB 以內的 JSON 草稿。');const text=await file.text();if(ticket!==revision)return;access.requireCurrent();const p=normalizePolicy(JSON.parse(text));fieldIds.forEach(id=>$(id).value=p[id]);$('sections').replaceChildren();p.sections.forEach(s=>addSection(s.title,s.body));changed();message('草稿已載入。請重新核對內容後預覽；既有核對勾選不會自動沿用。');}
  catch(error){if(ticket===revision)message(error instanceof SyntaxError?'無法讀取 JSON，請選擇本頁產生的編輯草稿。':error.message,true);}
});
clearData();window.lucide?.createIcons();verify().catch(()=>{});
