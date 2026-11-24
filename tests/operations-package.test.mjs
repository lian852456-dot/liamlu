import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import JSZip from '../assets/vendor/store-presentation/jszip-3.10.1.min.js';
import {TEMPLATE_HASH,draftMetadata} from '../operations-brief-core.mjs';
import {inspectTemplate,buildDraft} from '../operations-brief-package.mjs';
import {regionRatioChart} from '../operations-brief-chart.mjs';

const sourceSha256 = 'a'.repeat(64);
const locator = 'SYNTHETIC來源表!A1:D4';
const section = '舊換新';
const source = {
  name:'SYNTHETIC.xlsx', sha256:sourceSha256, category:section,
  sourcePeriod:'2026-11-01 至 2026-11-24', coverage:'北一二全四區', reviewableLocators:[locator],
  report:{sections:[{key:section,cutoff:'2026-11-24'}]}
};
const facts = [{text:'SYNTHETIC 本期分區數字',sourceSha256,locator}];
const tables = [{sourceSha256,locator,headers:['督導區','比率','缺值','實際零件'],
  rows:[['北一二A','16.00%',null,0],['北一二B','19.50%',null,0]]}];
const sections = {[section]:{status:'verified',period:source.sourcePeriod,coverage:source.coverage,facts,tables}};
const template = {sha256:TEMPLATE_HASH,slides:15};
const form = {meeting:'2026-11',highlights:'SYNTHETIC 會議重點',sections};

test('chapter completeness has independent topic requirements; blank cells stay null and read zero survives',()=>{
  const meta = draftMetadata(form,[source],template);
  assert.equal(meta.status,'DRAFT_UNMAPPED');
  assert.equal(meta.sections[section].status,'partial');
  assert.equal(meta.sections[section].facts[0].sourceName,'SYNTHETIC.xlsx');
  assert.deepEqual(meta.sections[section].tables[0].rows[0],['北一二A','16.00%',null,'0']);
  assert.ok(meta.unresolved.some(message=>message.includes('當期舊換新政策')));
  assert.ok(!Object.hasOwn(meta.periods,'sections'));
});
test('wrong-month, replaced-file or wrong locator results do not enter a report',()=>{
  for (const invalid of [
    [{...source,report:{sections:[{key:section,cutoff:'2026-10-24'}]}}],
    [{...source,sha256:'b'.repeat(64)}],
    [{...source,reviewableLocators:['SYNTHETIC另表']}],
    [{...source,category:'好速'}]
  ]) {
    const meta = draftMetadata(form,invalid,null);
    assert.equal(meta.status,'DRAFT_UNMAPPED');
    assert.deepEqual(meta.sections[section].facts,[]);
    assert.deepEqual(meta.sections[section].tables,[]);
    assert.ok(meta.unresolved.some(message=>message.includes('原始15頁')));
  }
});
test('ratios only chart the reviewed four-region-compatible schema and do not turn missing into zero',()=>{
  assert.deepEqual(regionRatioChart(section,tables[0]).rows,[{label:'北一二A',value:0.16},{label:'北一二B',value:0.195}]);
  for (const rows of [
    [['北一二A','待補'],['北一二B','0%']],
    [['北一二A','5%'],['北一二A','0%']],
    [['區域','5%'],['北一二B','0%']]
  ]) assert.equal(regionRatioChart(section,{...tables[0],rows}),null);
});

test('template output keeps brand and 16:9, drops October content and embeds only reviewed editable values', {skip:!process.env.OP_TEMPLATE},async()=>{
  const bytes = await readFile(process.env.OP_TEMPLATE);
  const known = await inspectTemplate(bytes,JSZip);
  const meta = draftMetadata(form,[source],known);
  const out = await JSZip.loadAsync(await buildDraft(bytes,meta,JSZip));
  const files = Object.keys(out.files).filter(name=>!out.files[name].dir);
  assert.deepEqual(files.filter(name=>name.startsWith('ppt/media/')).sort(),['ppt/media/image1.png','ppt/media/image2.jpeg']);
  assert.ok(!files.some(name=>/notesSlides|comment|handout|EncryptionInfo/.test(name)));
  const read = name => out.file(name).async('string');
  const cover = await read('ppt/slides/slide1.xml');
  assert.match(cover,/2026\.11/);
  assert.doesNotMatch(cover,/2026\.10/);
  const trade = await read('ppt/slides/slide6.xml');
  assert.match(trade,/<a:tbl>/);
  assert.match(trade,/16\.00%/);
  assert.match(trade,/待補/);
  assert.match(trade,/SYNTHETIC\.xlsx.*SYNTHETIC來源表!A1:D4/);
  assert.doesNotMatch(await read('ppt/slides/slide7.xml'),/<p:pic>/);
  assert.match(await read('ppt/slides/slide7.xml'),/本頁尚缺已核對的當期來源/);
  const chartFile = files.find(name=>/^ppt\/charts\/region-ratio-\d+\.xml$/.test(name));
  assert.ok(chartFile);
  assert.match(await read(chartFile),/<c:v>0\.195<\/c:v>/);
  const book = await JSZip.loadAsync(await out.file(files.find(name=>name.startsWith('ppt/embeddings/'))).async('uint8array'));
  assert.match(await book.file('xl/worksheets/sheet1.xml').async('string'),/<v>0\.195<\/v>/);
});

test('whole report passes only with every chapter and separate policy references in a current period',()=>{
  const topics = {
    '店務':['','storeDeficiencies'],
    '舊換新':['','tradeinPolicy'],
    '新復原者／保險':['insurancePolicy','insurancePerformance','insuranceComparison'],
    '金牌':[''],
    '好速':[''],
    '好速長約':[''],
    '好速失敗原因':[''],
    '行銷簡報':['']
  };
  const all = Object.keys(topics).map((key,index)=>({
    ...source, name:`SYNTHETIC-${index}.xlsx`, sha256:index.toString(16).repeat(64), category:key, report:undefined
  }));
  const adopted = Object.fromEntries(all.map(file=>[file.category,{
    status:'verified',period:file.sourcePeriod,coverage:file.coverage,
    facts:topics[file.category].map(topic=>({text:'SYNTHETIC 本期已確認',sourceSha256:file.sha256,locator,topic}))
  }]));
  assert.equal(draftMetadata({...form,sections:adopted},all,template).status,'READY_VERIFIED');
  const previousOnly = all.map(file=>file.category === '行銷簡報' ? {...file,sourcePeriod:'2026-10'} : file);
  const rejected = draftMetadata({...form,sections:adopted},previousOnly,template);
  assert.equal(rejected.status,'DRAFT_UNMAPPED');
  assert.deepEqual(rejected.sections['行銷簡報'].facts,[]);
});
