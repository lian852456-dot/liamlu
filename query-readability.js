(function(scope){
  'use strict';
  function init(){
    const card=document.getElementById('queryCard');if(!card)return;
    function disclosure(node,label){
      if(!node||node.closest('.query-secondary-notes'))return;
      const details=document.createElement('details'),summary=document.createElement('summary');
      details.className='query-secondary-notes';summary.textContent=label;details.append(summary);node.before(details);details.append(node);return details;
    }
    function pageNotes(){
      let help=document.getElementById('queryHelp');
      if(!help){help=document.createElement('details');help.id='queryHelp';help.className='query-secondary-notes';const summary=document.createElement('summary');summary.textContent='查詢使用說明';help.append(summary);card.after(help);}
      for(const node of [document.querySelector('.hero p'),document.getElementById('shoppingSectionDescription'),document.querySelector('.privacy')])if(node&&!help.contains(node))help.append(node);
      const resources=document.getElementById('queryResources');if(resources&&help.parentNode!==resources)resources.append(help);
      const status=document.querySelector('#queryStatus.query-status-ready');if(status){let source=help.querySelector('[data-reference-note]');if(!source){source=document.createElement('p');source.dataset.referenceNote='';help.append(source);}source.textContent=status.textContent;}
    }
    function recycleNotes(){
      const host=document.getElementById('tradeinReferencePanel');if(!host||host.hidden)return;
      if(host.querySelector('.tref-notes'))return;
      const notes=disclosure(host.querySelector('.tref-grade-note'),'分級比較說明');
      const intro=host.querySelector('.tref-top p');if(notes&&intro)notes.append(intro);
      disclosure(host.querySelector('.tref-detection>small'),'檢測使用說明');
    }
    function readingNotes(){document.querySelectorAll('#shoppingResults .scroll-hint').forEach(node=>disclosure(node,'操作提示'));}
    pageNotes();recycleNotes();readingNotes();
    const result=document.getElementById('shoppingResults');if(result)new MutationObserver(readingNotes).observe(result,{childList:true,subtree:true});
    const host=document.getElementById('tradeinReferencePanel');if(host)new MutationObserver(recycleNotes).observe(host,{childList:true});
    scope.addEventListener('quote-reference:load',()=>queueMicrotask(()=>{pageNotes();recycleNotes();readingNotes();}));
    scope.addEventListener('query-workspace:ready',pageNotes);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
