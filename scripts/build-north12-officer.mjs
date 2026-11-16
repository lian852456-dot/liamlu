import {createHash} from 'node:crypto';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');const assets={html:read('north12-officer.html').replace('assets/brand/twm-logo.png','data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/brand/twm-logo.png')).toString('base64')),css:read('north12-officer.css'),core:read('readonly-dashboard-core.js')+';\n'+read('readonly-renewal-detail.js')+';\n'+read('north12-officer-core.js'),ui:read('north12-officer.js')};fs.writeFileSync(path.join(root,'north12-officer-export-assets.js'),'window.North12OfficerExportAssets='+JSON.stringify(assets)+';\n');

// srcdoc inherits the reader CSP. Permit only these two generated scripts.
const inline = text => text.replace(/<script/gi,'\\x3cscript').replace(/<\/script/gi,'<\\/script').replace(/<\/body/gi,'<\\/body');
const hashes = [assets.core, assets.ui].map(text => "'sha256-" + createHash('sha256').update(inline(text)).digest('base64') + "'");
const reader = path.join(root, 'department-conversion.html');
if (fs.existsSync(reader)) fs.writeFileSync(reader, fs.readFileSync(reader,'utf8').replace(/script-src [^;]+;/, "script-src 'self' " + hashes.join(' ') + ';'));
