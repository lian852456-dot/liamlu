(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.OfflineHtml=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const PROFILE='north12-single-html/v1';
  const MIME='text/html;charset=utf-8';
  const CSP="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Normalize only the document envelope; never rewrite report data or scripts.
  // Files remain plain UTF-8 HTML (no BOM, ZIP, module loader or remote assets).
  function finalize(html){
    if(typeof html!=='string')throw Error('HTML 內容不完整');
    html=html.replace(/^\uFEFF/,'').replace(/^\s*<!doctype html>\s*/i,'<!doctype html>\n');
    const match=html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
    if(!/^<!doctype html>/i.test(html)||!match)throw Error('HTML 文件結構不完整');
    let head=match[1].replace(/<meta\b[^>]*\bcharset\s*=[^>]*>/gi,'')
      .replace(/<meta\b[^>]*(?:http-equiv\s*=\s*["']Content-Security-Policy["']|name\s*=\s*["']north12-html-profile["'])[^>]*>/gi,'');
    head='<meta charset="utf-8"><meta name="north12-html-profile" content="'+PROFILE+'"><meta http-equiv="Content-Security-Policy" content="'+CSP+'">'+head;
    return html.replace(match[0],'<head>'+head+'</head>');
  }
  function create({title,body,css='',script=''}){
    return finalize('<!doctype html>\n<html lang="zh-Hant"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+'</title><style>'+css.replace(/<\/style/gi,'<\\/style')+'</style></head><body>'+body+(script?'<script>'+script.replace(/<\/script/gi,'<\\/script')+'</script>':'')+'</body></html>');
  }
  function download(html,filename,doc=globalThis.document){
    if(!/\.html$/i.test(filename))throw Error('匯出檔須為 HTML');
    const url=URL.createObjectURL(new Blob([finalize(html)],{type:MIME})),link=doc.createElement('a');
    try{link.href=url;link.download=filename;doc.body.append(link);link.click();}catch(error){URL.revokeObjectURL(url);throw error;}finally{link.remove();}
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  return Object.freeze({PROFILE,MIME,CSP,escape,finalize,create,download});
});
