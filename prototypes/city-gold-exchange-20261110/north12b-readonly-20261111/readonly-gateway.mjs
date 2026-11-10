import {readOwnNorth12BGold} from './gold-read-contract.mjs';

// Server-only wiring. All three readers are required protected adapters, not
// caller-supplied identity/data. This factory installs no route and writes no DB.
export function createNorth12BReadonlyGateway({verifyOwner,readLedger,readMapping,now=Date.now}) {
  if([verifyOwner,readLedger,readMapping,now].some(f=>typeof f!=='function'))throw Error('READONLY_ADAPTERS_REQUIRED');
  const fingerprint=p=>JSON.stringify([p.source,p.accountKind,p.employeeId,p.store,p.sessionEpoch,p.worldId,p.cityUID,p.policyId]);
  const assertOwner=p=>{
    if(!p||p.source!=='B_LOCKED_SESSION'||p.accountKind!=='employee'||p.active!==true||
      !Number.isSafeInteger(p.expiresAt)||p.expiresAt<=now()||!p.sessionEpoch||!p.employeeId)
      throw Error('FORMAL_OWNER_REQUIRED');
    return p;
  };
  return Object.freeze({async read(context,body={}){
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)throw Error('READONLY_FIELDS_INVALID');
    const initial=assertOwner(await verifyOwner(context));
    const snapshot=await readLedger();
    const mapping=await readMapping();
    const first=readOwnNorth12BGold({identity:initial,ledger:snapshot,mapping,now:now()});
    // Read again after I/O; never use a result signed off before source changes
    // or caller revocation. Any uncertainty is a denial, never a partial result.
    const latest=await readLedger();
    const currentMapping=await readMapping();
    const final=assertOwner(await verifyOwner(context));
    if(fingerprint(initial)!==fingerprint(final))throw Error('OWNER_CHANGED_DURING_READ');
    const second=readOwnNorth12BGold({identity:final,ledger:latest,mapping:currentMapping,now:now()});
    if(JSON.stringify(first)!==JSON.stringify(second))throw Error('SOURCE_CHANGED_DURING_READ');
    return second;
  }});
}
