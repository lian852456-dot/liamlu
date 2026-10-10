const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const helper=import(pathToFileURL(path.resolve(__dirname,'../tradein-clipboard.mjs')));
function documentFor(result){
  const state={removed:0,restored:0,copied:null};
  const doc={activeElement:{isConnected:true,focus(){state.restored++;}},
    body:{appendChild(field){state.field=field;}},
    createElement(){return {style:{},setAttribute(){},focus(){},select(){},setSelectionRange(){},remove(){state.removed++;}};},
    execCommand(){state.copied=state.field.value;if(result instanceof Error)throw result;return result;}};
  return {doc,state};
}
test('a synchronous copy preserves the exact filtered text without starting the stalled API',async()=>{
  const {copyReminderText}=await helper,{doc,state}=documentFor(true);
  const text='酒泉 · 回收 1 筆、2 筆\n測＊甲：i17P 256G';let calls=0;
  await copyReminderText(text,{document:doc,navigator:{clipboard:{writeText(){calls++;return new Promise(()=>{});}}}});
  assert.equal(state.copied,text);assert.equal(calls,0);assert.equal(state.removed,1);assert.equal(state.restored,1);
});
test('when synchronous copy is unavailable the standard API receives the same text',async()=>{
  const {copyReminderText}=await helper,{doc,state}=documentFor(false);let copied;
  await copyReminderText('filtered reminder',{document:doc,navigator:{clipboard:{async writeText(text){copied=text;}}}});
  assert.equal(copied,'filtered reminder');assert.equal(state.removed,1);
});
test('a permanently pending standard request rejects within the bound for manual recovery',async()=>{
  const {copyReminderText}=await helper,{doc,state}=documentFor(false);
  await assert.rejects(copyReminderText('reminder',{document:doc,navigator:{clipboard:{writeText:()=>new Promise(()=>{})}},timeoutMs:10}),/複製逾時/);
  assert.equal(state.removed,1);assert.equal(state.restored,1);
});
test('copy restrictions and unavailable APIs reject after cleaning up the temporary field',async()=>{
  const {copyReminderText}=await helper,{doc,state}=documentFor(new Error('denied'));
  await assert.rejects(copyReminderText('reminder',{document:doc,navigator:{}}),/未提供/);
  assert.equal(state.removed,1);assert.equal(state.restored,1);
});
test('standard API rejection remains an error rather than reporting a false success',async()=>{
  const {copyReminderText}=await helper,{doc}=documentFor(false);
  await assert.rejects(copyReminderText('reminder',{document:doc,navigator:{clipboard:{async writeText(){throw new Error('permission denied');}}}}),/permission denied/);
});
