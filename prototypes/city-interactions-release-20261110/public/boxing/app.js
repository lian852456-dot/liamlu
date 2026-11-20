(() => {
  'use strict';

  const cityMode=true;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const app = {
    self: null,
    room: null,
    roomId: '',
    mode: 'honor',
    stake: 5,
    serverOffset: 0,
    stateTimer: null,
    clockTimer: null,
    heartbeatTimer: null,
    lastSeq: 0,
    requestCounter: 0,
    log: [],
    tabId: makeId('tab'),
  };

  const actionNames = { punch: '直拳', hook:'勾拳', guard: '防守', dodge: '閃躲', retreat:'後撤' };
  const presenceNames = { online: '本人在線', reconnecting: '重連中', offline: '離線巡走' };
  const errorNames = {
    NICKNAME_REQUIRED: '請先輸入暱稱。',
    ROOM_NOT_FOUND: '找不到這個房間，請確認邀請碼。',
    ROOM_NOT_ACTIVE: '房間尚未開始，等第二位玩家接受邀請。',
    ROOM_FULL: '這個房間已經有兩位玩家。',
    ALREADY_JOINED: '你已經在這個房間裡。',
    NOT_ROOM_PLAYER: '你不是這個房間的玩家。',
    ACCEPT_NOT_ALLOWED: '只有第二位玩家可以接受邀請。',
    ACTION_NOT_ALLOWED: '目前還不能出拳，請等拳台開賽。',
    REQUEST_ID_INVALID: '這次操作識別碼無效，請再試一次。',
    RATE_LIMIT: '操作太快了，請稍等一下。',
    COOLDOWN: '招式正在恢復，稍等一下再出手。',
    STALE_ACTION: '這個動作已處理，請繼續下一招。',
    MATCH_NOT_ACTIVE: '比賽尚未開始或已經結束。',
    NOT_FIGHTER: '只有房間內的兩位玩家可以操作。',
    PLAYER_OFFLINE: '正在重新連線，連線恢復後再出手。',
    PLAYERS_NOT_READY: '等待雙方連線就緒，稍後再接受。',
    ONLY_OPPONENT_ACCEPTS: '請由收到邀請的第二位玩家接受。',
    ALREADY_IN_MATCH: '你已有房間，請先完成或取消原本對戰。',
    STAKE_LIMIT: '押注不得超過目前合成幣的10%，請降低金額。',
    INTERRUPTION_COOLDOWN: '近期中斷次數較多，請稍候10分鐘再挑戰。',
    SESSION_REQUIRED: '本頁試玩已到期，請重新整理後輸入暱稱。',
    PREVIEW_CAPACITY: '試玩名額暫滿，請稍後再試。',
    INVALID_NAME: '請使用1到12字的暱稱。',
  };

  function makeId(prefix) {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function text(value, fallback = '') {
    return value == null ? fallback : String(value);
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function timestamp(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)) return Number(value);
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function serverNow() {
    return Date.now() + app.serverOffset;
  }

  function idOf(player) {
    return typeof player === 'string' ? player : text(player?.id);
  }

  function currentNickname() {
    return text($('#nickname')?.value).trim().slice(0, 12);
  }

  async function api(path, options = {}) {
    if(cityMode&&!path.startsWith('/api/boxing/'))path=path.replace('/api/','/api/boxing/');
    const config = { credentials: 'same-origin', ...options, headers: { ...(options.headers || {}),...(cityMode&&app.csrf?{'x-city-csrf':app.csrf}:{}) } };
    if (options.body !== undefined) {
      config.headers['content-type'] = 'application/json';
      config.body = JSON.stringify(options.body);
    }
    const response = await fetch(path, config);
    let data = null;
    try { data = await response.json(); } catch (_) { /* Friendly fallback below. */ }
    if (!response.ok) {
      const error = data?.error || data?.code || `HTTP_${response.status}`;
      throw Object.assign(new Error(error), { code: error, status: response.status });
    }
    return data || {};
  }

  function friendlyError(error) {
    const code = text(error?.code || error?.message);
    return errorNames[code] || (code.startsWith('HTTP_') ? '服務暫時沒有回應，請稍後再試。' : `操作未完成：${code || '未知錯誤'}`);
  }

  function notice(message, kind = '') {
    const node = $('#notice');
    if (!node) return;
    node.textContent = message;
    node.className = `notice${kind ? ` ${kind}` : ''}`;
  }

  function log(message, important = false) {
    app.log.unshift({ message, important });
    app.log = app.log.slice(0, 12);
    const node = $('#roundLog');
    if (!node) return;
    node.innerHTML = app.log.map(item => `<span class="log-line${item.important ? ' important' : ''}">${escapeHtml(item.message)}</span>`).join('');
  }

  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
  }

  function applyState(payload) {
    const nextRoom = payload?.room || payload?.state?.room;
    const nextSelf = payload?.self || payload?.state?.self;
    if (nextSelf) app.self = nextSelf;
    if (nextRoom) {
      const previousStatus = app.room?.status;
      if(app.roomId !== nextRoom.id) app.lastSeq = 0;
      app.room = nextRoom;
      app.roomId = text(nextRoom.id || app.roomId);
      if (previousStatus && previousStatus !== nextRoom.status) log(`房間狀態：${statusLabel(nextRoom.status)}`, true);
      const own = ownFighter();
      if (own) app.lastSeq = Math.max(app.lastSeq, number(own.seq));
    }
    if (payload?.serverNow != null) {
      const serverTimestamp = timestamp(payload.serverNow);
      if (serverTimestamp) app.serverOffset = serverTimestamp - Date.now();
    }
    updateUrl();
    renderAll();
  }

  function statusLabel(status) {
    return ({ invited: '等待接受', active: '進行中', settled: '已結算', cancelled: '已取消' }[status] || '等待房間');
  }

  function roomModeLabel() {
    if (app.room?.mode === 'synthetic' || app.mode === 'synthetic') return `測試練習 · ${number(app.room?.stake, app.stake)} 合成幣（100 合成幣測試）`;
    return '榮譽對戰 · 不押注';
  }

  function fighterById(id) {
    return (Array.isArray(app.room?.fighters) ? app.room.fighters : []).find(fighter => idOf(fighter) === id) || null;
  }

  function ownFighter() {
    return fighterById(idOf(app.self));
  }

  function slotFighter(slot) {
    const room = app.room || {};
    const player = slot === 0 ? room.a : room.b;
    const playerId = idOf(player);
    const fighter = playerId ? fighterById(playerId) : null;
    if (fighter) return fighter;
    if (playerId) return typeof player === 'object' ? player : { id: playerId, name: '對手', presence: 'reconnecting', score: 0, seq: 0 };
    return { id: `npc-${slot}`, name: '巡走 NPC', presence: 'offline', score: 0, seq: 0, action: null, actionAt: 0, isNpc: true };
  }

  function isNpc(fighter) {
    return Boolean(fighter?.isNpc || /^npc(?:-|$)/i.test(idOf(fighter)) || text(fighter?.kind).toLowerCase() === 'npc');
  }

  function displayName(fighter) {
    return isNpc(fighter) ? '巡走 NPC' : text(fighter?.name, '等待玩家');
  }

  function presenceInfo(fighter) {
    if (isNpc(fighter)) return { className: 'gray', label: '離線巡走 · 非真人' };
    const state = ['online', 'reconnecting', 'offline'].includes(fighter?.presence) ? fighter.presence : 'offline';
    return { className: state === 'online' ? 'green' : state === 'reconnecting' ? 'yellow' : 'gray', label: presenceNames[state] };
  }

  function renderScoreboard() {
    const node = $('#scoreboard');
    if (!node) return;
    node.innerHTML = [slotFighter(0), slotFighter(1)].map((fighter, index) => {
      const presence = presenceInfo(fighter);
      const self = idOf(fighter) && idOf(fighter) === idOf(app.self);
      const action = actionNames[fighter?.action] || '準備中';
      const result=app.room?.result, effect=result?.winner&&serverNow()<timestamp(result.expiresAt)?(result.winner===idOf(fighter)?'🏆':'⭐'):'';
      return `<div class="fighter-card${self ? ' self' : ''}">
        <div class="fighter-top"><span class="fighter-meta">${index === 0 ? 'A 方' : 'B 方'}${self ? ' · 你' : ''}</span><span class="presence-label"><i class="status-dot ${presence.className}"></i>${escapeHtml(presence.label)}</span></div>
        <div class="fighter-name-line"><span class="fighter-name">${escapeHtml(displayName(fighter))}<span class="fighter-effect">${effect}</span></span><strong class="fighter-score">${number(fighter?.score)}</strong></div>
        <div class="fighter-meta">${escapeHtml(action)}</div>
      </div>`;
    }).join('');
  }

  function canAccept() {
    return app.room?.status === 'invited' && idOf(app.room?.b) === idOf(app.self);
  }

  function canAct() {
    const own = ownFighter();
    const now = serverNow();
    const start = timestamp(app.room?.startAt);
    const end = timestamp(app.room?.endAt);
    return Boolean(app.room?.status === 'active' && own && !isNpc(own) && own.presence === 'online' && (!start || now >= start) && (!end || now <= end));
  }

  function renderAll() {
    const hasRoom = Boolean(app.room);
    $('#arenaCard').hidden = !hasRoom;
    $('#invitePanel').hidden = !hasRoom;
    if (!hasRoom) return;

    $('#roomCode').textContent = text(app.room.id, '—');
    $('#roomModeLabel').textContent = roomModeLabel();
    $('#roomState').textContent = statusLabel(app.room.status);
    const accept = $('#acceptBtn');
    accept.hidden = !canAccept();
    const cancel = $('#cancelBtn');
    cancel.hidden = !['invited', 'active'].includes(app.room.status) || ![idOf(app.room?.a),idOf(app.room?.b)].includes(idOf(app.self));
    const inviteStatus = $('#inviteStatus');
    if (app.room.status === 'invited') {
      inviteStatus.textContent = canAccept() ? '你是第二位玩家；接受後開始 3 秒倒數。' : (app.room.b ? '第二位玩家已加入，等待對方接受。' : '等待第二位玩家加入。');
    } else if (app.room.status === 'active') {
      inviteStatus.textContent = '拳台進行中；畫面每 700ms 更新一次連線狀態。';
    } else if (app.room.status === 'settled') {
      inviteStatus.textContent = '這一局已由裁判結算。';
    } else {
      inviteStatus.textContent = '這個房間已取消。';
    }
    renderScoreboard();
    renderActions();
    renderResult();
    updateClock();
  }

  function renderActions() {
    const enabled = canAct();
    $$('#actionButtons [data-kind]').forEach(button => { button.disabled = !enabled; });
    const hint = $('#actionHint');
    if (!enabled) {
      hint.textContent = app.room?.status === 'active' ? '目前不是可操作狀態；離線巡走角色不能出拳。' : '開賽後即可操作，輸贏由裁判判定。';
    } else {
      hint.textContent = '觸控按鈕或鍵盤 J／K／L；抓準時機，防守減少失分，閃躲避開攻擊。';
    }
  }

  function renderResult() {
    const node = $('#resultBanner');
    if (!node || app.room?.status !== 'settled' || !app.room.result) { if (node) node.hidden = true; return; }
    const expiry = timestamp(app.room.result.expiresAt);
    if (expiry && serverNow() >= expiry) {
      node.hidden = false;
      node.textContent = '這局結果展示已過期；結算紀錄由裁判保留。';
      return;
    }
    const winner = app.room.result.winner;
    const winnerId = idOf(winner);
    const selfWon = winnerId && winnerId === idOf(app.self);
    const label = winner == null ? '平手' : selfWon ? '你贏了 · 🏆' : (winnerId ? '對手勝出 · ⭐' : '本局已結算');
    node.hidden = false;
    node.textContent = label;
  }

  function updateClock() {
    if (!app.room) return;
    const now = serverNow();
    const start = timestamp(app.room.startAt);
    const end = timestamp(app.room.endAt);
    const timer = $('#timer');
    const countdown = $('#countdown');
    if (app.room.status === 'invited') {
      timer.textContent = '等待';
      countdown.hidden = true;
    } else if (app.room.status === 'active' && start && now < start) {
      const seconds = Math.max(1, Math.ceil((start - now) / 1000));
      timer.textContent = `${seconds}s`;
      countdown.hidden = false;
      countdown.textContent = seconds;
    } else if (app.room.status === 'active' && end) {
      const seconds = Math.max(0, Math.ceil((end - now) / 1000));
      timer.textContent = `${seconds}s`;
      countdown.hidden = true;
      if (seconds === 0) countdown.hidden = true;
    } else {
      timer.textContent = app.room.status === 'settled' ? '完局' : '—';
      countdown.hidden = true;
    }
    const dot = $('#connectionDot');
    const own = ownFighter();
    const presence = presenceInfo(own || { presence: 'offline' });
    dot.className = `status-dot ${presence.className}`;
    $('#serverPulse').textContent = `連線更新 · ${new Date(now).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    renderResult();
    if(app.room?.result&&now>=timestamp(app.room.result.expiresAt))document.querySelectorAll('.fighter-effect').forEach(e=>e.textContent='');
  }

  function updateUrl() {
    if (!app.roomId || !history.replaceState) return;
    history.replaceState(null, '', `${location.pathname}?room=${encodeURIComponent(app.roomId)}`);
  }

  async function ensureSession() {
    if(cityMode){const data=await api('/api/session');app.self=data.self;app.csrf=data.csrf;await api('/api/boxing/enter',{method:'POST',body:{}});startHeartbeat();return;}
    const nickname = currentNickname();
    if (!nickname) throw Object.assign(new Error('NICKNAME_REQUIRED'), { code: 'NICKNAME_REQUIRED' });
    if (!app.self || app.self.name !== nickname) {
      const data = await api('/api/session', { method: 'POST', body: { nickname } });
      app.self = data.self || data;
    }
    startHeartbeat();
  }

  function startHeartbeat() {
    if (app.heartbeatTimer) return;
    void api('/api/heartbeat', { method: 'POST', body: { tabId: app.tabId } }).catch(() => {});
    app.heartbeatTimer = window.setInterval(() => {
      api('/api/heartbeat', { method: 'POST', body: { tabId: app.tabId } }).catch(() => {});
    }, 4000);
  }

  function startStatePolling() {
    if (app.stateTimer) clearInterval(app.stateTimer);
    app.stateTimer = window.setInterval(pollState, 150);
    void pollState();
  }

  async function pollState() {
    if (!app.roomId || app.polling) return;
    app.polling=true;
    try {
      const data = await api(`/api/state?roomId=${encodeURIComponent(app.roomId)}`);
      applyState(data);
    } catch (error) {
      if (error?.status !== 404) {
        $('#connectionDot')?.classList.add('yellow');
        $('#roomState').textContent = '重連中';
      }
    } finally {app.polling=false;}
  }

  async function createRoom() {
    try {
      await ensureSession();
      app.mode = document.querySelector('input[name="mode"]:checked')?.value || 'honor';
      const stake = app.mode === 'synthetic' ? app.stake : 0;
      await api('/api/boxing/enter',{method:'POST',body:{}});
      const data = await api('/api/rooms', { method: 'POST', body: { mode: app.mode, stake } });
      applyState(data);
      startStatePolling();
      notice('房間已建立，複製邀請連結給第二位玩家。', 'success');
      log(`建立${roomModeLabel()}房間。`);
    } catch (error) { notice(friendlyError(error), 'error'); }
  }

  async function joinRoom() {
    try {
      await ensureSession();
      const roomId = text($('#roomId')?.value).trim() || new URLSearchParams(location.search).get('room');
      if (!roomId) throw Object.assign(new Error('ROOM_NOT_FOUND'), { code: 'ROOM_NOT_FOUND' });
      await api('/api/boxing/enter',{method:'POST',body:{}});
      const data = await api('/api/join', { method: 'POST', body: { roomId } });
      applyState(data);
      startStatePolling();
      notice('已加入房間；若你是第二位玩家，按「接受邀請並開始」。', 'success');
      log('加入共享房間。');
    } catch (error) { notice(friendlyError(error), 'error'); }
  }

  async function acceptRoom() {
    if (!app.roomId || !canAccept()) return;
    try {
      const requestId = `${app.tabId}-${++app.requestCounter}`;
      const data = await api('/api/accept', { method: 'POST', body: { roomId: app.roomId, requestId } });
      applyState(data);
      notice('已送出接受；倒數與開始時間由裁判控制。', 'success');
      log('第二位玩家已接受邀請。', true);
    } catch (error) { notice(friendlyError(error), 'error'); }
  }

  async function cancelRoom() {
    if (!app.roomId) return;
    try {
      const requestId = `${app.tabId}-${++app.requestCounter}`;
      const data = await api('/api/cancel', { method: 'POST', body: { roomId: app.roomId, requestId } });
      applyState(data);
      notice('房間已送出取消請求；結果以裁判確認為準。', 'success');
    } catch (error) { notice(friendlyError(error), 'error'); }
  }

  async function sendAction(kind) {
    if (!canAct() || !actionNames[kind]) return;
    const own = ownFighter();
    const seq = Math.max(number(own?.seq), app.lastSeq) + 1;
    app.lastSeq = seq;
    try {
      const data = await api('/api/action', { method: 'POST', body: { roomId: app.roomId, seq, kind } });
      applyState(data);
      log(`你送出${actionNames[kind]}，等待連線更新。`);
    } catch (error) {
      app.lastSeq = Math.max(0, app.lastSeq - 1);
      notice(friendlyError(error), 'error');
    }
  }

  async function copyInvite() {
    const link = `${location.origin}${location.pathname}?room=${encodeURIComponent(app.roomId)}`;
    try {
      await navigator.clipboard.writeText(link);
      $('#copyBtn').textContent = '已複製';
      window.setTimeout(() => { $('#copyBtn').textContent = '複製連結'; }, 1600);
    } catch (_) {
      window.prompt('請複製這個邀請連結', link);
    }
  }

  function initModeControls() {
    $$('input[name="mode"]').forEach(input => input.addEventListener('change', () => {
      app.mode = input.value;
      $$('[data-mode-label]').forEach(label => label.classList.toggle('selected', label.dataset.modeLabel === app.mode));
      const synthetic = app.mode === 'synthetic';
      $$('#stakeChoices [data-stake]').forEach(button => { button.disabled = !synthetic; });
      if (!synthetic) $$('#stakeChoices [data-stake]').forEach(button => button.classList.remove('selected'));
      else $$('#stakeChoices [data-stake="5"]')[0]?.classList.add('selected');
    }));
    $$('#stakeChoices [data-stake]').forEach(button => button.addEventListener('click', () => {
      app.stake = number(button.dataset.stake, 5);
      $$('#stakeChoices [data-stake]').forEach(item => item.classList.toggle('selected', item === button));
    }));
  }

  function initEvents() {
    $('#createBtn')?.addEventListener('click', createRoom);
    $('#joinBtn')?.addEventListener('click', joinRoom);
    $('#acceptBtn')?.addEventListener('click', acceptRoom);
    $('#cancelBtn')?.addEventListener('click', cancelRoom);
    $('#copyBtn')?.addEventListener('click', copyInvite);
    $$('#actionButtons [data-kind]').forEach(button => button.addEventListener('click', () => sendAction(button.dataset.kind)));
    $('#roomId')?.addEventListener('keydown', event => { if (event.key === 'Enter') void joinRoom(); });
    $('#nickname')?.addEventListener('keydown', event => { if (event.key === 'Enter') void createRoom(); });
    document.addEventListener('keydown', event => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const kind = { j: 'punch', u:'hook', k: 'guard', l: 'dodge', i:'retreat' }[event.key.toLowerCase()];
      if (kind) { event.preventDefault(); void sendAction(kind); }
    });
  }

  function initQuery() {
    const room = new URLSearchParams(location.search).get('room');
    if (!room) return;
    $('#roomId').value = room;
    notice('已讀到邀請房間；輸入暱稱後按加入。');
  }

  function debugState() {
    const room = app.room;
    return {
      self: app.self ? { id: app.self.id, name: app.self.name, coins: app.self.coins } : null,
      roomId: app.roomId || null,
      mode: app.mode,
      stake: app.stake,
      room: room ? {
        id: room.id,
        mode: room.mode,
        stake: room.stake,
        status: room.status,
        startAt: room.startAt,
        endAt: room.endAt,
        reason: room.reason,events:room.events||[],
        result: room.result ? {
          winner: room.result.winner ?? null,
          eventId: room.result.eventId ?? null,
          expiresAt: room.result.expiresAt ?? null,
        } : null,
        fighters: Array.isArray(room.fighters) ? room.fighters.map(fighter => ({
          id: fighter.id,
          name: fighter.name,
          score: fighter.score,
          seq: fighter.seq,
          action: fighter.action,
          actionAt: fighter.actionAt,
          appearance:fighter.appearance,position:fighter.position,anchor:fighter.anchor,
          presence: fighter.presence,
        })) : [],
      } : null,
      serverNow: serverNow(),
      metrics:stage.renderer?{frames:stage.frames,drawCalls:stage.renderer.info.render.calls,triangles:stage.renderer.info.render.triangles,geometries:stage.renderer.info.memory.geometries,textures:stage.renderer.info.memory.textures,p95:[...stage.dt].sort((a,b)=>a-b)[Math.floor(stage.dt.length*.95)]||0,hair:CozyRefinedPortraitHair.stats(),motion:stage.fighters.map(v=>v?.driver.state())}:null,
    };
  }

  // ----- Simple Three.js boxing stage. It renders server-provided actions only. -----
  const stage = { scene: null, camera: null, renderer: null, fighters: [], ready: false,frames:0,dt:[],lastFrame:0 };

  function initStage() {
    const canvas = $('#arenaCanvas');
    if (!canvas || !globalThis.THREE) return;
    const T = globalThis.THREE;
    stage.scene = new T.Scene();
    stage.scene.background = new T.Color(0x101827);
    stage.camera = new T.PerspectiveCamera(33, 1, .1, 30);
    stage.camera.position.set(3.6, 2.8, 5.8);
    stage.camera.lookAt(0, 1.3, 0);
    stage.renderer = new T.WebGLRenderer({ canvas, antialias: innerWidth>600, alpha: false, powerPreference: 'default' });
    stage.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, innerWidth<600?1.2:1.5));
    stage.renderer.outputColorSpace = T.SRGBColorSpace;
    stage.renderer.shadowMap.enabled = true;
    stage.scene.add(new T.HemisphereLight(0xd9eeff, 0x25304a, 2.2));
    const key = new T.DirectionalLight(0xffe2c9, 3.2);
    key.position.set(-3, 6, 4); key.castShadow = true; stage.scene.add(key);
    buildRing(T);
    stage.fighters = [null,null];
    CozyRefinedPortraitHair.load('p3').catch(()=>{});CozyRefinedPortraitHair.load('p5').catch(()=>{});
    for(const kind of ['wide','close'])document.querySelector('#camera-'+kind).onclick=()=>{stage.camera.position.set(...(kind==='wide'?[3.6,2.8,5.8]:[2.5,2.2,3.6]));stage.camera.lookAt(0,1.15,0);};
    stage.ready = true;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      stage.renderer.setSize(rect.width, rect.height, false);
      stage.camera.aspect = rect.width / rect.height;
      stage.camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(canvas);
    resize();
    requestAnimationFrame(stageFrame);
  }

  function buildRing(T) {
    const floor = new T.Mesh(new T.BoxGeometry(5.4, .18, 3.5), new T.MeshStandardMaterial({ color: 0xd8b27d, roughness: .82 }));
    floor.position.y = .08; floor.receiveShadow = true; stage.scene.add(floor);
    const apron = new T.Mesh(new T.BoxGeometry(6.2, .35, 4.3), new T.MeshStandardMaterial({ color: 0x202c43, roughness: .9 }));
    apron.position.y = -.13; stage.scene.add(apron);
    const ropeMaterial = new T.MeshStandardMaterial({ color: 0xf5f7fa, roughness: .6 });
    for(const z of[-1.62,1.62])for(const y of[.50,1.0,1.48]){if(z>0&&y>.5)continue;const rope=new T.Mesh(new T.CylinderGeometry(.023,.023,5.05,8),ropeMaterial);rope.rotation.z=Math.PI/2;rope.position.set(0,y,z);stage.scene.add(rope);}
    for(const x of[-2.52,2.52])for(const y of[.50,1.0,1.48]){const rope=new T.Mesh(new T.CylinderGeometry(.023,.023,3.24,8),ropeMaterial);rope.rotation.x=Math.PI/2;rope.position.set(x,y,0);stage.scene.add(rope);}
    [-2.52,2.52].forEach(x=>[-1.62,1.62].forEach(z=>{const post=new T.Mesh(new T.CylinderGeometry(.09,.09,1.9,12),new T.MeshStandardMaterial({color:0xf06a35}));post.position.set(x,.8,z);stage.scene.add(post);}));
    const sign = new T.Mesh(new T.BoxGeometry(1.4, .45, .06), new T.MeshStandardMaterial({ color: 0x101827 }));
    sign.position.set(0, 2.25, -.05); stage.scene.add(sign);
  }

  function stageFrame(time) {
    if (!stage.ready) return;
    requestAnimationFrame(stageFrame);
    if(innerWidth<600&&time-stage.lastFrame<30)return;
    if(stage.lastFrame){stage.dt.push(time-stage.lastFrame);if(stage.dt.length>120)stage.dt.shift();}stage.lastFrame=time;stage.frames++;
    const now=serverNow();
    [0,1].forEach(index=>{
      const fighter=slotFighter(index),profile=fighter?.appearance;
      if(!profile)return;
      const key=JSON.stringify(profile);let visual=stage.fighters[index];
      if(!visual||visual.key!==key){if(visual){visual.driver.dispose();visual.model.dispose();}const model=CozyModels.character(stage.scene);model.setAppearance(profile);const driver=CozyBoxingMotion.create(model.active||model,{side:index===0?-1:1});visual=stage.fighters[index]={key,model,driver};}
      const anchor=fighter.anchor||{x:index===0?-.66:.66,z:0};visual.driver.group.position.set(anchor.x,0,anchor.z);
      const hit=[...(app.room?.events||[])].reverse().find(e=>e.target===fighter.id&&e.outcome!=='miss'&&now-e.at<700);
      const result=app.room?.result;
      visual.driver.update({now,action:fighter.action,actionAt:fighter.actionAt,seq:fighter.seq,impact:hit?{at:hit.at,eventId:String(hit.id),outcome:hit.outcome,attackKind:hit.kind}:null,result:result?{winner:result.winner===null?null:result.winner===fighter.id,at:result.at??result.expiresAt-4000,expiresAt:result.expiresAt}:null});
    });
    const event=[...(app.room?.events||[])].reverse().find(e=>now-e.at>=0&&now-e.at<800);const cue=document.querySelector('#impactCue');if(cue){cue.hidden=!event;if(event)cue.textContent=(event.outcome==='miss'?'落空':event.outcome==='guard'?'格擋 +'+event.points:'命中 +'+event.points);}
    stage.renderer.render(stage.scene,stage.camera);
  }
  async function resumeCitySession(){try{const data=await api('/api/session');app.self=data.self;app.csrf=data.csrf;await api('/api/boxing/enter',{method:'POST',body:{}});$('#nickname').value=data.self.name;$('#nickname').disabled=cityMode;if(cityMode&&data.identityScope==='same-origin-city-session')document.querySelector('.hero-copy').textContent='沿用此城市登入角色進擂台；只開放榮譽對戰。';startHeartbeat();}catch{if(cityMode)notice('登入已到期，請回小城重新登入。','error');}}
  document.querySelector('#returnCity').onclick=async()=>{try{await api('/api/boxing/leave',{method:'POST',body:{}});location.assign('/');}catch(e){notice(e.code==='FINISH_OR_CANCEL_FIRST'?'請先結束或取消對戰，再回城。':friendlyError(e),'error');}};

  initModeControls();
  initEvents();
  initQuery();
  initStage();
  void resumeCitySession();
  if(cityMode){document.querySelector('.hero-copy').textContent='正在確認此城市登入角色…';} window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  app.clockTimer = window.setInterval(updateClock, 180);
  window.addEventListener('pagehide',()=>{stage.ready=false;clearInterval(app.stateTimer);clearInterval(app.heartbeatTimer);clearInterval(app.clockTimer);for(const v of stage.fighters)if(v){v.driver.dispose();v.model.dispose();}const gs=new Set(),ms=new Set();stage.scene?.traverse(n=>{if(n.isMesh){gs.add(n.geometry);for(const m of(Array.isArray(n.material)?n.material:[n.material]))ms.add(m);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());stage.renderer?.dispose();stage.renderer?.forceContextLoss();},{once:true});
  globalThis.BoxingLab = Object.freeze({ state: debugState, refresh: pollState });
})();
