// Independent candidate: imported by read-only preview and synthetic QA only.
export const products=Object.freeze([
 {id:'pet-cat-a-v1',name:'A 款小貓',category:'pet',kind:'cat',coins:60,gold:0,variants:[{id:'orange-white',name:'橘白'},{id:'tabby',name:'虎斑'},{id:'black-white',name:'黑白'},{id:'gray-white',name:'灰白'}]},
 {id:'pet-dog-a-v1',name:'A 款小狗',category:'pet',kind:'dog',coins:75,gold:0,variants:[{id:'cream',name:'奶油'},{id:'brown-white',name:'棕白'},{id:'black-white',name:'黑白'},{id:'dark-brown',name:'深棕'}]}
].map(p=>Object.freeze({...p,variants:Object.freeze(p.variants.map(Object.freeze))})));
export const catalog=Object.freeze({scope:'isolated-candidate-only',currency:'game-coins',priceStatus:'CONFIRMED',purchaseEnabled:false,upgradePolicy:'PENDING_USER_DECISION',legacyItemsUnchanged:['pet-cat','pet-dog'],products,formalGoldEnabled:false,autoChargeExistingOwners:false});
export function validateSelection(itemId,variant){const product=products.find(p=>p.id===itemId);if(!product||!product.variants.some(v=>v.id===variant))throw Object.assign(new Error('INVALID_PET_VARIANT'),{code:'INVALID_PET_VARIANT',status:400});return product;}
