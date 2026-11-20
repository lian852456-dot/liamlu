(function(global,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(null);
  else global.GuestAccess=factory(global);
})(typeof globalThis==='object'?globalThis:this,function(global){
  'use strict';
  const VERSION='guest-registration-v1';
  const STORAGE_KEY='city-v43-guest-pending-registration-v1';
  const CARD_MASK='••••••••••••';
  const KNOWN_PLAYER_KEY='city-v43-known-game-player-v1';
  function canStartAutomatically({sessionErrorCode,knownPlayerId,signedIn}={}){return sessionErrorCode==='AUTH_REQUIRED'&&!knownPlayerId&&!signedIn;}
  const hex=value=>Number(value).toString(16).padStart(2,'0');
  function normalizeNickname(value){
    const text=String(value??'').normalize('NFKC').trim();
    if(!text||Array.from(text).length>12||/[<>\u0000-\u001f\u007f]/.test(text))return '';
    return text;
  }
  function validRegistrationKey(value){return typeof value==='string'&&/^[a-f0-9]{48}$/.test(value);}
  function makeRegistrationKey(getRandomValues){
    const fill=getRandomValues||(global?.crypto?.getRandomValues?.bind(global.crypto));
    if(typeof fill!=='function')throw new Error('CRYPTO_REQUIRED');
    const bytes=new Uint8Array(24);fill(bytes);return Array.from(bytes,hex).join('');
  }
  function pendingPayload(nickname,registrationKey){
    const name=normalizeNickname(nickname);
    return name&&validRegistrationKey(registrationKey)?{nickname:name,registrationKey}:null;
  }
  function maskCard(card){return typeof card==='string'&&card?CARD_MASK:'';}
  function readPending(storage){
    try{const raw=storage?.getItem(STORAGE_KEY);if(!raw)return null;const value=JSON.parse(raw);return pendingPayload(value?.nickname,value?.registrationKey);}catch{return null;}
  }
  function savePending(storage,payload){try{storage?.setItem(STORAGE_KEY,JSON.stringify(payload));return true;}catch{return false;}}
  function clearPending(storage){try{storage?.removeItem(STORAGE_KEY);}catch{}}
  function viewPolicy(access){
    const guest=access?.accountKind==='guest';
    if(guest)return {guest:true,businessBuildings:false,businessTasks:false,editStores:false,showFormalLinks:false};
    return {guest:false,businessBuildings:access?.businessBuildings!==false,businessTasks:access?.businessTasks!==false,editStores:access?.editStores!==false,showFormalLinks:access?.businessBuildings!==false};
  }
  const pure={VERSION,STORAGE_KEY,normalizeNickname,validRegistrationKey,makeRegistrationKey,pendingPayload,maskCard,readPending,viewPolicy,canStartAutomatically,KNOWN_PLAYER_KEY};
  if(!global)return pure;

  let config={},state=null,available=null,busy=false,recoveryCard=null,refs=null,cardDialog=null;
  const storage=()=>{try{return config.storage||global.sessionStorage;}catch{return null;}};
  const identityStorage=()=>{try{return config.identityStorage||global.localStorage;}catch{return null;}};
  const knownPlayer=()=>{try{return identityStorage()?.getItem(KNOWN_PLAYER_KEY)||'';}catch{return '';}};
  const rootElement=()=>typeof config.root==='string'?document.querySelector(config.root):config.root||document.querySelector('#guest-access');
  const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  function message(text){config.onMessage?.(text);}
  function mapError(code){return({GUEST_REGISTRATION_CONFLICT:'這個訪客註冊請求已使用；請保留原卡或重新開始。',GUEST_REGISTRATION_RATE_LIMIT:'訪客註冊請稍後再試。',ALREADY_SIGNED_IN:'目前已登入，請先登出再建立訪客。',GUEST_INTERNAL_BUILDING_DENIED:'訪客只能探索街區，不能進入業務功能大樓。',GUEST_INTERNAL_ACCESS_DENIED:'訪客不能使用內部業務示範。',GUEST_STORE_READ_ONLY:'訪客可參觀門市布置，不能修改店裝。'}[code]||code||'訪客註冊暫時失敗，請稍後再試。');}
  function ensure(){
    const host=rootElement();if(!host)return null;
    if(refs?.host===host)return refs;
    host.replaceChildren();
    const title=make('strong','建立訪客角色');title.id='guest-access-title';
    const intro=make('p','只需輸入名字即可開始探索小城：可逛九家門市、購物換裝，也能和主管與同伴互動。進度保存在此小城，請保存續玩卡；可在自己的裝置按「記住我的角色」，到期後一鍵續玩；換裝置也能匯入原卡讀取。首次建立送 100 金幣，僅限遊戲使用且只發一次。');intro.className='small';
    const form=make('form');form.className='guest-access-form';
    const label=make('label','角色名字');const input=make('input');input.type='text';input.maxLength=24;input.autocomplete='nickname';input.placeholder='輸入 1 至 12 字';label.append(input);
    const button=make('button','建立訪客角色');button.type='submit';button.className='primary';
    const status=make('p');status.className='guest-access-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    form.append(label,button);host.append(title,intro,form,status);
    const cardButton=document.querySelector('#guest-card-open');
    if(cardButton)cardButton.addEventListener('click',async()=>{try{if(!recoveryCard){const data=await config.getRecoveryCard?.();recoveryCard=data?.card||null;}if(recoveryCard)showRecoveryCard(recoveryCard);else message('續玩卡暫時無法讀取，請稍後再試。');}catch{message('續玩卡讀取失敗，請保留原卡並稍後再試。');}});
    refs={host,title,intro,form,input,button,status,cardButton};
    form.addEventListener('submit',event=>{event.preventDefault();register();});
    const pending=readPending(storage());if(pending)input.value=pending.nickname;
    render();return refs;
  }
  function render(){
    if(!refs)return;
    const signed=!!state?.profile?.id;
    refs.host.hidden=signed||available===false;
    refs.button.disabled=busy||available!==true;
    refs.input.disabled=busy;
    if(refs.cardButton)refs.cardButton.hidden=!(state?.access?.accountKind==='guest');
    if(available===false&&!signed)refs.status.textContent='目前裝置尚未開放訪客入口。';
    if(available===null&&!signed)refs.status.textContent='正在確認訪客入口…';
  }
  async function probe(){
    ensure();
    try{
      const response=await fetch('/api/access',{credentials:'same-origin',cache:'no-store'}),data=await response.json();
      available=response.ok&&data?.guestRegistration===true;render();
      if(available===true&&!busy)refs.status.textContent='';
      if(!available&&response.ok)refs.status.textContent='目前裝置尚未開放訪客入口。';
      return available;
    }catch{available=false;render();return false;}
  }
  function showRecoveryCard(card,{afterClose=false}={}){
    if(typeof card!=='string'||!card)return;
    recoveryCard=card;
    if(!cardDialog){
      cardDialog=document.createElement('dialog');cardDialog.className='guest-access-card-dialog';cardDialog.setAttribute('aria-labelledby','guest-card-title');
      const close=make('button','×');close.className='close';close.type='button';close.setAttribute('aria-label','關閉續玩卡');close.onclick=()=>cardDialog.close();
      const title=make('h2','訪客角色已建立');title.id='guest-card-title';
      const intro=make('p','進度保存在此小城。可在自己的裝置記住角色；換裝置時匯入這張下載卡，或沿用複製貼上。卡片只用於這個遊戲。');
      const code=make('code');code.className='guest-access-card-value';
      const note=make('p','續玩卡預設遮住，避免截圖或旁人看見。關閉後請自行保存；本次分頁仍可從手帳重新開啟，不要貼到公開聊天。');note.className='small';
      const actions=make('div');actions.className='guest-access-card-actions';
      const reveal=make('button','顯示卡片');reveal.type='button';const copy=make('button','複製');copy.type='button';const download=make('button','下載');download.type='button';
      let revealed=false;const paint=()=>{code.textContent=revealed?recoveryCard:maskCard(recoveryCard);reveal.textContent=revealed?'遮住卡片':'顯示卡片';};
      reveal.onclick=()=>{revealed=!revealed;paint();};
      copy.onclick=async()=>{try{await navigator.clipboard.writeText(recoveryCard);message('續玩卡已複製，請放在安全的地方。');}catch{message('瀏覽器不允許複製，請先顯示卡片後手動保存。');}};
      download.onclick=()=>{const blob=new Blob([recoveryCard+'\n'],{type:'text/plain'}),url=URL.createObjectURL(blob),link=make('a');link.href=url;link.download='city-guest-recovery-card.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);message('已準備下載續玩卡，請確認瀏覽器下載提示。');};
      actions.append(reveal,copy,download);cardDialog.append(close,title,intro,code,note,actions);document.body.append(cardDialog);cardDialog.addEventListener('close',()=>{revealed=false;code.textContent=maskCard(recoveryCard);if(cardDialog.dataset.afterClose==='true'){cardDialog.dataset.afterClose='false';config.onRecoveryCardClosed?.();}});
    }
    cardDialog.dataset.afterClose=afterClose?'true':'false';const code=cardDialog.querySelector('.guest-access-card-value');if(code)code.textContent=maskCard(card);if(!cardDialog.open)cardDialog.showModal();
  }
  async function register({automatic=false}={}){
    if(busy)return;
    if(state?.profile?.id){message(mapError('ALREADY_SIGNED_IN'));return;}
    ensure();if(available!==true&&!(await probe()))return;
    const pending=readPending(storage());
    const key=makeRegistrationKey();
    const payload=pending||pendingPayload(automatic?'街區旅人'+key.slice(0,4):refs.input.value,key);
    if(!payload){refs.status.textContent='請輸入 1 至 12 字的角色名字。';return;}
    if(pending)refs.input.value=pending.nickname;
    busy=true;render();refs.status.textContent='正在建立訪客角色…';
    try{
      if(!pending)savePending(storage(),payload);
      const response=await fetch('/api/guest',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){const error=new Error(mapError(data?.error));error.code=data?.error;error.status=response.status;throw error;}
      clearPending(storage());recoveryCard=data?.guestRecovery?.card||null;state=data;render();refs.status.textContent='訪客角色已建立。';
      await config.onRegistered?.(data,{automatic});
      if(recoveryCard&&!automatic)showRecoveryCard(recoveryCard,{afterClose:true});
      if(automatic)message('已用訪客身分進入；可在生活手帳改名、換裝並保存續玩卡。');
      return data;
    }catch(error){refs.status.textContent=error.message||mapError(error.code);config.onError?.(error);}
    finally{busy=false;render();}
  }
  async function startAutomatic({sessionErrorCode}={}){if(!canStartAutomatically({sessionErrorCode,knownPlayerId:knownPlayer(),signedIn:!!state?.profile?.id}))return null;return register({automatic:true});}
  function setState(next){state=next||null;if(next?.profile?.id){try{identityStorage()?.setItem(KNOWN_PLAYER_KEY,next.profile.id);}catch{}}if(next?.guestRecovery?.card)recoveryCard=next.guestRecovery.card;render();}
  function clear(){state=null;recoveryCard=null;if(cardDialog)cardDialog.dataset.afterClose='false';if(cardDialog?.open)cardDialog.close();const code=cardDialog?.querySelector('.guest-access-card-value');if(code)code.textContent=maskCard('card');render();}
  function init(options={}){config={...options};ensure();probe();}
  return {...pure,init,setState,clear,probe,startAutomatic,showRecoveryCard,getState:()=>state,getRecoveryCard:()=>recoveryCard};
});
