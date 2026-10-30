(function (window, document) {
  'use strict';

  const CONTROL_MESSAGE = 'avatar-artlab/control';
  const READY_MESSAGE = 'avatar-artlab/ready';
  const METRICS_MESSAGE = 'avatar-artlab/metrics';
  const labels = {
    version: { new: 'Blender 第二版', v1: 'Blender 第一版', old: '程式化原版' },
    view: { front: '正面', quarter: '45°', side: '側面', back:'背面' },
    motion: { idle: '站立', walk: '行走', wave: '揮手', sit: '坐下', highfive: '擊掌' },
  };
  const allowed = {
    version: new Set(['new','v1','old']),
    focus: new Set(['character']),
    view: new Set(['front','quarter','side','back']),
    motion: new Set(['idle', 'walk', 'wave', 'sit', 'highfive']),
    hair: new Set(['bob', 'pony', 'braids', 'silver']),
    outfit: new Set(['uniform', 'forest', 'ocean', 'rose']),
  };
  const state = {
    scene: 'studio',
    version: 'new',
    view: 'front',
    motion: 'idle',
    hair: 'bob',
    outfit: 'uniform',
    ready: false,
    frame: null,
  };
  const refs = {
    mount: document.getElementById('frame-mount'),
    stage: document.getElementById('avatar-stage'),
    status: document.getElementById('preview-status'),
    sceneTitle: document.getElementById('scene-title'),
    sceneState: document.getElementById('scene-state'),
    gameGuide: document.getElementById('game-guide'),
    metricVersion: document.getElementById('metric-version'),
    metricFrame: document.getElementById('metric-frame'),
    metricsFootnote: document.getElementById('metrics-footnote'),
    controls: document.getElementById('control-column'),
  };

  function setStatus(message) {
    if (refs.status) refs.status.textContent = message;
  }

  function isAllowed(action, value) {
    return allowed[action]?.has(value) === true;
  }

  function send(action, value) {
    if (!state.frame || !state.ready || !isAllowed(action, value)) return false;
    state.frame.contentWindow?.postMessage({ type: CONTROL_MESSAGE, action, value }, window.location.origin);
    return true;
  }

  function syncFrame() {
    if (!state.frame || !state.ready) return;
    send('version', state.version);
    send('view', state.view);
    send('motion', state.motion);
    send('hair', state.hair);
    send('outfit', state.outfit);
  }

  function replaceFrame(scene) {
    state.ready = false;
    state.frame = null;
    if (!refs.mount) return;
    while (refs.mount.firstChild) {
      try { refs.mount.firstChild.contentWindow?.AvatarArtLabStudio?.dispose?.(); refs.mount.firstChild.contentWindow?.CozyWorld?.setActive?.(false); } catch (_) {}
      refs.mount.removeChild(refs.mount.firstChild);
    }
    const frame = document.createElement('iframe');
    frame.title = scene === 'studio' ? '人物細節預覽' : '城市試玩預覽';
    frame.loading = 'eager';
    frame.referrerPolicy = 'same-origin';
    frame.src = scene === 'studio' ? './studio.html' : './game.html';
    frame.addEventListener('load', function () {
      if (state.frame !== frame || state.ready) return;
      setStatus('預覽已載入，正在連線角色…');
    });
    refs.mount.appendChild(frame);
    state.frame = frame;
    setStatus(scene === 'studio' ? '正在載入人物細節…' : '正在載入城市試玩…');
  }

  function updatePressed(action, value) {
    document.querySelectorAll(`[data-action="${action}"]`).forEach(node => {
      const selected = node.dataset.value === value;
      node.classList.toggle('is-selected', selected);
      node.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function updateSelect(action, value) {
    const node = document.querySelector(`[data-action="${action}"]`);
    if (node) node.value = value;
  }

  function render() {
    document.querySelectorAll('.scene-tab').forEach(tab => {
      const selected = tab.dataset.scene === state.scene;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    updatePressed('version', state.version);
    updatePressed('view', state.view);
    updatePressed('motion', state.motion);
    updateSelect('hair', state.hair);
    updateSelect('outfit', state.outfit);
    document.querySelectorAll('[data-studio-only]').forEach(card => {
      const disabled = state.scene === 'game';
      card.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      card.querySelectorAll('button, select').forEach(control => { control.disabled = disabled; });
    });
    if (refs.gameGuide) refs.gameGuide.hidden = state.scene !== 'game';
    if (refs.sceneTitle) refs.sceneTitle.textContent = state.scene === 'studio' ? '短髮造型比較・臉部與比例保持不變' : '走進城市，和角色一起玩';
    if (refs.sceneState) refs.sceneState.textContent = state.scene === 'studio' ? '獨立髮型示範' : '城市試玩';
    if (refs.metricVersion) refs.metricVersion.textContent = labels.version[state.version];
  }

  function metricNumber(value, minimum = 0) {
    return Number.isFinite(value) && value >= minimum ? value : null;
  }

  function renderMetrics(data) {
    if (!data || !['new','v1','old'].includes(data.version)) return;
    if ((data.version === 'new' && data.hairAsset?.error) || (data.version==='v1' && data.hairAssetV1?.error)) setStatus('精緻髮型未載入，暫用原短髮；可重新開啟預覽。');
    const calls = metricNumber(data.calls);
    const triangles = metricNumber(data.triangles);
    const geometries = metricNumber(data.geometries);
    const textures = metricNumber(data.textures);
    const p50 = metricNumber(data.frameP50Ms);
    const p95 = metricNumber(data.frameP95Ms);
    state.metrics = { calls, triangles, geometries, textures, p50, p95 };
    if (refs.metricVersion) refs.metricVersion.textContent = labels.version[data.version];
    if (refs.metricFrame) refs.metricFrame.textContent = p50 == null ? '等待讀取' : p95 == null ? `平均 ${p50.toFixed(1)}ms` : `P50 ${p50.toFixed(1)}ms・P95 ${p95.toFixed(1)}ms`;
    if (refs.metricsFootnote) {
      const compact = [calls == null ? null : `呼叫 ${calls}`, triangles == null ? null : `三角面 ${triangles}`, geometries == null ? null : `幾何 ${geometries}`, textures == null ? null : `紋理 ${textures}`].filter(Boolean);
      refs.metricsFootnote.textContent = compact.length ? `${compact.join('・')}；僅供此示範參考，不代表真機或全面上線結果。` : '數值僅供此示範參考，不代表真機或全面上線結果。';
    }
  }

  function selectScene(scene) {
    if (!['studio', 'game'].includes(scene) || state.scene === scene) return;
    state.scene = scene;
    replaceFrame(scene);
    render();
  }

  function selectControl(action, value) {
    if (!isAllowed(action, value)) return;
    if (state.scene === 'game' && ['view', 'hair', 'outfit'].includes(action)) return;
    state[action] = value;
    if (action === 'version' || action === 'view' || action === 'motion') updatePressed(action, value);
    if (action === 'hair' || action === 'outfit') updateSelect(action, value);
    if (refs.metricVersion && action === 'version') refs.metricVersion.textContent = labels.version[value];
    send(action, value);
  }

  function onClick(event) {
    const tab = event.target.closest?.('[data-scene]');
    if (tab) { selectScene(tab.dataset.scene); return; }
    const control = event.target.closest?.('[data-action]');
    if (control && control.tagName !== 'SELECT') selectControl(control.dataset.action, control.dataset.value);
  }

  function onChange(event) {
    const control = event.target.closest?.('select[data-action]');
    if (control) selectControl(control.dataset.action, control.value);
  }

  function onMessage(event) {
    if (event.origin !== window.location.origin || !state.frame || event.source !== state.frame.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === READY_MESSAGE) {
      state.ready = true;
      setStatus(state.scene === 'studio' ? '角色預覽已就緒' : '城市試玩已就緒');
      syncFrame();
    } else if (data.type === METRICS_MESSAGE) {
      renderMetrics(data);
    }
  }

  document.addEventListener('click', onClick);
  refs.controls?.addEventListener('change', onChange);
  window.addEventListener('message', onMessage);
  replaceFrame(state.scene);
  render();
})(window, document);
