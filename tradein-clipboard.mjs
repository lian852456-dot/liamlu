// Copy synchronously during the click before trying the permission-based API.
// Some desktop browsers leave writeText pending instead of rejecting it.
export async function copyReminderText(text,{document:doc=globalThis.document,navigator:nav=globalThis.navigator,timeoutMs=2000}={}){
  const previous=doc.activeElement;
  let field;
  try{
    if(typeof doc.execCommand==='function'){
      field=doc.createElement('textarea');
      field.value=text;field.readOnly=true;
      field.setAttribute('aria-hidden','true');
      field.style.cssText='position:fixed;left:-9999px;top:0;font-size:16px;';
      doc.body.appendChild(field);field.focus({preventScroll:true});
      field.select();field.setSelectionRange(0,text.length);
      if(doc.execCommand('copy'))return;
    }
  }catch(_){
    // Continue to the standard API when synchronous copying is unavailable.
  }finally{
    field?.remove();
    if(previous?.isConnected&&typeof previous.focus==='function')previous.focus({preventScroll:true});
  }
  if(typeof nav.clipboard?.writeText!=='function')throw new Error('瀏覽器未提供一鍵複製。');
  let timer;
  try{
    await Promise.race([
      nav.clipboard.writeText(text),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('瀏覽器複製逾時，請使用下方手動複製。')),timeoutMs);})
    ]);
  }finally{clearTimeout(timer);}
}
