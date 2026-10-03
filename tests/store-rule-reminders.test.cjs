'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(root,'patrol-gas/PatrolCode.gs'),'utf8');
const rulesSource = fs.readFileSync(path.join(root,'gas/StoreRules.gs'),'utf8');
const fixture = () => ({contract:'store-rule-reminders-v1',scope:'store-daily-reminders',revision:'synthetic-v1',context:'SYNTHETIC_CONTEXT',rules:[{id:'synthetic-a',category:'合成分類',title:'合成提醒 A',instruction:'SYNTHETIC_PRIVATE_RULE_ALPHA',frequency:'合成頻率',audience:'合成對象',exceptions:['合成例外'],sources:[{shortName:'合成來源',pages:[1,2]}]}]});

function runtime() {
  const properties = new Map([['PT_KEY','synthetic-passcode']]);
  const cache = new Map();
  let now = Math.floor(Date.now()/1000), reads = 0;
  let access = 'PRIVATE', fileAccess = 'PRIVATE', count = 1;
  let document = fixture();
  const context = vm.createContext({console,Date,
    PropertiesService:{getScriptProperties:() => ({getProperty:key => properties.get(key) || null,setProperty:(key,value) => properties.set(key,String(value))})},
    CacheService:{getScriptCache:() => ({get:key => cache.get(key) || null,put:(key,value) => cache.set(key,String(value)),remove:key => cache.delete(key)})},
    LockService:{getScriptLock:() => ({waitLock(){},releaseLock(){}})},Logger:{log(){}},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,value) => [...crypto.createHash('sha256').update(String(value)).digest()],computeHmacSha256Signature:(value,key) => [...crypto.createHmac('sha256',String(key)).update(String(value)).digest()],base64EncodeWebSafe:value => Buffer.from(value.map ? value.map(byte => byte < 0 ? byte+256 : byte) : value).toString('base64url'),base64DecodeWebSafe:value => [...Buffer.from(value,'base64url')],newBlob:value => ({getBytes:() => [...Buffer.from(value)],getDataAsString:() => Buffer.from(value.map ? value.map(byte => byte < 0 ? byte+256 : byte) : value).toString()}),getUuid:() => crypto.randomUUID()},
    DriveApp:{Access:{PRIVATE:'PRIVATE'}},ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:text => ({text,setMimeType(){return this;}})}
  });
  vm.runInContext(source,context);
  vm.runInContext(rulesSource,context);
  context.ptSessionNowSeconds_ = () => now;
  context.departmentOpsFolder_ = () => { reads++; return {getSharingAccess:() => access,getFilesByName:() => {let remaining=count; return {hasNext:() => remaining>0,next:() => {remaining--;return {getSharingAccess:() => fileAccess,getSize:() => 1000,getBlob:() => ({getDataAsString:() => JSON.stringify(document)})};}};}}; };
  const post = payload => JSON.parse(context.doPost({postData:{contents:JSON.stringify(payload)}}).text);
  return {context,post,get reads(){return reads;},get document(){return document;},set document(value){document=value;},set access(value){access=value;},set fileAccess(value){fileAccess=value;},set count(value){count=value;},advance:seconds => {now+=seconds;}};
}

test('anonymous and forged tokens cannot enumerate or read private reminder files', () => {
  for (const token of [undefined,'','SYNTHETIC_FORGED_TOKEN']) {
    const env = runtime();
    const result = env.post({action:'department_store_rules_read',token});
    assert.notEqual(result.status,'ok');
    assert.equal(env.reads,0);
    assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_PRIVATE_RULE|document|fileId|download_url/);
  }
});
test('legal signed login can read reminders; revoked and expired sessions cannot', () => {
  const env = runtime();
  const auth = env.post({action:'ptauth',key:'synthetic-passcode'});
  const result = env.post({action:'department_store_rules_read',token:auth.token});
  assert.equal(result.status,'ok');
  assert.equal(result.document.rules[0].instruction,'SYNTHETIC_PRIVATE_RULE_ALPHA');
  assert.equal(result.expiresAt,auth.expiresAt);
  env.post({action:'ptlogout',token:auth.token});
  const reads = env.reads;
  assert.notEqual(env.post({action:'department_store_rules_read',token:auth.token}).status,'ok');
  assert.equal(env.reads,reads);
  const other = runtime();
  const expired = other.post({action:'ptauth',key:'synthetic-passcode'});
  other.advance(1801);
  assert.notEqual(other.post({action:'department_store_rules_read',token:expired.token}).status,'ok');
  assert.equal(other.reads,0);
});
test('shared folder, shared file, duplicate or malformed private document fail closed', () => {
  for (const mutation of [env => {env.access='ANYONE';},env => {env.fileAccess='DOMAIN';},env => {env.count=2;},env => {env.document.scope='synthetic-other';},env => {env.document.rules[0].score=100;},env => {env.document.rules[0].sources[0].pages=[0];}]) {
    const env=runtime();mutation(env);
    const auth=env.post({action:'ptauth',key:'synthetic-passcode'});
    const result=env.post({action:'department_store_rules_read',token:auth.token});
    assert.notEqual(result.status,'ok');
    assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_PRIVATE_RULE_ALPHA/);
  }
});
test('missing document is unavailable, without invented performance data', () => {
  const env=runtime();env.count=0;
  const auth=env.post({action:'ptauth',key:'synthetic-passcode'});
  const result=env.post({action:'department_store_rules_read',token:auth.token});
  assert.equal(result.status,'ok');assert.equal(result.available,false);
  assert.doesNotMatch(JSON.stringify(result),/score|completion|penalty|document/);
});
test('only POST exposes the protected reminder read; no public write action exists', () => {
  const env=runtime();
  const auth=env.post({action:'ptauth',key:'synthetic-passcode'});
  assert.throws(() => env.context.patrolGetRoute_('department_store_rules_read',{token:auth.token}),/unknown patrol action/);
  assert.notEqual(env.post({action:'department_store_rules_publish',token:auth.token,document:fixture()}).status,'ok');
  assert.equal(env.reads,0);
});
test('module is isolated from department controller and contains no private fixture', () => {
  const page=fs.readFileSync(path.join(root,'department-ops.html'),'utf8');
  const module=fs.readFileSync(path.join(root,'store-rule-reminders.js'),'utf8');
  assert.match(page,/store-rule-reminders\.js\?v=20261004-collapse-1/);
  assert.match(module,/textContent = text/);
  assert.doesNotMatch(module,/localStorage|indexedDB|SYNTHETIC_PRIVATE_RULE_ALPHA/);
  assert.equal(rulesSource,fs.readFileSync(path.join(root,'patrol-gas/StoreRules.gs'),'utf8'));
});
