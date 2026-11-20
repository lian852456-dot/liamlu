// Not loaded by preview server or production. Reuses existing store transaction contracts.
import {GameStore,GameError} from './runtime/store-base/game-store.mjs';
import {products,validateSelection} from './pricing.mjs';
import {randomUUID} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const qaRoot=resolve(dirname(fileURLToPath(import.meta.url)),'.private-qa');
const requireValue=(value,code)=>{if(!value)throw new GameError(code,409)};
export class CandidatePetStore extends GameStore{
 constructor(file,options={}){requireValue(resolve(file).startsWith(qaRoot+'/'),'ISOLATED_DATABASE_REQUIRED');super(file,{...options,seed:false});}
 purchaseA(uid,body){
  requireValue(body&&Object.keys(body).every(k=>['itemId','variant','requestId'].includes(k)),'INVALID_FIELDS');
  const p=validateSelection(body.itemId,body.variant);
  return this.idempotent(uid,body.requestId,'purchase-pet-a',{itemId:p.id,variant:body.variant},()=>{
   this.user(uid);const wallet=this.wallet(uid);
   requireValue(!this.get('SELECT id FROM inventory WHERE user_id=? AND item_id=?',uid,p.id),'ALREADY_OWNED');
   requireValue(this.inventory(uid).length<150,'INVENTORY_FULL');requireValue(wallet.coins>=p.coins,'INSUFFICIENT_FUNDS');
   const iid=randomUUID();this.run('UPDATE wallets SET coins=coins-? WHERE user_id=?',p.coins,uid);
   this.run('INSERT INTO inventory VALUES(?,?,?,?)',iid,uid,p.id,this.now());
   this.run('INSERT INTO v4_metadata VALUES(?,?)','pet-a-variant:'+iid,JSON.stringify({variant:body.variant}));
   this.run('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)',randomUUID(),uid,'PURCHASE',-p.coins,0,body.requestId,this.now());
   this.audit(uid,'PURCHASE',p.id,{inventoryId:iid,variant:body.variant,coins:p.coins,gold:0});
   return {purchased:{itemId:p.id,inventoryId:iid,variant:body.variant,cost:{coins:p.coins,gold:0}},...this.bootstrap(uid)};
  });
 }
 selectA(uid,body){requireValue(body&&Object.keys(body).every(k=>['inventoryId','expectedRevision','requestId'].includes(k)),'INVALID_FIELDS');return this.idempotent(uid,body.requestId,'select-pet-a',{inventoryId:body.inventoryId,expectedRevision:body.expectedRevision},()=>{
  const current=this.petFollow(uid);requireValue(Number.isSafeInteger(body.expectedRevision)&&body.expectedRevision===current.revision,'PET_REVISION_CONFLICT');
  const item=this.get('SELECT item_id FROM inventory WHERE id=? AND user_id=?',body.inventoryId,uid);requireValue(item&&products.some(p=>p.id===item.item_id),'PET_NOT_OWNED');
  this.run('INSERT OR REPLACE INTO v4_metadata VALUES(?,?)','pet-follow:'+uid,JSON.stringify({...current,inventoryId:body.inventoryId,revision:current.revision+1}));return this.bootstrap(uid);
 });}
 petCompanion(uid){const old=super.petCompanion(uid),state=this.petFollow(uid),inv=state.inventoryId&&this.get('SELECT item_id FROM inventory WHERE id=? AND user_id=?',state.inventoryId,uid),p=products.find(p=>p.id===inv?.item_id);if(!p)return old;
  const saved=this.get('SELECT value FROM v4_metadata WHERE key=?','pet-a-variant:'+state.inventoryId);const variant=JSON.parse(saved?.value||'{}').variant;validateSelection(p.id,variant);
  return {...old,inventoryId:state.inventoryId,itemId:p.id,kind:p.kind,name:p.name,variant,artVersion:'pet-art-a',revision:state.revision};
 }
 bootstrap(uid){return {...super.bootstrap(uid),candidateOnly:true};}
}
