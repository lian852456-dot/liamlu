(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CozyStaffPeerRender = api;
})(typeof window === 'undefined' ? globalThis : window, function (root) {
  'use strict';

  const text = value => typeof value === 'string' ? value : String(value == null ? '' : value);
  const idOf = peer => text(peer?.id || peer?.uid || peer?.opaqueAvatarId);
  const poseOf = peer => peer?.pose || peer?.position || peer || {};
  const distance = (peer, center = {}) => {
    const pose = poseOf(peer), x = Number(pose.x), z = Number(pose.z);
    const cx = Number(center.x), cz = Number(center.z);
    return [x, z, cx, cz].every(Number.isFinite) ? (x - cx) ** 2 + (z - cz) ** 2 : Infinity;
  };

  function worldOfflinePeer(item) {
    const appearance = item?.appearance || item || {};
    const profile = {};
    for (const key of ['character', 'skin', 'hair', 'outfit', 'avatarPreset']) {
      if (typeof appearance[key] === 'string') profile[key] = appearance[key];
    }
    return { id: idOf(item), nickname: text(item?.nickname || '同仁'), ...profile,
      pose: { ...poseOf(item), moving: item?.pose?.moving !== false } };
  }

  function selectPeers(realPeers, offlinePeers, selfId, center, limit) {
    const max = Math.max(0, Math.floor(Number(limit) || 0));
    const self = text(selfId);
    const realIds = new Set();
    const real = (Array.isArray(realPeers) ? realPeers : []).filter(peer => {
      const id = idOf(peer);
      if (!id || id === self || realIds.has(id)) return false;
      realIds.add(id);
      return true;
    }).sort((a, b) => distance(a, center) - distance(b, center));
    const selected = real.slice(0, max);
    const offlineIds = new Set();
    (Array.isArray(offlinePeers) ? offlinePeers : []).filter(peer => {
      const id = idOf(peer);
      if (!id || id === self || realIds.has(id) || offlineIds.has(id)) return false;
      offlineIds.add(id);
      return true;
    }).sort((a, b) => distance(a, center) - distance(b, center))
      .slice(0, Math.max(0, max - selected.length))
      .forEach(peer => selected.push(peer));
    return selected;
  }

  function createStaffPeerRender({
    world,
    fetchCrowd,
    getSelfId = () => '',
    getScene = () => world?.getScene?.() || 'outdoor',
    getPose = () => world?.getPose?.() || {},
    isTouch = null,
    touchLimit = 16,
    desktopLimit = 24
  } = {}) {
    if (!world || typeof world.setPeers !== 'function') throw new TypeError('STAFF_WORLD_REQUIRED');
    if (typeof fetchCrowd !== 'function') throw new TypeError('STAFF_CROWD_FETCH_REQUIRED');
    if (!Number.isInteger(touchLimit) || touchLimit < 1 || !Number.isInteger(desktopLimit) || desktopLimit < 1) throw new TypeError('STAFF_PEER_LIMIT_INVALID');
    const originalSetPeers = world.setPeers;
    const originalCall = originalSetPeers.bind(world);
    let realPeers = [];
    let offlinePeers = [];
    let disposed = false;
    let lastRendered = [];
    let lastError = null;

    const touch = () => {
      if (typeof isTouch === 'function') return isTouch() === true;
      return Number(root?.navigator?.maxTouchPoints || 0) > 0 || Number(root?.innerWidth || 1024) < 600;
    };
    const limit = () => touch() ? touchLimit : desktopLimit;
    const scene = () => { try { return text(getScene?.() || 'outdoor'); } catch (_) { return 'outdoor'; } };
    const center = () => { try { return getPose?.() || {}; } catch (_) { return {}; } };
    const render = () => {
      if (disposed) return [];
      const selected = selectPeers(realPeers, scene() === 'outdoor' ? offlinePeers : [], getSelfId?.(), center(), limit());
      lastRendered = selected;
      originalCall(selected);
      return selected;
    };
    const wrapped = peers => {
      realPeers = Array.isArray(peers) ? peers.slice() : [];
      return render();
    };
    wrapped._staffPeerRenderWrapped = true;
    world.setPeers = wrapped;

    return Object.freeze({
      setRealPeers(peers) { realPeers = Array.isArray(peers) ? peers.slice() : []; return render(); },
      setOfflinePeers(peers) { offlinePeers = Array.isArray(peers) ? peers.map(worldOfflinePeer) : []; return render(); },
      async refresh() {
        if (disposed) return { disposed: true, rendered: 0 };
        if (scene() !== 'outdoor') {
          offlinePeers = [];
          render();
          return { rendered: lastRendered.length, offline: 0, limit: limit(), scene: scene() };
        }
        const p = center();
        try {
          const data = await fetchCrowd({ x: Number(p.x) || 0, z: Number(p.z) || 0, scene: 'outdoor' });
          offlinePeers = Array.isArray(data?.poses) ? data.poses.map(worldOfflinePeer) : [];
          lastError = null;
        } catch (error) {
          offlinePeers = [];
          lastError = error;
        }
        render();
        return { rendered: lastRendered.length, offline: offlinePeers.length, limit: limit(), scene: scene(), error: lastError?.message || null };
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        if (world.setPeers === wrapped) world.setPeers = originalSetPeers;
        originalCall(realPeers);
        offlinePeers = [];
        lastRendered = realPeers.slice();
      },
      state() { return { disposed, real: realPeers.length, offline: offlinePeers.length, rendered: lastRendered.length, limit: limit(), scene: scene(), error: lastError?.message || null }; }
    });
  }

  return Object.freeze({ create: createStaffPeerRender, selectPeers });
});
