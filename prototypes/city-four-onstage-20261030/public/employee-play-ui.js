(function(root){'use strict';
 let config={},state=null,refs=null,busy=false;
 const guide='https://lian852456-dot.github.io/liamlu/city-play-guide.html?v=20261030-play-2';
 const make=(tag,label)=>{const n=document.createElement(tag);if(label)n.textContent=label;return n;};
 const message=e=>({PLAY_EMPLOYEE_FORMAT:'請輸入自己的 7 碼員編。',PLAY_EMPLOYEE_UNAVAILABLE:'此員編目前無法使用，請確認員編或洽主管。',PLAY_LINK_CONFLICT:'此員編或角色已有其他連結，請找主管核對，原進度未變更。',PLAY_ROLE_NOT_ELIGIBLE:'這個角色目前無法連結，請找主管核對原角色。',PLAY_SIGN_OUT_FIRST:'目前已登入另一個角色。請先保存原續玩卡並登出，再輸入本人員編。',PLAY_LOGIN_RATE_LIMIT:'登入次數較多，請稍等一分鐘再試。',PLAY_FORMAL_VERIFICATION_REQUIRED:'員編快速登入僅限遊戲；正式網站仍須本人驗證。',CSRF_DENIED:'登入狀態已更新，請重新整理後再試。',PREVIEW_EXPIRED:'臨時試玩入口已到期，請向主管索取後續入口。'}[e?.code||e?.message]||'目前無法完成，請恢復連線後再試；原角色與進度保留。');
 function help(){const a=make('a','查看簡單操作手冊 ↗');a.href=guide;a.target='_blank';a.rel='noopener';return a;}
 function field(id){const label=make('label','本人員編（7 碼）'),input=make('input');input.id=id;input.type='text';input.inputMode='numeric';input.autocomplete='off';input.maxLength=7;input.pattern='[0-9]{7}';input.placeholder='輸入自己的員編';input.required=true;label.append(input);return {label,input};}
 function render(){if(!refs)return;const signed=!!state?.profile?.id,linked=!!state?.playLink,quick=state?.playLogin?.mode==='employee-id-game-only';refs.login.hidden=signed;refs.link.hidden=!signed||linked;refs.connected.hidden=!signed||!linked;
  refs.connectedLabel.textContent=linked?'員編 '+state.playLink.employeeIdMasked+' 已連結此遊戲角色；換裝置仍可用同一員編登入。':'';
  for(const x of [refs.loginButton,refs.linkButton,refs.loginInput,refs.linkInput])x.disabled=busy;
  document.body.dataset.cityEmployeePlay=quick?'true':'false';document.body.dataset.cityPlaySigned=signed?'true':'false';
 }
 async function submit(kind){if(busy)return;const input=kind==='login'?refs.loginInput:refs.linkInput,employeeId=input.value.trim(),note=kind==='login'?refs.loginNote:refs.linkNote;if(!/^\d{7}$/.test(employeeId)){note.textContent='請輸入自己的 7 碼員編。';return;}
  busy=true;render();note.textContent=kind==='login'?'正在開啟你的遊戲…':'正在連結目前角色，保留所有進度…';
  try{const data=await config.api(kind==='login'?'play-login':'play-link',{employeeId});input.value='';await config.onRestored(data);note.textContent='已進入你的遊戲角色。';config.onMessage?.(kind==='login'?'已用員編登入，歡迎來到小城。':'員編已連結，下次換裝置也可直接輸入員編登入遊戲。');}
  catch(e){note.textContent=message(e);}finally{busy=false;render();}
 }
 function init(options={}){config=options;if(refs)return;const login=make('section');login.className='employee-play-card';const title=make('h3','請輸入你的員編'),intro=make('p','本區同仁輸入本人 7 碼員編，即可開始玩。');
  const loginForm=make('form'),lf=field('employee-play-login-id'),loginButton=make('button','登入我的遊戲角色');loginButton.type='submit';loginButton.className='primary';const loginNote=make('p');loginNote.setAttribute('role','status');
  loginForm.append(lf.label,loginButton);const first=make('p','已連結會讀回原進度；第一次使用會建立遊戲角色。已有舊訪客進度，可用下方「舊角色備援」找回；若角色不同，請洽主管核對。');first.className='small';login.append(title,intro,loginForm,loginNote,first,help());document.querySelector('#login-area')?.prepend(login);
  const link=make('section');link.className='employee-play-card';const form=make('form'),sf=field('employee-play-link-id'),linkButton=make('button','連結這個角色與我的員編');linkButton.type='submit';linkButton.className='primary';const linkNote=make('p');linkNote.setAttribute('role','status');form.append(sf.label,linkButton);link.append(make('h3','設定員編登入（保留這個角色）'),make('p','先核對目前角色名字與金幣，再填自己的員編。連結後換裝置也能讀取相同進度。'),form,linkNote,make('p','連結後，知道員編的人可能開啟此遊戲角色。這只適用於遊戲，不授予正式網站權限。'));
  const connected=make('section');connected.className='employee-play-card';const connectedLabel=make('p');connected.append(connectedLabel,make('p','員編登入只用於遊戲。KPI、台獎、回報與正式金牌仍須原網站本人驗證。'),help());document.querySelector('#player-area')?.prepend(link,connected);
  const warning=make('p','請只輸入自己的員編。知道員編的人可能開啟該遊戲角色；員編不會授予正式網站權限。');warning.className='small';login.append(warning);
  const oldForm=document.querySelector('#login-form');if(oldForm){const details=make('details'),summary=make('summary','舊角色備援：使用原續玩卡');details.className='employee-play-backup';oldForm.before(details);details.append(summary,oldForm);}
  const manual=help();manual.className='employee-play-manual';document.querySelector('#journal')?.querySelector('h2')?.after(manual);
  refs={login,link,connected,connectedLabel,loginInput:lf.input,linkInput:sf.input,loginButton,linkButton,loginNote,linkNote};loginForm.addEventListener('submit',e=>{e.preventDefault();void submit('login');});form.addEventListener('submit',e=>{e.preventDefault();void submit('link');});render();
 }
 root.CityEmployeePlay=Object.freeze({init,setState(data){state=data;render();}});
})(window);
