import {existsSync,realpathSync,lstatSync} from 'node:fs';
import {resolve,dirname,basename,join,relative,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const inside=(base,path)=>{const r=relative(base,path);return r===''||(!r.startsWith('..')&&!isAbsolute(r))};
function canonical(path){let p=resolve(path),tail=[];while(!existsSync(p)){tail.unshift(basename(p));const parent=dirname(p);if(parent===p)throw Error('V42_DATA_PATH_INVALID');p=parent}return join(realpathSync(p),...tail)}
export function safeV42DataDir(path){
 const p=canonical(path),base=canonical(root),temp=canonical(tmpdir());
 // A temporary extraction must not turn an older version's private path into
 // an allowed test directory. Check both the supplied path and its real target.
 for(const candidate of [resolve(path),p])if(candidate.split(/[\\/]/).some(n=>n.startsWith('.private')&&!/^\.private-v42(?:-|$)/.test(n)))throw Error('V42_DATA_ISOLATION_REQUIRED: older private namespaces cannot be used by V4.2');
 const local=relative(base,p).split(/[\\/]/)[0];
 if(!(inside(base,p)?/^\.private-v42(?:-|$)/.test(local):inside(temp,p)))throw Error('V42_DATA_ISOLATION_REQUIRED: use this V4.2 folder .private-v42 or a temporary test directory');
 for(const name of ['city.sqlite','city.sqlite-wal','city.sqlite-shm','access-codes.json']){try{if(lstatSync(join(p,name)).isSymbolicLink())throw Error('V42_DATA_FILE_SYMLINK_DENIED')}catch(e){if(e.code!=='ENOENT')throw e}}
 return p;
}
