import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {inspectLocalDeck} from '../operations-large-deck.mjs';
import fixture from './operations-fixtures.cjs';

const JSZip = createRequire(import.meta.url)('../assets/vendor/store-presentation/jszip-3.10.1.min.js');
const mib = 1024 * 1024;

test('reads compressed slide parts in source order and hashes the entire original using bounded file slices', async () => {
  const zip = await fixture.marketingZip(JSZip);
  zip.file('ppt/media/unused.bin', Buffer.alloc(52 * mib, 51), {compression: 'STORE'});
  const bytes = await zip.generateAsync({type: 'nodebuffer', compression: 'DEFLATE'});
  class SelectedFile extends Blob {
    arrayBuffer() { throw Error('Unexpected whole-file read'); }
    slice(start, end) {
      const part = super.slice(start, end);
      assert.ok(part.size < 8 * mib, 'unexpected large file read');
      return part;
    }
  }
  const progress = [];
  const {document, sha256} = await inspectLocalDeck(new SelectedFile([bytes]), {onProgress: m => progress.push(m)});
  assert.equal(sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(document.pages.map(p => p.sourcePage), [1, 2]);
  assert.match(document.pages[0].text, /SYNTHETIC行銷政策/);
  assert.equal(document.pages[1].text, '');
  assert.equal(document.readState, 'partial');
  assert.ok(progress.some(item => item.includes('2／2')));
  assert.ok(progress.at(-1).includes('100%'));
});

test('malformed or unsupported archive explains recovery without accepting a source', async () => {
  await assert.rejects(inspectLocalDeck(new Blob(['bad'])), /PowerPoint.*另存/);
  const zip = await fixture.marketingZip(JSZip);
  zip.file('ppt/vbaProject.bin', 'SYNTHETIC');
  await assert.rejects(inspectLocalDeck(new Blob([await zip.generateAsync({type: 'nodebuffer'})])), /巨集/);
});

test('a damaged slide is reported by page while the other slide remains reviewable', async () => {
  const zip = await fixture.marketingZip(JSZip);
  const bytes = await zip.generateAsync({type: 'nodebuffer', compression: 'STORE'});
  const damaged = bytes.indexOf('STALE-HIDDEN-TEXT');
  assert.ok(damaged > 0);
  bytes[damaged] ^= 1;
  const {document} = await inspectLocalDeck(new Blob([bytes]));
  assert.equal(document.readState, 'partial');
  assert.match(document.pages[0].text, /SYNTHETIC行銷政策/);
  assert.equal(document.pages[1].sourcePage, 2);
  assert.match(document.pages[1].issues.join(' '), /校驗失敗/);
});
