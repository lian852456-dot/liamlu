import {DatabaseSync,backup} from 'node:sqlite';import {createHash} from 'node:crypto';import {existsSync,mkdirSync,chmodSync,copyFileSync,readFileSync,writeFileSync,constants} from 'node:fs';import {dirname,join,resolve} from 'node:path';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function databaseFingerprint(file){
 const db=new DatabaseSync(file,{readOnly:true});try{
  if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('INTEGRITY_CHECK_FAILED');
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('FOREIGN_KEY_CHECK_FAILED');
  const tables={};for(const{name}of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){
   if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name))throw Error('INVALID_TABLE_NAME');if(name==='v42_runtime_lock')continue;
   const rows=db.prepare('SELECT * FROM "'+name+'"').all().map(row=>JSON.stringify(row)).sort();tables[name]={rows:rows.length,sha256:sha(rows.join('\n'))};
  }return{tables,integrity:'ok',foreignKeys:'ok'};
 }finally{db.close();}
}
export async function snapshotDatabase({source,destination,worldKey}){
 if(!['legacy-owners','current-guests'].includes(worldKey)||(existsSync(destination)||existsSync(destination+'.manifest.json'))||!existsSync(source))throw Error('INVALID_SNAPSHOT_REQUEST');
 mkdirSync(dirname(destination),{recursive:true,mode:0o700});chmodSync(dirname(destination),0o700);
 const db=new DatabaseSync(source,{readOnly:true});try{await backup(db,destination);}finally{db.close();}chmodSync(destination,0o600);
 const fingerprint=databaseFingerprint(destination),manifest={schema:'city-preserved-snapshot/v1',worldKey,createdAt:new Date().toISOString(),sha256:sha(readFileSync(destination)),...fingerprint};writeFileSync(destination+'.manifest.json',JSON.stringify(manifest,null,2)+'\n',{mode:0o600});return manifest;
}
export function restoreSnapshot({snapshot,manifest,dataDir}){
 if(sha(readFileSync(snapshot))!==manifest.sha256)throw Error('SNAPSHOT_HASH_MISMATCH');
 if(existsSync(dataDir))throw Error('RESTORE_REQUIRES_NEW_EMPTY_DIRECTORY');mkdirSync(dataDir,{recursive:true,mode:0o700});chmodSync(dataDir,0o700);
 const target=join(dataDir,'city.sqlite');copyFileSync(snapshot,target,constants.COPYFILE_EXCL);chmodSync(target,0o600);
 const db=new DatabaseSync(target);try{if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='v42_runtime_lock'").get())db.exec('DELETE FROM v42_runtime_lock');}finally{db.close();}
 const after=databaseFingerprint(target);if(JSON.stringify(after.tables)!==JSON.stringify(manifest.tables))throw Error('RESTORE_ROW_FINGERPRINT_MISMATCH');
 writeFileSync(join(dataDir,'.release-import.json'),JSON.stringify({worldKey:manifest.worldKey,snapshotSha256:manifest.sha256,restoredAt:new Date().toISOString(),runtimeLockResetOnCopyOnly:true})+'\n',{mode:0o600});return{...after,runtimeLockResetOnCopyOnly:true};
}
