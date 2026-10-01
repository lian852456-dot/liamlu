// Run once on the parent's integrated branch; this does not deploy or initialize data.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const apply=process.argv.includes('--apply'),anchor="    else if (action === 'department_ops_read') result = departmentOpsRead(payload);";
const route="    else if (['department_scores_read','department_scores_history_read','department_scores_publish','department_scores_restore'].indexOf(action) >= 0) result = departmentScoresDispatch_(payload);";
const changes=[];
for(const relative of ['gas/Code.gs','scripts/build-patrol-gas-bundle.mjs']){
 const file=path.join(root,relative),before=fs.readFileSync(file,'utf8');
 if(before.includes(route)){console.log(relative+': scores dispatcher already integrated');continue;}
 if(before.split(anchor).length!==2)throw new Error(relative+': expected exactly one existing department_ops_read anchor; merge manually against current branch');
 changes.push({file,relative,after:before.replace(anchor,anchor+'\n'+route)});
}
const builderPath=path.join(root,'scripts/build-patrol-gas-bundle.mjs');
const copy="\nfor (const file of ['DepartmentScoresCore.gs', 'DepartmentScores.gs']) fs.copyFileSync(path.join(root, 'gas', file), path.join(outputDir, file));\n";
const planned=changes.find(c=>c.file===builderPath),builder=planned?planned.after:fs.readFileSync(builderPath,'utf8');
if(!builder.includes("['DepartmentScoresCore.gs', 'DepartmentScores.gs']")){
 if(planned)planned.after+=copy;else changes.push({file:builderPath,relative:'scripts/build-patrol-gas-bundle.mjs',after:builder+copy});
}
console.log('Code base: 0b862fc7eab15f05049ea53c52ee324a3a1cfcd0; anchors are checked against current integrated files.');
console.log('Minimal shared-file changes: '+changes.map(c=>c.relative).join(', '));
if(!apply){console.log('Read-only check. Use --apply on the integrated branch, then build:patrol-gas and run module tests.');process.exit(0);}
for(const change of changes)fs.writeFileSync(change.file,change.after);
fs.copyFileSync(path.join(root,'department-scores-core.js'),path.join(root,'gas/DepartmentScoresCore.gs'));
console.log('Protected dispatcher integrated; no deployment or private-data writes performed.');
