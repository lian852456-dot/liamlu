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

  const BOUNDS = Object.freeze({ minX: -35, maxX: 32, minZ: 48, maxZ: 84 });
  const ROWS = Object.freeze([
    Object.freeze({ z: 50.6, count: 9 }),
    Object.freeze({ z: 58.2, count: 10 }),
    Object.freeze({ z: 66.4, count: 10 }),
    Object.freeze({ z: 74.0, count: 9 }),
    Object.freeze({ z: 81.6, count: 10 })
  ]);
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

  function makeLayout(height) {
    const buildings = [];
    ROWS.forEach((row, rowIndex) => {
      const step = (BOUNDS.maxX - BOUNDS.minX - 4) / (row.count - 1);
      for (let index = 0; index < row.count; index += 1) {
        const xWave = Math.sin((rowIndex + 2) * 2.17 + index * 1.71) * 1.1;
        const zWave = Math.cos((rowIndex + 1) * 1.43 + index * 2.31) * 1.05;
        const x = clamp(BOUNDS.minX + 2 + step * index + xWave, BOUNDS.minX + 1.2, BOUNDS.maxX - 1.2);
        const z = clamp(row.z + zWave, BOUNDS.minZ + 1, BOUNDS.maxZ - 1);
        const width = 3.25 + ((rowIndex * 3 + index * 2) % 5) * .42;
        const depth = 2.55 + ((rowIndex + index * 3) % 4) * .43;
        const heightValue=1.8+((rowIndex*5+index*7)%7)*.38;
        buildings.push({
          x, z, width, depth, height: heightValue,
          ground: groundAt(height, x, z),
          rotation: Math.sin(rowIndex * 1.8 + index * .7) * .045,
          shellColor: SHELL_COLORS[(rowIndex + index * 2) % SHELL_COLORS.length],
          roofColor: ROOF_COLORS[(rowIndex * 2 + index) % ROOF_COLORS.length],
          windows: 2,
          balcony: ((rowIndex + index) % 3) !== 1,
          tank: ((rowIndex * 2 + index) % 2) === 0
        });
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
    parent.add(group);
    const buildings = makeLayout(options.height);
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
    const stats = Object.freeze({
      buildings: buildings.length,
      meshes: 5,
      drawCalls: 5,
      triangles: Math.round(boxTriangles * (buildings.length * 2 + buildings.length * 4 + buildings.filter(building => building.balcony).length) + tankTriangles * buildings.filter(building => building.tank).length),
      geometries: 2,
      materials: 5,
      bounds: Object.freeze({ ...BOUNDS }),
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
