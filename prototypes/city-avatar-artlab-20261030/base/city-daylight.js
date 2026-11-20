/*
 * Server-anchored daylight for the Cozy Pocket Taipei candidate.
 *
 * This module is deliberately presentation-only.  It does not read the
 * device locale or clock: callers pass a server epoch (UTC milliseconds),
 * which is converted to Taiwan time (UTC+08:00, no DST).  The renderer can
 * opt in through create().  Keeping the colour sampler pure makes the
 * day/dusk/night schedule deterministic in screenshots and tests.
 */
(function (root, factory) {
  const api = factory();
  if (root) root.CozyDaylight = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const TAIPEI_OFFSET_MINUTES = 8 * 60;
  const MINUTES_PER_DAY = 24 * 60;

  // These daytime values intentionally match the existing finish candidate.
  // The other stops are restrained so street names, actors and shop fronts
  // remain legible on a small screen after the lights are connected by world.js.
  const DAY = Object.freeze({
    sky: 0x9acde7,
    fog: 0xc9dce8,
    sunColor: 0xffefd4,
    intensity: 3.6,
    hemiIntensity: .46,
    environmentIntensity: .16,
    nightFactor: 0,
    warmFactor: 0
  });
  const DAWN = Object.freeze({
    sky: 0xf1b487,
    fog: 0xd9b29c,
    sunColor: 0xffaa72,
    intensity: 2.05,
    hemiIntensity: .52,
    environmentIntensity: .2,
    nightFactor: .28,
    warmFactor: .82
  });
  const DUSK = Object.freeze({
    sky: 0xefaa70,
    fog: 0xd8ad8b,
    sunColor: 0xff9958,
    intensity: 2.1,
    hemiIntensity: .5,
    environmentIntensity: .21,
    nightFactor: .38,
    warmFactor: .96
  });
  const NIGHT = Object.freeze({
    sky: 0x233b59,
    fog: 0x3c5267,
    sunColor: 0x8ea8d0,
    intensity: .35,
    hemiIntensity: .34,
    environmentIntensity: .16,
    nightFactor: 1,
    warmFactor: .72
  });

  function assertEpoch(value, label) {
    const name = label || 'epochMs';
    if (value instanceof Date) {
      const dateEpoch = value.getTime();
      if (Number.isFinite(dateEpoch)) return dateEpoch;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    throw new TypeError(name + ' must be a finite UTC epoch in milliseconds');
  }

  function clamp01(value) {
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  function smoothstep(value) {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function blendColor(from, to, amount) {
    const a = parseColor(from);
    const b = parseColor(to);
    const t = clamp01(Number(amount));
    const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
    const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
    const bl = Math.round(lerp(a & 255, b & 255, t));
    return (r << 16) | (g << 8) | bl;
  }

  function parseColor(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value & 0xffffff;
    if (typeof value === 'string' && /^#?[0-9a-f]{6}$/i.test(value)) return parseInt(value.replace(/^#/, ''), 16);
    throw new TypeError('colour must be a finite number or six-digit hex string');
  }

  function localMinutes(epoch) {
    // Epoch is absolute UTC.  Adding Taiwan's fixed offset is independent of
    // the browser's locale and works for dates before/after midnight too.
    const raw = epoch / 60000 + TAIPEI_OFFSET_MINUTES;
    return ((raw % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  }

  function interpolate(from, to, amount) {
    const t = smoothstep(amount);
    return {
      sky: blendColor(from.sky, to.sky, t),
      fog: blendColor(from.fog, to.fog, t),
      sunColor: blendColor(from.sunColor, to.sunColor, t),
      intensity: lerp(from.intensity, to.intensity, t),
      hemiIntensity: lerp(from.hemiIntensity, to.hemiIntensity, t),
      environmentIntensity: lerp(from.environmentIntensity, to.environmentIntensity, t),
      nightFactor: lerp(from.nightFactor, to.nightFactor, t),
      warmFactor: lerp(from.warmFactor, to.warmFactor, t)
    };
  }

  function stateAt(minutes) {
    // Dawn: deep night until 04:30, then a gentle dawn ramp to daylight at
    // 07:00.  Dusk deliberately has a warm plateau around 18:00 so the user
    // can see the orange transition instead of a purple midpoint.
    if (minutes < 270) return { values: NIGHT, phase: 'night', label: '夜間' };
    if (minutes < 360) return { values: interpolate(NIGHT, DAWN, (minutes - 270) / 90), phase: 'dawn', label: '晨光' };
    if (minutes < 420) return { values: interpolate(DAWN, DAY, (minutes - 360) / 60), phase: 'dawn', label: '晨光' };
    if (minutes < 990) return { values: DAY, phase: 'day', label: '白天' };
    if (minutes < 1035) return { values: interpolate(DAY, DUSK, (minutes - 990) / 45), phase: 'dusk', label: '夕陽' };
    if (minutes < 1125) return { values: DUSK, phase: 'dusk', label: '夕陽' };
    if (minutes < 1170) return { values: interpolate(DUSK, NIGHT, (minutes - 1125) / 45), phase: 'dusk', label: '暮色' };
    return { values: NIGHT, phase: 'night', label: '夜間' };
  }

  function sample(epochMs) {
    const epoch = assertEpoch(epochMs);
    const minutes = localMinutes(epoch);
    const stop = stateAt(minutes);
    return Object.freeze({
      phase: stop.phase,
      label: stop.label,
      sky: stop.values.sky,
      fog: stop.values.fog,
      sunColor: stop.values.sunColor,
      intensity: stop.values.intensity,
      hemiIntensity: stop.values.hemiIntensity,
      environmentIntensity: stop.values.environmentIntensity,
      nightFactor: stop.values.nightFactor,
      warmFactor: stop.values.warmFactor,
      taipeiMinutes: minutes
    });
  }

  function setColor(target, value) {
    if (!target) return;
    if (target.color && typeof target.color.setHex === 'function') target.color.setHex(value);
    else if (typeof target.setHex === 'function') target.setHex(value);
  }

  function create(options) {
    const opts = options || {};
    const scene = opts.scene || null;
    const sun = opts.sun || null;
    const hemi = opts.hemi || opts.hemisphere || null;
    const ambient = opts.ambient || opts.fill || null;
    function apply(epochMs) {
      const state = sample(epochMs);
      if (scene) {
        setColor(scene.background, state.sky);
        if (scene.fog) setColor(scene.fog, state.fog);
        scene.environmentIntensity = state.environmentIntensity;
      }
      if (sun) {
        setColor(sun, state.sunColor);
        sun.intensity = state.intensity;
      }
      if (hemi) hemi.intensity = state.hemiIntensity;
      if (ambient) ambient.intensity = state.hemiIntensity;
      return state;
    }
    return Object.freeze({ sample, apply, blendColor });
  }

  function createClock(nowLocal) {
    const origin = assertEpoch(nowLocal == null ? Date.now() : nowLocal, 'nowLocal');
    let offset = null;
    return Object.freeze({
      sync(serverEpoch, localNow) {
        const server = assertEpoch(serverEpoch, 'serverEpoch');
        // Every snapshot supplies its own monotonic stamp (performance.now()).
        // Replacing the offset from that pair prevents repeated syncs from
        // adding the previous offset a second time.
        const local = assertEpoch(localNow == null ? origin : localNow, 'nowLocal');
        offset = server - local;
        return server;
      },
      read(localNow) {
        if (offset == null) throw new Error('server clock has not been synchronized');
        const local = assertEpoch(localNow == null ? Date.now() : localNow, 'nowLocal');
        return local + offset;
      },
      get synced() { return offset != null; },
      get offsetMs() { return offset; }
    });
  }

  return Object.freeze({
    TAIPEI_OFFSET_MINUTES,
    sample,
    blendColor,
    create,
    createClock
  });
}));
