import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');const assets={html:read('north12-officer.html').replace('assets/brand/twm-logo.png','data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/brand/twm-logo.png')).toString('base64')),css:read('north12-officer.css'),core:read('readonly-dashboard-core.js')+';\n'+read('readonly-renewal-detail.js')+';\n'+read('north12-officer-core.js'),ui:read('north12-officer.js')};fs.writeFileSync(path.join(root,'north12-officer-export-assets.js'),'window.North12OfficerExportAssets='+JSON.stringify(assets)+';\n');

// srcdoc inherits the parent CSP. Permit only the two generated, reviewed
// executable bodies; report JSON remains inert and arbitrary inline code stays blocked.
const {createHash} = await import('node:crypto');
const safeScript = code => code.replace(/<script/gi,'\\x3cscript').replace(/<\/script/gi,'<\\/script').replace(/<\/body/gi,'<\\/body');
const scriptHashes = [assets.core, assets.ui].map(code => "'sha256-" + createHash('sha256').update(safeScript(code)).digest('base64') + "'");
const viewer = path.join(root,'department-conversion.html');
fs.writeFileSync(viewer,fs.readFileSync(viewer,'utf8').replace(/script-src 'self'(?: 'sha256-[^']+')*;/, "script-src 'self' " + scriptHashes.join(' ') + ';'));
