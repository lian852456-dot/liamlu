import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {mkdirSync,chmodSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {createRequire} from 'node:module';
import {STORES,ECONOMY,CATALOG,CHARACTERS,VEHICLES,taipeiDate} from './game-config.mjs';
import {GUEST_WELCOME_COINS,INTERNAL_BUILDINGS,gameAccess} from './guest-policy.mjs';
const sceneRequire=createRequire(import.meta.url),R=sceneRequire('./scene-rules.js');
export class GameError extends Error{constructor(code,status=400,details={}){super(code);this.code=code;this.status=status;this.details=details}}
const hash=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value);
const parse=value=>JSON.parse(value);
const id=()=>randomUUID();
function ensure(value,code,status=400,details){if(!value)throw new GameError(code,status,details)}
function shape(o,keys){ensure(o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k)),'INVALID_FIELDS')}
function integer(n,min=0,max=1e7){return Number.isSafeInteger(n)&&n>=min&&n<=max}
function nickname(value){ensure(typeof value==='string','INVALID_NICKNAME');const name=value.normalize('NFKC').trim();ensure([...name].length>=1&&[...name].length<=12&&!/[<>\u0000-\u001f\u007f]/u.test(name),'INVALID_NICKNAME');return name}
function taskSpec(task){
 if(task==='report')return{question:'確認已閱讀今日示範回報入口？',answer:'confirm',choices:['confirm']};
 if(task==='kpi')return{question:'選擇要查看的 KPI 示範區間',answer:'today',choices:['today','month']};
 if(task==='awards')return{question:'點選一筆台獎示範資料',answer:'demo-award-a',choices:['demo-award-a','demo-award-b']};
 if(task==='tradein')return{question:'選擇要查看的舊換新示範區間',answer:'today',choices:['today','month']};
 return{question:'選擇一支手機進行獎金查詢示範',answer:'demo-a',choices:['demo-a','demo-b','demo-c']};
}
function taskContent(task,choice,store='jiuquan'){
 const base={fictional:true,mode:'ISOLATED_DEMO',store};
 if(task==='report')return{...base,title:'今日回報示範入口',metrics:{kpi:75,a999:3,r999:2,speed:4,r1399:1,insurance:100}};
 if(task==='kpi')return{...base,title:'KPI 示範看板',period:choice,today:75,month:80,unit:'%'};
 if(task==='awards')return{...base,title:'台獎示範資料',itemId:choice,itemName:choice==='demo-award-a'?'原創示範手機 A':'原創示範手機 B',points:choice==='demo-award-a'?120:200};
 if(task==='tradein')return{...base,title:'舊換新示範進度',period:choice,today:3,target:8,month:16};
 const models={
  'demo-a':{name:'示範手機 A',bonusPoints:120},
  'demo-b':{name:'示範手機 B',bonusPoints:200},
  'demo-c':{name:'示範平板 C',bonusPoints:160}
 };
 return{...base,title:'手機獎金示範查詢',modelId:choice,...(models[choice]||models['demo-a']),bonusUnit:'試玩虛構點'};
}
function challengePayload(row,store='jiuquan'){
 const choices=parse(row.choices);
 return{challengeId:row.id,task:row.task,date:row.date,question:row.question,choices,expires:row.expires,completed:!!row.completed,selected:row.selected||null,contentByChoice:Object.fromEntries(choices.map(choice=>[choice,taskContent(row.task,choice,store)]))};
}
export class GameStore{
 constructor(file,{now=()=>Date.now(),seed=true}={}){
  this.now=now;this.file=file;mkdirSync(dirname(file),{recursive:true,mode:0o700});this.db=new DatabaseSync(file);chmodSync(file,0o600);
  this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,store_id TEXT NOT NULL,nickname TEXT NOT NULL,character TEXT NOT NULL DEFAULT 'orange',skin TEXT NOT NULL DEFAULT 'orange',hair TEXT NOT NULL DEFAULT '',outfit TEXT NOT NULL DEFAULT '',car TEXT NOT NULL DEFAULT '',home TEXT NOT NULL DEFAULT '',account_kind TEXT NOT NULL DEFAULT 'demo' CHECK(account_kind IN ('demo','guest')),active INTEGER NOT NULL DEFAULT 1,epoch INTEGER NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 0,code_hash TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS demo_codes(user_id TEXT PRIMARY KEY REFERENCES users(id),code TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,epoch INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wallets(user_id TEXT PRIMARY KEY REFERENCES users(id),coins INTEGER NOT NULL CHECK(coins>=0),gold INTEGER NOT NULL CHECK(gold>=0));
CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,coins INTEGER NOT NULL,gold INTEGER NOT NULL,source TEXT NOT NULL,at INTEGER NOT NULL,UNIQUE(user_id,kind,source));
CREATE TABLE IF NOT EXISTS tasks(user_id TEXT NOT NULL REFERENCES users(id),date TEXT NOT NULL,task TEXT NOT NULL,event TEXT NOT NULL,claimed INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,date,task));
CREATE TABLE IF NOT EXISTS transactions(user_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(user_id,request_id));
CREATE TABLE IF NOT EXISTS inventory(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),item_id TEXT NOT NULL,at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS spaces(id TEXT PRIMARY KEY,kind TEXT NOT NULL,owner TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS placements(id TEXT PRIMARY KEY,space_id TEXT NOT NULL REFERENCES spaces(id),inventory_id TEXT UNIQUE NOT NULL REFERENCES inventory(id),x INTEGER NOT NULL,z INTEGER NOT NULL,rotation INTEGER NOT NULL DEFAULT 0,UNIQUE(space_id,x,z));
CREATE TABLE IF NOT EXISTS work_receipts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),task TEXT NOT NULL,date TEXT NOT NULL,content TEXT NOT NULL,expires INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),date TEXT NOT NULL,body TEXT NOT NULL,at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS imports(source_id TEXT PRIMARY KEY,source_hash TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),gold INTEGER NOT NULL,at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS travel_state(user_id TEXT PRIMARY KEY REFERENCES users(id),from_store TEXT NOT NULL,destination TEXT NOT NULL,mode TEXT NOT NULL,started_at INTEGER NOT NULL,ready_at INTEGER NOT NULL,status TEXT NOT NULL,request_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS task_challenges(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),date TEXT NOT NULL,task TEXT NOT NULL,question TEXT NOT NULL,answer TEXT NOT NULL,choices TEXT NOT NULL,expires INTEGER NOT NULL,completed INTEGER NOT NULL DEFAULT 0,selected TEXT,UNIQUE(user_id,date,task));
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,resource TEXT NOT NULL,details TEXT NOT NULL,at INTEGER NOT NULL);`);
  if(!this.all('PRAGMA table_info(users)').some(column=>column.name==='account_kind'))this.db.exec("ALTER TABLE users ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'demo' CHECK(account_kind IN ('demo','guest'))");
  if(!this.all('PRAGMA table_info(task_challenges)').some(column=>column.name==='selected'))this.db.exec('ALTER TABLE task_challenges ADD COLUMN selected TEXT');
  this.db.exec("CREATE TABLE IF NOT EXISTS v4_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);INSERT OR IGNORE INTO v4_metadata VALUES('namespace','north12b-city-v4');PRAGMA user_version=4;");
  if(seed)this.seed();
 }
 close(){this.db.close()}
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value}catch(e){this.db.exec('ROLLBACK');throw e}}
 get(sql,...args){return this.db.prepare(sql).get(...args)}
 all(sql,...args){return this.db.prepare(sql).all(...args)}
 run(sql,...args){return this.db.prepare(sql).run(...args)}
 seed(){
  const codesFile=join(dirname(this.file),'access-codes.json');
  this.tx(()=>{for(const store of STORES){this.run('INSERT OR IGNORE INTO spaces(id,kind,owner) VALUES(?,?,?)','store:'+store.id,'store',store.id);
   for(let n=1;n<=2;n++){const uid=`demo-${store.id}-${n}`;if(this.get('SELECT id FROM users WHERE id=?',uid))continue;const code=randomBytes(15).toString('base64url');
    this.run('INSERT INTO users(id,store_id,nickname,code_hash) VALUES(?,?,?,?)',uid,store.id,`${store.name}旅人${n}`,hash(code));
    this.run('INSERT INTO demo_codes VALUES(?,?)',uid,code);this.run('INSERT INTO wallets VALUES(?,?,?)',uid,ECONOMY.starterCoins,ECONOMY.starterGold);
    this.run('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)',id(),uid,'DEMO_GRANT',ECONOMY.starterCoins,ECONOMY.starterGold,'fixture-once-v1',this.now());
   }
  }});
  writeFileSync(codesFile,json(this.codes())+'\n',{mode:0o600});chmodSync(codesFile,0o600);
 }
 codes(){return Object.fromEntries(this.all('SELECT u.id,u.store_id,u.nickname,c.code FROM users u JOIN demo_codes c ON c.user_id=u.id').map(u=>[u.id,{name:u.nickname,store:STORES.find(s=>s.id===u.store_id).name,code:u.code}]))}
 registerGuest(body,{signedInUserId=null}={}){
  shape(body,['nickname','registrationKey']);const name=nickname(body.nickname);ensure(typeof body.registrationKey==='string'&&/^[a-f0-9]{48}$/.test(body.registrationKey),'INVALID_GUEST_REGISTRATION');
  // The creation key is a temporary bearer secret; only its hash is indexed.
  // The recovery card remains inside the existing private SQLite boundary.
  const key='guest-registration:'+hash(body.registrationKey);
  return this.tx(()=>{const saved=this.get('SELECT value FROM v4_metadata WHERE key=?',key);
   if(saved){const prior=parse(saved.value);ensure(prior.nickname===name,'GUEST_REGISTRATION_CONFLICT',409);ensure(!signedInUserId||signedInUserId===prior.userId,'ALREADY_SIGNED_IN',409);ensure(this.isGuest(prior.userId),'AUTH_REQUIRED',401);return{userId:prior.userId,card:prior.card,created:false}}
   ensure(!signedInUserId,'ALREADY_SIGNED_IN',409);const uid='guest-'+id(),card='guest_'+randomBytes(24).toString('base64url');
   this.run("INSERT INTO users(id,store_id,nickname,account_kind,code_hash) VALUES(?,?,?,'guest',?)",uid,'jiuquan',name,hash(card));
   this.run('INSERT INTO wallets VALUES(?,?,?)',uid,GUEST_WELCOME_COINS,0);
   this.run('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)',id(),uid,'GUEST_WELCOME',GUEST_WELCOME_COINS,0,'guest-once-v1',this.now());
   this.run('INSERT INTO v4_metadata VALUES(?,?)',key,json({userId:uid,nickname:name,card}));this.audit(uid,'GUEST_CREATE','self',{coins:GUEST_WELCOME_COINS,gold:0});
   return{userId:uid,card,created:true};
  });
 }
 guestRecoveryCard(uid,body){shape(body,[]);ensure(this.isGuest(uid),'GUEST_ACCOUNT_REQUIRED',403);const saved=this.get("SELECT value FROM v4_metadata WHERE key LIKE 'guest-registration:%' AND json_extract(value,'$.userId')=? LIMIT 1",uid);ensure(saved,'GUEST_CARD_UNAVAILABLE',404);return{card:parse(saved.value).card}}
 isGuest(uid){return this.user(uid).account_kind==='guest'}
 requireBusiness(uid){ensure(this.user(uid).account_kind==='demo','GUEST_INTERNAL_ACCESS_DENIED',403)}
 authorizeBuilding(uid,body){shape(body,['buildingId']);ensure(this.user(uid).account_kind==='demo','GUEST_INTERNAL_BUILDING_DENIED',403);ensure(INTERNAL_BUILDINGS.includes(body.buildingId),'BUILDING_NOT_FOUND',404);return{allowed:true,buildingId:body.buildingId}}
 login(code){ensure(typeof code==='string'&&code.length>=12&&code.length<120,'LOGIN_DENIED',401);const user=this.get('SELECT * FROM users WHERE code_hash=? AND active=1',hash(code.trim()));ensure(user,'LOGIN_DENIED',401);const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex'),expires=this.now()+ECONOMY.sessionHours*3600000;this.run('INSERT INTO sessions VALUES(?,?,?,?,?)',hash(token),user.id,csrf,user.epoch,expires);return{token,csrf,expires,userId:user.id}}
 authenticate(token){ensure(typeof token==='string'&&/^[a-f0-9]{64}$/.test(token),'AUTH_REQUIRED',401);const s=this.get('SELECT s.*,u.active,u.epoch AS current_epoch FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?',hash(token));ensure(s&&s.active===1&&s.epoch===s.current_epoch&&s.expires>this.now(),'SESSION_EXPIRED',401);return{userId:s.user_id,csrf:s.csrf,expires:s.expires,tokenHash:s.token_hash}}
 logout(session){this.run('DELETE FROM sessions WHERE token_hash=?',session.tokenHash)}
 audit(user,action,resource,details={}){this.run('INSERT INTO audit VALUES(?,?,?,?,?,?)',id(),user,action,resource,json(details),this.now())}
 user(uid){const u=this.get("SELECT u.id,u.store_id,u.nickname,u.character,u.skin,u.hair,u.outfit,u.car,u.home,u.revision,u.active,u.account_kind,m.value AS _avatar_preset FROM users u LEFT JOIN v4_metadata m ON m.key='avatar-preset:'||u.id WHERE u.id=?",uid);ensure(u&&u.active,'AUTH_REQUIRED',401);const preset=u._avatar_preset;delete u._avatar_preset;if(preset==='portrait-li-shuhuan-v1')u.avatarPreset=preset;return u}
 wallet(uid){return{...this.get('SELECT coins,gold FROM wallets WHERE user_id=?',uid),goldCoinValue:50,source:this.isGuest(uid)?'ISOLATED_GUEST_WALLET':'ISOLATED_DEMO_WALLET'}}
 storeList(uid){const u=this.user(uid);return STORES.map(store=>{const space=this.get('SELECT id,kind,owner,version FROM spaces WHERE id=?','store:'+store.id);return{...store,spaceId:space.id,version:space.version,editable:u.account_kind==='demo'&&u.store_id===store.id}})}
 movementSpeed(uid){const u=this.user(uid);const vehicle=u.car&&VEHICLES[u.car];return vehicle?.speed||3.4}
 currentZone(uid){try{const row=this.get('SELECT zone FROM v42_positions WHERE user_id=?',uid);return row?.zone||this.user(uid).store_id}catch{ return this.user(uid).store_id }}
 tasks(uid){if(this.isGuest(uid))return[];const date=taipeiDate(this.now()),rows=this.all('SELECT * FROM tasks WHERE user_id=? AND date=?',uid,date);return ECONOMY.tasks.map(t=>({...t,status:rows.some(r=>r.task===t.id)?rows.find(r=>r.task===t.id).claimed?'claimed':'ready':'pending'}))}
 inventory(uid){return this.all('SELECT i.*,p.space_id FROM inventory i LEFT JOIN placements p ON p.inventory_id=i.id WHERE i.user_id=? ORDER BY i.at,i.id',uid)}
 petFollow(uid){
  this.user(uid);
  const row=this.get('SELECT value FROM v4_metadata WHERE key=?','pet-follow:'+uid);
  if(!row)return{inventoryId:null,accessoryInventoryId:null,revision:0};
  const state=parse(row.value);
  ensure(state&&typeof state==='object'&&!Array.isArray(state),'PET_STATE_INVALID',500);
  const inventoryId=Object.prototype.hasOwnProperty.call(state,'inventoryId')?state.inventoryId:null;
  const accessoryInventoryId=Object.prototype.hasOwnProperty.call(state,'accessoryInventoryId')?state.accessoryInventoryId:null;
  ensure(integer(state.revision,0,Number.MAX_SAFE_INTEGER),'PET_STATE_INVALID',500);
  ensure(inventoryId===null||typeof inventoryId==='string','PET_STATE_INVALID',500);
  ensure(accessoryInventoryId===null||typeof accessoryInventoryId==='string','PET_STATE_INVALID',500);
  return{inventoryId,accessoryInventoryId,revision:state.revision};
 }
 petCompanion(uid){
  const state=this.petFollow(uid);
  const petInventory=state.inventoryId&&this.get('SELECT id,item_id FROM inventory WHERE id=? AND user_id=?',state.inventoryId,uid);
  const petItem=petInventory&&CATALOG.find(item=>item.id===petInventory.item_id&&item.category==='pet');
  const accessoryInventory=state.accessoryInventoryId&&this.get('SELECT id,item_id FROM inventory WHERE id=? AND user_id=?',state.accessoryInventoryId,uid);
  const accessoryItem=accessoryInventory&&CATALOG.find(item=>item.id===accessoryInventory.item_id&&item.category==='petAccessory');
  return{
   inventoryId:petItem?petInventory.id:null,
   kind:petItem?.kind||null,
   name:petItem?.name||null,
   accessoryInventoryId:accessoryItem?accessoryInventory.id:null,
   accessoryKind:accessoryItem?.kind||null,
   accessoryName:accessoryItem?.name||null,
   accessoryStyle:accessoryItem?.style||null,
   revision:state.revision
  };
 }
 bootstrap(uid){const user=this.user(uid),guest=user.account_kind==='guest';return{access:gameAccess(user.account_kind),mode:'isolated-demo',formalIntegration:'NOT_DEPLOYED',date:taipeiDate(this.now()),profile:user,personalGold:{trusted:false,available:0,status:'PERSONAL_GOLD_BRIDGE_REQUIRED',basis:'MONTHLY_CUMULATIVE'},appearanceSetupComplete:this.get('SELECT value FROM v4_metadata WHERE key=?','appearance-setup:'+uid)?.value==='complete',wallet:this.wallet(uid),tasks:this.tasks(uid),inventory:this.inventory(uid),catalog:CATALOG,petCompanion:this.petCompanion(uid),economy:guest?{...ECONOMY,starterCoins:GUEST_WELCOME_COINS,starterGold:0,tasks:[]}:ECONOMY,stores:STORES,storeMap:this.storeList(uid),travel:this.travelStatus(uid),movementSpeed:this.movementSpeed(uid)}}
 profile(uid,body){shape(body,['nickname','character','skin','hair','outfit','car','home','expectedRevision','completeSetup']);if('completeSetup' in body)ensure(body.completeSetup===true,'INVALID_SETUP_STATE');return this.tx(()=>{const u=this.user(uid);ensure(body.expectedRevision===u.revision,'PROFILE_CONFLICT',409,{profile:u});const patch={};
  if('nickname'in body)patch.nickname=nickname(body.nickname)
  if('character'in body){ensure(CHARACTERS.includes(body.character),'INVALID_CHARACTER');patch.character=body.character}
  if('skin'in body){ensure(['orange','teal','purple'].includes(body.skin),'INVALID_SKIN');patch.skin=body.skin}
  for(const category of ['hair','outfit','car','home'])if(category in body){const value=body[category];ensure(typeof value==='string','INVALID_EQUIPMENT');if(value){const item=CATALOG.find(v=>v.id===value&&v.category===category);ensure(item&&this.get('SELECT id FROM inventory WHERE user_id=? AND item_id=?',uid,value),'ITEM_NOT_OWNED',403)}patch[category]=value}
  for(const[k,v]of Object.entries(patch))this.run(`UPDATE users SET ${k}=? WHERE id=?`,v,uid);
  if(body.completeSetup)this.run('INSERT OR REPLACE INTO v4_metadata VALUES(?,?)','appearance-setup:'+uid,'complete');
  this.run('UPDATE users SET revision=revision+1 WHERE id=?',uid);this.audit(uid,'PROFILE','self',Object.keys(patch));return this.bootstrap(uid)
 })}
 idempotent(uid,requestId,operation,body,fn){ensure(typeof requestId==='string'&&/^[a-zA-Z0-9_-]{12,100}$/.test(requestId),'INVALID_REQUEST_ID');const fingerprint=hash(json([operation,body]));return this.tx(()=>{const prior=this.get('SELECT * FROM transactions WHERE user_id=? AND request_id=?',uid,requestId);if(prior){ensure(prior.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT',409);return parse(prior.result)}const result=fn();this.run('INSERT INTO transactions VALUES(?,?,?,?)',uid,requestId,fingerprint,json(result));return result})}
 completeTask(uid,task,event){this.requireBusiness(uid);ensure(ECONOMY.tasks.some(t=>t.id===task),'INVALID_TASK');this.run('INSERT OR IGNORE INTO tasks(user_id,date,task,event) VALUES(?,?,?,?)',uid,taipeiDate(this.now()),task,event)}
 claim(uid,body){this.requireBusiness(uid);shape(body,['task','requestId']);const task=ECONOMY.tasks.find(t=>t.id===body.task);ensure(task,'INVALID_TASK');return this.idempotent(uid,body.requestId,'claim',{task:body.task,date:taipeiDate(this.now())},()=>{const date=taipeiDate(this.now()),state=this.get('SELECT * FROM tasks WHERE user_id=? AND date=? AND task=?',uid,date,task.id);ensure(state,'TASK_NOT_COMPLETE',409);if(state.claimed)return{alreadyClaimed:true,...this.bootstrap(uid)};
  const total=this.get("SELECT COALESCE(SUM(coins),0) total FROM ledger WHERE user_id=? AND kind='TASK_REWARD' AND source LIKE ?",uid,date+':%').total;ensure(total+task.coins<=ECONOMY.dailyCoinCap,'DAILY_CAP',409);
  this.run('UPDATE tasks SET claimed=1 WHERE user_id=? AND date=? AND task=?',uid,date,task.id);this.run('UPDATE wallets SET coins=coins+? WHERE user_id=?',task.coins,uid);this.run('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)',id(),uid,'TASK_REWARD',task.coins,0,date+':'+task.id,this.now());this.audit(uid,'CLAIM',task.id,{date,coins:task.coins});return this.bootstrap(uid)
 })}
 selectPet(uid,body){shape(body,['inventoryId','accessoryInventoryId','expectedRevision','requestId']);ensure(body.inventoryId===null||typeof body.inventoryId==='string','INVALID_PET_SELECTION');ensure(body.accessoryInventoryId===undefined||body.accessoryInventoryId===null||typeof body.accessoryInventoryId==='string','INVALID_PET_ACCESSORY');ensure(integer(body.expectedRevision,0,Number.MAX_SAFE_INTEGER),'INVALID_PET_REVISION');const accessoryProvided=Object.prototype.hasOwnProperty.call(body,'accessoryInventoryId');return this.idempotent(uid,body.requestId,'select-pet',{inventoryId:body.inventoryId,accessoryInventoryId:accessoryProvided?body.accessoryInventoryId:null,expectedRevision:body.expectedRevision},()=>{const current=this.petFollow(uid);ensure(body.expectedRevision===current.revision,'PET_REVISION_CONFLICT',409,{petCompanion:this.petCompanion(uid)});const petInventory=body.inventoryId&&this.get('SELECT id,item_id FROM inventory WHERE id=? AND user_id=?',body.inventoryId,uid);const petItem=petInventory&&CATALOG.find(item=>item.id===petInventory.item_id&&item.category==='pet');ensure(body.inventoryId===null||petItem,'PET_NOT_OWNED',403);const accessoryId=accessoryProvided?body.accessoryInventoryId:current.accessoryInventoryId;const accessoryInventory=accessoryId&&this.get('SELECT id,item_id FROM inventory WHERE id=? AND user_id=?',accessoryId,uid);const accessoryItem=accessoryInventory&&CATALOG.find(item=>item.id===accessoryInventory.item_id&&item.category==='petAccessory');ensure(accessoryId===null||accessoryItem,'PET_ACCESSORY_NOT_OWNED',403);const revision=current.revision+1;this.run('INSERT OR REPLACE INTO v4_metadata VALUES(?,?)','pet-follow:'+uid,json({inventoryId:body.inventoryId,accessoryInventoryId:accessoryId,revision}));this.audit(uid,'PET_SELECT','pet-follow',{inventoryId:body.inventoryId,accessoryInventoryId:accessoryId,revision});return this.bootstrap(uid)})}
 purchase(uid,body){shape(body,['itemId','requestId']);const item=CATALOG.find(i=>i.id===body.itemId);ensure(item,'UNKNOWN_ITEM');return this.idempotent(uid,body.requestId,'purchase',{itemId:item.id},()=>{const u=this.user(uid),wallet=this.wallet(uid);ensure(item.priceStatus!=='pending','PRICE_PENDING',403);ensure(item.currency!=='personalGold','PERSONAL_GOLD_BRIDGE_REQUIRED',403);const unique=['hair','outfit','car','home','unlock','pet','petAccessory'].includes(item.category);ensure(!unique||!this.get('SELECT id FROM inventory WHERE user_id=? AND item_id=?',uid,item.id),'ALREADY_OWNED',409);ensure(this.inventory(uid).length<150,'INVENTORY_FULL',409);ensure(wallet.coins>=item.coins&&wallet.gold>=item.gold,'INSUFFICIENT_FUNDS',409);
  this.run('UPDATE wallets SET coins=coins-?,gold=gold-? WHERE user_id=?',item.coins,item.gold,uid);const iid=id();this.run('INSERT INTO inventory VALUES(?,?,?,?)',iid,uid,item.id,this.now());this.run('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)',id(),uid,'PURCHASE',-item.coins,-item.gold,body.requestId,this.now());
  if(item.category==='home'){this.run('INSERT OR IGNORE INTO spaces(id,kind,owner) VALUES(?,?,?)','home:'+uid,'home',uid);this.run('UPDATE users SET home=?,revision=revision+1 WHERE id=?',item.id,uid)}
  this.audit(uid,'PURCHASE',item.id,{coins:item.coins,gold:item.gold,inventoryId:iid});return{purchased:{itemId:item.id,inventoryId:iid,cost:{coins:item.coins,gold:item.gold}},...this.bootstrap(uid)}
 })}
 work(uid,task){this.requireBusiness(uid);ensure(['kpi','awards','tradein','price'].includes(task),'INVALID_WORK');const data=task==='kpi'?{title:'KPI 示範看板',today:75,month:80,unit:'%',fictional:true}:task==='awards'?{title:'台獎示範清單',items:[{name:'原創示範手機 A',points:120},{name:'原創示範手機 B',points:200}],fictional:true}:task==='tradein'?{title:'舊換新示範進度',today:3,target:8,month:16,fictional:true}:{title:'查價練習',models:[{id:'demo-a',name:'示範手機 A',cash:9900},{id:'demo-b',name:'示範手機 B',cash:15900},{id:'demo-c',name:'示範平板 C',cash:11900}],fictional:true};
  const receipt=id();this.run('INSERT INTO work_receipts(id,user_id,task,date,content,expires) VALUES(?,?,?,?,?,?)',receipt,uid,task,taipeiDate(this.now()),json(data),this.now()+ECONOMY.workReceiptMinutes*60000);return{receiptId:receipt,data}
 }
 acknowledge(uid,body){this.requireBusiness(uid);shape(body,['receiptId','action','value','requestId']);ensure(typeof body.receiptId==='string','INVALID_RECEIPT');return this.idempotent(uid,body.requestId,'work',{receiptId:body.receiptId,action:body.action,value:body.value},()=>{const r=this.get('SELECT * FROM work_receipts WHERE id=? AND user_id=?',body.receiptId,uid);ensure(r&&r.expires>this.now()&&r.date===taipeiDate(this.now()),'INVALID_RECEIPT',409);const d=parse(r.content);
  const valid=r.task==='kpi'?body.action==='period'&&['today','month'].includes(body.value):r.task==='awards'?body.action==='inspect'&&d.items.some(i=>i.name===body.value):r.task==='tradein'?body.action==='period'&&['today','month'].includes(body.value):body.action==='query'&&d.models.some(i=>i.id===body.value);
  ensure(valid,'CONTENT_ACTION_REQUIRED');this.run('UPDATE work_receipts SET consumed=1 WHERE id=?',r.id);this.completeTask(uid,r.task,r.id);this.audit(uid,'DEMO_WORK',r.task,{receipt:r.id});return this.bootstrap(uid)
 })}
 startTask(uid,body){this.requireBusiness(uid);shape(body,['task','requestId']);const task=ECONOMY.tasks.find(t=>t.id===body.task);ensure(task,'INVALID_TASK');const date=taipeiDate(this.now());return this.idempotent(uid,body.requestId,'task-start',{task:task.id,date},()=>{const existing=this.get('SELECT * FROM task_challenges WHERE user_id=? AND date=? AND task=?',uid,date,task.id);if(existing&&!existing.completed&&existing.expires<=this.now()){
    // A stale unanswered challenge must not lock the daily task forever. Keep
    // the per-user/day/task uniqueness invariant while issuing a fresh prompt.
    const challenge=id(),spec=taskSpec(task.id),expires=this.now()+ECONOMY.workReceiptMinutes*60000;
    this.run('UPDATE task_challenges SET id=?,question=?,answer=?,choices=?,expires=?,completed=0,selected=NULL WHERE user_id=? AND date=? AND task=?',challenge,spec.question,spec.answer,json(spec.choices),expires,uid,date,task.id);
    const renewed=this.get('SELECT * FROM task_challenges WHERE id=?',challenge);this.audit(uid,'TASK_RENEW',task.id,{date,challenge});return{...challengePayload(renewed,this.user(uid).store_id),...this.bootstrap(uid)};
   }
   if(existing)return{...challengePayload(existing,this.user(uid).store_id),...this.bootstrap(uid)};
   const challenge=id(),spec=taskSpec(task.id),expires=this.now()+ECONOMY.workReceiptMinutes*60000;
   this.run('INSERT INTO task_challenges(id,user_id,date,task,question,answer,choices,expires,completed,selected) VALUES(?,?,?,?,?,?,?,?,?,?)',challenge,uid,date,task.id,spec.question,spec.answer,json(spec.choices),expires,0,null);this.audit(uid,'TASK_START',task.id,{date,challenge});const created=this.get('SELECT * FROM task_challenges WHERE id=?',challenge);return{...challengePayload(created,this.user(uid).store_id),...this.bootstrap(uid)}})}
 answerTask(uid,body){this.requireBusiness(uid);shape(body,['challengeId','answer','requestId']);ensure(typeof body.challengeId==='string'&&typeof body.answer==='string','INVALID_TASK_ANSWER');return this.idempotent(uid,body.requestId,'task-answer',{challengeId:body.challengeId,answer:body.answer,date:taipeiDate(this.now())},()=>{const challenge=this.get('SELECT * FROM task_challenges WHERE id=? AND user_id=?',body.challengeId,uid);ensure(challenge&&challenge.date===taipeiDate(this.now())&&challenge.expires>this.now(),'TASK_CHALLENGE_EXPIRED',409);const store=this.user(uid).store_id;if(challenge.completed){const selected=challenge.selected||challenge.answer;return{alreadyCompleted:true,completed:{task:challenge.task,date:challenge.date,choice:selected,content:taskContent(challenge.task,selected,store)},...this.bootstrap(uid)}}const choices=parse(challenge.choices);ensure(choices.includes(body.answer),'TASK_ANSWER_INCORRECT',409,{choices});this.run('UPDATE task_challenges SET completed=1,selected=? WHERE id=?',body.answer,challenge.id);this.completeTask(uid,challenge.task,challenge.id);this.audit(uid,'TASK_ANSWER',challenge.task,{date:challenge.date,challenge:challenge.id,choice:body.answer});return{completed:{task:challenge.task,date:challenge.date,choice:body.answer,content:taskContent(challenge.task,body.answer,store)},...this.bootstrap(uid)}})}
 exchangeGold(uid,body){shape(body,['gold','requestId']);ensure(integer(body.gold,1,100000),'INVALID_GOLD_AMOUNT');return this.idempotent(uid,body.requestId,'gold-exchange',{gold:body.gold},()=>{const wallet=this.wallet(uid),coins=body.gold*ECONOMY.goldCoinValue;ensure(wallet.gold>=body.gold,'INSUFFICIENT_GOLD',409);this.run('UPDATE wallets SET gold=gold-?,coins=coins+? WHERE user_id=?',body.gold,coins,uid);this.run('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)',id(),uid,'GOLD_EXCHANGE',coins,-body.gold,body.requestId,this.now());this.audit(uid,'GOLD_EXCHANGE','wallet',{gold:body.gold,coins});return{exchange:{gold:body.gold,coins,rate:ECONOMY.goldCoinValue},...this.bootstrap(uid)}})}
 report(uid,body){this.requireBusiness(uid);shape(body,['store','segment','metrics','requestId']);const u=this.user(uid);ensure(body.store===u.store_id,'STORE_FORBIDDEN',403);ensure([16,21].includes(body.segment),'INVALID_SEGMENT');shape(body.metrics,['kpi','a999','r999','speed','r1399','insurance']);const m=body.metrics;ensure(Object.keys(m).length===6&&Object.entries(m).every(([k,v])=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=(k==='insurance'?100:999)&&(['kpi','insurance'].includes(k)||Number.isInteger(v))),'INVALID_METRICS');return this.idempotent(uid,body.requestId,'report',{store:u.store_id,segment:body.segment,metrics:m,date:taipeiDate(this.now())},()=>{const receipt=id(),date=taipeiDate(this.now());this.run('INSERT INTO reports VALUES(?,?,?,?,?)',receipt,uid,date,json(m),this.now());const readback=this.get('SELECT body FROM reports WHERE id=? AND user_id=?',receipt,uid);ensure(readback&&readback.body===json(m),'READBACK_FAILED',500);this.completeTask(uid,'report',receipt);this.audit(uid,'DEMO_REPORT',receipt,{date,segment:body.segment});return{receipt:{id:receipt,date,rowWritten:true,readbackMatches:true,mode:'ISOLATED_DEMO_NOT_FORMAL'},...this.bootstrap(uid)}})}
 ownHome(uid){const user=this.user(uid),homes=this.inventory(uid).filter(row=>CATALOG.some(item=>item.id===row.item_id&&item.category==='home'));ensure(homes.length,'HOME_NOT_OWNED',403);const selected=homes.find(row=>row.item_id===user.home)||homes[0];const key='home:'+uid;ensure(this.get('SELECT id FROM spaces WHERE id=?',key),'HOME_SPACE_MISSING',409);return{itemId:selected.item_id,space:this.space(uid,key)};}
 space(uid,spaceId){const u=this.user(uid),s=this.get('SELECT * FROM spaces WHERE id=?',spaceId);ensure(s,'SPACE_NOT_FOUND',404);ensure(s.kind==='store'||s.owner===uid,'HOME_PRIVATE',403);return{...s,editable:s.kind==='store'?u.account_kind==='demo'&&u.store_id===s.owner:s.owner===uid,placements:this.all('SELECT p.*,i.item_id,i.user_id owner_id FROM placements p JOIN inventory i ON p.inventory_id=i.id WHERE p.space_id=?',spaceId)}}
 decorate(uid,body){shape(body,['spaceId','expectedVersion','operation','inventoryId','placementId','x','z','rotation','requestId']);ensure(typeof body.spaceId==='string','INVALID_SPACE');return this.idempotent(uid,body.requestId,'decorate',{spaceId:body.spaceId,expectedVersion:body.expectedVersion,operation:body.operation,inventoryId:body.inventoryId||'',placementId:body.placementId||'',x:body.x??null,z:body.z??null,rotation:body.rotation??0},()=>{const space=this.space(uid,body.spaceId);ensure(space.editable,'STORE_READ_ONLY',403);ensure(body.expectedVersion===space.version,'SPACE_CONFLICT',409,{space});
  if(body.operation==='place'){ensure(integer(body.x,0,7)&&integer(body.z,0,5)&&integer(body.rotation??0,0,3),'INVALID_POSITION');const inv=this.get('SELECT * FROM inventory WHERE id=? AND user_id=?',body.inventoryId,uid);ensure(inv,'ITEM_NOT_OWNED',403);const item=CATALOG.find(v=>v.id===inv.item_id);ensure(item&&['furniture','supplies'].includes(item.category),'NOT_PLACEABLE');ensure(!this.get('SELECT id FROM placements WHERE inventory_id=?',inv.id),'ITEM_ALREADY_PLACED',409);ensure(!this.get('SELECT id FROM placements WHERE space_id=? AND x=? AND z=?',space.id,body.x,body.z),'CELL_OCCUPIED',409);ensure(space.placements.length<32,'SPACE_FULL',409);this.run('INSERT INTO placements VALUES(?,?,?,?,?,?)',id(),space.id,inv.id,body.x,body.z,body.rotation??0)}
  else{ensure(['move','remove'].includes(body.operation),'INVALID_OPERATION');const p=this.get('SELECT * FROM placements WHERE id=? AND space_id=?',body.placementId,space.id);ensure(p,'PLACEMENT_NOT_FOUND',404);if(body.operation==='remove')this.run('DELETE FROM placements WHERE id=?',p.id);else{ensure(integer(body.x,0,7)&&integer(body.z,0,5)&&integer(body.rotation??0,0,3),'INVALID_POSITION');ensure(!this.get('SELECT id FROM placements WHERE space_id=? AND x=? AND z=? AND id<>?',space.id,body.x,body.z,p.id),'CELL_OCCUPIED',409);this.run('UPDATE placements SET x=?,z=?,rotation=? WHERE id=?',body.x,body.z,body.rotation??0,p.id)}}
  this.run('UPDATE spaces SET version=version+1 WHERE id=?',space.id);this.audit(uid,'DECORATE',space.id,{operation:body.operation,version:space.version+1});return{space:this.space(uid,space.id),...this.bootstrap(uid)}
 })}
 travel(uid,body){shape(body,['destination','mode','requestId']);ensure(STORES.some(s=>s.id===body.destination),'INVALID_DESTINATION');const mode=body.mode||'express';ensure(['walk','ride','express'].includes(mode),'INVALID_TRAVEL_MODE');return this.idempotent(uid,body.requestId,'travel',{destination:body.destination,mode},()=>{const from=this.currentZone(uid),u=this.user(uid);if(body.destination===from)return{status:'arrived',from,destination:body.destination,mode,durationMs:0,readyAt:this.now(),speed:this.movementSpeed(uid)};if(mode==='express')ensure(this.get('SELECT id FROM inventory WHERE user_id=? AND item_id=?',uid,'unlock-express'),'EXPRESS_LOCKED',403);if(mode==='ride')ensure(u.car&&VEHICLES[u.car],'VEHICLE_REQUIRED',403);
   const to=R.storeCenters[body.destination]||R.storeCenters.jiuquan,fromCenter=R.storeCenters[from]||R.storeCenters.jiuquan,distanceUnits=Math.max(1,Math.hypot(to.x-fromCenter.x,to.z-fromCenter.z));const speed=mode==='ride'?this.movementSpeed(uid):mode==='walk'?3.4:60;const durationMs=Math.max(2000,Math.round(distanceUnits*1000/speed));const startedAt=this.now(),readyAt=startedAt+durationMs;const existing=this.get('SELECT * FROM travel_state WHERE user_id=?',uid);ensure(!existing||existing.status==='completed','TRAVEL_IN_PROGRESS',409,{travel:this.travelStatus(uid)});this.run('INSERT INTO travel_state(user_id,from_store,destination,mode,started_at,ready_at,status,request_id) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET from_store=excluded.from_store,destination=excluded.destination,mode=excluded.mode,started_at=excluded.started_at,ready_at=excluded.ready_at,status=excluded.status,request_id=excluded.request_id',uid,from,body.destination,mode,startedAt,readyAt,'traveling',body.requestId);this.audit(uid,'TRAVEL_START',body.destination,{from,mode,durationMs,speed,distanceUnits});return{status:'traveling',from,destination:body.destination,mode,durationMs,readyAt,speed}})}
 travelStatus(uid){const row=this.get('SELECT * FROM travel_state WHERE user_id=?',uid);if(!row)return{status:'idle',zone:this.currentZone(uid)};const status=row.status==='traveling'&&row.ready_at<=this.now()?'ready':row.status;return{status,from:row.from_store,destination:row.destination,mode:row.mode,startedAt:row.started_at,readyAt:row.ready_at,remainingMs:Math.max(0,row.ready_at-this.now()),speed:row.mode==='ride'?this.movementSpeed(uid):row.mode==='walk'?3.4:60,requestId:row.request_id}}
 completeTravel(uid, destination){const status=this.travelStatus(uid);ensure(status.destination===destination&&status.status==='ready','TRAVEL_NOT_READY',409,{travel:status});this.run('UPDATE travel_state SET status=? WHERE user_id=?','completed',uid);this.audit(uid,'TRAVEL_ARRIVE',destination,{from:status.from,mode:status.mode});return{status:'arrived',from:status.from,destination,mode:status.mode,arrivedAt:this.now(),speed:status.speed}}
 ledger(uid){return this.all('SELECT id,kind,coins,gold,source,at FROM ledger WHERE user_id=? ORDER BY at DESC,id LIMIT 80',uid)}
 importGold(){throw new GameError('FORMAL_IMPORT_NOT_ENABLED',403)}
}
