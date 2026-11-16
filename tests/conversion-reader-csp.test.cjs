'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const O=require('../north12-officer-core.js'),{fixture}=require('./helpers/readonly-conversion-runtime.cjs');
test('embedded formal report scripts are explicitly permitted by reader CSP',()=>{
 const context={window:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../north12-officer-export-assets.js'),'utf8'),context);
 const html=O.buildHtml({...require('../readonly-dashboard-core.js').validateConversion(fixture()),schema:O.SCHEMA},context.window.North12OfficerExportAssets);
 const parent=fs.readFileSync(require.resolve('../department-conversion.html'),'utf8');
 const directive=parent.match(/script-src ([^;]+);/)[1];
 assert.ok(!directive.includes('unsafe-inline'));
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,2);
 for(const [,body] of scripts) assert.ok(directive.includes("'sha256-"+crypto.createHash('sha256').update(body).digest('base64')+"'"));
 assert.match(parent,/sandbox="allow-scripts"/);
});
