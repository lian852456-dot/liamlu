(function (root) {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const safeNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const state = {
    self: null,
    profile: null,
    pose: { scene: 'outdoor', zone: 'qa-plaza', x: 0, z: 0, heading: 0 },
    inArena: false,
    scope: null,
    avatar: null,
    scene: null,
    renderer: null,
    camera: null,
    clock: 0,
    moving: false,
    directions: new Set(),
    moveFrame: 0,
    lastMoveSentAt: 0,
    moveInFlight: false,
    moveQueued: false,
    cityLoaded: false,
    busy: false,
  };

  function setNotice(message = '') {
    const node = $('#cityNotice');
    if (node) node.textContent = message;
  }

  function setStatus(message, connected = false) {
    const node = $('#connectionStatus');
    if (!node) return;
    node.textContent = message;
    node.dataset.connected = connected ? 'true' : 'false';
  }

  async function api(path, options = {}) {
    const config = { method: 'GET', credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } };
    if (config.body && typeof config.body !== 'string') config.body = JSON.stringify(config.body);
    const response = await fetch(path, config);
    let payload = null;
    try { payload = await response.json(); } catch { payload = {}; }
    if (!response.ok) {
      const error = new Error(typeof payload?.error === 'string' ? payload.error : `HTTP_${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function displayError(error, fallback = '目前無法更新，請稍後再試。') {
    const code = String(error?.message || '');
    const messages = {
      NICKNAME_REQUIRED: '請先輸入 QA 暱稱。',
      SESSION_REQUIRED: '請先輸入 QA 暱稱。',
      CITY_UNAVAILABLE: '小城暫時無法載入。',
      ARENA_UNAVAILABLE: '目前無法進入擂台。',
      POSITION_SAVE_FAILED: '位置暫時未保存，請再走一步。',
    };
    return messages[code] || fallback;
  }

  function appearanceFrom(data) {
    const profile = data?.profile || data?.self || {};
    const appearance = profile?.appearance && typeof profile.appearance === 'object' ? profile.appearance : profile;
    return appearance && typeof appearance === 'object' ? { ...appearance } : {};
  }

  function normalizePose(pose) {
    const source = pose && typeof pose === 'object' ? pose : {};
    return {
      scene: typeof source.scene === 'string' ? source.scene : 'outdoor',
      zone: typeof source.zone === 'string' ? source.zone : 'qa-plaza',
      x: clamp(safeNumber(source.x), -4, 4),
      z: clamp(safeNumber(source.z), -4, 4),
      heading: safeNumber(source.heading),
    };
  }

  function renderProfile() {
    const name = state.self?.name || 'QA 演示者';
    $('#profileName').textContent = name;
    $('#profileText').textContent = state.inArena ? '目前在擂台，原城市位置已保留' : '伺服器指定的人偶外觀，不可在此頁改選';
    $('#arenaButton').textContent = state.inArena ? '回到擂台' : '進擂台';
    $('#moveHint').textContent = state.inArena ? '目前在擂台；回到擂台後才可繼續城市演示。' : '手機按住方向鍵，電腦可用 WASD／方向鍵。';
    $$('.direction-button').forEach((button) => { button.disabled = state.inArena; });
  }

  function renderLocation() {
    const pose = state.pose;
    $('#locationText').textContent = `${pose.zone || 'QA 廣場'} · X ${pose.x.toFixed(1)}／Z ${pose.z.toFixed(1)}`;
    if (state.avatar?.group) {
      state.avatar.group.position.x = pose.x;
      state.avatar.group.position.z = pose.z;
      state.avatar.group.rotation.y = pose.heading;
    }
  }

  function addBlock(T, scene, x, z, width, depth, height, color) {
    const geometry = new T.BoxGeometry(width, height, depth);
    const material = new T.MeshStandardMaterial({ color, roughness: .82 });
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, height / 2, z);
    scene.add(mesh);
    return mesh;
  }

  function makeScene() {
    if (!root.THREE || state.scene) return;
    const T = root.THREE;
    const canvas = $('#cityCanvas');
    if (!canvas) return;
    state.scene = new T.Scene();
    state.scene.background = new T.Color(0xdce8e5);
    state.camera = new T.PerspectiveCamera(36, 1, .1, 100);
    state.camera.position.set(8, 8, 10);
    state.camera.lookAt(0, 0, 0);
    state.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
    state.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    state.renderer.shadowMap.enabled = true;
    state.scene.add(new T.HemisphereLight(0xfff8ed, 0x60748a, 2.1));
    const key = new T.DirectionalLight(0xfff0d6, 2.7);
    key.position.set(4, 10, 6);
    key.castShadow = true;
    state.scene.add(key);
    const floor = new T.Mesh(new T.PlaneGeometry(14, 14), new T.MeshStandardMaterial({ color: 0xc9d4c6, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    state.scene.add(floor);
    const grid = new T.GridHelper(8, 8, 0x95a99a, 0xb5c2b5);
    grid.position.y = .012;
    state.scene.add(grid);
    addBlock(T, state.scene, -3.1, -2.8, 1.8, 1.2, 1.15, 0xe7b28a);
    addBlock(T, state.scene, 3.0, 2.7, 1.55, 1.1, .9, 0xb3c7ce);
    const sign = addBlock(T, state.scene, 0, -3.75, 3.1, .22, 1.4, 0x38556a);
    sign.position.y = .7;
    window.addEventListener('resize', resize, { passive: true });
    resize();
  }

  function resize() {
    if (!state.renderer || !state.camera) return;
    const canvas = $('#cityCanvas');
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(width, height, false);
  }

  function mountAvatar() {
    if (!state.scene || !root.CozyRefinedAvatarPortraits?.create) {
      setNotice('人偶素材尚未載入，請重新整理。');
      return;
    }
    state.avatar?.dispose?.();
    const appearance = appearanceFrom({ profile: state.profile });
    state.avatar = root.CozyRefinedAvatarPortraits.create(state.scene, { scale:.86,portraitPreset:appearance.avatarPreset });
    state.avatar.setAppearance?.(appearance);
    state.avatar.group.scale.setScalar(.86);
    state.avatar.group.traverse((node) => {
      if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    renderLocation();
  }

  function renderFrame() {
    state.clock += .016;
    moveFrame();
    if (state.avatar) state.avatar.animate?.(state.clock, state.moving, false, false);
    if (state.renderer && state.scene && state.camera) state.renderer.render(state.scene, state.camera);
    state.moveFrame = root.requestAnimationFrame(renderFrame);
  }

  function directionVector() {
    let x = 0;
    let z = 0;
    if (state.directions.has('left')) x -= 1;
    if (state.directions.has('right')) x += 1;
    if (state.directions.has('up')) z -= 1;
    if (state.directions.has('down')) z += 1;
    const length = Math.hypot(x, z);
    return length ? { x: x / length, z: z / length } : null;
  }

  async function saveMove(force = false) {
    if (state.inArena || !state.self || !state.cityLoaded) return;
    const now = Date.now();
    if (!force && now - state.lastMoveSentAt < 250) return;
    if (state.moveInFlight) { state.moveQueued = true; return; }
    state.moveInFlight = true;
    const sent = { x: state.pose.x, z: state.pose.z, heading: state.pose.heading };
    try {
      const data = await api('/api/city/move', { method: 'POST', body: { pose: sent } });
      state.lastMoveSentAt = Date.now();
      const confirmed = data?.pose;
      if (confirmed && !state.directions.size) {
        state.pose = { ...state.pose, ...normalizePose({ ...state.pose, ...confirmed }) };
        renderLocation();
      }
      setStatus('位置已保存', true);
      setNotice('');
    } catch (error) {
      setNotice(displayError(error, '位置暫時未保存，請再試一次。'));
    } finally {
      state.moveInFlight = false;
      if (state.moveQueued) { state.moveQueued = false; void saveMove(true); }
    }
  }

  function moveFrame() {
    const vector = directionVector();
    state.moving = !!vector && !state.inArena;
    if (vector && !state.inArena) {
      state.pose.x = clamp(state.pose.x + vector.x * .075, -4, 4);
      state.pose.z = clamp(state.pose.z + vector.z * .075, -4, 4);
      state.pose.heading = Math.atan2(vector.x, vector.z);
      renderLocation();
      void saveMove(false);
    }
  }

  function setDirection(direction, active) {
    if (active && !state.inArena) state.directions.add(direction);
    else state.directions.delete(direction);
    $$('[data-direction]').forEach((button) => button.dataset.active = String(state.directions.has(button.dataset.direction)));
    if (!active) void saveMove(true);
  }

  function bindDirectionControls() {
    $$('.direction-button').forEach((button) => {
      const direction = button.dataset.direction;
      const start = (event) => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); setDirection(direction, true); };
      const stop = (event) => { event.preventDefault(); setDirection(direction, false); };
      button.addEventListener('pointerdown', start);
      button.addEventListener('pointerup', stop);
      button.addEventListener('pointercancel', stop);
      button.addEventListener('lostpointercapture', stop);
    });
    const keyMap = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
    window.addEventListener('keydown', (event) => {
      const direction = keyMap[event.key];
      if (!direction || state.inArena) return;
      event.preventDefault();
      setDirection(direction, true);
    });
    window.addEventListener('keyup', (event) => {
      const direction = keyMap[event.key];
      if (!direction) return;
      event.preventDefault();
      setDirection(direction, false);
    });
    window.addEventListener('blur', () => { state.directions.clear(); state.moving = false; void saveMove(true); });
  }

  async function loadCity() {
    setStatus('讀取小城…');
    try {
      const data = await api('/api/city');
      state.profile = data?.profile || state.self?.appearance || {};
      state.pose = normalizePose(data?.pose);
      state.inArena = data?.inArena === true;
      state.scope = data?.scope || null;
      state.cityLoaded = true;
      $('#sessionCard').hidden = true;
      $('#cityPanel').hidden = false;
      makeScene();
      mountAvatar();
      renderProfile();
      renderLocation();
      setStatus(state.inArena ? '人在擂台' : '已連線', true);
      setNotice(state.inArena ? '你目前在擂台，城市位置已保留。' : '可以在廣場走動，離開前會記住你的位置。');
    } catch (error) {
      setStatus('尚未連線');
      setNotice(displayError(error, '小城暫時無法載入。'));
    }
  }

  async function tryExistingSession() {
    try {
      const data = await api('/api/session');
      if (data?.self) { state.self = data.self; await loadCity(); return true; }
    } catch { /* A missing session is expected on first QA visit. */ }
    return false;
  }

  async function createSession(event) {
    event.preventDefault();
    const input = $('#qaNickname');
    const nickname = input.value.trim().slice(0, 12);
    if (!nickname) { setNotice('請先輸入 QA 暱稱。'); input.focus(); return; }
    const button = $('#sessionButton');
    button.disabled = true;
    setNotice('正在準備隔離演示…');
    try {
      const data = await api('/api/session', { method: 'POST', body: { nickname } });
      if (!data?.self) throw new Error('SESSION_REQUIRED');
      state.self = data.self;
      await loadCity();
    } catch (error) {
      setNotice(displayError(error, '暫時無法開始演示。'));
    } finally {
      button.disabled = false;
    }
  }

  async function enterArena() {
    if (state.busy) return;
    state.busy = true;
    $('#arenaButton').disabled = true;
    setNotice('正在前往擂台…');
    try {
      await api('/api/boxing/enter', { method: 'POST', body: {} });
      root.location.assign('/?fromCity=1');
    } catch (error) {
      setNotice(displayError(error, '目前無法進入擂台。'));
      $('#arenaButton').disabled = false;
      state.busy = false;
    }
  }

  function debugState() {
    return {
      authenticated: !!state.self,
      name: state.self?.name || null,
      pose: { ...state.pose },
      inArena: state.inArena,
      cityLoaded: state.cityLoaded,
      hasAvatar: !!state.avatar,
      moving: state.moving,
    };
  }

  function init() {
    $('#sessionForm')?.addEventListener('submit', createSession);
    $('#arenaButton')?.addEventListener('click', enterArena);
    bindDirectionControls();
    window.BoxingCityQA = Object.freeze({ state: debugState, refresh: loadCity });
    state.moveFrame = root.requestAnimationFrame(renderFrame);
    void tryExistingSession();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
