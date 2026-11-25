(() => {
  'use strict';
  const root = document.getElementById('nori-helper');
  if (!root) return;
  const byId = id => document.getElementById(id);
  const toggle = byId('nori-toggle');
  const headerLink = byId('ask-nori');
  let opener = toggle;
  const panel = byId('nori-panel');
  const input = byId('nori-question');
  const answer = byId('nori-answer');
  const actions = byId('nori-actions');
  const normalize = value => value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const shortcuts = [
    ['所有項目', '所有項目'],
    ['個人 KPI', '個人 KPI 達成率'],
    ['回收查價', '手機舊換新去哪裡查價？'],
    ['OP 進度', '我們店 OP 還差幾件？'],
    ['動店任務', '動店任務進度在哪裡？'],
    ['締結率', 'AQ／RT 締結率去哪裡看？']
  ];
  function button(label, question) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.addEventListener('click', () => ask(question));
    return el;
  }
  function link(label, href) {
    const el = document.createElement('a');
    el.textContent = label;
    el.href = href;
    actions.append(el);
  }
  function respond(message) {
    answer.textContent = message;
    actions.replaceChildren();
  }
  function showChoice(message, choices) {
    respond(message);
    for (const [label, question] of choices) actions.append(button(label, question));
  }
  function destination(message, label, url) {
    respond(message);
    link(label, url);
  }
  let activeRead;
  let expectTradeinSubject = false;
  function cancelRead() {
    activeRead?.abort();
    activeRead = null;
  }
  async function tradeinAnswer(question) {
    const controller = new AbortController();
    activeRead = controller;
    respond('正在查詢舊換新進度…');
    try {
      const {answerTradein} = await import('./nori-tradein.mjs');
      if (controller.signal.aborted) return;
      const result = await answerTradein(question, controller.signal);
      if (controller.signal.aborted) return;
      expectTradeinSubject = Boolean(result.follow);
      respond(result.message);
      for (const person of result.choices || []) {
        actions.append(button(person.store, person.store + person.masked + '舊換新筆數'));
      }
      link('查看舊換新進度', 'tradein-progress.html');
    } catch {
      if (controller.signal.aborted) return;
      respond('這次未能讀回已核對的舊換新報表，目前無法確認筆數。');
      actions.append(button('重新查詢',question));
      link('查看舊換新進度','tradein-progress.html');
    } finally {
      if (activeRead === controller) activeRead = null;
    }
  }
  const cards = [...document.querySelectorAll('a.card[data-search]')];
  const topicLinks={
    kpi:['KPI 戰情','kpi-battle.html#kpi'],awards:['台獎戰情','kpi-battle.html#awards'],
    insurance:['個績與保險搭售率','kpi-battle.html#personal'],conversion:['AQ／RT 締結率','kpi-battle.html#conversion'],
    op:['OP 系列','kpi-battle.html#op'],focus:['重點任務進度','kpi-battle.html#focus-tasks'],
    price:['查價＆回收系統','threec-query.html'],gold:['金牌查詢','gold-medal.html'],log:['每日日誌檢查','daily-log-dashboard.html']
  };
  const topicHints={
    kpi:'輸入門市或同仁姓名，可查 KPI 達成率、排名與分項實績。',
    awards:'輸入同仁姓名，可查報表所列的個人台獎實際金額與推估金額。',
    insurance:'輸入同仁或門市，可查最新報表的保險搭售率。',
    conversion:'輸入門市或全區，可查 AQ、RT 締結率與分母。',
    op:'在 KPI 戰情的「OP 系列」匯入報表。輸入門市可查累計、目標和差額。',
    focus:'在 KPI 戰情的「重點任務進度」匯入報表，可依門市或同仁查五項動店進度。'
  };
  let followReport=null, protectedAnswer=false;
  function identify(q){
    if(/締結|來客/.test(q))return 'conversion';
    if(/(?:^|[^a-z])op(?![a-z])|智慧家庭|科技生活|遊戲玩家/.test(q))return 'op';
    if(/動店|重點任務|重點機型|充電多/.test(q))return 'focus';
    if(/台獎|臺獎|獎金/.test(q))return 'awards';
    if(/保險搭售|個保|搭售率/.test(q))return 'insurance';
    if(/日誌|漏填表/.test(q))return 'log';
    if(/金牌|加牌|扣牌/.test(q))return 'gold';
    if(/kpi|個績|個人排名|a999|a1399|r999|r1399|好速|aq|rt|特維|配件|包膜|業績|netflix|hbo|disney|primevideo|kkbox|myvideo|預付卡|好速|換約淨新增|自退|device|5g|保險點數/.test(q))return 'kpi';
    return '';
  }
  async function readReport(topic,question){
    const controller=new AbortController();
    activeRead=controller;
    protectedAnswer=!['gold','log','price'].includes(topic);
    const [title,url]=topicLinks[topic];
    respond('正在查詢'+title+'…');
    const timeout=setTimeout(()=>{
      if(activeRead!==controller)return;
      controller.abort();activeRead=null;
      respond('讀取'+title+'逾時，請稍後重新查詢。');
      actions.append(button('重新查詢',question));link('查看'+title,url);
    },75000);
    try {
      let result;
      if(protectedAnswer){
        result=await window.DashboardB?.answerHomeQuestion?.(topic,question,controller.signal) || {login:true};
      }else if(topic==='price'){
        const {readPrice}=await import('./nori-price.mjs');
        if(controller.signal.aborted)return;
        result={message:await readPrice(question,controller.signal)};
      }else{
        const mod=await import('./nori-site-reports.mjs');
        if(controller.signal.aborted)return;
        result={message:topic==='gold'?await mod.readGold(question,controller.signal):mod.logAnswer(question,JSON.parse(localStorage.getItem('bei12b_daily_log_snapshot_v1') || 'null'))};
      }
      if(controller.signal.aborted)return;
      if(result.login){
        respond('請先在首頁用員編與密碼登入，再問一次，海苔就能查你有權查看的'+title+'資料。');
        link('前往首頁登入','#home-login');
        actions.lastElementChild.addEventListener('click',()=>{openPanel(false);document.querySelector('[data-b-employee]')?.focus();});
        actions.append(button('重新查詢',question));
        return;
      }
      respond(result.message);
      if(result.follow)followReport={topic,question};
      link('查看'+title,url);
    }catch{
      if(controller.signal.aborted)return;
      respond(title+'這次沒有讀回可核對的資料，目前無法確認。');
      actions.append(button('重新查詢',question));
      link('查看'+title,url);
    }finally{clearTimeout(timeout);if(activeRead===controller)activeRead=null;}
  }
  function listTopics(){
    respond('點選項目可看使用方式，也可以直接輸入「門市或姓名＋想查的數字」。');
    const seen=new Set();
    for(const card of cards){
      if(seen.has(card.href))continue;
      seen.add(card.href);
      const title=card.querySelector('h2,h3')?.textContent.trim();
      if(title)actions.append(button(title,title+'怎麼使用？'));
    }
    for(const key of ['op','focus','insurance','conversion'])actions.append(button(topicLinks[key][0],topicLinks[key][0]+'怎麼使用？'));
  }
  function ask(raw) {
    const q=normalize(raw);
    if(!q){input.focus();return;}
    cancelRead();
    const follow=expectTradeinSubject,previous=followReport;
    expectTradeinSubject=false;followReport=null;protectedAnswer=false;
    byId('nori-asked').textContent=raw.trim();
    input.value='';
    if(/所有項目|全部項目|可以問什麼|能問什麼|工具清單/.test(q)){listTopics();return;}
    const hits=window.NoriCatalog.find(raw,cards),best=hits[0];
    const how=/怎麼用|怎麼使用|如何使用|怎麼查|哪裡|哪邊|去哪|如何|如何操作|怎麼匯|上傳|匯入|匯出|哪個入口|功能|怎麼填|怎麼補/.test(q);
    const topic=identify(q);
    if(/續約洞察|tier/.test(q)){destination('在部區管理選「部區締結率」，再切到續約洞察，可依 Tier 與原方案查看來源期間及件數。','查看續約洞察','department-ops.html');return;}
    const lookup=/多少|幾|達成|排名|進度|誰|哪些|還有|剩|不足|未完成|未填|缺|怎麼扣|為什麼|原因|庫存|筆數|業績|獎金|搭售率|來客數|締結率|累計/.test(q);
    const special=/續約洞察|tier|部區|北一二部|四區|稽核|作戰|行進間|試算|模擬|簡報|庫存|回報|請益|巡店|面談|日誌檢查|近三日|主管唯讀|情報站|台北小城|保險請益/.test(q);
    if((/上傳|匯入/.test(q) && (topic==='op' || topic==='focus')) || (how && topicHints[topic] && !special && !/上傳|匯入/.test(q))){
      destination(topicHints[topic],'開啟'+topicLinks[topic][0],topicLinks[topic][1]);return;
    }
    if(/查價|報價|回收價|折抵|估價|專案價|值多少/.test(q) && !/簡報/.test(q)){
      if(!how){void readReport('price',raw);return;}
      destination('查新機請選「手機專案／3C」並指定資費與期數；查舊機請選「舊換新」並指定機型。','開啟查價＆回收系統','threec-query.html');return;
    }
    if(/舊換新|以舊換新|回收/.test(q) && !/簡報|上傳|匯入/.test(q)){
      if(how || /排名|機型|明細|獎金|金額|機款/.test(q))destination('在舊換新進度可切換區、門市或個人。輸入「門市或姓名＋舊換新幾台」可在這裡直接查。','查看舊換新進度','tradein-progress.html');
      else if(/^(?:舊換新|以舊換新|回收)$/.test(q))showChoice('想查回收價格，還是查累計筆數？',[['查回收價','舊機回收價'],['查筆數','舊換新進度']]);
      else void tradeinAnswer(raw);return;
    }
    if(/上傳|匯入/.test(q) && !special){destination('在快速上傳選擇對應報表類型，核對來源與日期後更新。','開啟資料快速上傳','quick-upload.html');return;}
    if(topic && (!special || topic==='log') && !how){void readReport(topic,raw);return;}
    if(best){
      const specific=lookup && !how;
      const message=specific?'海苔目前沒有連到「'+best.title+'」的這筆明細。'+best.help:best.help;
      destination(message,'開啟'+best.title,best.href);
      hits.filter(hit=>hit!==best && hit.score===best.score).slice(0,2).forEach(hit=>link(hit.title,hit.href));return;
    }
    if(previous){void readReport(previous.topic,(raw+' '+previous.question).replace(/我們店|本店|我的|我們的/g,''));return;}
    if(follow){void tradeinAnswer(raw+'舊換新筆數');return;}
    showChoice('請加上工具或指標名稱，例如「通化 KPI 達成率」或「面談紀錄在哪裡」。',[['瀏覽所有項目','所有項目']]);
  }
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const feedback = byId('nori-feedback');
  let poseTimer;
  let nextRest = 'sit';

  function setPose(pose, message = '') {
    clearTimeout(poseTimer);
    toggle.dataset.pose = pose;
    if (feedback) feedback.textContent = message;
  }
  function resumeCat() {
    if (!panel.hidden) {
      setPose('sit');
      return;
    }
    setPose('walk');
    if (!feedback || document.hidden || motion.matches) return;
    poseTimer = setTimeout(() => {
      setPose(nextRest);
      nextRest = nextRest === 'sit' ? 'stretch' : 'sit';
      poseTimer = setTimeout(resumeCat, 2600);
    }, 7500);
  }
  function playWithCat(pose, message) {
    setPose(pose, message);
    poseTimer = setTimeout(resumeCat, 3200);
  }
  byId('nori-pet')?.addEventListener('click', () => playWithCat('purr', '海苔瞇起眼睛，呼嚕呼嚕。'));
  byId('nori-toy')?.addEventListener('click', () => playWithCat('pounce', '海苔伸出爪子撲羽毛！'));
  document.addEventListener('visibilitychange', resumeCat);
  motion.addEventListener('change', resumeCat);
  resumeCat();

  function openPanel(open, trigger) {
    if (open && trigger) opener = trigger;
    if (!open) {
      if(protectedAnswer)resetQuestion();
      if (activeRead) respond('查詢已收合，可重新輸入問題。');
      cancelRead();
      expectTradeinSubject = false;
    }
    panel.hidden = !open;
    resumeCat();
    toggle.setAttribute('aria-expanded', String(open));
    headerLink?.setAttribute('aria-expanded', String(open));
    if (open) input.focus({preventScroll:true});
    else opener.focus({preventScroll:true});
  }
  for (const [label, question] of shortcuts) byId('nori-shortcuts').append(button(label, question));
  toggle.addEventListener('click', () => openPanel(panel.hidden, toggle));
  if (headerLink) {
    headerLink.href = '#ask-nori';
    headerLink.setAttribute('aria-controls', panel.id);
    headerLink.setAttribute('aria-expanded', 'false');
    headerLink.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openPanel(true, headerLink);
    });
  }
  byId('nori-close').addEventListener('click', () => openPanel(false));
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) openPanel(false);
  });
  byId('nori-form').addEventListener('submit', event => { event.preventDefault(); ask(input.value); });
  function resetQuestion() {
    followReport=null;protectedAnswer=false;
    cancelRead();
    expectTradeinSubject = false;
    byId('nori-asked').textContent = '';
    input.value = '';
    respond('');
  }
  window.addEventListener('pagehide', resetQuestion);
  window.addEventListener('home-nori-access-cleared',()=>{if(protectedAnswer){resetQuestion();respond('登入狀態已變更，請確認首頁登入後再查。');}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden && protectedAnswer)resetQuestion();});
  window.addEventListener('portal-before-logout', resetQuestion);
  root.hidden = false;
  function openLinkedQuestion() {
    if (location.hash === '#ask-nori') openPanel(true, headerLink || toggle);
  }
  window.addEventListener('hashchange', openLinkedQuestion);
  openLinkedQuestion();
})();
