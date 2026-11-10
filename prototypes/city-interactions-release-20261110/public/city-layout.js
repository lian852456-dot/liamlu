/* Deterministic, renderer-neutral geometry for the compact Cozy Pocket Taipei. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CozyCityLayout = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_BOUNDS = Object.freeze({ minX: -36, maxX: 56, minZ: -40, maxZ: 73 });
  const DEFAULT_SPAWN = Object.freeze({ x: 0, z: 1.5 });
  const GRID_X = Object.freeze([-30, -10, 10, 30, 50]);
  const GRID_Z = Object.freeze([-34, -14, 6, 26, 46, 66]);
  const ROAD_WIDTH = 4.4;
  const EPSILON = 0.01;

  const finite = value => Number.isFinite(Number(value));
  const point = value => ({ x: Number(value?.x), z: Number(value?.z) });
  const rect = (value, defaults = {}) => ({
    x: Number(value?.x), z: Number(value?.z),
    w: Number(value?.w ?? defaults.w ?? 1), d: Number(value?.d ?? defaults.d ?? 1)
  });
  const validRect = value => finite(value.x) && finite(value.z) && value.w > 0 && value.d > 0;
  const copyBounds = value => ({
    minX: finite(value?.minX) ? Number(value.minX) : DEFAULT_BOUNDS.minX,
    maxX: finite(value?.maxX) ? Number(value.maxX) : DEFAULT_BOUNDS.maxX,
    minZ: finite(value?.minZ) ? Number(value.minZ) : DEFAULT_BOUNDS.minZ,
    maxZ: finite(value?.maxZ) ? Number(value.maxZ) : DEFAULT_BOUNDS.maxZ
  });
  const overlaps = (a, b, gap = 0) =>
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap - EPSILON &&
    Math.abs(a.z - b.z) < (a.d + b.d) / 2 + gap - EPSILON;
  const inside = (p, bounds, radius = 0) =>
    p.x >= bounds.minX + radius && p.x <= bounds.maxX - radius &&
    p.z >= bounds.minZ + radius && p.z <= bounds.maxZ - radius;
  const distanceToRect = (p, box) => {
    const dx = Math.max(Math.abs(p.x - box.x) - box.w / 2, 0);
    const dz = Math.max(Math.abs(p.z - box.z) - box.d / 2, 0);
    return Math.hypot(dx, dz);
  };

  function normalizeObstacles(items) {
    return (Array.isArray(items) ? items : Object.values(items || {}))
      .map(item => rect(item)).filter(validRect);
  }

  function canonicalAnchors(input, storeCenters, taskBuildings, landmarkBoxes) {
    const anchors = normalizeObstacles(input);
    for (const value of Object.values(storeCenters || {})) {
      const center = point(value);
      if (finite(center.x) && finite(center.z)) anchors.push({ x: center.x, z: center.z, w: 7.2, d: 4.8 });
    }
    for (const item of Array.isArray(taskBuildings) ? taskBuildings : []) {
      const value = rect(item, { w: 5.1, d: 3.4 });
      if (validRect(value)) anchors.push(value);
    }
    for (const item of Array.isArray(landmarkBoxes) ? landmarkBoxes : []) {
      const value = rect(item, { w: 2.7, d: 2.7 });
      if (validRect(value)) anchors.push(value);
    }
    return anchors;
  }

  function segmentIntersects(a, b, box, extra = 0) {
    const horizontal = Math.abs(a.z - b.z) < EPSILON;
    if (horizontal) {
      return Math.abs(a.z - box.z) < box.d / 2 + extra &&
        Math.max(Math.min(a.x, b.x), box.x - box.w / 2 - extra) <=
        Math.min(Math.max(a.x, b.x), box.x + box.w / 2 + extra);
    }
    return Math.abs(a.x - box.x) < box.w / 2 + extra &&
      Math.max(Math.min(a.z, b.z), box.z - box.d / 2 - extra) <=
      Math.min(Math.max(a.z, b.z), box.z + box.d / 2 + extra);
  }

  function clipAxisSegment(a, b, width, anchors) {
    const horizontal = Math.abs(a.z - b.z) < EPSILON;
    const min = horizontal ? Math.min(a.x, b.x) : Math.min(a.z, b.z);
    const max = horizontal ? Math.max(a.x, b.x) : Math.max(a.z, b.z);
    const cuts = [];
    for (const obstacle of anchors) {
      const across = horizontal
        ? Math.abs(a.z - obstacle.z) < (width + obstacle.d) / 2
        : Math.abs(a.x - obstacle.x) < (width + obstacle.w) / 2;
      if (!across) continue;
      const lo = (horizontal ? obstacle.x : obstacle.z) - (horizontal ? obstacle.w : obstacle.d) / 2 - width / 2 - .25;
      const hi = (horizontal ? obstacle.x : obstacle.z) + (horizontal ? obstacle.w : obstacle.d) / 2 + width / 2 + .25;
      if (hi > min && lo < max) cuts.push([Math.max(min, lo), Math.min(max, hi)]);
    }
    cuts.sort((left, right) => left[0] - right[0]);
    const pieces = [];
    let cursor = min;
    for (const [lo, hi] of cuts) {
      if (lo - cursor >= 2.8) pieces.push(horizontal
        ? { a: { x: cursor, z: a.z }, b: { x: lo, z: a.z } }
        : { a: { x: a.x, z: cursor }, b: { x: a.x, z: lo } });
      cursor = Math.max(cursor, hi);
    }
    if (max - cursor >= 2.8) pieces.push(horizontal
      ? { a: { x: cursor, z: a.z }, b: { x: max, z: a.z } }
      : { a: { x: a.x, z: cursor }, b: { x: a.x, z: max } });
    return pieces;
  }

  function makeRoads(bounds, anchors) {
    const roads = [];
    const corridors = [];
    const add = (a, b, width, kind, name) => {
      const horizontal = Math.abs(a.z - b.z) < EPSILON;
      const boundedA = horizontal
        ? { x: Math.max(bounds.minX + width / 2, Math.min(bounds.maxX - width / 2, a.x)), z: a.z }
        : { x: a.x, z: Math.max(bounds.minZ + width / 2, Math.min(bounds.maxZ - width / 2, a.z)) };
      const boundedB = horizontal
        ? { x: Math.max(bounds.minX + width / 2, Math.min(bounds.maxX - width / 2, b.x)), z: b.z }
        : { x: a.x, z: Math.max(bounds.minZ + width / 2, Math.min(bounds.maxZ - width / 2, b.z)) };
      if (!inside(boundedA, bounds, width / 2) || !inside(boundedB, bounds, width / 2)) return;
      corridors.push({ a: boundedA, b: boundedB, width });
      for (const piece of clipAxisSegment(boundedA, boundedB, width, anchors)) {
        if (Math.hypot(piece.b.x - piece.a.x, piece.b.z - piece.a.z) < 2.8) continue;
        roads.push({ a: piece.a, b: piece.b, width, kind, name, sidewalk: 1 });
      }
    };
    const halfRoad = ROAD_WIDTH / 2;
    const xStops = [bounds.minX + halfRoad, ...GRID_X, bounds.maxX - halfRoad];
    const zStops = [bounds.minZ + halfRoad, ...GRID_Z, bounds.maxZ - halfRoad];
    for (const z of GRID_Z) {
      const width = ROAD_WIDTH;
      for (let i = 0; i < xStops.length - 1; i++) add({ x: xStops[i], z }, { x: xStops[i + 1], z }, width,
        'street', `東西街${z}`);
    }
    for (const x of GRID_X) {
      const width = ROAD_WIDTH;
      for (let i = 0; i < zStops.length - 1; i++) add({ x, z: zStops[i] }, { x, z: zStops[i + 1] }, width,
        'street', `南北巷${x}`);
    }
    return { roads, corridors };
  }

  function districtFor(x, z) {
    if (z < -14) return { name: '大同老街', x: 0, z: -24 };
    if (x < -10 && z >= 6) return { name: '萬華生活', x: -20, z: 37 };
    if (x >= 30 && z >= 26) return { name: '信義天際', x: 40, z: 57 };
    if (z >= 26) return { name: '大安綠巷', x: 20, z: 37 };
    return { name: '中正文創', x: 20, z: 17 };
  }

  function parkList(bounds, anchors, corridors) {
    const candidates = [
      { x: 0, z: -24, w: 5, d: 4.1 },
      { x: 0, z: 16, w: 5, d: 4.1 },
      { x: 40, z: 26, w: 5, d: 4.1 },
      { x: -20, z: 56, w: 5, d: 4.1 }
    ];
    const parks = [];
    for (const candidate of candidates) {
      if (!inside(candidate, bounds, 2.7) || anchors.some(box => overlaps(candidate, box, .35))) continue;
      if (corridors.some(line => segmentIntersects(line.a, line.b, candidate, line.width / 2 + .2))) continue;
      if (parks.some(existing => overlaps(candidate, existing, .5))) continue;
      parks.push(candidate);
      if (parks.length === 3) break;
    }
    return parks;
  }

  let currentDoors = [];
  function doorClearance(box, doors) { return doors.some(door => distanceToRect(door, box) < 2.4); }

  function buildingList(bounds, anchors, corridors, parks, storeCenters) {
    const buildings = [];
    const occupied = anchors.concat(parks);
    const addBuilding = (box, xi, zi, index, options = {}) => {
      if (!options.allowRoadProximity && corridors.some(line =>
        segmentIntersects(line.a, line.b, box, line.width / 2 + .35))) return false;
      if (occupied.some(obstacle => overlaps(box, obstacle, options.anchorGap ?? .3)) ||
          (!options.skipDoorClearance && doorClearance(box, currentDoors))) return false;
      const district = districtFor(box.x, box.z);
      const oldTown = district.name === '大同老街' || district.name === '萬華生活';
      const tower = district.name === '信義天際' && (xi + zi + index) % 4 === 0;
      const building = {
        ...box,
        height: options.height ?? (tower ? 8.0 : [5.4, 5.7, 6.8, 5.5, 7.2][Math.abs(xi * 3 + zi + index) % 5]),
        district: district.name,
        kind: tower ? 'tower' : oldTown ? 'rowhouse' : ((xi + zi + index) % 3 === 0 ? 'arcade' : 'apartment'),
        color: tower ? '#6f8f9b' : oldTown ? '#d8a77e' : ((xi + zi) % 2 ? '#d9c5a4' : '#a9c6b5')
      };
      buildings.push(building); occupied.push(box); return true;
    };

    // 酒泉 is the visual anchor: two attached street houses share its front
    // wall with a deliberate 5 cm collision-edge gap.  Their wider frontage
    // makes the store read as part of a lived-in row instead of a freestanding
    // object in an empty square.
    addBuilding({ x: -5.65, z: -2.7, w: 4, d: 5.2, frontage:'south' }, 0, 0, 0,
      { allowRoadProximity: true, anchorGap: .04, skipDoorClearance: true, height:6.9 });
    addBuilding({ x: 5.65, z: -2.7, w: 4, d: 5.2, frontage:'south' }, 0, 0, 1,
      { allowRoadProximity: true, anchorGap: .04, skipDoorClearance: true, height:5.4 });

    // Other canonical shops get one compact side/rear lot where the block
    // geometry permits it.  This prevents a store-sized blank square while
    // retaining the full store collision and its door position.
    for (const [id, center] of Object.entries(storeCenters || {})) {
      if (id === 'jiuquan') continue;
      const xIndex = Math.max(0, Math.min(GRID_X.length - 2, GRID_X.findIndex((value, index) =>
        center.x >= value && center.x < GRID_X[index + 1])));
      const zIndex = Math.max(0, Math.min(GRID_Z.length - 2, GRID_Z.findIndex((value, index) =>
        center.z >= value && center.z < GRID_Z[index + 1])));
      const x0 = GRID_X[xIndex], x1 = GRID_X[xIndex + 1], z0 = GRID_Z[zIndex], z1 = GRID_Z[zIndex + 1];
      // Put the companion frontage on the quieter side of the shop.  A
      // 5.5m offset clears the shop's full collision while still leaving a
      // believable shared sidewalk inside the 20m block.
      const choices = [
        { x: center.x, z: center.z - 5.5 },
        { x: center.x, z: center.z + 5.5 },
        { x: x0 + 5.1, z: z0 + 5.4 }, { x: x1 - 5.1, z: z0 + 5.4 },
        { x: x0 + 5.1, z: z1 - 5.4 }, { x: x1 - 5.1, z: z1 - 5.4 }
      ];
      for (const [index, candidate] of choices.entries()) {
        if (addBuilding({ ...candidate, w: 4.5, d: 5 }, 0, 0, index, { anchorGap: .05 })) break;
      }
    }

    for (let xi = 0; xi < GRID_X.length - 1; xi++) {
      for (let zi = 0; zi < GRID_Z.length - 1; zi++) {
        const x0 = GRID_X[xi], x1 = GRID_X[xi + 1], z0 = GRID_Z[zi], z1 = GRID_Z[zi + 1];
        // Two rows follow the opposing sidewalks.  Most blocks receive three
        // adjacent lots per row; alternating blocks receive two to leave room
        // for a pocket park, landmark, or the canonical store footprint.
        const width = (xi + zi) % 4 === 0 ? 5 : 4.5;
        const xPositions = width === 5
          ? [x0 + 5.1, x1 - 5.1]
          : [x0 + 5.1, x0 + 10, x1 - 5.1];
        // Keep the two shopfront rows close to the sidewalks.  This leaves
        // a usable inner lane for pocket parks and the occasional landmark,
        // while still clearing the 4.4m road by construction.
        const rows = [z0 + 5.3, z1 - 5.3];
        const candidates = [];
        for (const z of rows) for (const x of xPositions) candidates.push({ x, z, w: width, d: 5.2 });
        const order = (xi + zi) % 2 ? [...Array(candidates.length).keys()].reverse() : [...Array(candidates.length).keys()];
        for (const candidateIndex of order) {
          const candidate = candidates[candidateIndex];
          // Keep the canonical 酒泉 destination's rear approach open.  The
          // small lane below the store is the detour used by both nav and
          // players walking from the preserved spawn to the lower street.
          const core = storeCenters?.jiuquan;
          if (core && candidate.z < core.z && candidate.z > core.z - 8.5 &&
              Math.abs(candidate.x - core.x) < 7.5) continue;
          addBuilding(candidate, xi, zi, candidateIndex, { anchorGap: .05 });
        }
      }
    }
    return buildings;
  }

  // Keep the prop orientation contract identical to city-scenery's facade
  // orientation: local +z faces the nearest road.  The visual dimensions stay
  // local to the prop, while navigation receives the rotated world AABB.
  function rotatedFootprint(w, d, rotation) {
    const cosine = Math.abs(Math.cos(rotation));
    const sine = Math.abs(Math.sin(rotation));
    return { w: cosine * w + sine * d, d: sine * w + cosine * d };
  }

  function nearestRoad(position, roads) {
    let best = null;
    let bestDistance = Infinity;
    for (const road of roads) {
      const dx = road.b.x - road.a.x;
      const dz = road.b.z - road.a.z;
      const lengthSquared = dx * dx + dz * dz;
      if (lengthSquared < EPSILON) continue;
      const t = Math.max(0, Math.min(1,
        ((position.x - road.a.x) * dx + (position.z - road.a.z) * dz) / lengthSquared));
      const nearest = { x: road.a.x + dx * t, z: road.a.z + dz * t };
      const distance = Math.hypot(position.x - nearest.x, position.z - nearest.z);
      if (distance >= bestDistance) continue;
      const angle = Math.atan2(-dz, dx);
      const side = (position.x - nearest.x) * Math.sin(angle) +
        (position.z - nearest.z) * Math.cos(angle) < 0 ? -1 : 1;
      best = { road, nearest, angle, side };
      bestDistance = distance;
    }
    return best;
  }

  function makeStreetProps(buildings, roads, anchors, parks, storeDoors,
    taskBuildings, landmarkBoxes, spawn, trafficLoops, bounds, storeCenters = {}) {
    const kinds = [
      { kind: 'planter', w: .65, d: .5 },
      { kind: 'bench', w: 1.2, d: .55 },
      { kind: 'chalkboard', w: .5, d: .35 }
    ];
    const buildingObstacles = buildings.map(({ x, z, w, d }) => ({ x, z, w, d }));
    if (!buildings.length) return { streetProps: [], propObstacles: [] };
    const fixedObstacles = anchors.concat(parks, buildingObstacles);
    const stands = [
      ...Object.values(storeDoors || {}).map(point),
      ...taskBuildings.map(item => {
        const box = rect(item, { w: 5.1, d: 3.4 });
        return { x: box.x, z: box.z + 3.1 };
      }),
      ...landmarkBoxes.map(item => {
        const box = rect(item, { w: 2.7, d: 2.7 });
        return { x: box.x, z: box.z + 2.3 };
      }),
      spawn
    ].filter(value => finite(value?.x) && finite(value?.z));

    // Evenly sample the complete building list first, so props appear in all
    // districts.  The fallback pass fills holes when a sampled facade is too
    // close to an anchor, doorway, road, or an adjacent prop.
    const order = [];
    const seen = new Set();
    for (let i = 0; i < buildings.length && i < 60; i++) {
      const index = Math.min(buildings.length - 1, Math.floor(i * buildings.length / 60));
      if (!seen.has(index)) { seen.add(index); order.push(index); }
    }
    for (let index = 0; index < buildings.length; index++) {
      if (!seen.has(index)) order.push(index);
    }

    const streetProps = [];
    const propObstacles = [];
    function admit(spec,x,z,rotation){
      const footprint = rotatedFootprint(spec.w, spec.d, rotation);
      const obstacle = { x, z, w: footprint.w, d: footprint.d };
      if (x - obstacle.w / 2 < bounds.minX + .1 || x + obstacle.w / 2 > bounds.maxX - .1 ||
          z - obstacle.d / 2 < bounds.minZ + .1 || z + obstacle.d / 2 > bounds.maxZ - .1) return false;
      if (fixedObstacles.some(box => overlaps(obstacle, box, .1)) ||
          propObstacles.some(box => overlaps(obstacle, box, .1))) return false;
      if (stands.some(stand => distanceToRect(stand, obstacle) < 1.4)) return false;
      // Roads are center-line geometry here; 1.7m is the vehicle swept radius
      // used by traffic validation and keeps props on the sidewalk side.
      if (roads.some(line => segmentIntersects(line.a, line.b, obstacle, 1.7)) ||
          trafficLoops.some(loop => loop.points.some((a, index) =>
            segmentIntersects(a, loop.points[(index + 1) % loop.points.length], obstacle, 1.7)))) return false;
      const id = `street-prop-${streetProps.length + 1}`;
      streetProps.push({ id, kind: spec.kind, x, z, w: spec.w, d: spec.d, rotation });
      propObstacles.push(obstacle);
      return true;
    }
    for(const center of Object.values(storeCenters))for(const side of[-1,1]){
      admit(kinds[0],center.x+side*3.15,center.z+2.9,0);
    }
    for (const buildingIndex of order) {
      if (streetProps.length >= 60) break;
      const building = buildings[buildingIndex];
      // Named frontages keep props to the side of the same storefront, with
      // identical obstacle and protected-stand validation below.
      const road = nearestRoad(building, roads);
      if (!road) continue;
      const spec = building.frontage==='south'?kinds[2]:kinds[streetProps.length % kinds.length];
      const named={south:0,north:Math.PI,east:Math.PI/2,west:-Math.PI/2}[building.frontage];
      const rotation = Number.isFinite(named)?named:road.angle + (road.side > 0 ? Math.PI : 0);
      const localX = (buildingIndex % 2 ? .27 : -.27) * building.w;
      const halfExtent = Math.abs(Math.sin(rotation)) * building.w / 2 +
        Math.abs(Math.cos(rotation)) * building.d / 2;
      const localZ = halfExtent + spec.d / 2 + .14;
      const x = building.x + Math.cos(rotation) * localX + Math.sin(rotation) * localZ;
      const z = building.z - Math.sin(rotation) * localX + Math.cos(rotation) * localZ;
      admit(spec,x,z,rotation);
    }
    return { streetProps, propObstacles };
  }

  function blocked(p, obstacles, bounds, radius = .3) {
    return !inside(p, bounds, radius) || obstacles.some(box =>
      Math.abs(p.x - box.x) < box.w / 2 + radius && Math.abs(p.z - box.z) < box.d / 2 + radius);
  }
  function clearSegment(a, b, obstacles, bounds, radius = .3) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .12));
    for (let i = 1; i <= steps; i++) {
      const p = { x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps };
      if (blocked(p, obstacles, bounds, radius)) return false;
    }
    return true;
  }

  function localLoop(anchor, obstacles, bounds) {
    const offsets = [[0, 1.25], [0, -1.25], [1.25, 0], [-1.25, 0], [1, 1], [1, -1], [-1, 1], [-1, -1],
      [0, 2.2], [0, -2.2], [2.2, 0], [-2.2, 0], [3.5, .5], [-3.5, .5], [.5, 3.5], [.5, -3.5]];
    for (const radius of [.75, .9, 1.15, 1.4]) {
      for (const [ox, oz] of offsets) {
        const cx = anchor.x + ox, cz = anchor.z + oz;
        const route = [{ x: cx - radius, z: cz - radius }, { x: cx + radius, z: cz - radius },
          { x: cx + radius, z: cz + radius }, { x: cx - radius, z: cz + radius }];
        if (route.some(p => blocked(p, obstacles, bounds, .3))) continue;
        let valid = true;
        for (let i = 0; i < route.length; i++) {
          if (!clearSegment(route[i], route[(i + 1) % route.length], obstacles, bounds, .3)) { valid = false; break; }
        }
        if (valid && route.every(p => Math.hypot(p.x - anchor.x, p.z - anchor.z) <= 5)) return route;
      }
    }
    return [];
  }

  function create(input = {}) {
    const bounds = copyBounds(input.bounds);
    const storeCenters = input.storeCenters || {};
    const storeDoors = input.storeDoors || {};
    const taskBuildings = Array.isArray(input.taskBuildings) ? input.taskBuildings : [];
    const landmarkBoxes = Array.isArray(input.landmarkBoxes) ? input.landmarkBoxes : [];
    const anchors = canonicalAnchors(input.baseObstacles, storeCenters, taskBuildings, landmarkBoxes);
    currentDoors = Object.values(storeDoors).map(point).filter(value => finite(value.x) && finite(value.z));
    const roadPlan = makeRoads(bounds, anchors);
    const parks = parkList(bounds, anchors, roadPlan.corridors);
    const buildings = buildingList(bounds, anchors, roadPlan.corridors, parks, storeCenters);
    const buildingObstacles = buildings.map(({ x, z, w, d }) => ({ x, z, w, d }));
    const districts = [
      { name: '大同老街', x: 0, z: -24 }, { name: '中正文創', x: 20, z: 17 },
      { name: '萬華生活', x: -20, z: 37 }, { name: '大安綠巷', x: 20, z: 37 },
      { name: '信義天際', x: 40, z: 57 }
    ];
    const trafficLoops = [
      { points: [{ x: -30, z: -34 }, { x: -10, z: -34 }, { x: -10, z: -14 }, { x: -30, z: -14 }], speed: 2.2, type: 'scooter' },
      { points: [{ x: -10, z: -14 }, { x: 30, z: -14 }, { x: 30, z: 6 }, { x: -10, z: 6 }], speed: 2.7, type: 'car' },
      { points: [{ x: -30, z: 6 }, { x: 10, z: 6 }, { x: 10, z: 26 }, { x: -30, z: 26 }], speed: 2.4, type: 'scooter' },
      { points: [{ x: 10, z: 26 }, { x: 50, z: 26 }, { x: 50, z: 46 }, { x: 10, z: 46 }], speed: 2.6, type: 'car' },
      { points: [{ x: 30, z: 46 }, { x: 50, z: 46 }, { x: 50, z: 66 }, { x: 30, z: 66 }], speed: 2.8, type: 'car' }
    ];
    const spawn = { x: finite(input.spawn?.x) ? Number(input.spawn.x) : DEFAULT_SPAWN.x,
      z: finite(input.spawn?.z) ? Number(input.spawn.z) : DEFAULT_SPAWN.z };
    const { streetProps, propObstacles } = makeStreetProps(buildings, roadPlan.roads,
      anchors, parks, storeDoors, taskBuildings, landmarkBoxes, spawn, trafficLoops, bounds, storeCenters);
    // Props are part of the same shared obstacle stream before routes are
    // sampled, so server and client pedestrian navigation agree on clearance.
    const allObstacles = anchors.concat(buildingObstacles, propObstacles);
    const pedestrianRoutes = [];
    for (const door of currentDoors) {
      const route = localLoop(door, allObstacles, bounds);
      if (route.length) pedestrianRoutes.push(route);
    }
    for (const item of taskBuildings) {
      const box = rect(item, { w: 5.1, d: 3.4 });
      const route = localLoop({ x: box.x, z: box.z + box.d / 2 + 1.2 }, allObstacles, bounds);
      if (route.length) pedestrianRoutes.push(route);
    }
    for (const item of landmarkBoxes) {
      const box = rect(item, { w: 2.7, d: 2.7 });
      const route = localLoop({ x: box.x, z: box.z + box.d / 2 + 1.2 }, allObstacles, bounds);
      if (route.length) pedestrianRoutes.push(route);
    }
    const landmarkCenters = Object.freeze(Object.fromEntries(landmarkBoxes.map(item =>
      [item.id || `landmark-${item.x}-${item.z}`, Object.freeze(point(item))])));
    return { roads: roadPlan.roads, buildings, parks, streetProps, trafficLoops, pedestrianRoutes,
      districts, obstacles: buildingObstacles.concat(propObstacles), landmarkCenters, spawn };
  }

  return Object.freeze({ create, overlaps, segmentIntersects });
}));
