(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.CityGuestResume=api;})(typeof window==='undefined'?null:window,function(root){'use strict';
 function parseRecoveryFile(text,size=0){if(size>2048||typeof text!=='string'||text.length>2048)throw Error('CARD_FILE_TOO_LARGE');const card=text.replace(/^\uFEFF/,'').trim();if(!/^[A-Za-z0-9_-]{12,119}$/.test(card))throw Error('CARD_FILE_INVALID');return card;}
 if(!root)return{parseRecoveryFile};
 let config={},state=null,status={available:false},supported=false,busy=false,probePromise=null,refs=null;
 const make=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const errorText=e=>({CARD_FILE_TOO_LARGE:'卡片檔案太大，請選擇原本下載的文字續玩卡。',CARD_FILE_INVALID:'這不是有效的續玩卡文字檔，請選擇原下載檔或手動輸入。',DEVICE_DIFFERENT_OWNER:'這個裝置記住了另一個角色，請先忘記此裝置再重新選擇。',DEVICE_RECOVERY_EXPIRED:'此裝置續玩已到期或失效，請匯入原續玩卡。',DEVICE_CHALLENGE_EXPIRED:'續玩確認已到期，請再按一次。',DEVICE_LIMIT_REACHED:'此角色已記住多個裝置，請先保留續玩卡。',LOGIN_RATE_LIMIT:'嘗試次數較多，請稍後再試。',SESSION_EXPIRED:'登入已到期，請按一鍵續玩或匯入原卡。'}[e?.code||e?.message]||'目前無法完成，請恢復連線後再試；原進度仍保留。');
 function note(text){if(refs)refs.note.textContent=text;config.onMessage?.(text);}
 function render(){if(!refs)return;const guest=state?.access?.accountKind==='guest';refs.login.hidden=!!state?.profile?.id;refs.resume.hidden=!!state?.profile?.id||!status.available;refs.remember.hidden=!guest||!supported||status.available;refs.forget.hidden=!guest||!supported||!status.available;refs.signed.hidden=!guest;for(const b of [refs.resume,refs.remember,refs.forget,refs.reconnect])b.disabled=busy;}
 async function probe(){if(probePromise)return probePromise;probePromise=(async()=>{try{status=await config.api('device/status');supported=true;}catch(e){if(e.status===404){supported=false;status={available:false};}}finally{probePromise=null;render();}return status;})();return probePromise;}
 async function run(action){if(busy)return;busy=true;render();try{await action();}catch(e){note(errorText(e));if(e.code==='DEVICE_RECOVERY_EXPIRED')await probe();}finally{busy=false;render();}}
 function init(options={}){config=options;if(refs)return;const login=make('section'),signed=make('section');login.className=signed.className='city-device-continuation';
  const title=make('strong','繼續原本的角色'),resume=make('button','一鍵續玩我的角色');resume.type='button';resume.className='primary';resume.dataset.guestResume='';
  const importer=make('label','匯入已下載的續玩卡'),file=make('input');file.type='file';file.accept='.txt,text/plain';file.dataset.guestCardImport='';importer.className='city-card-import';importer.append(file);
  const help=make('p','同一裝置已記住角色時可一鍵續玩；換裝置可選擇原下載的文字卡片，再按「讀取我的進度」。');help.className='small';login.append(title,resume,importer,help);document.querySelector('#login-area')?.prepend(login);
  const remember=make('button','在此裝置記住我的角色'),forget=make('button','忘記此裝置的續玩'),reconnect=make('button','恢復連線');for(const b of [remember,forget,reconnect]){b.type='button';b.className='text-button';}remember.dataset.guestRemember='';forget.dataset.guestForget='';reconnect.dataset.guestReconnect='';
  const description=make('p','只在自己的裝置使用。以受保護 Cookie 記住此遊戲角色，不會記住正式員工網站密碼；登出會一併忘記。'),message=make('p');description.className='small';message.className='small';message.setAttribute('role','status');signed.append(remember,forget,reconnect,description,message);document.querySelector('#guest-card-open')?.after(signed);
  refs={login,signed,resume,remember,forget,reconnect,note:message};
  remember.onclick=()=>run(async()=>{const result=await config.api('device/remember',{});await probe();const date=new Intl.DateTimeFormat('zh-TW',{month:'numeric',day:'numeric',timeZone:'Asia/Taipei'}).format(new Date(result.expiresAt));note('此裝置已記住角色，最晚可續玩至 '+date+'；原續玩卡仍可使用。');});
  forget.onclick=()=>run(async()=>{await config.api('device/forget',{});await probe();note('已忘記此裝置的續玩；目前進度保留，原續玩卡仍可使用。');});
  reconnect.onclick=()=>run(async()=>{await config.reconnect?.();note('已重新確認連線；若登入到期，請使用一鍵續玩或原卡。');});
  resume.onclick=()=>run(async()=>{const proof=await probe();if(!proof.available)throw{code:'DEVICE_RECOVERY_EXPIRED'};const fresh=await config.api('device/restore',{challenge:proof.challenge});await config.onRestored(fresh);note('已讀回原本角色與進度。');});
  file.onchange=async()=>{const selected=file.files?.[0];if(!selected)return;try{if(selected.size>2048)throw Error('CARD_FILE_TOO_LARGE');const card=parseRecoveryFile(await selected.text(),selected.size),input=document.querySelector('#login-code');if(!input)throw Error('CARD_FILE_INVALID');input.value=card;input.dispatchEvent(new Event('input',{bubbles:true}));config.onMessage?.('卡片已匯入，請按「讀取我的進度」；未另外保存卡片內容。');}catch(e){config.onMessage?.(errorText(e));}finally{file.value='';}};
  render();probe();
 }
 return{parseRecoveryFile,init,setState(next){state=next||null;render();},onSessionInvalid(){state=null;probe();},refresh:probe};
});
