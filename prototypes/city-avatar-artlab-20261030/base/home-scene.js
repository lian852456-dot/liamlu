/*
 * Optional personal-home presentation, kept independent from the world
 * renderer.  It only creates native M primitives; collision and placement
 * authority remain in scene-rules.js / the existing server contract.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CozyHomeScene = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const ROOM_BOUNDS = Object.freeze({ minX: -6.65, maxX: 6.65, minZ: -5, maxZ: 5.4 });
  const ENTRY = Object.freeze({ x: 0, z: 4.1 });
  const GRID = Object.freeze({ minX: -4.9, maxX: -1.05, minZ: 1.8, maxZ: 4.3 });
  const DEFAULT_OBSTACLES = Object.freeze([
    { x: 0, z: -3.5, w: 6, d: 1.55 },
    { x: -3, z: 0.1, w: 2.55, d: 1.65 },
    { x: 1, z: 0.1, w: 2.55, d: 1.65 },
    { x: -5.9, z: -2.2, w: 1.6, d: 0.9 },
    { x: 4.6, z: 3.6, w: 3.1, d: 1.35 },
    { x: 4.5, z: 1.1, w: 1.5, d: 1.5 },
    { x: 6, z: -0.4, w: 0.65, d: 0.65 },
    { x: -5.9, z: 3.8, w: 0.8, d: 0.8 },
    { x: 5.8, z: -4.3, w: 0.8, d: 0.8 },
    { x: -4.7, z: -4.7, w: 0.8, d: 0.8 }
  ].map(Object.freeze));

  function asNumber(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function meshStats(group) {
    let meshes = 0;
    let triangles = 0;
    group.traverse(node => {
      if (!node || !node.isMesh) return;
      meshes += 1;
      const geometry = node.geometry;
      const indexCount = geometry?.index?.count;
      const positionCount = geometry?.attributes?.position?.count;
      triangles += Math.floor(Number(indexCount ?? positionCount ?? 0) / 3);
    });
    return { meshes, triangles };
  }

  function create(options = {}) {
    const T = options.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    const M = options.models || (typeof CozyModels !== 'undefined' ? CozyModels : null);
    const parent = options.parent;
    if (!T || !M || !parent || typeof M.group !== 'function' || typeof M.box !== 'function') {
      throw new TypeError('CozyHomeScene.create requires THREE, models, and parent');
    }

    const group = M.group(parent);
    group.name = 'cozy-personal-home-scene';
    group.userData.homeScene = true;
    group.userData.collisionAuthority = 'R.obstacles.indoor';
    group.userData.noAdditionalObstacles = true;

    const sourceObstacles = Array.isArray(options.obstacles) && options.obstacles.length
      ? options.obstacles
      : DEFAULT_OBSTACLES;
    const obstacle = index => sourceObstacles[index] || DEFAULT_OBSTACLES[index];
    const ox = index => asNumber(obstacle(index)?.x, DEFAULT_OBSTACLES[index].x);
    const oz = index => asNumber(obstacle(index)?.z, DEFAULT_OBSTACLES[index].z);

    // The front remains open at the canonical entry; collision is supplied by
    // the caller's existing R.obstacles.indoor, never by this presentation.
    M.box(group, 13.1, .12, 10.25, 0xdcc8a5, 0, -.06, .15, .04);
    M.box(group, 13.1, 3.1, .18, 0xf3e7cf, 0, 1.55, -4.9, .06);
    M.box(group, .18, 3.1, 9.7, 0xe9d9bd, -6.56, 1.55, .15, .05);

    // Two windows brighten the cutaway room without adding a front wall.
    for (const x of [-2.15, 1.45]) {
      M.box(group, 2.5, 1.35, .06, 0x8eb9b7, x, 2.0, -4.78, .01);
      M.box(group, 2.62, .07, .08, 0xd1b28a, x, 2.69, -4.74, .01);
      M.box(group, 2.62, .07, .08, 0xd1b28a, x, 1.31, -4.74, .01);
      M.box(group, .07, 1.42, .08, 0xd1b28a, x - 1.27, 2.0, -4.74, .01);
      M.box(group, .07, 1.42, .08, 0xd1b28a, x + 1.27, 2.0, -4.74, .01);
      M.box(group, .05, 1.25, .08, 0xd1b28a, x, 2.0, -4.73, .01);
    }

    // The following shapes deliberately sit on the same rectangles as the
    // canonical indoor obstacles.  They are visual furniture only.
    const kitchen = M.group(group, ox(0), 0, oz(0));
    M.box(kitchen, 5.55, .92, 1.18, 0xbf946b, 0, .46, 0, .08);
    M.box(kitchen, 5.72, .12, 1.3, 0xf0d2a1, 0, .98, 0, .04);
    M.box(kitchen, .72, .08, .65, 0x8ab4a5, -1.5, 1.08, 0, .025);

    const cabinet = M.group(group, ox(1), 0, oz(1));
    M.box(cabinet, 2.18, .8, 1.35, 0x9bb6a0, 0, .4, 0, .08);
    M.box(cabinet, 2.3, .12, 1.45, 0xd7b484, 0, .86, 0, .035);

    const bed = M.group(group, ox(2), 0, oz(2));
    M.box(bed, 2.16, .42, 1.48, 0xa9c4b0, 0, .28, .02, .08);
    M.box(bed, 2.2, 1.08, .14, 0x7e9d8e, 0, .62, -.68, .035);
    M.box(bed, .64, .14, .4, 0xf4e1c2, -.57, .58, .34, .03);

    const cabinetTall = M.group(group, ox(3), 0, oz(3));
    M.box(cabinetTall, 1.34, 2.22, .7, 0xc48f68, 0, 1.11, 0, .055);
    M.box(cabinetTall, .08, 1.52, .05, 0xead5b0, 0, 1.12, .37, .01);

    const sofa = M.group(group, ox(4), 0, oz(4));
    M.box(sofa, 2.62, .48, 1.1, 0x8eafa0, 0, .34, .05, .12);
    M.box(sofa, 2.62, .75, .2, 0x769b8d, 0, .88, -.4, .06);
    for (const x of [-1.2, 1.2]) M.box(sofa, .2, .58, 1.08, 0x769b8d, x, .57, .05, .04);

    const sideTable = M.group(group, ox(5), 0, oz(5));
    M.box(sideTable, .88, .1, .82, 0xd0a274, 0, .68, 0, .03);
    M.box(sideTable, .12, .62, .12, 0x8a6c55, 0, .34, 0, .02);

    const lamp = M.group(group, ox(6), 0, oz(6));
    M.cyl?.(lamp, .25, .3, .08, 0xb28b63, 0, .04, 0);
    M.cyl?.(lamp, .035, .05, 1.55, 0x92785c, 0, .8, 0);
    M.cyl?.(lamp, .31, .5, .42, 0xf0c77c, 0, 1.73, 0);

    for (const [index, scale] of [[7, 1.25], [8, 1.1], [9, .95]]) {
      const plant = M.plant?.(group, ox(index), oz(index), scale, index === 7);
      if (plant) plant.userData.homeFixedObstacleIndex = index;
    }

    const counted = meshStats(group);
    const stats = Object.freeze({
      meshes: counted.meshes,
      triangles: counted.triangles,
      maxMeshes: 80,
      fixedObstacleCount: sourceObstacles.length,
      bounds: ROOM_BOUNDS,
      entry: ENTRY,
      placementGrid: GRID,
      collisionSource: 'R.obstacles.indoor',
      addsCollision: false,
      usesSharedModels: true
    });
    let disposed = false;
    function dispose() {
      if (disposed) return { disposed: true, ...stats };
      disposed = true;
      M.disposeOwned?.(group);
      while (group.children?.length) group.remove(group.children[0]);
      group.removeFromParent?.();
      return { disposed: true, ...stats };
    }
    return { group, dispose, stats };
  }

  return Object.freeze({ create, bounds: ROOM_BOUNDS, entry: ENTRY, placementGrid: GRID });
});
