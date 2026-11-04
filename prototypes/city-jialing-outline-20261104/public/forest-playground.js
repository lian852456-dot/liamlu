/* Isolated visual playground module. It never owns collision, navigation, or server state. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CozyForestPlayground = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const STATIONS = Object.freeze({
    swing: Object.freeze({
      id: 'swing',
      center: Object.freeze({ x: -4.8, z: 2 }),
      stand: Object.freeze({ x: -6.5, z: 2 }),
      seats: Object.freeze(['single']),
    }),
    seesaw: Object.freeze({
      id: 'seesaw',
      center: Object.freeze({ x: -4.8, z: 15 }),
      stand: Object.freeze({ x: -6.5, z: 15 }),
      seats: Object.freeze(['left', 'right']),
    }),
    bench: Object.freeze({
      id: 'bench',
      center: Object.freeze({ x: -4.8, z: 21 }),
      stand: Object.freeze({ x: -6.5, z: 21 }),
      seats: Object.freeze(['left', 'right']),
    }),
    slide: Object.freeze({
      id: 'slide',
      center: Object.freeze({ x: -4.8, z: -3 }),
      stand: Object.freeze({ x: -6.5, z: -3 }),
      seats: Object.freeze(['single']),
    }),
    balance: Object.freeze({
      id: 'balance',
      center: Object.freeze({ x: 6.4, z: 39.2 }),
      stand: Object.freeze({ x: 5.7, z: 33.6 }),
      seats: Object.freeze(['single']),
    }),
    stumps: Object.freeze({
      id: 'stumps',
      center: Object.freeze({ x: 10.4, z: 39.2 }),
      stand: Object.freeze({ x: 9, z: 33.4 }),
      seats: Object.freeze(['single']),
    }),
  });

  const SEAT_ALIASES = Object.freeze({
    // The server contract is one-based: swing=1; seesaw/bench=1,2.
    // Human-readable names remain accepted for local callers, but zero-based
    // aliases are intentionally absent so the two seats cannot overlap.
    swing: Object.freeze({ 1: 'single', single: 'single', swing: 'single' }),
    seesaw: Object.freeze({ 1: 'left', 2: 'right', left: 'left', right: 'right' }),
    bench: Object.freeze({ 1: 'left', 2: 'right', left: 'left', right: 'right' }),
    slide: Object.freeze({ 1: 'single', single: 'single', slide: 'single' }),
    balance: Object.freeze({ 1: 'single', single: 'single', balance: 'single' }),
    stumps: Object.freeze({ 1: 'single', single: 'single', stumps: 'single' }),
  });

  const EMPTY_OCCUPANCY = Object.freeze([]);
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function normalizeSeat(station, seat) {
    const aliases = SEAT_ALIASES[station];
    if (!aliases) return null;
    return aliases[String(seat)] || null;
  }

  function activeOccupant(station, seat, now, occupancy) {
    const list = Array.isArray(occupancy) ? occupancy : EMPTY_OCCUPANCY;
    for (let index = 0; index < list.length; index += 1) {
      const item = list[index];
      if (!item || item.station !== station || normalizeSeat(station, item.seat) !== seat) continue;
      const startedAt = finite(item.startedAt, NaN), expiresAt = finite(item.expiresAt, NaN);
      if (Number.isFinite(startedAt) && Number.isFinite(expiresAt) && startedAt <= now && now < expiresAt) return item;
    }
    return null;
  }

  function create(options = {}) {
    const T = options.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    const parent = options.parent;
    const height = typeof options.height === 'function' ? options.height : () => 0;
    if (!T || !parent || !T.Group || !T.Mesh || !T.InstancedMesh || !T.Object3D || !T.BoxGeometry || !T.CylinderGeometry || !T.MeshStandardMaterial) {
      throw new TypeError('CozyForestPlayground.create requires THREE, parent, InstancedMesh, Object3D, BoxGeometry, CylinderGeometry, and MeshStandardMaterial');
    }

    const geometries = new Set();
    const materials = new Set();
    const meshes = new Set();
    const group = new T.Group();
    group.name = 'cozy-forest-playground';
    group.userData.playground = true;
    group.userData.nonWalkable = true;
    parent.add(group);
    let disposed = false;
    let lastServerNow = 0;
    let lastOccupancy = EMPTY_OCCUPANCY;
    let splashKey = '';

    const ownGeometry = (geometry) => { geometries.add(geometry); return geometry; };
    const ownMaterial = (material) => { materials.add(material); return material; };
    const woodGeometry = ownGeometry(new T.BoxGeometry(1, 1, 1));
    const roundGeometry = ownGeometry(new T.CylinderGeometry(1, 1, 1, 8));
    const woodMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0x9a6338, roughness: .82 }));
    const darkWoodMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0x5d3824, roughness: .9 }));
    const ropeMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0x3e3329, roughness: 1 }));
    const waterMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0x4c8eaa, roughness: .36, transparent: true, opacity: .92, depthWrite: false }));
    const splashMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0xe9fbf0, roughness: .2, transparent: true, opacity: .88, depthWrite: false }));
    const anchors = new Map();
    const motions = new Map();
    const newStations = new Map();
    const worldPosition = new T.Vector3();
    const seesawOccupants = { left: null, right: null };
    // One mutable result per fixed seat. Returning these stable objects keeps
    // repeated pose sampling allocation-free without sharing two seats' data.
    const poseValues = {
      'swing:single': { x: 0, y: 0, z: 0, heading: 0 },
      'seesaw:left': { x: 0, y: 0, z: 0, heading: 0 },
      'seesaw:right': { x: 0, y: 0, z: 0, heading: 0 },
      'bench:left': { x: 0, y: 0, z: 0, heading: 0 },
      'bench:right': { x: 0, y: 0, z: 0, heading: 0 },
      'slide:single': { x: 0, y: 0, z: 0, heading: 0 },
      'balance:single': { x: 0, y: 0, z: 0, heading: 0 },
      'stumps:single': { x: 0, y: 0, z: 0, heading: 0 },
    };
    // Reused diagnostic object: motionState() is safe to sample every frame
    // without allocating another object alongside the existing pose caches.
    const motionStateValue = { swing: 0, seesaw: 0, slide: 0, balance: 0, stumps: 0, splash: 0 };

    function terrainY(point) {
      let value = height({ x: point.x, z: point.z });
      if (!Number.isFinite(Number(value))) value = height(point.x, point.z);
      return finite(value, 0);
    }

    function mesh(geometry, material, name, container) {
      const item = new T.Mesh(geometry, material);
      item.name = name;
      item.castShadow = true;
      item.receiveShadow = true;
      meshes.add(item);
      (container || group).add(item);
      return item;
    }

    function box(container, name, x, y, z, sx, sy, sz, material = woodMaterial) {
      const item = mesh(woodGeometry, material, name, container);
      item.position.set(x, y, z);
      item.scale.set(sx, sy, sz);
      return item;
    }

    function cylinder(container, name, x, y, z, radius, length, material = ropeMaterial) {
      const item = mesh(roundGeometry, material, name, container);
      item.position.set(x, y, z);
      item.scale.set(radius, length, radius);
      return item;
    }

    function instancedBox(container, name, count, material, transforms) {
      const item = new T.InstancedMesh(woodGeometry, material, count);
      item.name = name;
      item.castShadow = true;
      item.receiveShadow = true;
      const transform = new T.Object3D();
      transforms.forEach((value, index) => {
        transform.position.set(value.x, value.y, value.z);
        transform.scale.set(value.sx, value.sy, value.sz);
        transform.rotation.set(value.rx || 0, value.ry || 0, value.rz || 0);
        transform.updateMatrix();
        item.setMatrixAt(index, transform.matrix);
      });
      item.instanceMatrix.needsUpdate = true;
      meshes.add(item);
      (container || group).add(item);
      return item;
    }

    function stationRoot(station) {
      const definition = STATIONS[station];
      const root = new T.Group();
      root.name = `forest-playground-${station}`;
      root.userData.playgroundId = station;
      root.userData.station = station;
      root.userData.stand = { ...definition.stand };
      root.userData.center = { ...definition.center };
      root.position.set(definition.center.x, terrainY(definition.center), definition.center.z);
      group.add(root);
      return root;
    }

    function makeSwing() {
      const root = stationRoot('swing');
      box(root, 'swing-post-left', -.9, 1.2, 0, .14, 2.4, .14, darkWoodMaterial);
      box(root, 'swing-post-right', .9, 1.2, 0, .14, 2.4, .14, darkWoodMaterial);
      box(root, 'swing-top-beam', 0, 2.35, 0, 2.05, .18, .18, woodMaterial);
      const motion = new T.Group();
      motion.name = 'swing-motion';
      motion.position.y = 2.35;
      root.add(motion);
      [-.27, .27].forEach((x, index) => cylinder(motion, `swing-rope-${index}`, x, -.62, 0, .025, 1.24));
      const seat = box(motion, 'swing-seat', 0, -1.27, 0, .66, .1, .38, woodMaterial);
      anchors.set('swing:single', seat);
      motions.set('swing', { root, motion, type: 'swing' });
    }

    function makeSeesaw() {
      const root = stationRoot('seesaw');
      cylinder(root, 'seesaw-pivot', 0, .42, 0, .24, .84, darkWoodMaterial);
      const motion = new T.Group();
      motion.name = 'seesaw-motion';
      motion.position.y = .78;
      root.add(motion);
      box(motion, 'seesaw-board', 0, 0, 0, 2.9, .12, .3, woodMaterial);
      const left = box(motion, 'seesaw-seat-left', -1.12, .17, 0, .58, .1, .46, darkWoodMaterial);
      const right = box(motion, 'seesaw-seat-right', 1.12, .17, 0, .58, .1, .46, darkWoodMaterial);
      box(motion, 'seesaw-handle-left', -1.12, .42, 0, .08, .48, .08, ropeMaterial);
      box(motion, 'seesaw-handle-right', 1.12, .42, 0, .08, .48, .08, ropeMaterial);
      anchors.set('seesaw:left', left);
      anchors.set('seesaw:right', right);
      motions.set('seesaw', { root, motion, type: 'seesaw' });
    }

    function makeBench() {
      const root = stationRoot('bench');
      box(root, 'bench-seat', 0, .62, 0, 2.55, .12, .55, woodMaterial);
      box(root, 'bench-back', 0, 1.2, -.22, 2.55, .65, .1, woodMaterial);
      [-.95, .95].forEach((x, index) => {
        box(root, `bench-leg-front-${index}`, x, .3, .16, .12, .6, .12, darkWoodMaterial);
        box(root, `bench-leg-back-${index}`, x, .3, -.16, .12, .6, .12, darkWoodMaterial);
      });
      const left = box(root, 'bench-seat-left-anchor', -.68, .7, 0, .08, .04, .08, darkWoodMaterial);
      const right = box(root, 'bench-seat-right-anchor', .68, .7, 0, .08, .04, .08, darkWoodMaterial);
      anchors.set('bench:left', left);
      anchors.set('bench:right', right);
      motions.set('bench', { root, type: 'bench' });
    }

    function visualAnchor(container, name) {
      const anchor = new T.Group();
      anchor.name = name;
      container.add(anchor);
      return anchor;
    }

    function makeSlide() {
      const root = stationRoot('slide');
      // A compact wood slide: the posts double as the low ladder silhouette,
      // keeping the mobile scene light while the pose anchor follows the full
      // climb -> slide -> stand path.
      box(root, 'slide-post-left', -.62, .62, -.43, .14, 1.24, .14, darkWoodMaterial);
      box(root, 'slide-post-right', -.62, .62, .43, .14, 1.24, .14, darkWoodMaterial);
      box(root, 'slide-platform', -.62, 1.28, 0, .7, .14, 1.02, woodMaterial);
      const bed = box(root, 'slide-bed', .32, .67, 0, 1.92, .12, .78, woodMaterial);
      bed.rotation.z = -.23;
      box(root, 'slide-side-rail', .32, .92, .43, 1.92, .12, .1, darkWoodMaterial);
      instancedBox(root, 'slide-ladder-rungs', 6, darkWoodMaterial,
        Array.from({ length: 6 }, (_, index) => ({
          x: -.62, y: .28 + index * .18, z: 0, sx: .58, sy: .07, sz: .1,
        })));
      const standY = terrainY(STATIONS.slide.stand) - root.position.y;
      const poseAnchor = visualAnchor(root, 'slide-pose-anchor');
      poseAnchor.position.set(-1.7, standY, 0);
      newStations.set('slide', { root, poseAnchor, type: 'slide', progress: 0, standY });
    }

    function makeBalance() {
      const root = stationRoot('balance');
      box(root, 'balance-support-left', -.84, .28, 0, .16, .56, .16, darkWoodMaterial);
      box(root, 'balance-support-right', .84, .28, 0, .16, .56, .16, darkWoodMaterial);
      const motion = new T.Group();
      motion.name = 'balance-motion';
      motion.position.y = .62;
      root.add(motion);
      box(motion, 'balance-beam', 0, 0, 0, 2.25, .16, .22, woodMaterial);
      const poseAnchor = visualAnchor(root, 'balance-pose-anchor');
      poseAnchor.position.set(-.86, .82, 0);
      newStations.set('balance', { root, poseAnchor, motion, type: 'balance', progress: 0, balance: 0 });
    }

    function makeStumps() {
      const root = stationRoot('stumps');
      // Six posts share one InstancedMesh. Server step 0..5 therefore maps to
      // six visible landing points without adding per-post draw calls.
      instancedBox(root, 'stumps-posts', 6, darkWoodMaterial,
        Array.from({ length: 6 }, (_, index) => ({
          x: 0, y: .27, z: -2.4 + index, sx: .48, sy: .54, sz: .48,
        })));
      const poseAnchor = visualAnchor(root, 'stumps-pose-anchor');
      poseAnchor.position.set(0, .62, -2.4);
      newStations.set('stumps', { root, poseAnchor, type: 'stumps', progress: 0, step: 0 });
    }

    function makePool() {
      // The shallow pool is a single bounded visual surface. It intentionally
      // has no navigation/collision metadata; the server retains the legal
      // stand positions outside this scenery rectangle.
      const poolY = terrainY({ x: 8, z: 35 }) + .06;
      // Reuse the existing eight-sided cylinder for a bounded rounded bank.
      // It encloses both games while avoiding a rectangular sheet across the
      // valley. No new geometry, material, texture or draw call is needed.
      const bank = cylinder(group, 'balance-pool-deck', 8, poolY - .05, 39.55, 1, .06, darkWoodMaterial);
      bank.scale.set(4.2, .06, 3.85);
      const water = cylinder(group, 'balance-shallow-pool', 8, poolY, 39.55, 1, .08, waterMaterial);
      water.scale.set(4.1, .08, 3.75);
      water.castShadow = water.receiveShadow = false;
      water.renderOrder = 1;
      const splash = cylinder(group, 'balance-splash', 8, poolY + .16, 39.55, .16, .06, splashMaterial);
      splash.castShadow = splash.receiveShadow = false;
      splash.renderOrder = 2;
      splash.visible = false;
      newStations.set('pool', { splash, poolY });
    }

    makeSwing();
    makeSeesaw();
    makeBench();
    makeSlide();
    makeBalance();
    makeStumps();
    makePool();

    function swingAngle(now, occupant) {
      if (!occupant) return 0;
      const startedAt = finite(occupant.startedAt, now);
      return Math.sin((now - startedAt) * Math.PI * 2 / 2600) * .28;
    }

    function seesawAngle(now, occupantsBySeat) {
      const left = occupantsBySeat.left, right = occupantsBySeat.right;
      if (!left && !right) return 0;
      const leftStartedAt = finite(left?.startedAt, now);
      const rightStartedAt = finite(right?.startedAt, now);
      // Both seats use the same phase. With two occupants the board still
      // makes a small synchronized motion instead of becoming frozen.
      const startedAt = left && right ? Math.min(leftStartedAt, rightStartedAt) : (left ? leftStartedAt : rightStartedAt);
      const phase = (now - startedAt) * Math.PI * 2 / 3000;
      const side = left && right ? 1 : (left ? 1 : -1);
      return side * Math.sin(phase) * .22;
    }

    const phaseDuration = Object.freeze({
      climbing: 2400, sliding: 1800, complete: 1500,
      approaching: 900, playing: 650, falling: 900, recovering: 1600,
    });

    function gameFor(occupant) {
      return occupant && occupant.game && typeof occupant.game === 'object' ? occupant.game : null;
    }

    function phaseProgress(game, now, duration, useWholeProgress = false) {
      if (!game) return 0;
      if (useWholeProgress && Number.isFinite(Number(game.progress))) {
        // Balance progress is the whole run. A short 200ms interpolation
        // window is harmless when a snapshot is just behind the render tick.
        return clamp(Number(game.progress), 0, 1.2);
      }
      const phaseAt = finite(game.phaseAt ?? game.at, now);
      return clamp((now - phaseAt) / Math.max(1, duration), 0, 1);
    }

    function updateNewStations(now, occupancy) {
      const slideOccupant = activeOccupant('slide', 'single', now, occupancy);
      const slide = newStations.get('slide');
      if (slide) {
        const game = gameFor(slideOccupant);
        const phase = game?.phase || 'climbing';
        const p = phaseProgress(game, now, phaseDuration[phase] || phaseDuration.climbing);
        slide.progress = p;
        if (!slideOccupant) {
          slide.poseAnchor.position.set(-1.7, slide.standY, 0);
          slide.poseAnchor.rotation.set(0, 0, 0);
          motionStateValue.slide = 0;
        } else if (phase === 'climbing') {
          slide.poseAnchor.position.set(-1.7 + p * 1.08, slide.standY + p * (.9 - slide.standY), 0);
          slide.poseAnchor.rotation.set(0, 0, 0);
          motionStateValue.slide = p * .35;
        } else if (phase === 'sliding') {
          slide.poseAnchor.position.set(-.18 + p * 1.18, .98 - p * .68, 0);
          slide.poseAnchor.rotation.set(0, 0, -.23);
          motionStateValue.slide = p;
        } else if (phase === 'complete') {
          // Complete is the 1.5s walk from the runout back to the retained
          // legal stand. Release therefore meets the player at the stand.
          slide.poseAnchor.position.set(1.18 - p * 2.88, .24 + p * (slide.standY - .24), 0);
          slide.poseAnchor.rotation.set(0, 0, 0);
          motionStateValue.slide = 1 - p;
        } else {
          slide.poseAnchor.position.set(-1.7, slide.standY, 0);
          slide.poseAnchor.rotation.set(0, 0, 0);
          motionStateValue.slide = 0;
        }
      }

      const balanceOccupant = activeOccupant('balance', 'single', now, occupancy);
      const balance = newStations.get('balance');
      const balanceGame = gameFor(balanceOccupant);
      if (balance) {
        const phase = balanceGame?.phase || 'approaching';
        const p = phase === 'playing'
          ? phaseProgress(balanceGame, now, phaseDuration.playing, true)
          : phaseProgress(balanceGame, now, phaseDuration[phase] || phaseDuration.approaching);
        const value = clamp(finite(balanceGame?.balance, 0), -1, 1);
        const pool = newStations.get('pool');
        const poolLocalY = pool ? pool.poolY - .15 - balance.root.position.y : .2;
        balance.progress = p;
        balance.balance = value;
        if (!balanceOccupant) {
          balance.motion.rotation.z = 0;
          balance.poseAnchor.position.set(-.86, .82, 0);
          balance.poseAnchor.rotation.set(0, 0, 0);
          motionStateValue.balance = 0;
        } else if (phase === 'playing') {
          balance.motion.rotation.z = value * .18;
          balance.poseAnchor.position.set(-.86 + p * 1.72, .82 + Math.abs(value) * .06, 0);
          balance.poseAnchor.rotation.set(0, 0, value * .18);
          motionStateValue.balance = value;
        } else if (phase === 'falling') {
          const side = finite(balanceGame?.fallSide, 1) < 0 ? -1 : 1;
          const beamProgress = clamp(finite(balanceGame?.progress, 0), 0, 1);
          balance.motion.rotation.z = side * p * .65;
          const localX = -.86 + beamProgress * 1.72;
          const localZ = side * p * .9;
          balance.poseAnchor.position.set(localX, .82 + (poolLocalY - .82) * p, localZ);
          balance.poseAnchor.rotation.set(0, 0, side * p * .65);
          motionStateValue.balance = side * p;
        } else {
          if (phase === 'recovering') {
            const side = finite(balanceGame?.fallSide, 1) < 0 ? -1 : 1;
            balance.motion.rotation.z = 0;
            balance.poseAnchor.position.set(-.86, poolLocalY + (.82 - poolLocalY) * p, side * .9 * (1 - p));
            balance.poseAnchor.rotation.set(0, 0, 0);
            motionStateValue.balance = side * (1 - p);
          } else {
            balance.motion.rotation.z = 0;
            balance.poseAnchor.position.set(-.86, .82, 0);
            balance.poseAnchor.rotation.set(0, 0, 0);
            motionStateValue.balance = 0;
          }
        }
      }

      const stumpsOccupant = activeOccupant('stumps', 'single', now, occupancy);
      const stumps = newStations.get('stumps');
      const stumpsGame = gameFor(stumpsOccupant);
      if (stumps) {
        const phase = stumpsGame?.phase || 'approaching';
        const step = clamp(Math.floor(finite(stumpsGame?.step, 0)), 0, 5);
        // Stump progress is the whole five-step journey; animation itself is
        // local to this 650ms phaseAt interval so every jump is smooth.
        const p = phaseProgress(stumpsGame, now, phaseDuration[phase] || phaseDuration.playing);
        const postZ = -2.4 + step;
        if (!stumpsOccupant) {
          stumps.poseAnchor.position.set(0, .62, -2.4);
          stumps.poseAnchor.rotation.set(0, 0, 0);
          motionStateValue.stumps = 0;
        } else if (phase === 'playing') {
          const hop = Math.sin(p * Math.PI);
          stumps.poseAnchor.position.set(0, .62 + hop * .42, postZ + p);
          stumps.poseAnchor.rotation.set(0, 0, 0);
          motionStateValue.stumps = step + p;
        } else if (phase === 'complete') {
          stumps.poseAnchor.position.set(0, .62, -2.4 + 5);
          stumps.poseAnchor.rotation.set(0, 0, 0);
          motionStateValue.stumps = 5;
        } else {
          stumps.poseAnchor.position.set(0, .62, postZ);
          stumps.poseAnchor.rotation.set(0, 0, 0);
          motionStateValue.stumps = step;
        }
      }

      const pool = newStations.get('pool');
      const splashGame = balanceGame;
      const falling = !!balanceOccupant && splashGame?.phase === 'falling';
      const recovering = !!balanceOccupant && splashGame?.phase === 'recovering';
      const splashVisible = falling;
      if (pool?.splash) {
        if (falling) {
          const phaseAt = finite(splashGame.phaseAt ?? splashGame.at, now);
          const key = `${finite(splashGame.round, 0)}:${phaseAt}`;
          if (key !== splashKey) splashKey = key;
          const side = finite(splashGame.fallSide, 1) < 0 ? -1 : 1;
          const beamProgress = clamp(finite(splashGame.progress, 0), 0, 1);
          const fallProgress = phaseProgress(splashGame, now, phaseDuration.falling);
          const localX = -.86 + beamProgress * 1.72;
          pool.splash.position.set(
            newStations.get('balance').root.position.x + localX,
            pool.poolY + .16,
            newStations.get('balance').root.position.z + side * fallProgress * .9,
          );
          pool.splash.visible = splashKey.length > 0;
          const ripple = .8 + .2 * fallProgress;
          pool.splash.scale.set(ripple, 1, ripple);
        } else {
          pool.splash.visible = false;
          pool.splash.scale.set(1, 1, 1);
          if (!recovering) splashKey = '';
        }
      }
      motionStateValue.splash = splashVisible ? 1 : 0;
    }

    function update(serverNow, occupancy) {
      if (disposed) return stats;
      const now = finite(serverNow, lastServerNow);
      lastServerNow = now;
      lastOccupancy = Array.isArray(occupancy) ? occupancy : EMPTY_OCCUPANCY;
      const swing = motions.get('swing');
      swing.motion.rotation.x = swingAngle(now, activeOccupant('swing', 'single', now, lastOccupancy));
      const seesaw = motions.get('seesaw');
      seesawOccupants.left = activeOccupant('seesaw', 'left', now, lastOccupancy);
      seesawOccupants.right = activeOccupant('seesaw', 'right', now, lastOccupancy);
      seesaw.motion.rotation.z = seesawAngle(now, seesawOccupants);
      motionStateValue.swing = swing.motion.rotation.x;
      motionStateValue.seesaw = seesaw.motion.rotation.z;
      updateNewStations(now, lastOccupancy);
      return stats;
    }

    function motionState() {
      return motionStateValue;
    }

    function seatPose(station, seat, serverNow, occupancy) {
      if (disposed) return null;
      const now = finite(serverNow, lastServerNow);
      const currentOccupancy = occupancy === undefined ? lastOccupancy : occupancy;
      update(now, currentOccupancy);
      const normalized = normalizeSeat(station, seat);
      const key = normalized && `${station}:${normalized}`;
      const pose = key && poseValues[key];
      if (!pose) return null;

      // Optional posture fields are reset on every sample so a recycled seat
      // object cannot leak a previous player's animation into a later view.
      pose.sitting = false;
      pose.walking = false;
      pose.pitch = 0;
      pose.roll = 0;

      const newStation = newStations.get(station);
      if (newStation && newStation.poseAnchor) {
        const occupant = activeOccupant(station, normalized, now, currentOccupancy);
        const game = gameFor(occupant);
        newStation.poseAnchor.getWorldPosition(worldPosition);
        pose.x = worldPosition.x;
        pose.y = worldPosition.y;
        pose.z = worldPosition.z;
        const phase = game?.phase || 'approaching';
        pose.heading = station === 'slide' && phase === 'climbing' ? Math.PI : (station === 'slide' ? 0 : Math.PI / 2);
        if (occupant) {
          pose.walking = phase === 'approaching' || phase === 'climbing' || phase === 'complete';
          pose.sitting = station === 'slide' && phase === 'sliding';
          pose.pitch = station === 'slide' && phase === 'sliding' ? -.23 : 0;
          // The slide anchor is a seat point; player feet are one body-height
          // below it. Other new stations expose feet/world-base coordinates.
          if (pose.sitting) pose.y -= .42;
          pose.roll = station === 'balance'
            ? (phase === 'falling' ? (finite(game?.fallSide, 1) < 0 ? -.65 : .65) : clamp(finite(game?.balance, 0), -1, 1) * .18)
            : 0;
        }
        return pose;
      }
      const anchor = key && anchors.get(key);
      if (!anchor) return null;
      anchor.getWorldPosition(worldPosition);
      const motion = motions.get(station);
      const heading = station === 'swing' ? Math.PI : (motion.motion ? motion.motion.rotation.z : 0);
      pose.x = worldPosition.x;
      pose.y = worldPosition.y;
      pose.z = worldPosition.z;
      pose.heading = heading;
      pose.sitting = !!activeOccupant(station, normalized, now, currentOccupancy);
      return pose;
    }

    const triangleCount = Array.from(meshes).reduce((sum, item) => {
      const index = item.geometry?.index;
      const positions = item.geometry?.attributes?.position;
      const instances = Number.isFinite(Number(item.count)) ? Number(item.count) : 1;
      return sum + ((index ? index.count : (positions ? positions.count : 0)) / 3) * instances;
    }, 0);
    const stats = {
      stations: 6,
      playgroundIds: Object.freeze(['swing', 'seesaw', 'bench', 'slide', 'balance', 'stumps']),
      seats: 8,
      swingSeats: 1,
      seesawSeats: 2,
      benchSeats: 2,
      slideSeats: 1,
      balanceSeats: 1,
      stumpsSeats: 1,
      meshes: meshes.size,
      geometries: geometries.size,
      materials: materials.size,
      triangles: triangleCount,
      bounded: true,
      disposed: false,
    };

    function dispose() {
      if (disposed) return stats;
      disposed = true;
      group.traverse((item) => { if (item.isMesh) item.visible = false; });
      if (group.parent) group.parent.remove(group);
      geometries.forEach((geometry) => geometry.dispose?.());
      materials.forEach((material) => material.dispose?.());
      meshes.clear();
      geometries.clear();
      materials.clear();
      anchors.clear();
      motions.clear();
      motionStateValue.swing = 0;
      motionStateValue.seesaw = 0;
      motionStateValue.slide = 0;
      motionStateValue.balance = 0;
      motionStateValue.stumps = 0;
      motionStateValue.splash = 0;
      splashKey = '';
      newStations.clear();
      group.clear?.();
      stats.disposed = true;
      return stats;
    }

    return { group, update, seatPose, motionState, dispose, stats };
  }

  return { STATIONS, create };
});
