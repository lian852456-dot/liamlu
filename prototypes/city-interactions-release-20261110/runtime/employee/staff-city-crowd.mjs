import { StaffControlError } from './staff-control.mjs';
import { validateRouteSegments } from './staff-runtime.mjs';

export const STAFF_CROWD_MAX_AGENTS = 41;
export const STAFF_CROWD_GRACE_MS = 120000;
export const STAFF_CROWD_SPEED = 0.8;
export const STAFF_CROWD_PUBLIC_RADIUS = 28;
export const STAFF_CROWD_PUBLIC_LIMIT = 18;

const PHOTO_PRESETS = new Set(['portrait-jialing-v1', 'portrait-yixin-v1', 'portrait-li-shuhuan-v1', 'portrait-trial-a-v1', 'portrait-trial-b-v1','photo-p1-v1','photo-p2-v1','photo-p4-v1']);
const GENERIC_APPEARANCE = Object.freeze({ character: 'orange', skin: 'orange', hair: '', outfit: '' });
const fail = (code, message = code, status = 409) => { throw new StaffControlError(code, message, status); };
const text = value => typeof value === 'string' && value.length > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function routePoint(value, fallbackScene = 'outdoor') {
  return {
    x: Number(value?.x),
    z: Number(value?.z),
    scene: value?.scene || fallbackScene,
    heading: value?.heading == null ? 0 : Number(value.heading)
  };
}

function pointAt(route, totalDistance, distance) {
  let remaining = ((distance % totalDistance) + totalDistance) % totalDistance;
  for (let index = 1; index < route.length; index += 1) {
    const a = route[index - 1], b = route[index];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (remaining <= length || index === route.length - 1) {
      const ratio = Math.min(1, remaining / length);
      return {
        x: a.x + (b.x - a.x) * ratio,
        z: a.z + (b.z - a.z) * ratio,
        scene: b.scene || a.scene || 'outdoor',
        heading: Math.atan2(b.x - a.x, b.z - a.z)
      };
    }
    remaining -= length;
  }
  const end = route.at(-1);
  return { x: end.x, z: end.z, scene: end.scene || 'outdoor', heading: end.heading || 0 };
}

function safeAppearance(profile, preset, { featured, personalized }) {
  if (!personalized && !featured) return { ...GENERIC_APPEARANCE };
  const appearance = {
    character: ['orange', 'sunny', 'forest', 'violet'].includes(profile?.character) ? profile.character : 'orange',
    skin: ['orange', 'teal', 'purple'].includes(profile?.skin) ? profile.skin : 'orange',
    hair: text(profile?.hair) ? profile.hair : '',
    outfit: text(profile?.outfit) ? profile.outfit : '',
  };
  if (PHOTO_PRESETS.has(preset)) appearance.avatarPreset = preset;
  if (['linked','display-unlinked'].includes(profile?.portraitBinding)) appearance.portraitBinding=profile.portraitBinding;
  return appearance;
}

function safeLimit(value, fallback, max, code) {
  const result = value == null ? fallback : Number(value);
  if (!Number.isInteger(result) || result < 1 || result > max) fail(code, code, 422);
  return result;
}

/**
 * In-memory staff crowd actor builder/sampler. Employee IDs remain internal;
 * host code supplies bindings and connected-session state. This helper does
 * not authenticate, persist, mutate wallets, or save player positions.
 */
export function createStaffCityCrowd({
  activeRoster,
  getBinding,
  getProfile,
  getConnectedSession,
  now = () => Date.now(),
  nav,
  sceneRules = {},
  routeFor,
  graceMs = STAFF_CROWD_GRACE_MS,
  speed = STAFF_CROWD_SPEED,
  maxAgents = STAFF_CROWD_MAX_AGENTS,
  publicRadius = STAFF_CROWD_PUBLIC_RADIUS,
  publicLimit = STAFF_CROWD_PUBLIC_LIMIT
} = {}) {
  if (!Array.isArray(activeRoster) && typeof activeRoster !== 'function') fail('ACTIVE_ROSTER_REQUIRED', 'activeRoster is required', 500);
  if (typeof getBinding !== 'function' || typeof getProfile !== 'function' || typeof getConnectedSession !== 'function') fail('CROWD_LOOKUPS_REQUIRED', 'server lookups are required', 500);
  const navigation = nav || sceneRules;
  if (typeof navigation?.validate !== 'function') fail('NAV_VALIDATOR_REQUIRED', 'nav.validate is required', 500);
  const makeRoute = typeof routeFor === 'function' ? routeFor : sceneRules?.routeFor;
  if (typeof makeRoute !== 'function') fail('ROUTE_BUILDER_REQUIRED', 'routeFor is required', 500);
  if (!Number.isSafeInteger(graceMs) || graceMs < 0) fail('INVALID_GRACE_MS');
  if (!finite(speed) || speed < 0) fail('INVALID_CROWD_SPEED');
  if (!Number.isSafeInteger(maxAgents) || maxAgents < 1 || maxAgents > STAFF_CROWD_MAX_AGENTS) fail('INVALID_MAX_AGENTS');
  if (!Number.isInteger(publicLimit) || publicLimit < 1 || publicLimit > STAFF_CROWD_PUBLIC_LIMIT) fail('INVALID_PUBLIC_LIMIT');
  if (!finite(publicRadius) || publicRadius < 0 || publicRadius > STAFF_CROWD_PUBLIC_RADIUS) fail('INVALID_PUBLIC_RADIUS');

  let actors = new Map();
  let lastStep = null;

  const clock = raw => {
    const value = raw == null ? Number(now()) : Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_TIME');
    return value;
  };

  const rosterRows = () => {
    const rows = typeof activeRoster === 'function' ? activeRoster() : activeRoster;
    if (!Array.isArray(rows)) fail('ACTIVE_ROSTER_REQUIRED', 'activeRoster must return an array', 500);
    return rows;
  };

  const build = at => {
    const rows = rosterRows().filter(row => row && row.active === true);
    if (rows.length > maxAgents) fail('ROSTER_TOO_LARGE', 'active roster exceeds bounded crowd', 422);
    const next = new Map();
    let featuredCount = 0;
    rows.forEach((row, index) => {
      if (!text(row.employeeId)) fail('ROSTER_INVALID', 'server employeeId is required', 422);
      const binding = getBinding(row.employeeId);
      const cityUID = binding?.cityUID;
      if (!text(cityUID)) return;
      const profile = getProfile(cityUID);
      if (!profile || typeof profile !== 'object') return;
      let route;
      try {
        route = (row.route || makeRoute(row.store, row, profile)).map(point => routePoint(point, row.scene || 'outdoor'));
        const audit = validateRouteSegments(route, navigation, { sampleStep: row.routeSampleStep || .5 });
        const personalized = row.personalized === true;
        const profilePreset = PHOTO_PRESETS.has(profile.avatarPreset) ? profile.avatarPreset : '';
        const candidatePreset = profilePreset || (!personalized && PHOTO_PRESETS.has(row.photoPreset) ? row.photoPreset : '');
        const displayName = personalized
          ? (profile.nickname || profile.displayName || row.displayName || '')
          : (row.displayName || profile.displayName || profile.nickname || '');
        const featured = PHOTO_PRESETS.has(candidatePreset) && text(displayName);
        if (featured) featuredCount += 1;
        if (featuredCount > 8) fail('PHOTO_PRESET_LIMIT', 'at most eight approved photo actors are allowed', 422);
        const prior = actors.get(row.employeeId);
        const sameBinding = prior?.cityUID === cityUID;
        const phaseFraction = finite(row.phaseFraction) && row.phaseFraction >= 0 && row.phaseFraction < 1
          ? row.phaseFraction : (index * .61803398875) % 1;
        const state = sameBinding ? prior.state : {
          distance: phaseFraction * audit.totalDistance,
          pose: pointAt(route, audit.totalDistance, phaseFraction * audit.totalDistance),
          npcActive: true,
          lastSession: undefined,
          disconnectedAt: null
        };
        next.set(row.employeeId, {
          employeeId: row.employeeId,
          cityUID,
          route,
          totalDistance: audit.totalDistance,
          state,
          nickname: personalized
            ? (profile.nickname || profile.displayName || row.displayName || '同仁')
            : (featured ? displayName : (row.maskedName || profile.maskedName || '同仁')),
          appearance: safeAppearance(profile, candidatePreset, { featured, personalized }),
          featured,
          personalized
        });
      } catch (error) {
        if (error instanceof StaffControlError) throw error;
        fail('ROUTE_INVALID', error.message, 422);
      }
    });
    actors = next;
    syncAll(at);
    return { active: actors.size, featured: featuredCount };
  };

  const sync = (actor, at) => {
    const session = getConnectedSession(actor.cityUID);
    const connected = text(session);
    if (connected) {
      actor.state.lastSession = session;
      actor.state.disconnectedAt = null;
      actor.state.npcActive = false;
      return;
    }
    if (actor.state.lastSession !== undefined && actor.state.disconnectedAt == null) {
      actor.state.disconnectedAt = at;
      actor.state.npcActive = false;
      return;
    }
    if (actor.state.disconnectedAt != null) {
      actor.state.npcActive = at - actor.state.disconnectedAt >= graceMs;
      return;
    }
    actor.state.npcActive = true;
  };
  const syncAll = at => { for (const actor of actors.values()) sync(actor, at); };

  const publicSnapshot = ({ center = {}, scene = center.scene || 'outdoor', radius = publicRadius, limit = publicLimit } = {}) => {
    const at = clock();
    if (!finite(center.x) || !finite(center.z) || !navigation.validate(center)) fail('PUBLIC_CENTER_ILLEGAL', 'center is outside legal nav', 422);
    const maxRadius = Number(radius);
    const maxLimit = safeLimit(limit, publicLimit, publicLimit, 'PUBLIC_LOD_BOUNDS');
    if (!finite(maxRadius) || maxRadius < 0 || maxRadius > publicRadius) fail('PUBLIC_LOD_BOUNDS', 'radius exceeds public bound', 422);
    syncAll(at);
    const poses = [];
    for (const actor of actors.values()) {
      if (!actor.state.npcActive || actor.state.pose.scene !== scene) continue;
      const distance = Math.hypot(actor.state.pose.x - center.x, actor.state.pose.z - center.z);
      if (distance <= maxRadius) poses.push({
        distance,
        opaqueAvatarId: actor.cityUID,
        nickname: actor.nickname,
        appearance: clone(actor.appearance),
        pose: { ...actor.state.pose }
      });
    }
    poses.sort((a, b) => a.distance - b.distance || a.opaqueAvatarId.localeCompare(b.opaqueAvatarId));
    return {
      scene,
      center: { x: center.x, z: center.z },
      radius: maxRadius,
      poses: poses.slice(0, maxLimit).map(({ distance, ...item }) => item)
    };
  };

  build(clock());

  return Object.freeze({
    rebuild(rawNow) { return build(clock(rawNow)); },
    roster() {
      return [...actors.values()].map(actor => ({
        cityUID: actor.cityUID,
        nickname: actor.nickname,
        appearance: clone(actor.appearance),
        featured: actor.featured
      }));
    },
    step(rawNow) {
      const at = clock(rawNow);
      if (lastStep != null && at < lastStep) fail('CLOCK_REWIND');
      const dt = lastStep == null ? 0 : Math.min((at - lastStep) / 1000, .25);
      lastStep = at;
      syncAll(at);
      if (dt > 0) for (const actor of actors.values()) {
        if (!actor.state.npcActive || actor.totalDistance <= 0) continue;
        actor.state.distance = (actor.state.distance + speed * dt) % actor.totalDistance;
        actor.state.pose = pointAt(actor.route, actor.totalDistance, actor.state.distance);
      }
      return { now: at, dt, active: actors.size, offline: [...actors.values()].filter(actor => actor.state.npcActive).length };
    },
    publicSnapshot,
    snapshot: publicSnapshot,
    stats() {
      return { active: actors.size, offline: [...actors.values()].filter(actor => actor.state.npcActive).length,
        featured: [...actors.values()].filter(actor => actor.featured).length, lastStep };
    },
    close() { actors = new Map(); lastStep = null; }
  });
}
