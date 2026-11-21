import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const assets=['readonly-dashboard-core.js','readonly-renewal-detail.js','store-renewal-evidence.js'];
const source=assets.map(name=>fs.readFileSync(path.join(root,name),'utf8')).join('\n');
fs.writeFileSync(path.join(root,'gas/ReadonlyDashboardCore.gs'),source);
console.log('Updated the GAS asset from the conversion and renewal evidence modules.');
