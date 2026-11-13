'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '../home.html'), 'utf8');

test('query clicks add the accepted UI release without changing other routes or creating a worker',async()=>{
 const handlers={},assigned=[];let updated=0,registrations=0;
 const location={href:'https://example.test/liamlu/home.html',origin:'https://example.test',protocol:'https:',assign:url=>assigned.push(url)};
 const navigator={serviceWorker:{getRegistration:async scope=>{assert.equal(scope,'./');return {update:async()=>updated++};},register:()=>registrations++}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../query-route-update.js'),'utf8'),{URL,location,navigator,document:{addEventListener:(event,fn)=>handlers[event]=fn}});
 await new Promise(r=>setImmediate(r));assert.equal(updated,1);assert.equal(registrations,0);
 function click(href,extra={}){let prevented=false;handlers.click(Object.assign({button:0,target:{closest:()=>({href,target:'',hasAttribute:()=>false})},preventDefault:()=>prevented=true},extra));return prevented;}
 assert.equal(click('https://example.test/liamlu/threec-query.html'),true);assert.equal(click('https://example.test/liamlu/tradein-query.html?view=source'),true);
 assert.match(assigned[0],/ui=integrated-20261105-1/);assert.match(assigned[1],/view=source&ui=integrated-20261105-1/);
 assert.equal(click('https://example.test/liamlu/kpi-battle.html'),false);assert.equal(click('https://other.test/tradein-query.html'),false);assert.equal(click('https://example.test/liamlu/tradein-query.html',{ctrlKey:true}),false);assert.equal(assigned.length,2);
});

// Static navigation contracts also run in environments without a browser.
function navigation(label) {
  const match = html.match(new RegExp(`<nav\\b[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)<\\/nav>`));
  assert.ok(match, `Missing navigation: ${label}`);
  return match[1];
}

function cards(source) {
  return [...source.matchAll(/<a\b(?=[^>]*\bclass="[^"]*\bcard\b)[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
}

function cardFor(source, href) {
  const matches = cards(source).filter(card => card.includes(`href="${href}"`));
  assert.equal(matches.length, 1, `Expected one card linking to ${href}`);
  return matches[0];
}

test('home navigation retains PR179 performance and PR181 lab removal', () => {
  assert.equal(cards(navigation('常用入口')).length, 4);
  const staffHrefs = cards(navigation('同仁大廳')).map(card => card.match(/href="([^"]+)"/)[1]);
  assert.deepEqual(staffHrefs, [
    'kpi.html', 'kpitry.html', 'gold-medal.html', 'audit-report.html',
    'https://twm-store-inspection.liamlu245.chatgpt.site/',
    'tradein-progress.html', 'threec-query.html'
  ]);
  assert.equal(cards(navigation('督導專區')).length, 9);
  assert.equal(cards(html).length, 4 + staffHrefs.length + 9);
});

test('staff gold lookup lives under performance tools and uses the existing viewer', () => {
  const staff = navigation('同仁大廳');
  const performance = [...staff.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)]
    .map(match => match[0]).find(section => /業績與試算<\/h3>/.test(section));
  assert.ok(performance, 'Missing performance tools group');
  const gold = cardFor(performance, 'gold-medal.html');
  assert.match(gold, /<h3>北一二B｜金牌查詢<\/h3>/);
  assert.match(gold, /data-search="[^"]*金牌查詢[^"]*"/);
  assert.doesNotMatch(staff, /href="north12b-gold-ops\.html"/);
});

test('quick gold details retain the existing viewer and label', () => {
  const gold = cardFor(navigation('常用入口'), 'gold-medal.html');
  assert.match(gold, /<h3>北一二B 金牌明細<\/h3>/);
  assert.match(gold, /查看明細/);
});

test('home omits supervisor gold entry and moves the original intelligence station to management', () => {
  const supervisor = navigation('督導專區');
  assert.doesNotMatch(html, /href="north12b-gold-ops\.html"/);
  assert.ok(fs.existsSync(path.resolve(__dirname, '../north12b-gold-ops.html')));
  const management=supervisor.match(/<div class="management-grid"[^>]*>([\s\S]*?)<\/div>\s*<div class="supervisor-grid"/)[1];
  assert.deepEqual(cards(management).map(card=>card.match(/href="([^"]+)"/)[1]),['access-management.html','department-ops.html','patrol.html']);
  const intel=cardFor(supervisor,'patrol.html');
  assert.match(intel, /class="card tool-card management-card"/);
  assert.match(intel, /<h3>Liam 情報站<\/h3>/);
  assert.match(intel, /data-search="Liam 情報站 巡店紀錄、班表、半月檢查、檢核大盤"/);
  assert.doesNotMatch(supervisor, /href="gold-medal\.html"/);
});

test('formal price lookup is a staff tool without publisher privileges', () => {
  const lookup = cardFor(navigation('同仁大廳'), 'threec-query.html');
  assert.match(lookup, /<h3>查價&amp;回收系統<\/h3>/);
  assert.match(lookup, /舊機回收價與唯讀匯出/);
  assert.doesNotMatch(lookup, /發布|上傳/);
});

test('home omits the import lab entry while retaining its maintenance page and formal upload', () => {
  assert.doesNotMatch(html, /href="tradein-import-lab\.html"/);
  assert.ok(fs.existsSync(path.resolve(__dirname, '../tradein-import-lab.html')));
  const upload = cards(navigation('督導專區')).filter(card => /<h3>資料快速上傳<\/h3>/.test(card));
  assert.equal(upload.length, 1);
  assert.match(upload[0], /href="quick-upload\.html"/);
  const quickUpload=fs.readFileSync(path.resolve(__dirname,'../quick-upload.html'),'utf8');
  assert.match(quickUpload, /href="readonly-conversion-upload\.html">\s*<strong>締結率<\/strong>/);
  assert.match(quickUpload, /href="https:\/\/script\.google\.com\/macros\/s\/AKfycbzkvUUKtaFvEi7gaYWp8M98M_5fAmSD8a7g0ds5WarG5ikiOETTwalHattGKDMfqOfq\/exec"/);
});

test('home and APP open the v6 recovery query and retain target progress navigation', () => {
  const area=cardFor(navigation('同仁大廳'),'tradein-progress.html');
  assert.doesNotMatch(navigation('同仁大廳'), /href="tradein-query\.html"/);
  const system=fs.readFileSync(path.resolve(__dirname,'../threec-query.html'),'utf8');
  assert.match(system, /href="tradein-query\.html"/);
  assert.match(system, /id="downloadQueryHtml"/);
  assert.match(area, /<h3>舊換新進度追蹤<\/h3>/);
  assert.match(area, /門市與同仁進度、TOP3 提醒與匯出/);
  const app=fs.readFileSync(path.resolve(__dirname,'../app.html'),'utf8');
  assert.match(app, /href="threec-query\.html">查價&amp;回收系統/);
  assert.match(app, /href="tradein-progress\.html">舊換新進度追蹤/);
  assert.doesNotMatch(app, /href="tradein-query\.html"/);
  const recovery=fs.readFileSync(path.resolve(__dirname,'../tradein-query.html'),'utf8');
  assert.match(recovery, /<h1>舊換新專區<\/h1>/);
  assert.match(recovery, /id="tradeinResults"/);
  assert.match(recovery, /href="tradein-progress\.html">目標進度/);
  const progress=fs.readFileSync(path.resolve(__dirname,'../tradein-progress.html'),'utf8');
  assert.match(progress, /data-performance-release="public"/);
  for(const page of [progress,recovery]){
    const nav=page.match(/<nav class="area-nav"[\s\S]*?<\/nav>/)[0];
    assert.ok(nav.indexOf('目標進度')<nav.indexOf('回收價查詢'));
  }
  assert.doesNotMatch(html+recovery, /整合候選|尚未上線/);
});

test('trade-in presentation is a supervisor tool and explains the verification gate', () => {
  const card = cardFor(navigation('督導專區'), 'tradein-brief.html');
  assert.match(card, /督導驗證/);
  assert.doesNotMatch(navigation('同仁大廳'), /href="tradein-brief\.html"/);
});
