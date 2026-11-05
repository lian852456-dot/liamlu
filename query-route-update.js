(function(){
  'use strict';
  const release='integrated-20261105-1';
  document.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=event.target.closest('a[href]');if(!link||link.target==='_blank'||link.hasAttribute('download'))return;
    const url=new URL(link.href,location.href);
    if(url.origin!==location.origin||!/(?:^|\/)(?:threec-query|tradein-query)\.html$/.test(url.pathname))return;
    url.searchParams.set('ui',release);event.preventDefault();location.assign(url.href);
  });
  // Refresh only an existing app worker. Do not install a new worker on devices
  // that have never used the app or clear unrelated caches / private data.
  if(location.protocol==='https:'&&'serviceWorker'in navigator)navigator.serviceWorker.getRegistration('./').then(registration=>registration?.update()).catch(()=>{});
})();
