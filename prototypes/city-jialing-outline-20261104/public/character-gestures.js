/* Small, additive character gestures.  The world owns position and movement;
 * this module only layers short pose offsets on top of an already animated
 * character, then removes every offset when the gesture completes. */
(function(root, factory){
  'use strict';
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  root.CozyCharacterGestures = api;
})(typeof window === 'undefined' ? globalThis : window, function(){
  'use strict';

  const DURATIONS = Object.freeze({ greet: 1500, highfive: 1700, stumble: 2600 });
  const active = typeof WeakMap === 'function' ? new WeakMap() : new Map();
  const VALID = new Set(Object.keys(DURATIONS));
  const finite = value => Number.isFinite(Number(value));
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const smooth = value => value * value * (3 - 2 * value);
  const normalizeKind = kind => {
    const value = String(kind || '').trim().toLowerCase().replace(/[-_ ]/g, '');
    if(value === 'wave' || value === 'hello' || value === 'greeting') return 'greet';
    if(value === 'highfive' || value === 'high5' || value === 'high-five') return 'highfive';
    if(value === 'fall' || value === 'trip' || value === 'stumble') return 'stumble';
    return VALID.has(value) ? value : null;
  };
  const axis = (node, key) => node && node[key] && finite(node[key].x) && finite(node[key].y) && finite(node[key].z)
    ? node[key] : null;
  const transform = node => node && {
    node,
    rotation: axis(node, 'rotation'),
    position: axis(node, 'position')
  };

  function partNodes(model){
    const group = model && model.group;
    const direct = group && Array.isArray(group.children) ? group.children : [];
    const arms = model && Array.isArray(model.arms) ? model.arms.filter(Boolean) : [];
    const legs = model && Array.isArray(model.legs) ? model.legs.filter(Boolean) : [];
    const headNodes = [];
    const named = model && (model.head || model.headGroup || model.face);
    if(named) headNodes.push(named);
    for(const node of direct){
      if(!node || headNodes.includes(node)) continue;
      const name = String(node.name || '').toLowerCase();
      if(name.includes('head') || name.includes('face')) headNodes.push(node);
      else if(node.userData && (node.userData.characterHair || node.userData.characterHead)) headNodes.push(node);
      else if(node.geometry && node.position && Number(node.position.y) >= 1.5 &&
        String(node.geometry.type || '').toLowerCase().includes('sphere')) headNodes.push(node);
      else if(Array.isArray(node.children) && node.children.length &&
        node.children.some(child => child && child.geometry && String(child.geometry.type || '').toLowerCase().includes('sphere') && Number(child.position?.y) > 1.4)) headNodes.push(node);
    }
    return { group, arms, legs, headNodes };
  }

  function pushOffset(state, node, path, amount){
    if(!node || !amount || !['x','y','z'].some(axisName => finite(amount[axisName]) && Number(amount[axisName]) !== 0)) return;
    const target = path === 'rotation' ? node.rotation : node.position;
    if(!target) return;
    const key = path + ':' + (state.applied.length);
    const item = { node, path, amount, axis: key };
    state.applied.push(item);
    target.z += amount.z || 0;
    target.x += amount.x || 0;
    target.y += amount.y || 0;
  }

  function restore(state){
    if(!state || !Array.isArray(state.applied)) return;
    for(let i = state.applied.length - 1; i >= 0; i--){
      const item = state.applied[i];
      const target = item.node && item.node[item.path];
      if(!target) continue;
      target.z -= item.amount.z || 0;
      target.x -= item.amount.x || 0;
      target.y -= item.amount.y || 0;
    }
    state.applied.length = 0;
  }

  function greet(progress){
    const wave = Math.sin(progress * Math.PI * 5.5) * (0.48 + 0.15 * (1 - progress));
    const envelope = Math.sin(Math.min(1, progress) * Math.PI);
    return {
      stage: progress < .18 ? 'raise' : progress < .82 ? 'wave' : 'lower',
      groupX: 0, groupZ: 0, bodyY: 0,
      headX: Math.sin(progress * Math.PI * 2) * .075 * envelope,
      headZ: Math.sin(progress * Math.PI) * .035,
      rightArmX: -.82 * envelope,
      rightArmZ: -1.05 + wave * .22,
      leftArmX: 0, leftArmZ: 0,
      legsX: 0, legsY: 0
    };
  }

  function highfive(progress){
    const up = smooth(clamp(progress / .28));
    const hold = progress < .7 ? 1 : 1 - smooth(clamp((progress - .7) / .3));
    const arm = -1.05 * up * hold;
    return {
      stage: progress < .28 ? 'reach' : progress < .7 ? 'tap' : 'celebrate',
      groupX: 0, groupZ: Math.sin(progress * Math.PI) * -.045, bodyY: Math.sin(progress * Math.PI) * .055,
      headX: Math.sin(progress * Math.PI * 2) * .05,
      headZ: 0,
      rightArmX: arm, rightArmZ: -.55 * hold,
      leftArmX: -.2 * hold, leftArmZ: .22 * hold,
      legsX: progress < .7 ? -.12 * up : .08 * (1 - hold),
      legsY: progress < .7 ? .02 * up : 0
    };
  }

  function stumble(progress){
    let stage, groupZ, groupX, bodyY, headX, rightArmX, leftArmX, rightArmZ, leftArmZ, legsX, legsY;
    if(progress < .24){
      const p = smooth(progress / .24); stage = 'stumble'; groupZ = -.36 * p; groupX = .06 * p; bodyY = -.035 * p; headX = -.12 * p;
      rightArmX = -.22 * p; leftArmX = -.55 * p; rightArmZ = -.45 * p; leftArmZ = .55 * p; legsX = -.1 * p; legsY = 0;
    } else if(progress < .52){
      const p = smooth((progress - .24) / .28); stage = 'catch'; groupZ = -.36 - .04 * p; groupX = .06 + .025 * p; bodyY = -.035 - .35 * p; headX = -.12 + .22 * p;
      rightArmX = -.22 + .55 * p; leftArmX = -.55 + .9 * p; rightArmZ = -.45 - .35 * p; leftArmZ = .55 - .85 * p; legsX = -.1 - 1.05 * p; legsY = .02 * p;
    } else if(progress < .73){
      const p = smooth((progress - .52) / .21); stage = 'sit'; groupZ = -.40 + .16 * p; groupX = .085 - .06 * p; bodyY = -.385 - .03 * Math.sin(p * Math.PI); headX = .1 - .08 * p;
      rightArmX = .33 - .1 * p; leftArmX = .35 - .05 * p; rightArmZ = -.8 + .55 * p; leftArmZ = -.3 + .15 * p; legsX = -1.15 + .1 * p; legsY = .02 * (1 - p);
    } else {
      const p = smooth((progress - .73) / .27); stage = 'stand'; groupZ = -.24 * (1 - p); groupX = .025 * (1 - p); bodyY = -.385 * (1 - p); headX = .02 * (1 - p);
      rightArmX = (.23 + Math.sin(p * Math.PI * 6) * .4) * (1 - p); leftArmX = .3 * (1 - p); rightArmZ = -.25 * (1 - p); leftArmZ = -.15 * (1 - p); legsX = -1.05 * (1 - p); legsY = .02 * (1 - p);
    }
    return {stage, groupX, groupZ, bodyY, headX, headZ:groupZ * -.18,
      rightArmX, rightArmZ, leftArmX, leftArmZ, legsX, legsY};
  }

  function poseSample(kind, elapsed){
    const key = normalizeKind(kind), duration = key ? DURATIONS[key] : 0;
    if(!key) return {kind:null, elapsed:0, progress:1, stage:'none', done:true};
    const ms = clamp(finite(elapsed) ? Number(elapsed) : 0, 0, duration);
    const progress = duration ? ms / duration : 1;
    const pose = key === 'greet' ? greet(progress) : key === 'highfive' ? highfive(progress) : stumble(progress);
    return Object.assign({kind:key, elapsed:ms, progress, done:ms >= duration}, pose);
  }

  function applyPose(state, pose){
    const parts = partNodes(state.model), group = parts.group;
    if(!group) return;
    pushOffset(state, group, 'rotation', {x:pose.groupX || 0, z:pose.groupZ || 0});
    pushOffset(state, group, 'position', {y:pose.bodyY || 0});
    const right = parts.arms[1] || parts.arms[0], left = parts.arms[0];
    if(right) pushOffset(state, right, 'rotation', {x:pose.rightArmX || 0, z:pose.rightArmZ || 0});
    if(left && left !== right) pushOffset(state, left, 'rotation', {x:pose.leftArmX || 0, z:pose.leftArmZ || 0});
    for(const node of parts.headNodes) pushOffset(state, node, 'rotation', {x:pose.headX || 0, z:pose.headZ || 0});
    for(const leg of parts.legs) pushOffset(state, leg, 'rotation', {x:pose.legsX || 0});
    if(parts.legs[0]) pushOffset(state, parts.legs[0], 'position', {y:pose.legsY || 0});
    if(parts.legs[1]) pushOffset(state, parts.legs[1], 'position', {y:-(pose.legsY || 0)});
  }

  function finish(state){
    restore(state);
    if(active.get(state.model) === state) active.delete(state.model);
    state.done = true;
    return state;
  }

  function start(model, kind, startMs){
    const key = normalizeKind(kind);
    if(active.has(model)) reset(model);
    const state = {model, kind:key, startMs:finite(startMs) ? Number(startMs) : 0, duration:key ? DURATIONS[key] : 0, applied:[], done:!key};
    if(model && key) active.set(model, state);
    return Object.assign(state, {
      update(now){
        const elapsed = finite(now) ? Number(now) - state.startMs : 0;
        return update(state, elapsed);
      },
      reset(){ return reset(model); }
    });
  }

  function update(target, elapsed){
    const state = target && target.model && target.applied ? target : active.get(target);
    if(!state || state.done || !state.kind) return {done:true, kind:state?.kind || null, progress:1, stage:'none'};
    restore(state);
    const pose = poseSample(state.kind, elapsed);
    if(pose.done) return finish(state);
    applyPose(state, pose);
    state.last = pose;
    return pose;
  }

  function reset(model){
    const state = model && model.model && model.applied ? model : active.get(model);
    if(!state) return false;
    restore(state);
    state.done = true;
    if(active.get(state.model) === state) active.delete(state.model);
    return true;
  }

  function apply(model, kind, elapsed, startMs){
    let state = active.get(model);
    const key = normalizeKind(kind);
    if(!state || state.kind !== key || (finite(startMs) && state.startMs !== Number(startMs))) state = start(model, key, startMs);
    return update(state, elapsed);
  }

  return Object.freeze({duration:kind => { const key=normalizeKind(kind); return key ? DURATIONS[key] : 0; }, poseSample, start, update, apply, reset, normalizeKind});
});
