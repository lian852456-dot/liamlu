import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {inspectMarketing, inspectMarketingImage} from '../operations-marketing-core.mjs';
import fixture from './operations-fixtures.cjs';

const JSZip = createRequire(import.meta.url)('../assets/vendor/store-presentation/jszip-3.10.1.min.js');
const fakePng = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const paragraph = text => `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`;
const row = cells => `<a:tr>${cells.map(cell => `<a:tc>${paragraph(cell)}</a:tc>`).join('')}</a:tr>`;

test('follows actual slide order and suppresses text covered by a full-page picture', async () => {
  const result = await inspectMarketing(await fixture.marketingZip(JSZip));
  assert.equal(result.pageCount, 2);
  assert.equal(result.readState, 'partial');
  assert.match(result.pages[0].text, /SYNTHETIC行銷政策 2026年8月 & 測試用/);
  assert.equal(result.pages[1].text, '');
  assert.equal(result.pages[1].covered, true);
  assert.doesNotMatch(JSON.stringify(result), /STALE-HIDDEN/);
  assert.match(result.pages[1].issues.join(), /素材遺失.*尚未 OCR/);
});

test('classifies native table columns and separates suggested actions from policy evidence', async () => {
  const zip = await fixture.marketingZip(JSZip);
  const columns = ['商品名稱', '申辦資格', '活動期間', '優惠價', '限制', '門市作業'];
  const values = ['測試方案 A', '新申辦或攜碼', '2026年11月1日至30日', '新臺幣 999 元', '不可併用', '上架前確認陳列'];
  zip.file('ppt/slides/slide2.xml', `<p:sld><p:cSld><p:spTree><p:sp>${paragraph('本月政策')}</p:sp><p:graphicFrame><a:tbl>${row(columns)}${row(values)}</a:tbl></p:graphicFrame></p:spTree></p:cSld></p:sld>`);
  const result = await inspectMarketing(zip);
  const page = result.pages[0];
  assert.equal(page.readState, 'read');
  assert.equal(page.sourcePage, 1);
  assert.deepEqual(page.methods, ['原生文字', '可編輯表格']);
  assert.deepEqual(Object.fromEntries(page.facts.map(({kind, text}) => [kind, text])), {
    product: values[0], customer: values[1], timing: values[2], pricing: values[3], restriction: values[4], operations: values[5]
  });
  assert.match(page.facts[1].evidence, /申辦資格.+\n.+新申辦或攜碼/);
  assert.ok(page.suggestions.some(item => item.text.includes('建議') && item.evidence));
  assert.ok(!page.facts.some(fact => fact.text.includes('建議')));
});

test('recognizes a full-page local picture using only its internal package bytes', async () => {
  const zip = await fixture.marketingZip(JSZip);
  const slide = await zip.file('ppt/slides/slide1.xml').async('string');
  zip.file('ppt/slides/slide1.xml', slide.replace('<p:pic>', '<p:pic><p:blipFill><a:blip r:embed="photo"/></p:blipFill>'));
  zip.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="photo" Target="../media/page.png"/></Relationships>');
  zip.file('ppt/media/page.png', fakePng);
  const seen = [];
  const result = await inspectMarketing(zip, {ocr: async (bytes, type) => {
    seen.push({bytes, type});
    return {text: '主推方案：測試圖檔促案\n活動價：999 元', confidence: 96};
  }});
  assert.equal(seen.length, 1);
  assert.deepEqual([...seen[0].bytes], [...fakePng]);
  assert.equal(seen[0].type, 'image/png');
  const page = result.pages[1];
  assert.deepEqual(page.methods, ['本機 OCR']);
  assert.equal(page.imageReview, true);
  assert.deepEqual(page.facts.map(fact => fact.text), ['測試圖檔促案', '999 元']);
  assert.doesNotMatch(JSON.stringify(result), /STALE-HIDDEN/);
});

test('low confidence and unknown image page numbers are reported without promoting OCR guesses', async () => {
  const unverified = await inspectMarketingImage(fakePng, '原圖.png', {ocr: async () => ({text: '價格：57 元', confidence: 41})});
  assert.equal(unverified.readState, 'unread');
  assert.equal(unverified.pages[0].sourcePage, null);
  assert.match(unverified.pages[0].issues.join(), /可信度偏低/);
  assert.equal(unverified.pages[0].facts.length, 0);
  assert.doesNotMatch(JSON.stringify(unverified), /57/);
  const valid = await inspectMarketingImage(fakePng, '本月-第16頁.png', {ocr: async () => ({text: '申請資格：新辦', confidence: 96})});
  assert.equal(valid.pages[0].sourcePage, 16);
  assert.match(valid.pages[0].pageLabel, /第 16 頁/);
  assert.equal(valid.pages[0].facts[0].text, '新辦');
});

test('an external image relationship remains a page-specific gap without invoking recognition', async () => {
  const zip = await fixture.marketingZip(JSZip);
  const slide = await zip.file('ppt/slides/slide1.xml').async('string');
  zip.file('ppt/slides/slide1.xml', slide.replace('<p:pic>', '<p:pic><p:blipFill><a:blip r:embed="photo"/></p:blipFill>'));
  zip.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="photo" Target="https://example.invalid/source.png" TargetMode="External"/></Relationships>');
  let recognitionCalls = 0;
  const result = await inspectMarketing(zip, {ocr: async () => { recognitionCalls++; }});
  assert.equal(recognitionCalls, 0);
  assert.equal(result.pages[0].readState, 'read');
  assert.equal(result.pages[1].readState, 'unread');
  assert.match(result.pages[1].issues.join(' '), /外部檔案/);
});
