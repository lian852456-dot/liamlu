(function(){'use strict';
  function start(){const prior=window.__cozyEmployeeCity;if(prior&&!prior.state().disposed)return;
    if(window.CozyEmployeeCityBootstrap)window.__cozyEmployeeCity=window.CozyEmployeeCityBootstrap.start();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.addEventListener('pageshow',event=>{if(event.persisted)start();});
})();
