import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'readonly-dashboard-core.js'));
fs.writeFileSync(path.join(root,'gas/ReadonlyDashboardCore.gs'),source);
console.log('Updated the GAS asset from the single reviewed conversion core.');
