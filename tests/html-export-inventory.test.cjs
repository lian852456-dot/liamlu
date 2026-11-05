const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('every active HTML download producer is represented in the eleven-entry inventory',()=>{
 const root=path.resolve(__dirname,'..'),inventory=require('../html-export-inventory.json');
 const producers=fs.readdirSync(root).filter(f=>/\.(?:html|js|mjs)$/.test(f)&&f!=='offline-html.js'&&!f.endsWith('-assets.js')).filter(f=>{const s=fs.readFileSync(path.join(root,f),'utf8');return /new Blob\([\s\S]{0,250}?type\s*:\s*['"]text\/html/i.test(s)||/\.OfflineHtml\.download\(/.test(s);});
 assert.deepEqual(producers.sort(),inventory.producers.slice().sort());assert.equal(inventory.entries.length,11);assert.equal(new Set(inventory.entries.map(r=>r.id)).size,11);
 assert.deepEqual([...new Set(inventory.entries.map(r=>r.kind))].sort(),['awards','department','kpi','officer','patrol','store','tradein']);
 for(const entry of inventory.entries)assert.ok(fs.existsSync(path.join(root,entry.page.split('#')[0])));
});
