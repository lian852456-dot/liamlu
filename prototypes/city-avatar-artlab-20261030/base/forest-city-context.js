/*
 * Native 3D distant Taipei context for the A-forest vista.
 *
 * The caller owns the geometry/material registries and mesh disposal.  This
 * helper only creates a bounded visual group; it never adds collision boxes
 * or a route.  Five instanced meshes keep the silhouette readable without
 * turning 48 buildings into 48 draw calls.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CozyForestCityContext = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  // Local coordinates are translated to the left rear valley by the group
  // transform below.  The 42 distant buildings occupy world x=+20..+65,
  // z=65..112; six reused instances are reserved for the south roofline.
  const BOUNDS = Object.freeze({ minX: -24, maxX: 20, minZ: 50, maxZ: 98 });
  const ROWS = Object.freeze([
    Object.freeze({ z: 52.0, count: 9 }),
    Object.freeze({ z: 63.2, count: 10 }),
    Object.freeze({ z: 74.4, count: 10 }),
    Object.freeze({ z: 85.6, count: 9 }),
    Object.freeze({ z: 96.8, count: 10 })
  ]);
  const SOUTH_SLOT_INDICES = Object.freeze([0, 8, 9, 18, 29, 38]);
  // These are world coordinates.  They deliberately sit south of the legal
  // rectangle so the six reused instances read as low foreground rooftops
  // without touching the exit, trails, or the x=-10..+10 water corridor.
  const SOUTH_SLOTS = Object.freeze({
    0: Object.freeze({ x: 10.5, z: -15.2, width: 2.25, depth: 1.5, height: .98 }),
    8: Object.freeze({ x: 15.0, z: -15.8, width: 2.55, depth: 1.7, height: 1.18 }),
    9: Object.freeze({ x: 19.5, z: -15.1, width: 2.35, depth: 1.45, height: .92 }),
    18: Object.freeze({ x: 12.0, z: -19.0, width: 2.45, depth: 1.65, height: 1.08 }),
    29: Object.freeze({ x: 16.5, z: -19.8, width: 2.65, depth: 1.6, height: 1.24 }),
    38: Object.freeze({ x: 21.0, z: -18.6, width: 2.3, depth: 1.75, height: 1.02 })
  });
  const SHELL_COLORS = Object.freeze([0xd7b28f, 0xc79c7c, 0xe1c4a2, 0xb89d8a, 0xd9c7aa]);
  const ROOF_COLORS = Object.freeze([0xb76f56, 0xc3815f, 0x9d705d, 0xd09a6e]);

  function finite(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function groundAt(height, x, z) {
    if (typeof height !== 'function') return 0;
    try {
      const direct = height(x, z);
      if (Number.isFinite(Number(direct))) return Number(direct);
    } catch (_) {
      // The forest rule commonly accepts one {x,z} object instead.
    }
    try {
      return finite(height({x, z}), 0);
    } catch (_) {
      return 0;
    }
  }

  function groundAtFootprint(height, x, z, width, depth) {
    const halfWidth = Math.max(.1, Number(width) / 2);
    const halfDepth = Math.max(.1, Number(depth) / 2);
    // The skirt is an interpolated surface, so the center sample can be lower
    // than a footprint edge.  Use the highest corner as a flat, conservative
    // foundation: a downhill side may float slightly, but no building is
    // visibly buried through its roof by a local slope.
    return Math.max(
      groundAt(height, x - halfWidth, z - halfDepth),
      groundAt(height, x + halfWidth, z - halfDepth),
      groundAt(height, x - halfWidth, z + halfDepth),
      groundAt(height, x + halfWidth, z + halfDepth)
    );
  }

  function makeLayout(height, transform = {}) {
    const buildings = [];
    const transformX = Number.isFinite(Number(transform.x)) ? Number(transform.x) : 0;
    const transformY = Number.isFinite(Number(transform.y)) ? Number(transform.y) : 0;
    const transformZ = Number.isFinite(Number(transform.z)) ? Number(transform.z) : 0;
    let buildingIndex = 0;
    ROWS.forEach((row, rowIndex) => {
      const step = (BOUNDS.maxX - BOUNDS.minX - 4) / (row.count - 1);
      for (let index = 0; index < row.count; index += 1) {
        // Use five loose terrace layers, but give each layer its own cluster
        // phase and depth drift.  The silhouette reads as a town receding into
        // the hills instead of a rigid wall of equally tall boxes.
        const phase = rowIndex * 1.91 + index * 2.37;
        const cluster = .5 + .5 * Math.sin(phase * .83 + Math.cos(index * .41));
        const depthScale = 1 - rowIndex * .055;
        const xWave = Math.sin((rowIndex + 2) * 2.17 + index * 1.71) * 2.35 + Math.cos(index * .83 + rowIndex * .6) * .55;
        const zWave = Math.cos((rowIndex + 1) * 1.43 + index * 2.31) * 2.55 + Math.sin(index * 1.17 + rowIndex * .6) * .72;
        const defaultX = clamp(BOUNDS.minX + 2 + step * index + xWave, BOUNDS.minX + 1.2, BOUNDS.maxX - 1.2);
        const defaultZ = clamp(row.z + zWave + defaultX * .05, BOUNDS.minZ + 1, BOUNDS.maxZ - 1);
        const south = SOUTH_SLOTS[buildingIndex];
        const x = south ? south.x - transformX : defaultX;
        const z = south ? south.z - transformZ : defaultZ;
        const footprint = depthScale * (.84 + cluster * .18);
        const width = south ? south.width : (2.55 + ((rowIndex * 3 + index * 2) % 5) * .38) * footprint;
        const depth = south ? south.depth : (2.0 + ((rowIndex + index * 3) % 4) * .34) * footprint;
        // Do not use index*7 here: modulo 7 made every building in a row the
        // same height and was the source of the conspicuous banding.
        const heightValue = south ? south.height : (1.0 + ((rowIndex * 5 + index * 3) % 8) * .24) *
          (1 - rowIndex * .06) * (.88 + cluster * .16);
        // Layout coordinates are local to the decorative group.  Sample the
        // final world terrain and compensate the group's y offset so a slope
        // transform cannot bury or float the building bases.
        const worldX = x + transformX;
        const worldZ = z + transformZ;
        buildings.push({
          x, z, width, depth, height: heightValue,
          ground: groundAtFootprint(height, worldX, worldZ, width, depth) - transformY,
          rotation: Math.sin(rowIndex * 1.8 + index * .7) * .075,
          shellColor: SHELL_COLORS[(rowIndex + index * 2) % SHELL_COLORS.length],
          roofColor: ROOF_COLORS[(rowIndex * 2 + index) % ROOF_COLORS.length],
          windows: 2,
          balcony: ((rowIndex + index) % 3) !== 1,
          tank: ((rowIndex * 2 + index) % 2) === 0
        });
        buildingIndex += 1;
      }
    });
    return buildings;
  }

  function create(options = {}) {
    const T = options.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    const parent = options.parent;
    const ownGeometry = options.ownGeometry;
    const ownMaterial = options.ownMaterial;
    const addMesh = options.addMesh;
    if (!T || !parent || !T.Group || !T.InstancedMesh || typeof ownGeometry !== 'function' ||
        typeof ownMaterial !== 'function' || typeof addMesh !== 'function') {
      throw new TypeError('CozyForestCityContext.create requires THREE, parent, ownGeometry, ownMaterial, and addMesh');
    }

    const group = new T.Group();
    group.name = 'forest-city-context';
    group.userData = { decorativeOnly: true, noCollision: true, resourceOwner: 'forest-scene' };
    // Recess the decorative town behind the forest terrace.  This is a local
    // visual transform only: building coordinates, 101 silhouette, and all
    // gameplay/collision contracts remain unchanged.
    // Keep the decorative town as a quiet left-rear backdrop behind the creek
    // vista; this transform does not alter any gameplay route/collision
    // contract.  The separate 101 silhouette is coordinated by forest-scene.
    group.position.set(44, -.62, 14);
    parent.add(group);
    const buildings = makeLayout(options.height, group.position);
    const boxGeometry = ownGeometry(new T.BoxGeometry(1, 1, 1));
    const tankGeometry = ownGeometry(new T.CylinderGeometry(.5, .5, 1, 8));
    const shellMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0xffffff, roughness: .9, fog: true }));
    const windowMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0x668b91, roughness: .72, metalness: .04, fog: true }));
    const roofMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0xffffff, roughness: .96, fog: true }));
    const balconyMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0x8e6b51, roughness: .93, fog: true }));
    const tankMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0x9aa2a0, roughness: .82, fog: true }));
    const identity = new T.Quaternion();
    const matrix = new T.Matrix4();
    const position = new T.Vector3();
    const scale = new T.Vector3();
    const color = new T.Color();

    function register(mesh) {
      addMesh(mesh);
      // Root addMesh registers ownership; this local group owns visibility.
      if (mesh.parent !== group) group.add(mesh);
      return mesh;
    }

    const shells = register(new T.InstancedMesh(boxGeometry, shellMaterial, buildings.length));
    shells.name = 'forest-city-context-building-shells';
    const windows = register(new T.InstancedMesh(boxGeometry, windowMaterial, buildings.length * 4));
    windows.name = 'forest-city-context-window-bands';
    const roofs = register(new T.InstancedMesh(boxGeometry, roofMaterial, buildings.length));
    roofs.name = 'forest-city-context-rooflines';
    const balconies = register(new T.InstancedMesh(boxGeometry, balconyMaterial, buildings.filter(building => building.balcony).length));
    balconies.name = 'forest-city-context-balconies';
    const tanks = register(new T.InstancedMesh(tankGeometry, tankMaterial, buildings.filter(building => building.tank).length));
    tanks.name = 'forest-city-context-rooftop-tanks';

    let windowIndex = 0;
    let balconyIndex = 0;
    let tankIndex = 0;
    buildings.forEach((building, index) => {
      const ground = building.ground;
      position.set(building.x, ground + building.height / 2, building.z);
      scale.set(building.width, building.height, building.depth);
      matrix.compose(position, identity, scale);
      shells.setMatrixAt(index, matrix);
      color.setHex(building.shellColor);
      shells.setColorAt(index, color);

      position.set(building.x, ground + building.height + .12, building.z);
      scale.set(building.width + .18, .18, building.depth + .15);
      matrix.compose(position, identity, scale);
      roofs.setMatrixAt(index, matrix);
      color.setHex(building.roofColor);
      roofs.setColorAt(index, color);

      for(const level of[.32,.67])for(const side of[-1,1]){
        position.set(building.x+side*building.width*.23,ground+building.height*level,building.z-building.depth/2-.035);
        scale.set(building.width*.22,building.height*.16,.045);matrix.compose(position,identity,scale);windows.setMatrixAt(windowIndex++,matrix);
      }

      if (building.balcony) {
        position.set(building.x, ground + building.height * .57, building.z - building.depth / 2 - .12);
        scale.set(building.width * .5, .08, .2);
        matrix.compose(position, identity, scale);
        balconies.setMatrixAt(balconyIndex++, matrix);
      }

      if (building.tank) {
        position.set(building.x + (index % 2 ? .38 : -.38), ground + building.height + .48, building.z + .08);
        scale.set(.32, .78, .32);
        matrix.compose(position, identity, scale);
        tanks.setMatrixAt(tankIndex++, matrix);
      }
    });
    for (const mesh of [shells, windows, roofs, balconies, tanks]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.decorativeOnly = true;
      mesh.userData.noCollision = true;
    }
    shells.instanceColor.needsUpdate = true;
    roofs.instanceColor.needsUpdate = true;

    const boxTriangles = (boxGeometry.index?.count || boxGeometry.attributes.position.count) / 3;
    const tankTriangles = (tankGeometry.index?.count || tankGeometry.attributes.position.count) / 3;
    const distantWorldBounds = Object.freeze({
      minX: BOUNDS.minX + group.position.x,
      maxX: BOUNDS.maxX + group.position.x,
      minZ: BOUNDS.minZ + group.position.z,
      maxZ: BOUNDS.maxZ + group.position.z
    });
    const southWorldBounds = Object.freeze(SOUTH_SLOT_INDICES.reduce((bounds, index) => {
      const slot = SOUTH_SLOTS[index];
      return {
        minX: Math.min(bounds.minX, slot.x - slot.width / 2),
        maxX: Math.max(bounds.maxX, slot.x + slot.width / 2),
        minZ: Math.min(bounds.minZ, slot.z - slot.depth / 2),
        maxZ: Math.max(bounds.maxZ, slot.z + slot.depth / 2)
      };
    }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }));
    const worldBounds = Object.freeze({
      minX: Math.min(distantWorldBounds.minX, southWorldBounds.minX),
      maxX: Math.max(distantWorldBounds.maxX, southWorldBounds.maxX),
      minZ: Math.min(distantWorldBounds.minZ, southWorldBounds.minZ),
      maxZ: Math.max(distantWorldBounds.maxZ, southWorldBounds.maxZ)
    });
    const stats = Object.freeze({
      buildings: buildings.length,
      meshes: 5,
      drawCalls: 5,
      triangles: Math.round(boxTriangles * (buildings.length * 2 + buildings.length * 4 + buildings.filter(building => building.balcony).length) + tankTriangles * buildings.filter(building => building.tank).length),
      geometries: 2,
      materials: 5,
      bounds: Object.freeze({ ...BOUNDS }),
      worldBounds,
      distantWorldBounds,
      southWorldBounds,
      southSlots: SOUTH_SLOT_INDICES.length,
      collision: false,
      resourceOwner: 'forest-scene'
    });

    return {
      group,
      stats,
      // Resources remain owned by the caller's ownGeometry/ownMaterial sets.
      // This only detaches the visual group; forest-scene.dispose performs the
      // actual resource release exactly once.
      dispose() {
        group.removeFromParent?.();
        return { disposed: true, ...stats };
      }
    };
  }

  return Object.freeze({ create, bounds: BOUNDS });
});
