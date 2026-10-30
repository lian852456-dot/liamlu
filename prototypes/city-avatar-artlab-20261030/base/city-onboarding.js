(function (root, factory) {
  const api = factory(root || globalThis);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) {
    root.CozyOnboarding = api;
    api.mount();
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VERSION = 'v1';
  const SAVE_NOTE = '角色已保存，之後可在手帳再調整';
  const BLOCKING_DIALOGS = 'dialog';

  function normalizePlayer(value) {
    const player = value && typeof value === 'object' ? value : {};
    const id = player.id == null ? '' : String(player.id).trim();
    return {
      id,
      nickname: player.nickname == null ? '' : String(player.nickname),
      setupComplete: player.setupComplete === true,
    };
  }

  function storageKey(identityId, version = VERSION) {
    return `cozy-onboarding:${version}:${encodeURIComponent(String(identityId || ''))}`;
  }

  function resolveStorage(explicit) {
    if (explicit !== undefined) return explicit;
    try {
      return root && root.localStorage ? root.localStorage : null;
    } catch (_error) {
      return null;
    }
  }

  function shouldShow({ identityId, version = VERSION, storage } = {}) {
    const id = identityId == null ? '' : String(identityId).trim();
    if (!id) return false;
    const store = resolveStorage(storage);
    if (!store) return true;
    try {
      return store.getItem(storageKey(id, version)) !== version;
    } catch (_error) {
      // A blocked or full localStorage must never stop a player from logging in.
      return true;
    }
  }

  function markSeen({ identityId, version = VERSION, storage } = {}) {
    const id = identityId == null ? '' : String(identityId).trim();
    if (!id) return false;
    const store = resolveStorage(storage);
    if (!store) return false;
    try {
      store.setItem(storageKey(id, version), version);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function stepsFor(player = {}) {
    const setupComplete = player.setupComplete === true;
    return [
      {
        title: setupComplete ? '從已保存的角色開始' : '先認識一下自己的角色',
        body: setupComplete
          ? '目前角色外觀已保存；之後仍可在生活手帳再調整。'
          : '先從生活手帳開始，改名並選好外觀後按保存；完成前先把它當成草稿。',
      },
      {
        title: '在街區慢慢走',
        body: '點地或用 WASD／搖桿走路，也能拖曳鏡頭；上方街區操作列可隨時查看。',
      },
      {
        title: '靠近就能互動',
        body: '靠近門市或人物就能互動；點擊動作會直接播放。',
      },
      {
        title: '找戶外巡走的主管',
        body: '主管會在戶外巡走，走近就能聊聊。',
      },
    ];
  }

  function createOnboardingModel({ storage, version = VERSION } = {}) {
    let player = null;
    let identityId = '';
    let stepIndex = 0;
    let sessionHidden = false;
    let permanentlyHidden = false;
    let notice = '';

    function snapshot() {
      const steps = stepsFor(player || {});
      const index = Math.min(stepIndex, Math.max(steps.length - 1, 0));
      return {
        version,
        player: player ? { ...player } : null,
        steps,
        index,
        step: steps[index] || null,
        notice,
        visible: Boolean(player && player.id && !sessionHidden && !permanentlyHidden),
      };
    }

    function setPlayer(value) {
      const next = normalizePlayer(value);
      if (next.id !== identityId) {
        stepIndex = 0;
        sessionHidden = false;
        permanentlyHidden = false;
        notice = '';
      }
      player = next.id ? next : null;
      identityId = next.id;
      const alreadySeen = Boolean(next.id && !shouldShow({ identityId: next.id, version, storage }));
      permanentlyHidden = Boolean(next.id && alreadySeen);
      return snapshot();
    }

    function markShown() {
      return snapshot();
    }

    function savedAppearance() {
      if (player) player = { ...player, setupComplete: true };
      notice = player ? SAVE_NOTE : '';
      return snapshot();
    }

    function next() {
      if (!player) return snapshot();
      const last = stepsFor(player).length - 1;
      if (stepIndex < last) {
        stepIndex += 1;
      } else {
        markSeen({ identityId, version, storage });
        permanentlyHidden = true;
        sessionHidden = true;
      }
      return snapshot();
    }

    function snooze() {
      sessionHidden = true;
      return snapshot();
    }

    function disable() {
      if (player) {
        markSeen({ identityId, version, storage });
        permanentlyHidden = true;
      }
      sessionHidden = true;
      return snapshot();
    }

    function clearNotice() {
      notice = '';
      return snapshot();
    }

    function clear() {
      player = null;
      identityId = '';
      stepIndex = 0;
      sessionHidden = false;
      permanentlyHidden = false;
      notice = '';
      return snapshot();
    }

    return {
      setPlayer,
      markShown,
      savedAppearance,
      next,
      snooze,
      disable,
      clearNotice,
      clear,
      getState: snapshot,
    };
  }

  function isBlockingModal(document) {
    if (!document || !document.querySelectorAll) return false;
    const dialogs = Array.from(document.querySelectorAll(BLOCKING_DIALOGS));
    const sceneActions = Array.from(document.querySelectorAll('#scene-actions[open], .scene-actions[open]'));
    const cityDrawers = Array.from(document.querySelectorAll('#city-drawer:not([hidden]), .city-drawer:not([hidden])'));
    return dialogs.some((dialog) => dialog.open === true) || sceneActions.length > 0 || cityDrawers.length > 0;
  }

  function bindUi(api, model) {
    const document = root.document;
    if (!document || !document.body || document.getElementById('cozy-onboarding')) return null;

    const card = document.createElement('aside');
    card.id = 'cozy-onboarding';
    card.className = 'cozy-onboarding';
    card.setAttribute('role', 'status');
    card.setAttribute('aria-live', 'polite');

    const eyebrow = document.createElement('div');
    eyebrow.className = 'cozy-onboarding__eyebrow';
    eyebrow.textContent = '小城操作提示';
    const heading = document.createElement('h2');
    heading.className = 'cozy-onboarding__title';
    const body = document.createElement('p');
    body.className = 'cozy-onboarding__body';
    const progress = document.createElement('p');
    progress.className = 'cozy-onboarding__progress';
    const note = document.createElement('p');
    note.className = 'cozy-onboarding__note';
    note.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'cozy-onboarding__actions';
    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'primary cozy-onboarding__next';
    const snoozeButton = document.createElement('button');
    snoozeButton.type = 'button';
    snoozeButton.className = 'text-button cozy-onboarding__snooze';
    snoozeButton.textContent = '先收起';
    const disableButton = document.createElement('button');
    disableButton.type = 'button';
    disableButton.className = 'text-button cozy-onboarding__disable';
    disableButton.textContent = '不再提示';
    actions.append(nextButton, snoozeButton, disableButton);
    card.append(eyebrow, heading, body, progress, note, actions);
    document.body.append(card);

    function render() {
      const state = model.getState();
      const total = state.steps.length;
      const position = state.index + 1;
      heading.textContent = state.step ? state.step.title : '';
      body.textContent = state.step ? state.step.body : '';
      progress.textContent = state.step ? `${position} / ${total}` : '';
      nextButton.textContent = position >= total ? '完成介紹' : '下一則';
      note.textContent = state.notice;
      note.hidden = !state.notice;
      const visibleNow = state.visible && !isBlockingModal(document);
      card.hidden = !visibleNow;
      if (visibleNow) model.markShown();
    }

    nextButton.addEventListener('click', () => {
      model.next();
      render();
    });
    snoozeButton.addEventListener('click', () => {
      model.snooze();
      render();
    });
    disableButton.addEventListener('click', () => {
      model.disable();
      render();
    });

    document.addEventListener('toggle', render, true);
    document.addEventListener('close', render, true);
    if (root.MutationObserver && document.body) {
      const observer = new root.MutationObserver((records) => {
        if (records.some((record) => record.attributeName === 'open' || (record.attributeName === 'hidden' && record.target.id === 'city-drawer'))) render();
      });
      observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open', 'hidden'] });
    }
    root.addEventListener?.('resize', render);
    render();
    return { render };
  }

  function buildApi() {
    const model = createOnboardingModel();
    let ui = null;
    let mounted = false;
    let noticeTimer = null;

    function mount() {
      if (mounted || !root.document) return api;
      if (root.document.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', mount, { once: true });
        return api;
      }
      mounted = true;
      ui = bindUi(api, model);
      return api;
    }

    function render() {
      mount();
      ui?.render();
    }

    function setPlayer(value) {
      mount();
      const state = model.setPlayer(value);
      render();
      return state;
    }

    function savedAppearance() {
      mount();
      const state = model.savedAppearance();
      render();
      if (noticeTimer) root.clearTimeout?.(noticeTimer);
      noticeTimer = root.setTimeout?.(() => {
        model.clearNotice();
        render();
      }, 2600);
      return state;
    }

    function clear() {
      mount();
      const state = model.clear();
      render();
      return state;
    }

    const api = {
      VERSION,
      SAVE_NOTE,
      stepsFor,
      storageKey,
      shouldShow,
      markSeen,
      createOnboardingModel,
      mount,
      setPlayer,
      savedAppearance,
      clear,
    };
    return api;
  }

  return buildApi();
});
