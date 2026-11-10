import {randomBytes,createHash} from 'node:crypto';
import {canonicalStore} from './formal-contract.mjs';
export const CITY_OWNER_AUDIENCE='north12b-city-formal-login';
export const CITY_OWNER_DEADLINE=Date.parse('2026-10-31T15:59:00.000Z');
const sha=x=>createHash('sha256').update(x).digest('hex');
const pilots=new Map([['5511180',{store:'三創',preset:'portrait-jialing-v1'}],['5513075',{store:'通化',preset:'portrait-yixin-v1'}],['5514420',{store:'三創',preset:'portrait-li-shuhuan-v1'}]]);
export class OwnerBindingError extends Error{constructor(code,status=409){super(code);this.code=code;this.status=status;}}
const need=(yes,code,status)=>{if(!yes)throw new OwnerBindingError(code,status);};
const shape=(body,keys)=>{need(body&&typeof body==='object'&&!Array.isArray(body),'OWNER_BODY_INVALID',400);need(Object.keys(body).every(k=>keys.includes(k)),'OWNER_FIELDS_INVALID',400);};
// Both proofs are mandatory: a fresh ordinary city session owns the existing
// UID, while the original account service supplies current employee identity.
// This module never creates a guest, merges worlds, resets progress or grants money.
export function createStaffOwnerBinding({db,worldId,authenticateCity,redeemHandoff,validateLease,onBound=()=>{},now=Date.now,protectedUids=[],protectedOwnerPairs=[]}){
  need(db&&typeof db.prepare==='function'&&['current-guests','legacy-owners'].includes(worldId)&&
    typeof authenticateCity==='function'&&typeof redeemHandoff==='function'&&typeof validateLease==='function','OWNER_ADAPTER_REQUIRED',500);
  db.exec(`CREATE TABLE IF NOT EXISTS city_owner_challenges (
    id TEXT PRIMARY KEY,world_id TEXT NOT NULL,city_uid TEXT NOT NULL,session_hash TEXT NOT NULL,user_epoch TEXT NOT NULL,
    employee_id TEXT NOT NULL,nonce TEXT NOT NULL,expires_at INTEGER NOT NULL,completed_fingerprint TEXT);
    CREATE TABLE IF NOT EXISTS city_employee_owners (
    employee_id TEXT NOT NULL,world_id TEXT NOT NULL,city_uid TEXT NOT NULL,store TEXT NOT NULL,authority_epoch TEXT NOT NULL,
    authority_receipt TEXT NOT NULL,lease_token TEXT NOT NULL,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
    PRIMARY KEY(employee_id,world_id),UNIQUE(world_id,city_uid));`);
  need(Array.isArray(protectedOwnerPairs)&&protectedOwnerPairs.every(pair=>Array.isArray(pair)&&pair.length===2&&blockedPair(pair)),'PROTECTED_OWNER_CONFIG_INVALID',500);
  function blockedPair(pair){return protectedUids.includes(pair[0])&&pilots.has(pair[1]);}
  const blocked=new Set(protectedUids),allowedProtectedOwners=new Map(protectedOwnerPairs),originalEmployeeRoles=new Map(protectedOwnerPairs.map(([uid,id])=>[id,uid]));
  function ownerScope(p,employeeId){need(!originalEmployeeRoles.has(employeeId)||originalEmployeeRoles.get(employeeId)===p.userId,'EMPLOYEE_ORIGINAL_ROLE_REQUIRED',403);need(!blocked.has(p.userId)||allowedProtectedOwners.get(p.userId)===employeeId,'PROTECTED_EXISTING_ROLE',403);}
  const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
  function gate(){need(now()<CITY_OWNER_DEADLINE,'OWNER_PREVIEW_EXPIRED',410);}
  function city(context){gate();const p=authenticateCity(context);need(p&&p.worldId===worldId&&p.active===true&&p.accountKind==='guest'&&
    typeof p.userId==='string'&&p.userId.length>8&&typeof p.sessionId==='string'&&p.sessionId.length>=16&&p.userEpoch!==undefined,'EXISTING_CITY_OWNER_REQUIRED',401);
    need(!blocked.has(p.userId)||allowedProtectedOwners.has(p.userId),'PROTECTED_EXISTING_ROLE',403);return {...p,userEpoch:String(p.userEpoch),sessionHash:sha(p.sessionId)};}
  function sameCity(p,row){need(row&&row.world_id===worldId&&row.city_uid===p.userId&&row.session_hash===p.sessionHash&&row.user_epoch===p.userEpoch,'OWNER_CHALLENGE_SESSION_CHANGED',403);}
  function safe(row){return {bound:true,worldId:row.world_id,cityUID:row.city_uid,store:row.store,expiresAt:row.expires_at,
    photoPreset:pilots.get(row.employee_id)?.preset,employeeIdMasked:'***'+row.employee_id.slice(-3),formalBusinessAccess:false};}
  function binding(uid){return db.prepare('SELECT * FROM city_employee_owners WHERE world_id=? AND city_uid=?').get(worldId,uid);}
  function identity(raw,row){const who=raw?.identity,expected=pilots.get(row.employee_id);need(raw?.status==='ok'&&raw.schema==='city-employee-owner/v1'&&
    who?.source==='B_LOCKED_SESSION'&&who.accountKind==='employee'&&who.active===true&&who.employeeId===row.employee_id&&
    canonicalStore(who.store)===expected?.store&&who.worldId===worldId&&who.challengeId===row.id&&who.nonceHash===sha(row.nonce)&&
    who.audience===CITY_OWNER_AUDIENCE&&Number.isSafeInteger(who.expiresAt)&&who.expiresAt>now()&&who.expiresAt<=CITY_OWNER_DEADLINE&&
    typeof who.sessionEpoch==='string'&&who.sessionEpoch.length>0&&who.sessionEpoch.length<=160&&
    typeof who.authorityReceipt==='string'&&who.authorityReceipt.length>0,'FORMAL_OWNER_PROOF_INVALID',403);
    need(/^CL1_[a-f0-9]{64}_[a-f0-9]{64}$/.test(raw.leaseToken||''),'SERVER_ONLY_LEASE_REQUIRED',502);return who;}
  return Object.freeze({
    issue(context,body){shape(body,['employeeId']);const p=city(context);ownerScope(p,body.employeeId);db.prepare('DELETE FROM city_owner_challenges WHERE expires_at<=?').run(now());need(pilots.has(body.employeeId),'EMPLOYEE_PILOT_NOT_ALLOWED',403);
      const existing=db.prepare('SELECT * FROM city_employee_owners WHERE world_id=? AND employee_id=?').get(worldId,body.employeeId);
      need(!existing||existing.city_uid===p.userId,'EMPLOYEE_ALREADY_BOUND_OTHER_ROLE');
      const other=binding(p.userId);need(!other||other.employee_id===body.employeeId,'CITY_ROLE_ALREADY_BOUND_OTHER_EMPLOYEE');
      const count=db.prepare('SELECT COUNT(*) n FROM city_owner_challenges WHERE session_hash=? AND expires_at>? AND completed_fingerprint IS NULL').get(p.sessionHash,now()).n;
      need(count<4,'OWNER_CHALLENGE_RATE_LIMIT',429);
      const id=randomBytes(24).toString('base64url'),nonce=randomBytes(32).toString('base64url'),expiresAt=Math.min(now()+120000,CITY_OWNER_DEADLINE);
      db.prepare('INSERT INTO city_owner_challenges VALUES(?,?,?,?,?,?,?,?,NULL)').run(id,worldId,p.userId,p.sessionHash,p.userEpoch,body.employeeId,nonce,expiresAt);
      return {challengeId:id,nonceHash:sha(nonce),audience:CITY_OWNER_AUDIENCE,expiresAt,worldId};
    },
    async complete(context,body){shape(body,['challengeId','code']);need(/^[A-Za-z0-9_-]{24,100}$/.test(body.challengeId||'')&&/^CH1_[a-f0-9]{64}$/.test(body.code||''),'OWNER_HANDOFF_INVALID',400);
      const p=city(context),row=db.prepare('SELECT * FROM city_owner_challenges WHERE id=?').get(body.challengeId);sameCity(p,row);ownerScope(p,row.employee_id);
      need(row.expires_at>now(),'OWNER_CHALLENGE_EXPIRED');const fp=sha(body.code);need(!row.completed_fingerprint||row.completed_fingerprint===fp,'OWNER_CONFIRMATION_CONFLICT');
      const raw=await redeemHandoff({code:body.code,redemptionNonce:row.nonce,challengeId:row.id,worldId});
      const who=identity(raw,row),fresh=city(context);sameCity(fresh,row);need(row.expires_at>now()&&who.expiresAt>now(),'OWNER_CHALLENGE_EXPIRED');
      return tx(()=>{
        const current=db.prepare('SELECT * FROM city_owner_challenges WHERE id=?').get(row.id);sameCity(fresh,current);
        need(!current.completed_fingerprint||current.completed_fingerprint===fp,'OWNER_CONFIRMATION_CONFLICT');
        const byEmployee=db.prepare('SELECT * FROM city_employee_owners WHERE employee_id=? AND world_id=?').get(row.employee_id,worldId),byUid=binding(p.userId);
        need(!byEmployee||byEmployee.city_uid===p.userId,'EMPLOYEE_ALREADY_BOUND_OTHER_ROLE');need(!byUid||byUid.employee_id===row.employee_id,'CITY_ROLE_ALREADY_BOUND_OTHER_EMPLOYEE');
        const first=!byEmployee;
        db.prepare(`INSERT INTO city_employee_owners VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id,world_id)
          DO UPDATE SET authority_epoch=excluded.authority_epoch,authority_receipt=excluded.authority_receipt,
          lease_token=excluded.lease_token,expires_at=excluded.expires_at,updated_at=excluded.updated_at`).run(row.employee_id,worldId,p.userId,pilots.get(row.employee_id).store,who.sessionEpoch,who.authorityReceipt,raw.leaseToken,who.expiresAt,now(),now());
        db.prepare('UPDATE city_owner_challenges SET completed_fingerprint=? WHERE id=?').run(fp,row.id);
        if(first)onBound({employeeId:row.employee_id,cityUID:p.userId,preset:pilots.get(row.employee_id).preset,worldId});
        return safe(binding(p.userId));
      });
    },
    status(context){const p=city(context),row=binding(p.userId);if(row)ownerScope(p,row.employee_id);return row?safe(row):{bound:false,formalBusinessAccess:false};},
    async principal(context){const p=city(context),row=binding(p.userId);need(row,'EMPLOYEE_ROLE_NOT_BOUND',403);ownerScope(p,row.employee_id);const r=await validateLease({leaseToken:row.lease_token,worldId});
      const who=r?.identity;need(r?.status==='ok'&&r.schema==='city-employee-owner/v1'&&who?.source==='B_LOCKED_SESSION'&&who.active===true&&who.accountKind==='employee'&&
        who.employeeId===row.employee_id&&canonicalStore(who.store)===row.store&&who.sessionEpoch===row.authority_epoch&&who.worldId===worldId&&
        who.audience===CITY_OWNER_AUDIENCE&&Number.isSafeInteger(who.expiresAt)&&who.expiresAt>now(),'EMPLOYEE_REVERIFY_REQUIRED',401);
      need(city(context).sessionHash===p.sessionHash,'OWNER_CHALLENGE_SESSION_CHANGED',403);
      return {accountKind:'employee',active:true,employeeId:row.employee_id,store:row.store,sessionEpoch:who.sessionEpoch,expiresAt:who.expiresAt,cityUID:p.userId,worldId};
    },
    // Host-only accessor: never serialize this result to the browser.
    serverLease(context){const p=city(context),row=binding(p.userId);need(row,'EMPLOYEE_ROLE_NOT_BOUND',403);ownerScope(p,row.employee_id);return {leaseToken:row.lease_token,worldId};}
  });
}
