/* Isolated, mobile-first forest playground controls. It emits intents only;
 * the caller remains responsible for navigation, authorization, and server
 * seat assignment. */
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CozyForestPlaygroundControls = api;
})(typeof window === 'undefined' ? globalThis : window, function (root) {
  'use strict';

  const STATIONS = Object.freeze([
    Object.freeze({ id: 'swing', label: '鞦韆', seats: 1 }),
    Object.freeze({ id: 'seesaw', label: '蹺蹺板', seats: 2 }),
    Object.freeze({ id: 'bench', label: '長椅', seats: 2 }),
    Object.freeze({ id: 'slide', label: '溜滑梯', seats: 1, game: true }),
    Object.freeze({ id: 'balance', label: '平衡木', seats: 1, game: true }),
    Object.freeze({ id: 'stumps', label: '跳樁', seats: 1, game: true }),
  ]);
  const GAME_STATIONS = new Set(['slide', 'balance', 'stumps']);
  const FOREST_SCENES = new Set(['forest', 'forest-playground']);
  const text = value => String(value == null ? '' : value);
  const asArray = value => Array.isArray(value) ? value : [];
  const isForest = scene => FOREST_SCENES.has(text(scene));

  function create(options = {}) {
    const doc = root?.document || (typeof document === 'undefined' ? null : document);
    const onVisit = typeof options.onVisit === 'function' ? options.onVisit : () => {};
    const onLeave = typeof options.onLeave === 'function' ? options.onLeave : () => {};
    const onInput = typeof options.onInput === 'function' ? options.onInput : () => {};
    let disposed = false;
    let open = false;
    let state = { scene: '', connected: false, players: [], selfId: '' };
    let launcher = null;
    let panel = null;
    let renderedState = '';
    let lastSelfKey = '';
    let gameStatusNode = null;
    let gameGaugeNode = null;

    const el = (tag, className, label) => {
      if (!doc || typeof doc.createElement !== 'function') return null;
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (label != null) node.textContent = text(label);
      return node;
    };
    const clear = node => {
      if (!node) return;
      while (node.firstChild) node.removeChild(node.firstChild);
    };
    const append = (parent, ...children) => {
      children.forEach(child => {
        if (!parent || !child) return;
        if (typeof parent.append === 'function') parent.append(child);
        else parent.appendChild?.(child);
      });
    };
    const remove = node => {
      if (!node) return;
      if (typeof node.remove === 'function') node.remove();
      else node.parentNode?.removeChild?.(node);
    };

    function playersFor(station) {
      return asArray(state.players).filter(item => item && item.station === station);
    }

    function selfOccupancy() {
      const selfId = text(state.selfId);
      if (!selfId) return null;
      return asArray(state.players).find(item => item && text(item.uid) === selfId) || null;
    }

    function seatSummary(station) {
      const definition = STATIONS.find(item => item.id === station);
      const seats = new Set();
      playersFor(station).forEach(item => {
        if (item.seat != null) seats.add(text(item.seat));
      });
      const occupied = Math.min(definition?.seats || 0, seats.size);
      const total = definition?.seats || 0;
      return `${occupied}/${total} 席使用中 · ${Math.max(0, total - occupied)} 席可用`;
    }

    function close() {
      open = false;
      if (launcher) launcher.hidden = !isForest(state.scene) || open;
      if (panel) panel.hidden = true;
    }

    function show() {
      if (disposed || !isForest(state.scene)) return false;
      open = true;
      if (launcher) launcher.hidden = true;
      if (panel) panel.hidden = false;
      render();
      return true;
    }

    function visit(station) {
      if (disposed || !state.connected || selfOccupancy()) return false;
      if (!STATIONS.some(item => item.id === station)) return false;
      onVisit(station);
      close();
      launcher?.setAttribute('aria-expanded', 'false');
      return true;
    }

    function leave() {
      if (disposed || !selfOccupancy()) return false;
      onLeave();
      return true;
    }

    function gameStage(self, station) {
      const phase = text(self?.game?.phase);
      const step = Math.max(0, Math.min(5, Number(self?.game?.step) || 0));
      if (station.id === 'slide') {
        if (phase === 'climbing') return '正在爬木梯…';
        if (phase === 'sliding') return '滑行中…';
        if (phase === 'complete') return '回起點中…';
        return '前往溜滑梯中…';
      }
      if (station.id === 'balance') {
        if (phase === 'ready') return '站上乾平台，可開始平衡。';
        if (phase === 'playing') return '保持平衡，使用左右修正。';
        if (phase === 'falling') return '噗通！回岸邊囉';
        if (phase === 'recovering') return '爬回平台中…';
        if (phase === 'complete') return '完成一輪，可再玩一次。';
        return '正走向平衡木…';
      }
      if (phase === 'ready') return `第 ${Math.min(5, step + 1)}/5 根，按下跳下一根。`;
      if (phase === 'playing') return `跳躍中・第 ${Math.min(5, step + 1)}/5`;
      if (phase === 'complete') return '完成 5/5，可重新開始。';
      return '正走向跳樁…';
    }

    function gameActions(self, station) {
      if (!self || !station.game || text(self.station) !== station.id) return [];
      const phase = text(self.game?.phase);
      if (!state.connected) return [{ label: '等待連線', action: '', disabled: true }];
      if (station.id === 'balance') {
        const controls = [
          { label: '向左', action: 'left', disabled: phase !== 'playing' },
          { label: '向右', action: 'right', disabled: phase !== 'playing' },
        ];
        if (phase === 'ready') controls.push({ label: '開始平衡', action: 'start' });
        else if (phase === 'complete') controls.push({ label: '再玩一次', action: 'retry' });
        if (phase === 'falling' || phase === 'recovering') {
          controls.push({ label: phase === 'falling' ? '噗通！回岸邊囉' : '爬回平台中…', action: '', disabled: true });
        }
        return controls;
      }
      if (station.id === 'stumps') {
        if (phase === 'ready') return [{ label: '跳下一根', action: 'jump' }];
        if (phase === 'complete') return [{ label: '重新開始', action: 'retry' }];
        if (phase === 'falling' || phase === 'recovering' || phase === 'playing') {
          return [{ label: phase === 'playing' ? '跳躍中…' : '恢復中…', action: '', disabled: true }];
        }
        return [{ label: '接近中…', action: '', disabled: true }];
      }
      return [{ label: '自動遊玩中…', action: '', disabled: true }];
    }

    function updateGameLive(self) {
      if (!gameStatusNode || !gameGaugeNode || !self) return;
      const station = STATIONS.find(item => item.id === text(self.station));
      if (!station) return;
      gameStatusNode.textContent = gameStage(self, station);
      if (station.id === 'balance') {
        const balance = Number(self.game?.balance);
        const value = Number.isFinite(balance) ? balance : 0;
        gameGaugeNode.textContent = `平衡值 ${value.toFixed(2)}`;
        gameGaugeNode.setAttribute('aria-valuenow', String(value));
      } else if (station.id === 'stumps') {
        const step = Math.max(0, Math.min(5, Number(self.game?.step) || 0));
        gameGaugeNode.textContent = `進度 ${step}/5`;
      } else {
        gameGaugeNode.textContent = '自動流程';
      }
    }

    function renderGameCard(self, station) {
      const card = el('div', 'cozy-playground-controls-game-card');
      const title = el('strong', 'cozy-playground-controls-game-title', station.label);
      const status = el('p', 'cozy-playground-controls-game-status');
      const gauge = el('div', 'cozy-playground-controls-game-gauge');
      gauge.setAttribute('role', 'status');
      gauge.setAttribute('aria-live', 'polite');
      if (station.id === 'balance') gauge.setAttribute('aria-valuemin', '-1');
      if (station.id === 'balance') gauge.setAttribute('aria-valuemax', '1');
      const actions = el('div', 'cozy-playground-controls-actions');
      gameActions(self, station).forEach(item => {
        const actionButton = el('button', 'cozy-playground-controls-action', item.label);
        actionButton.type = 'button';
        actionButton.dataset.station = station.id;
        actionButton.dataset.action = item.action;
        actionButton.disabled = !!item.disabled;
        actionButton.setAttribute('aria-label', item.label);
        actionButton.addEventListener('click', () => { if (input(station.id, item.action)) render(); });
        append(actions, actionButton);
      });
      gameStatusNode = status;
      gameGaugeNode = gauge;
      append(card, title, status, gauge, actions);
      updateGameLive(self);
      append(panel._body, card);
    }

    function input(station, action) {
      if (disposed || !state.connected || !GAME_STATIONS.has(station) || !action) return false;
      const self = selfOccupancy();
      if (!self || text(self.station) !== station) return false;
      onInput({ station, action });
      return true;
    }

    function ensure() {
      if (!doc || !doc.body || launcher || panel) return;
      launcher = el('button', 'cozy-playground-controls-launcher', '林間遊樂');
      launcher.type = 'button';
      launcher.id = 'forest-playground-open';
      launcher.setAttribute('aria-controls', 'forest-playground-panel');
      launcher.setAttribute('aria-expanded', 'false');
      launcher.addEventListener('click', () => {
        if (open) close();
        else show();
        launcher.setAttribute('aria-expanded', String(open));
      });

      panel = el('aside', 'cozy-playground-controls-panel');
      panel.id = 'forest-playground-panel';
      panel.hidden = true;
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-label', '林間遊樂');
      const header = el('div', 'cozy-playground-controls-header');
      const title = el('strong', 'cozy-playground-controls-title', '林間遊樂');
      const closeButton = el('button', 'cozy-playground-controls-close', '×');
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', '關閉林間遊樂');
      closeButton.addEventListener('click', () => {
        close();
        launcher?.setAttribute('aria-expanded', 'false');
      });
      append(header, title, closeButton);
      const status = el('p', 'cozy-playground-controls-status');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      const body = el('div', 'cozy-playground-controls-body');
      panel._header = header;
      panel._status = status;
      panel._body = body;
      append(panel, header, status, body);
      append(doc.body, launcher, panel);
    }

    function render() {
      ensure();
      if (!launcher || !panel) return;
      const inForest = isForest(state.scene);
      const self = selfOccupancy();
      launcher.hidden = !inForest || open;
      launcher.setAttribute('aria-expanded', String(open));
      panel.hidden = !inForest || !open;
      panel._status.textContent = !state.connected
        ? '目前離線，請等連線後再前往遊具。'
        : self
          ? GAME_STATIONS.has(text(self.station))
            ? `你正在使用${STATIONS.find(item => item.id === self.station)?.label || '遊具'}。`
            : '你正在使用設施，按「離開設施」或移動即可起身。'
          : '選擇遊具，角色會先走過去。';
      const gameActive = !!self && GAME_STATIONS.has(text(self.station));
      panel.className = `cozy-playground-controls-panel${gameActive ? ' cozy-playground-controls-panel-game-active' : ''}`;
      // A game card already names the active station and owns its live stage
      // copy. Hide the generic shell title/status while active so the compact
      // mobile card does not repeat the same information three times.
      if (panel._header) panel._header.hidden = gameActive;
      panel._status.hidden = gameActive;
      clear(panel._body);
      gameStatusNode = null;
      gameGaugeNode = null;
      if (self) {
        const leaveButton = el('button', 'cozy-playground-controls-leave', '離開設施');
        leaveButton.type = 'button';
        leaveButton.addEventListener('click', () => { if (leave()) render(); });
        append(panel._body, leaveButton);
      }
      if (gameActive) {
        const station = STATIONS.find(item => item.id === text(self.station));
        renderGameCard(self, station);
        return;
      }
      STATIONS.forEach(station => {
        const row = el('div', 'cozy-playground-controls-row');
        const copy = el('div', 'cozy-playground-controls-copy');
        const name = el('strong', null, station.label);
        const count = el('small', 'cozy-playground-controls-count', seatSummary(station.id));
        append(copy, name, count);
        const button = el('button', 'cozy-playground-controls-visit', `前往${station.label}`);
        button.type = 'button';
        button.dataset.station = station.id;
        button.disabled = !state.connected || !!self;
        button.setAttribute('aria-label', `前往${station.label}，${seatSummary(station.id)}`);
        button.addEventListener('click', () => visit(station.id));
        append(row, copy, button);
        append(panel._body, row);
      });
    }

    function setState(next = {}) {
      if (disposed) return state;
      const input = next && typeof next === 'object' ? next : {};
      const previousSelf = selfOccupancy();
      state = {
        scene: input.scene === undefined ? state.scene : text(input.scene),
        connected: input.connected === undefined ? !!state.connected : input.connected === true,
        players: input.players === undefined ? state.players : asArray(input.players),
        selfId: input.selfId === undefined ? state.selfId : text(input.selfId),
      };
      ensure();
      const nextSelf = selfOccupancy();
      const nextSelfKey = nextSelf ? `${text(nextSelf.uid)}:${text(nextSelf.station)}` : '';
      if (nextSelf && GAME_STATIONS.has(text(nextSelf.station)) && nextSelfKey !== lastSelfKey && isForest(state.scene)) {
        open = true;
        if (panel) panel.hidden = false;
      }
      if (!nextSelf && previousSelf) open = false;
      lastSelfKey = nextSelfKey;
      if (!isForest(state.scene)) {
        open = false;
        if (panel) panel.hidden = true;
      }
      const signature = JSON.stringify([state.scene,state.connected,state.selfId,
        state.players.map(item => [item?.uid,item?.station,item?.seat,
          // phase/step/round change the available controls. High-frequency
          // progress/balance snapshots stay out of this signature so a 200ms
          // server tick never removes a button between pointerdown/pointerup.
          item?.game?.phase,item?.game?.step,item?.game?.round])]);
      if (signature !== renderedState) {
        renderedState = signature;
        render();
      } else if (nextSelf && GAME_STATIONS.has(text(nextSelf.station))) {
        // game.at/progress/balance snapshots arrive frequently; update only
        // existing text nodes so a touch target survives pointerdown/up.
        updateGameLive(nextSelf);
      }
      return state;
    }

    ensure();
    setState(state);
    return Object.freeze({ setState, dispose() {
      if (disposed) return;
      disposed = true;
      remove(launcher);
      remove(panel);
      launcher = null;
      panel = null;
    } });
  }

  return Object.freeze({ create, STATIONS });
});
