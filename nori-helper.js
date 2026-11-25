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
  function ask(raw) {
    const q = normalize(raw);
    if (!q) { input.focus(); return; }
    cancelRead();
    const follow = expectTradeinSubject;
    expectTradeinSubject = false;
    byId('nori-asked').textContent = raw.trim();
    input.value = '';
    if (/上傳|匯入/.test(q)) {
      if (/op|動店|重點任務/.test(q)) {
        const op = /op/.test(q);
        destination('開啟專區後，選擇報表並核對預覽，再確認更新。', op ? '開啟 OP 系列' : '開啟動店任務', 'kpi-battle.html#' + (op ? 'op' : 'focus-tasks'));
      } else destination('從快速上傳選擇要更新的報表。', '開啟資料快速上傳', 'quick-upload.html');
    } else if (/\bop\b|op系列|op影音|op玩家|智慧家庭|科技生活|遊戲玩家/.test(q)) {
      const store = ['永吉','復興南','六張犁','酒泉','萬大','大稻埕','三創','杭州南','通化'].find(name => q.includes(name));
      const param = new URLSearchParams({nori: store || 'store'});
      destination(store ? '開啟 OP 明細即可查看' + store + '的月目標、累計件數、差額及截止日。' : '請在 OP 明細選擇你的門市，海苔會按這台裝置已匯入的報表計算還差幾件。', '查看 OP 目標差額', 'kpi-battle.html?' + param + '#op');
    } else if (/動店|重點任務|重點機型/.test(q)) {
      destination('到 KPI 戰情的「重點任務進度」，選擇門市或同仁查看。', '查看動店任務', 'kpi-battle.html#focus-tasks');
    } else if (/查價|報價|回收價|估價|折抵|值多少|專案價|回收.*多少錢/.test(q)) {
      destination('在「查價＆回收系統」選擇機型，可查手機專案價或舊機回收價。', '開啟查價＆回收系統', 'threec-query.html');
    } else if (/舊換新|以舊換新|回收/.test(q)) {
      if (/排名|機型|明細|獎金|金額|機款/.test(q)) destination('進入後可查看機款、明細或排名。','查看舊換新進度','tradein-progress.html');
      else if (!/^(?:舊換新|以舊換新|回收)$/.test(q)) void tradeinAnswer(raw);
      else showChoice('你想查舊機能折多少，還是看本月回收進度？', [['查回收價','舊機回收價'],['查進度','舊換新進度']]);
    } else if (/締結|來客|續約洞察|tier/.test(q)) {
      destination('主管唯讀看板可依授權範圍查看 AQ／RT 締結率。', '查看締結率', 'readonly-dashboard.html');
    } else if (/台獎|臺獎/.test(q)) {
      destination('台獎戰情可查看台獎排名及機型表現。', '開啟台獎戰情', 'kpi-battle.html#awards');
    } else if (/個績|個人排名/.test(q)) {
      destination('從個績排名查看已授權的同仁進度。', '開啟個績排名', 'kpi-battle.html#personal');
    } else if (/kpi|a999|a1399|r999|r1399|好速|aq|rt|業績/.test(q) && !/試算|模擬|回報/.test(q)) {
      destination('KPI 戰情可查看門市業績與目標達成。', '開啟 KPI 戰情', 'kpi-battle.html#kpi');
    } else {
      const names = new Set();
      const matches = cards.filter(card => {
        const title = card.querySelector('h2,h3')?.textContent;
        if (!title || names.has(card.href)) return false;
        const words = [title, ...card.dataset.search.split(/[\s／、｜＆&]+/)].map(normalize);
        if (!words.some(word => word.length >= 2 && (q.includes(word) || (q.length >= 2 && word.includes(q))))) return false;
        names.add(card.href);
        return true;
      });
      if (!matches.length && follow && /^[\p{Script=Han}*]{1,12}$/u.test(q)) {
        void tradeinAnswer(raw + '舊換新筆數');
      } else if (matches.length) {
        respond('可以從這些入口查看。');
        matches.slice(0,4).forEach(card => link(card.querySelector('h2,h3').textContent, card.href));
      } else showChoice(/幾|差|多少|進度|目標/.test(q) ? '你想看哪一項進度？' : '還沒找到對應的入口。可以輸入工具名稱，或選一個常查項目。', [['OP 系列','OP 進度'],['舊換新','舊換新進度'],['A999','A999 進度'],['動店','動店任務']]);
    }
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
    cancelRead();
    expectTradeinSubject = false;
    byId('nori-asked').textContent = '';
    input.value = '';
    respond('');
  }
  window.addEventListener('pagehide', resetQuestion);
  window.addEventListener('portal-before-logout', resetQuestion);
  root.hidden = false;
  function openLinkedQuestion() {
    if (location.hash === '#ask-nori') openPanel(true, headerLink || toggle);
  }
  window.addEventListener('hashchange', openLinkedQuestion);
  openLinkedQuestion();
})();
