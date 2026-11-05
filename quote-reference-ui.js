(function(scope){
  'use strict';
  function init(){
    const Core=scope.QuoteReferenceCore,card=document.getElementById('queryCard');if(!Core||!card)return;
    const panel=document.createElement('details');panel.className='quote-reference';panel.id='quoteReference';
    panel.innerHTML='<summary>使用已下載的參考報價 HTML</summary><p>選擇公司報價中心檔，使用其中的手機專案價與回收價查詢。參考檔只在本頁使用；請依顯示的來源日期與有效期核對。</p><label>選擇參考檔<input type="file" accept=".html,.htm,text/html"></label><p role="status">目前使用線上價格。</p><button type="button" hidden>回到線上價格</button>';
    card.before(panel);const input=panel.querySelector('input'),status=panel.querySelector('[role="status"]'),reset=panel.querySelector('button');let epoch=0;
    async function load(file){if(!file)return;const ticket=++epoch;if(file.size>12*1024*1024){status.textContent='檔案超過 12MB，未載入。';return;}status.textContent='正在核對參考檔…';
      try{const content=await file.text();const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content));const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');const converted=Core.convert(Core.extract(content),hash);if(ticket!==epoch)return;
        scope.dispatchEvent(new CustomEvent('quote-reference:load',{detail:converted}));reset.hidden=false;
        const sourceDate=converted.shopping.snapshot.source_version_date;status.textContent='已載入本機參考檔「'+file.name+'」；手機價格日期 '+sourceDate+'，'+converted.shopping.sourceQuoteCount.toLocaleString()+' 筆完整報價條件。SHA-256 '+hash+'。';
      }catch(error){if(ticket!==epoch)return;status.textContent='未載入：'+error.message+'。目前價格來源未更動。';}
    }
    input.addEventListener('change',()=>load(input.files[0]));reset.addEventListener('click',()=>{epoch++;input.value='';reset.hidden=true;status.textContent='正在重新讀取線上價格…';scope.dispatchEvent(new Event('quote-reference:reset'));});
    document.getElementById('refreshBtn').addEventListener('click',()=>{epoch++;input.value='';reset.hidden=true;status.textContent='目前使用線上價格。';});
    scope.addEventListener('pagehide',()=>{epoch++;input.value='';status.textContent='參考資料已清除。';reset.hidden=true;});
    const embedded=document.getElementById('privateQuoteReference');if(embedded){const content=JSON.parse(embedded.textContent);embedded.remove();load(new File([content],'已核對參考報價.html',{type:'text/html'}));}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
