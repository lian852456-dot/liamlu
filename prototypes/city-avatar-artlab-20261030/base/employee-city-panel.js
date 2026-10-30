(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CozyEmployeeCityPanel = api;
})(typeof window === 'undefined' ? globalThis : window, function (root) {
  'use strict';

  const CHARACTER_VALUES = ['orange', 'sunny', 'forest', 'violet'];
  const SKIN_VALUES = ['orange', 'teal', 'purple'];
  const EMPLOYEE_ME = '/api/employee/me';
  const SESSION = '/api/session';
  const PROFILE = '/api/profile';
  const APPEARANCE_PREVIEW = '/api/employee/appearance/preview';
  const APPEARANCE_CONFIRM = '/api/employee/appearance/confirm';
  const CHARACTER_LABELS = { orange: '橘光', sunny: '晴日', forest: '森林', violet: '紫藤' };
  const SKIN_LABELS = { orange: '暖膚', teal: '青綠', purple: '紫調' };
  const text = value => value == null ? '' : String(value);

  function requestId(win) {
    try {
      const id = win?.crypto?.randomUUID?.();
      if (id) return id;
    } catch (_) { /* Fall through to a bounded local identifier. */ }
    return `employee-city-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function sameOriginPath(win, path) {
    try {
      const url = new URL(path, win.location.origin);
      return url.origin === win.location.origin && url.pathname === path;
    } catch (_) { return false; }
  }

  function create(options = {}) {
    const win = options.window || root;
    const doc = options.document || win?.document || null;
    const fetcher = options.fetch || win?.fetch?.bind(win);
    const getSession = typeof options.getSession === 'function' ? options.getSession : null;
    const reload = typeof options.reload === 'function' ? options.reload : () => win?.location?.reload?.();
    const previewMount = typeof options.previewMount === 'function'
      ? options.previewMount
      : (typeof win?.CozyAppearancePreview?.mount === 'function' ? win.CozyAppearancePreview.mount.bind(win.CozyAppearancePreview) : null);
    const state = {
      booted: false,
      bound: false,
      profile: null,
      remainingAppearance: false,
      photoPreset: '',
      previewPreset: '',
      previewSelection: null,
      previewProfile: null,
      previewOpen: false,
      previewSeq: 0,
      open: false,
      disposed: false,
    };
    const refs = {};
    let previewDispose = null;

    const el = (tag, className, label) => {
      const node = doc?.createElement?.(tag);
      if (!node) return null;
      if (className) node.className = className;
      if (label != null) node.textContent = text(label);
      return node;
    };
    const append = (parent, ...children) => children.forEach(child => child && parent?.appendChild?.(child));
    const button = (label, className) => {
      const node = el('button', className, label);
      if (node) node.type = 'button';
      return node;
    };

    function setStatus(value, error = false) {
      if (!refs.status) return;
      refs.status.textContent = text(value);
      refs.status.dataset.kind = error ? 'error' : 'info';
    }

    function disposePreview() {
      if (typeof previewDispose === 'function') {
        try { previewDispose(); } catch (_) { /* Preview disposal is best effort and never blocks cancel. */ }
      }
      previewDispose = null;
      if (refs.previewHost) {
        while (refs.previewHost.firstChild) refs.previewHost.removeChild(refs.previewHost.firstChild);
      }
      state.previewProfile = null;
      state.previewOpen = false;
      state.previewPreset = '';
      state.previewSelection = null;
      if (refs.confirm) refs.confirm.disabled = true;
    }

    function render() {
      if (!refs.root) return;
      refs.root.hidden = !state.bound || !state.open || state.disposed;
      if (refs.nickname) refs.nickname.value = text(state.profile?.nickname);
      if (refs.remaining) refs.remaining.textContent = state.remainingAppearance
        ? '本人預設外觀重製權利：剩 1 次（預覽不消耗）'
        : '本人預設外觀重製權利已使用；付費髮型／服裝仍沿既有衣櫃。';
      for (const node of [refs.photo, refs.generic, refs.character, refs.skin]) if (node) node.disabled = !state.remainingAppearance || state.disposed;
      if (refs.confirm) refs.confirm.disabled = !state.previewOpen || !state.previewProfile || !state.remainingAppearance || state.disposed;
      if (refs.gold) refs.gold.textContent = '正式金牌尚未啟用；此面板不做金牌扣款。';
    }

    async function responseJSON(response) {
      let payload = null;
      try { payload = await response.json(); } catch (_) { payload = null; }
      if (!response?.ok) {
        const error = new Error(text(payload?.error || payload?.message || `HTTP_${response?.status || 0}`));
        error.status = response?.status;
        error.payload = payload;
        throw error;
      }
      return payload || {};
    }

    async function request(path, { method = 'GET', body, csrf = '' } = {}) {
      if (!sameOriginPath(win, path) || typeof fetcher !== 'function') throw new Error('SAME_ORIGIN_FETCH_UNAVAILABLE');
      const headers = { Accept: 'application/json' };
      const init = { method, credentials: 'same-origin', headers };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        if (csrf) headers['X-City-CSRF'] = csrf;
        init.body = JSON.stringify(body);
      }
      return responseJSON(await fetcher(path, init));
    }

    async function freshSession() {
      if (!getSession) throw new Error('CITY_SESSION_ADAPTER_REQUIRED');
      const session = await getSession();
      if (!session?.csrf || !session?.profile?.id) throw new Error('CITY_SESSION_REQUIRED');
      return session;
    }

    async function load() {
      if (state.disposed) return false;
      try {
        const data = await request(EMPLOYEE_ME);
        if (!data?.profile?.id) throw new Error('EMPLOYEE_PROFILE_INVALID');
        state.profile = { ...data.profile };
        state.bound = true;
        state.remainingAppearance = data.remainingAppearance === true;
        state.photoPreset = text(data.photoPreset);
        render();
        setStatus('已讀取本人員工角色；城市角色進度維持不變。');
        return true;
      } catch (_) {
        state.bound = false;
        state.profile = null;
        render();
        return false;
      }
    }

    async function saveNickname() {
      if (!state.bound || !state.profile || state.disposed) return false;
      const nickname = text(refs.nickname?.value).trim();
      if (!nickname || nickname.length > 12) {
        setStatus('暱稱需為 1–12 個字元。', true);
        return false;
      }
      try {
        const session = await freshSession();
        const expectedRevision = Number(session.profile.revision);
        if (!Number.isSafeInteger(expectedRevision)) throw new Error('PROFILE_REVISION_REQUIRED');
        const data = await request(PROFILE, { method: 'POST', csrf: session.csrf, body: { nickname, expectedRevision } });
        if (data?.profile?.id && data.profile.id === state.profile.id) state.profile = { ...state.profile, ...data.profile };
        setStatus('暱稱已保存。');
        render();
        return true;
      } catch (error) {
        setStatus(error?.status === 409 ? '資料剛被更新，請重新讀取後再保存暱稱。' : '暱稱尚未保存，城市角色進度未變更。', true);
        return false;
      }
    }

    function selection() {
      return {
        character: text(refs.character?.value || state.profile?.character || 'orange'),
        skin: text(refs.skin?.value || state.profile?.skin || 'orange'),
      };
    }

    async function preview(preset) {
      if (!state.bound || !state.remainingAppearance || state.disposed || !['photo', 'generic'].includes(preset)) return false;
      const seq = ++state.previewSeq;
      disposePreview();
      state.previewPreset = preset;
      state.previewSelection = preset === 'generic' ? selection() : null;
      setStatus('正在載入外觀預覽…');
      try {
        const session = await freshSession();
        const body = preset === 'generic'
          ? { preset, character: state.previewSelection.character, skin: state.previewSelection.skin }
          : { preset };
        const data = await request(APPEARANCE_PREVIEW, { method: 'POST', csrf: session.csrf, body });
        if (seq !== state.previewSeq || state.disposed) return false;
        if (!data?.profile || data.consumed === true) throw new Error('APPEARANCE_PREVIEW_INVALID');
        state.previewProfile = { ...data.profile };
        state.previewOpen = true;
        if (previewMount && refs.previewHost) previewDispose = previewMount(refs.previewHost, state.previewProfile) || null;
        setStatus('預覽不會消耗權利；確認後才會使用一次重製權利。');
        render();
        return true;
      } catch (_) {
        if (seq === state.previewSeq) {
          disposePreview();
          setStatus('外觀預覽尚未完成，未消耗重製權利。', true);
          render();
        }
        return false;
      }
    }

    function cancelPreview() {
      state.previewSeq += 1;
      disposePreview();
      setStatus('已取消預覽，未送出確認且未消耗重製權利。');
      render();
    }

    async function confirmPreview() {
      if (!state.previewOpen || !state.previewProfile || !state.remainingAppearance || state.disposed) return false;
      const preset = state.previewPreset;
      const picked = state.previewSelection;
      const body = preset === 'generic'
        ? { preset, character: picked.character, skin: picked.skin, requestId: requestId(win) }
        : { preset, requestId: requestId(win) };
      try {
        const session = await freshSession();
        await request(APPEARANCE_CONFIRM, { method: 'POST', csrf: session.csrf, body });
        state.remainingAppearance = false;
        setStatus('外觀重製已確認，正在重新載入最新城市角色…');
        disposePreview();
        await reload();
        return true;
      } catch (_) {
        setStatus('外觀尚未確認；目前角色與城市進度未清除。', true);
        return false;
      }
    }

    function buildUI() {
      if (!doc?.createElement || !doc?.body) return;
      refs.root = el('aside', 'employee-city-panel');
      refs.root.id = 'employee-city-panel';
      refs.root.hidden = true;
      refs.root.setAttribute?.('aria-label', '本人員工角色');
      const header = el('div', 'employee-city-panel-header');
      append(header, el('h2', '', '本人員工角色'), refs.close = button('×', 'employee-city-panel-close'));
      refs.close.setAttribute?.('aria-label', '關閉本人員工角色');
      const intro = el('p', 'employee-city-panel-intro', '保留目前城市角色與進度；不建立帳戶、不扣款。');
      const profileSection = el('section', 'employee-city-panel-section');
      append(profileSection, el('h3', '', '暱稱'), refs.nickname = el('input', 'employee-city-panel-nickname'), refs.saveNickname = button('保存暱稱', 'employee-city-panel-save'));
      refs.nickname.type = 'text';
      refs.nickname.maxLength = 12;
      const appearanceSection = el('section', 'employee-city-panel-section');
      append(appearanceSection, el('h3', '', '本人預設外觀重製'), refs.remaining = el('p', 'employee-city-panel-remaining'), refs.photo = button('預覽本人照片預設', 'employee-city-panel-action'), refs.generic = button('預覽通用預設', 'employee-city-panel-action'));
      const choices = el('div', 'employee-city-panel-choices');
      refs.character = el('select', 'employee-city-panel-select');
      refs.skin = el('select', 'employee-city-panel-select');
      for (const value of CHARACTER_VALUES) { const option = el('option', '', CHARACTER_LABELS[value]); option.value = value; refs.character.appendChild(option); }
      for (const value of SKIN_VALUES) { const option = el('option', '', SKIN_LABELS[value]); option.value = value; refs.skin.appendChild(option); }
      append(choices, refs.character, refs.skin);
      refs.previewHost = el('div', 'employee-city-panel-preview');
      refs.cancel = button('取消預覽', 'employee-city-panel-secondary');
      refs.confirm = button('確認使用一次重製權利', 'employee-city-panel-confirm');
      append(appearanceSection, choices, refs.previewHost, refs.cancel, refs.confirm);
      refs.gold = el('p', 'employee-city-panel-gold');
      refs.status = el('p', 'employee-city-panel-status', '');
      append(refs.root, header, intro, profileSection, appearanceSection, refs.gold, refs.status);
      doc.body.appendChild(refs.root);
      refs.close.addEventListener?.('click', close);
      refs.saveNickname.addEventListener?.('click', () => { void saveNickname(); });
      refs.photo.addEventListener?.('click', () => { void preview('photo'); });
      refs.generic.addEventListener?.('click', () => { void preview('generic'); });
      refs.cancel.addEventListener?.('click', cancelPreview);
      refs.confirm.addEventListener?.('click', () => { void confirmPreview(); });
    }

    buildUI();
    render();
    function open() {
      if (state.disposed || !state.bound) return false;
      state.open = true;
      render();
      return true;
    }
    function close() {
      state.open = false;
      render();
      return true;
    }
    return {
      state,
      refs,
      open,
      close,
      boot: load,
      load,
      saveNickname,
      preview,
      cancelPreview,
      confirmPreview,
      dispose() {
        if (state.disposed) return;
        state.disposed = true;
        state.previewSeq += 1;
        disposePreview();
        refs.root?.parentNode?.removeChild?.(refs.root);
      },
    };
  }

  return Object.freeze({ create, CHARACTER_VALUES, SKIN_VALUES });
});
