(function() {
  'use strict';
  // Preview-only diagnostics. No storage, identities, request bodies, tokens,
  // source hashes or business records are retained or displayed.
  const originalFetch=window.fetch.bind(window),entries=[];
  function render(){const node=document.getElementById('acceptance-timing');if(node)node.textContent=JSON.stringify(entries,null,2);}
  function append(entry){entries.push(entry);if(entries.length>60)entries.shift();render();}
  window.fetch=function(resource,options){
    const match=typeof options?.body==='string'?options.body.match(/"action"\s*:\s*"(department_ops_read|department_scores_read)"/):null;
    if(!match)return originalFetch(resource,options);
    const started=performance.now(),entry={action:match[1],knownVersionRequested:/"knownVersion"\s*:/.test(options.body)};
    return originalFetch(resource,options).then(response=>{
      entry.ms=Math.round(performance.now()-started);entry.http=response.status;
      response.clone().json().then(result=>{entry.notModified=result?.notModified===true;entry.versionContract=result?.readContract==='department-version-read/v1';append(entry);},()=>{entry.result='unreadable';append(entry);});
      return response;
    },error=>{entry.ms=Math.round(performance.now()-started);entry.result=error?.name==='AbortError'?'cancelled':'network-error';append(entry);throw error;});
  };
  document.addEventListener('DOMContentLoaded',render);
})();
