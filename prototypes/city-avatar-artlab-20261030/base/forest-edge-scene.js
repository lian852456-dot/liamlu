/*
 * The small visual bridge between the city and the forest.
 *
 * This module deliberately owns only visual resources.  Portals, collision,
 * navigation, and saved positions remain authoritative in the caller's
 * rules/world modules.  There are no image or canvas textures here: a few
 * low-poly, instanced meshes provide the wooded hillside and the return path.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CozyForestEdgeScene = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const ROUTES = Object.freeze([
    Object.freeze({ id: 'creek-south', label: '溪谷南徑', z: -14, forestZ: -5.5 }),
    Object.freeze({ id: 'creek-middle', label: '溪岸中徑', z: 6, forestZ: 13.5 }),
    Object.freeze({ id: 'ridge-north', label: '山稜北徑', z: 26, forestZ: 31.5 })
  ]);
  // The forest band ends in a five-metre fade; existing city ground
  // remains flat beyond it. All elevated walking points have a surface.
  const CITY_BOUNDS = Object.freeze({ minX: -54, maxX: -28, minZ: -24, maxZ: 36 });
  const FOREST_PATH = Object.freeze({ minX: 7.1, maxX: 13.2, width: 1.35 });

  function finite(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function colorParts(value) {
    const number = Number(value) >>> 0;
    return [(number >> 16 & 255) / 255, (number >> 8 & 255) / 255, (number & 255) / 255];
  }

  function heightReader(rules) {
    const candidate = typeof rules?.height === 'function' ? rules.height :
      typeof rules?.forest?.height === 'function' ? rules.forest.height : null;
    const probe = { x: 0, z: 0 };
    return function read(x, z) {
      if (!candidate) return 0;
      probe.x = finite(x);
      probe.z = finite(z);
      let value;
      try { value = candidate(probe); } catch (_) { value = NaN; }
      // A few old callers used height(x, z).  Keep this fallback for the
      // isolated candidate without changing the contract used by the world.
      if (!Number.isFinite(Number(value))) {
        try { value = candidate(probe.x, probe.z); } catch (_) { value = 0; }
      }
      return Math.max(0, finite(value, 0));
    };
  }

  function ownMaterial(T, materials, color, roughness = .92, vertexColors = false) {
    const Ctor = T.MeshStandardMaterial || T.MeshLambertMaterial || T.MeshBasicMaterial;
    const material = new Ctor({ color, roughness, vertexColors });
    materials.add(material);
    return material;
  }

  function ownGeometry(T, geometries, geometry) {
    geometries.add(geometry);
    return geometry;
  }

  function addVertex(builder, x, y, z, color) {
    builder.positions.push(x, y, z);
    const [r, g, b] = colorParts(color);
    builder.colors.push(r, g, b);
    return builder.positions.length / 3 - 1;
  }

  function addQuad(builder, a, b, c, d, color) {
    const ia = addVertex(builder, a[0], a[1], a[2], color);
    const ib = addVertex(builder, b[0], b[1], b[2], color);
    const ic = addVertex(builder, c[0], c[1], c[2], color);
    const id = addVertex(builder, d[0], d[1], d[2], color);
    const up = (b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
    if(up >= 0) builder.indices.push(ia, ib, ic, ia, ic, id);
    else builder.indices.push(ia, ic, ib, ia, id, ic);
  }

  function finishGeometry(T, geometries, builder) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(builder.positions, 3));
    geometry.setAttribute('color', new T.Float32BufferAttribute(builder.colors, 3));
    geometry.setIndex(builder.indices);
    geometry.computeVertexNormals?.();
    return ownGeometry(T, geometries, geometry);
  }

  function addXStrip(builder, x0, x1, z, width, yAt, color, segments = 8) {
    const dx = (x1 - x0) / segments;
    for (let index = 0; index < segments; index += 1) {
      const left = x0 + dx * index;
      const right = left + dx;
      const y0 = yAt(left, z);
      const y1 = yAt(right, z);
      addQuad(builder,
        [left, yAt(left,z-width) + .035, z - width], [left, yAt(left,z+width) + .035, z + width],
        [right, yAt(right,z+width) + .035, z + width], [right, yAt(right,z-width) + .035, z - width], color);
    }
  }

  function addZStrip(builder, x, z0, z1, width, yAt, color, segments = 10) {
    const dz = (z1 - z0) / segments;
    for (let index = 0; index < segments; index += 1) {
      const near = z0 + dz * index;
      const far = near + dz;
      const y0 = yAt(x, near);
      const y1 = yAt(x, far);
      addQuad(builder,
        [x - width, y0 + .026, near], [x - width, y1 + .026, far],
        [x + width, y1 + .026, far], [x + width, y0 + .026, near], color);
    }
  }

  function makeInstanced(T, geometries, materials, geometry, material, count, name) {
    if (!T.InstancedMesh) return null;
    const mesh = new T.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function setInstance(T, mesh, index, matrix, position, scale, rotationY = 0) {
    if (!mesh) return;
    const quaternion = new T.Quaternion();
    quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), rotationY);
    matrix.compose(new T.Vector3(position[0], position[1], position[2]), quaternion,
      new T.Vector3(scale[0], scale[1], scale[2]));
    mesh.setMatrixAt(index, matrix);
  }

  function appendCityTerrain(builder, cityHeight) {
    const columns = 26, rows = 60;
    for (let row = 0; row < rows; row += 1) {
      const z0 = CITY_BOUNDS.minZ + (CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ) * row / rows;
      const z1 = CITY_BOUNDS.minZ + (CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ) * (row + 1) / rows;
      for (let column = 0; column < columns; column += 1) {
        const x0 = CITY_BOUNDS.minX + (CITY_BOUNDS.maxX - CITY_BOUNDS.minX) * column / columns;
        const x1 = CITY_BOUNDS.minX + (CITY_BOUNDS.maxX - CITY_BOUNDS.minX) * (column + 1) / columns;
        const onTrail = ROUTES.some(route=>Math.abs((z0+z1)/2-route.z)<1.2)||Math.abs((x0+x1)/2+30)<1.2;
        const c = onTrail ? 0xb28a61 : ((row + column) % 3 === 0) ? 0x78906d : ((row + column) % 3 === 1 ? 0x829b73 : 0x708765);
        addQuad(builder,
          [x0, cityHeight(x0, z0), z0], [x0, cityHeight(x0, z1), z1],
          [x1, cityHeight(x1, z1), z1], [x1, cityHeight(x1, z0), z0], c);
      }
    }
  }

  function disposeOwned(group, meshes, materials, geometries, disposed, stats) {
    return function dispose() {
      if (disposed.value) return { disposed: true, ...stats };
      disposed.value = true;
      group.removeFromParent?.();
      while (group.children.length) group.remove(group.children[0]);
      for (const mesh of meshes) {
        mesh.parent?.remove(mesh);
        mesh.dispose?.();
      }
      for (const material of materials) material.dispose?.();
      for (const geometry of geometries) geometry.dispose?.();
      return { disposed: true, ...stats };
    };
  }

  function createCity(options = {}) {
    const T = options.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    const parent = options.parent;
    if (!T || !parent || !T.Group || !T.BufferGeometry || !T.Mesh) {
      throw new TypeError('CozyForestEdgeScene.createCity requires THREE and parent');
    }
    const readForestHeight = heightReader(options.rules);
    const routeHeights = ROUTES.map(route => readForestHeight(13.2, route.forestZ));
    function routeHeight(z) {
      const value = finite(z);
      if (value <= ROUTES[0].z) {
        const span = ROUTES[1].z - ROUTES[0].z;
        return routeHeights[0] + (routeHeights[1] - routeHeights[0]) * (value - ROUTES[0].z) / span;
      }
      for (let index = 1; index < ROUTES.length; index += 1) {
        if (value <= ROUTES[index].z) {
          const left = ROUTES[index - 1].z, right = ROUTES[index].z;
          const ratio = (value - left) / (right - left);
          return routeHeights[index - 1] + (routeHeights[index] - routeHeights[index - 1]) * ratio;
        }
      }
      const left = ROUTES[ROUTES.length - 2].z, right = ROUTES[ROUTES.length - 1].z;
      return routeHeights[routeHeights.length - 2] +
        (routeHeights[routeHeights.length - 1] - routeHeights[routeHeights.length - 2]) * (value - left) / (right - left);
    }
    const analyticHeight = (point = {}) => {
      const source = point && typeof point === 'object' ? point : {};
      const x = finite(source.x), z = finite(source.z);
      if (x < CITY_BOUNDS.minX || x >= CITY_BOUNDS.maxX || z < CITY_BOUNDS.minZ || z > CITY_BOUNDS.maxZ) return 0;
      // City z and forest z use different portal anchors.  Interpolate the
      // three route heights rather than sampling the unrelated forest z.
      const target = Math.max(0, routeHeight(z));
      const rise = smoothstep((-28 - x) / 7);
      const west = smoothstep((-35 - x) / 19) * 1.15;
      const edgeFade = smoothstep((z - CITY_BOUNDS.minZ) / 5) * smoothstep((CITY_BOUNDS.maxZ - z) / 5);
      return Math.max(0, (target * rise + west) * edgeFade);
    };
    // Use the very same terrain triangles for actor height. This avoids
    // hovering between vertices on the curved approach, including edge fades.
    const cityHeight = (point = {}) => {
      const x = finite(point.x), z = finite(point.z), b = CITY_BOUNDS;
      if (x < b.minX || x >= b.maxX || z < b.minZ || z >= b.maxZ) return 0;
      const x0 = Math.floor(x - b.minX) + b.minX, z0 = Math.floor(z - b.minZ) + b.minZ;
      const u = x - x0, v = z - z0;
      const a = analyticHeight({x:x0,z:z0}), c = analyticHeight({x:x0+1,z:z0+1});
      return v >= u ? a*(1-v)+analyticHeight({x:x0,z:z0+1})*(v-u)+c*u :
        a*(1-u)+c*v+analyticHeight({x:x0+1,z:z0})*(u-v);
    };
    const cityY = (x, z) => cityHeight({ x, z });
    const geometries = new Set(), materials = new Set(), meshes = new Set();
    const group = new T.Group();
    group.name = 'forest-edge-city-hillside';
    group.userData = {
      visualOnly: true,
      collisionAuthority: 'rules.obstacles',
      addsCollision: false,
      bounds: { ...CITY_BOUNDS },
      mainTrunkX: -30,
      routes: ROUTES.map((route, index) => ({ id: route.id, label: route.label, z: route.z, height: routeHeights[index] }))
    };

    const terrainBuilder = { positions: [], colors: [], indices: [] };
    appendCityTerrain(terrainBuilder, cityY);
    const soil = 0x9b7654;
    const path = 0xb28a61;
    // Dirt routes are vertex-colored on the one terrain surface, so there
    // is no second flat ribbon that could bury or float above a curved slope.
    const terrainGeometry = finishGeometry(T, geometries, terrainBuilder);
    const terrainMaterial = ownMaterial(T, materials, 0xffffff, .98, true);
    const terrain = new T.Mesh(terrainGeometry, terrainMaterial);
    terrain.name = 'forest-edge-city-terrain-and-ramps';
    terrain.receiveShadow = true;
    terrain.userData = { raycastTerrain: true, visualOnly: true, pathWidth: 2.4, addsCollision: false };
    group.add(terrain); meshes.add(terrain);

    const trunkGeometry = ownGeometry(T, geometries, new T.CylinderGeometry(.16, .25, 3.6, 6));
    const trunkMaterial = ownMaterial(T, materials, 0x76553d, 1);
    const canopyGeometry = ownGeometry(T, geometries, new T.IcosahedronGeometry(.72, 1));
    const canopyMaterials = [
      ownMaterial(T, materials, 0x466d50, .96),
      ownMaterial(T, materials, 0x52775a, .96),
      ownMaterial(T, materials, 0x66865c, .96)
    ];
    const canopyPoints = [];
    const zCandidates = [-22, -8, 0, 14, 22, 34];
    for (let column = 0; column < 5; column += 1) {
      for (let row = 0; row < zCandidates.length; row += 1) {
        const x = -52 + column * 3.7 + (row % 2) * .65;
        const z = zCandidates[row] + ((column * 3 + row) % 3 - 1) * .65;
        if (ROUTES.some(route => Math.abs(route.z - z) < 2.6)) continue;
        canopyPoints.push({ x, z, scale: .92 + ((column + row) % 4) * .06 });
      }
    }
    const treeBase = (point) => cityY(point.x, point.z);
    const trunk = makeInstanced(T, geometries, materials, trunkGeometry, trunkMaterial, canopyPoints.length, 'forest-edge-city-tree-trunks');
    if (trunk) {
      const matrix = new T.Matrix4();
      canopyPoints.forEach((point, index) => {
        const scale = point.scale;
        setInstance(T, trunk, index, matrix,
          [point.x, treeBase(point) + 1.8 * scale, point.z], [scale, scale, scale], (index % 5) * .37);
      });
      trunk.instanceMatrix.needsUpdate = true;
      trunk.userData = { visualOnly: true, count: canopyPoints.length, height: 3.6 };
      group.add(trunk); meshes.add(trunk);
    }
    const canopyLayers = [];
    const layerData = [
      { name: 'forest-edge-city-canopy-lower', y: 3.12, scale: [1.38, .88, 1.38] },
      { name: 'forest-edge-city-canopy-middle', y: 4.02, scale: [1.08, .82, 1.08] },
      { name: 'forest-edge-city-canopy-top', y: 4.76, scale: [.78, .72, .78] }
    ];
    layerData.forEach((layer, layerIndex) => {
      const canopy = makeInstanced(T, geometries, materials, canopyGeometry, canopyMaterials[layerIndex], canopyPoints.length, layer.name);
      if (!canopy) return;
      const matrix = new T.Matrix4();
      canopyPoints.forEach((point, index) => {
        const scale = point.scale;
        setInstance(T, canopy, index, matrix,
          [point.x, treeBase(point) + layer.y * scale, point.z],
          [layer.scale[0] * scale, layer.scale[1] * scale, layer.scale[2] * scale], (index % 5) * .37);
      });
      canopy.instanceMatrix.needsUpdate = true;
      canopy.userData = { visualOnly: true, count: canopyPoints.length, layer: layerIndex };
      group.add(canopy); meshes.add(canopy); canopyLayers.push(canopy);
    });

    const underGeometry = ownGeometry(T, geometries, new T.ConeGeometry(.28, .72, 6));
    const underMaterial = ownMaterial(T, materials, 0x6f8457, 1);
    const underPoints = [];
    for (let index = 0; index < 24; index += 1) {
      const x = -53 + (index * 7 % 18) + (index % 2) * .4;
      const z = -23 + (index * 11 % 58);
      if (ROUTES.some(route => Math.abs(route.z - z) < 1.8)) continue;
      underPoints.push({ x, z });
    }
    const undergrowth = makeInstanced(T, geometries, materials, underGeometry, underMaterial, underPoints.length, 'forest-edge-city-rock-grass');
    if (undergrowth) {
      const matrix = new T.Matrix4();
      underPoints.forEach((point, index) => setInstance(T, undergrowth, index, matrix,
        [point.x, cityY(point.x, point.z) + .36, point.z], [.8 + (index % 3) * .15, .75 + (index % 2) * .18, .8], index * .29));
      undergrowth.instanceMatrix.needsUpdate = true;
      undergrowth.userData = { visualOnly: true, count: underPoints.length };
      group.add(undergrowth); meshes.add(undergrowth);
    }

    parent.add(group);
    const triangles = meshes.size ? [...meshes].reduce((sum, mesh) => {
      const base = Math.floor(Number(mesh.geometry?.index?.count ?? mesh.geometry?.attributes?.position?.count ?? 0) / 3);
      return sum + base * (mesh.isInstancedMesh ? mesh.count : 1);
    }, 0) : 0;
    const stats = Object.freeze({
      meshes: meshes.size,
      triangles,
      paths: ROUTES.length,
      pathWidth: 2.4,
      trees: canopyPoints.length,
      treeLayers: canopyLayers.length,
      treeHeightRange: Object.freeze([4.6, 5.6]),
      undergrowth: underPoints.length,
      textures: 0,
      bounds: Object.freeze({ ...CITY_BOUNDS }),
      addsCollision: false,
      resourceOwner: 'forest-edge-city'
    });
    const disposed = { value: false };
    const dispose = disposeOwned(group, meshes, materials, geometries, disposed, stats);
    return { group, ground: terrain, walkSurfaces: [terrain], height: cityHeight, dispose, stats };
  }

  function createForest(options = {}) {
    const T = options.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    const parent = options.parent;
    if (!T || !parent || !T.Group || !T.BufferGeometry || !T.Mesh) {
      throw new TypeError('CozyForestEdgeScene.createForest requires THREE and parent');
    }
    const readHeight = heightReader(options.rules);
    // Reposition decorative understory only: canonical tree colliders,
    // terrain and all existing instance counts remain unchanged.
    let clearedPlants=0;
    const matrix = new T.Matrix4(), point = new T.Vector3();
    for(const name of ['forest-understory-fern-clusters','forest-bank-understory','forest-wildflowers']){
      const mesh=parent.getObjectByName(name);if(!mesh?.isInstancedMesh)continue;
      for(let i=0;i<mesh.count;i++){
        mesh.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);
        if(point.x<6.5||point.x>14)continue;
        const route=ROUTES.find(r=>Math.abs(point.z-r.forestZ)<1.7);if(!route)continue;
        const nextZ=route.forestZ+(point.z<route.forestZ?-1:1)*1.9;
        matrix.elements[13]+=readHeight(point.x,nextZ)-readHeight(point.x,point.z);
        matrix.elements[14]=nextZ;mesh.setMatrixAt(i,matrix);clearedPlants++;
      }
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere?.();
    }
    const geometries = new Set(), materials = new Set(), meshes = new Set();
    const group = new T.Group();
    group.name = 'forest-edge-return-paths';
    group.userData = {
      visualOnly: true,
      collisionAuthority: 'rules.obstacles',
      addsCollision: false,
      returnLabel: '下山回小城',
      routes: ROUTES.map(route => ({ id: route.id, label: route.label, forestZ: route.forestZ }))
    };
    const builder = { positions: [], colors: [], indices: [] };
    for (const route of ROUTES) {
      // The right-bank join stays in x=7.1..8.0, outside the creek/water
      // corridor.  The forest endpoint is the portal's exact x=13.2.
      addXStrip(builder, FOREST_PATH.maxX, FOREST_PATH.minX, route.forestZ,
        FOREST_PATH.width / 2, (x, z) => readHeight(x, z), 0xffffff, 12);
    }
    const pathGeometry = finishGeometry(T, geometries, builder);
    const pathMaterial = ownMaterial(T, materials, 0xb89066, .96, true);
    const paths = new T.Mesh(pathGeometry, pathMaterial);
    paths.name = 'forest-edge-return-paths';
    paths.receiveShadow = true;
    paths.userData = { visualOnly: true, pathWidth: FOREST_PATH.width * 2, avoidsWater: true, addsCollision: false };
    group.add(paths); meshes.add(paths);

    const signGeometry = ownGeometry(T, geometries, new T.BoxGeometry(.12, .8, 1.5));
    const signMaterial = ownMaterial(T, materials, 0x966d4d, .95);
    // Keep one named, pickable mesh per portal.  The geometry/material remain
    // shared, so registration can identify a portal without adding textures.
    ROUTES.forEach(route => {
      const sign = new T.Mesh(signGeometry, signMaterial);
      sign.name = `forest-edge-sign-${route.id}`;
      sign.position.set(13.55, readHeight(13.55, route.forestZ) + 1.05, route.forestZ);
      sign.userData = { label: '下山回小城', portalId: route.id, visualOnly: true };
      sign.castShadow = true;
      group.add(sign); meshes.add(sign);
    });
    const postGeometry = ownGeometry(T, geometries, new T.CylinderGeometry(.055, .07, 1.1, 6));
    const postMaterial = ownMaterial(T, materials, 0x79583f, 1);
    const posts = makeInstanced(T, geometries, materials, postGeometry, postMaterial, ROUTES.length * 2, 'forest-edge-return-sign-posts');
    if (posts) {
      const matrix = new T.Matrix4();
      ROUTES.forEach((route, routeIndex) => {
        const y = readHeight(13.55, route.forestZ) + .55;
        setInstance(T, posts, routeIndex * 2, matrix, [13.55, y, route.forestZ - .48], [1, 1, 1], 0);
        setInstance(T, posts, routeIndex * 2 + 1, matrix, [13.55, y, route.forestZ + .48], [1, 1, 1], 0);
      });
      posts.instanceMatrix.needsUpdate = true;
      posts.userData = { visualOnly: true, count: ROUTES.length * 2 };
      group.add(posts); meshes.add(posts);
    }

    // Close the purely visual east-bank gap revealed by the new path
    // cameras. The inner edge samples the legal mesh; the outer edge uses
    // the actual skirt triangles, rather than extrapolated terrain rules.
    const legal=parent.getObjectByName('forest-ground-terrain');
    const skirt=parent.getObjectByName('forest-distant-ground-skirt');
    let apronTriangles=0;
    if(legal?.geometry&&skirt?.geometry){
      function sample(mesh,x,z){
        const g=mesh.geometry,a=g.attributes.position,c=g.attributes.color,idx=g.index;
        let best=null;
        for(let i=0;i<(idx?.count||a.count);i+=3){
          const ia=idx?idx.getX(i):i,ib=idx?idx.getX(i+1):i+1,ic=idx?idx.getX(i+2):i+2;
          const ax=a.getX(ia),az=a.getZ(ia),bx=a.getX(ib),bz=a.getZ(ib),cx=a.getX(ic),cz=a.getZ(ic);
          if(x<Math.min(ax,bx,cx)-1e-5||x>Math.max(ax,bx,cx)+1e-5||z<Math.min(az,bz,cz)-1e-5||z>Math.max(az,bz,cz)+1e-5)continue;
          const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-10)continue;
          const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den,w=1-u-v;
          if(Math.min(u,v,w)<-1e-5)continue;
          const y=u*a.getY(ia)+v*a.getY(ib)+w*a.getY(ic);
          if(!best||y>best.y)best={y,color:c?[u*c.getX(ia)+v*c.getX(ib)+w*c.getX(ic),u*c.getY(ia)+v*c.getY(ib)+w*c.getY(ic),u*c.getZ(ia)+v*c.getZ(ib)+w*c.getZ(ic)]:[.4,.5,.3]};
        }
        if(!best)throw Error('FOREST_EDGE_SURFACE_MISSING:'+mesh.name+':'+x+':'+z);
        return best;
      }
      const b={positions:[],colors:[],indices:[]},uv=[];
      function quad(points,colors){const first=b.positions.length/3;addQuad(b,...points,0xffffff);for(let j=0;j<4;j++){b.colors.splice((first+j)*3,3,...colors[j]);uv.push(points[j][0]*.3,points[j][2]*.3);}}
      const rows=[];
      for(let z=-10;z<=35;z++){
        const inside=sample(legal,13.98,z),outside=sample(skirt,18,z);
        rows.push({a:[13.98,inside.y+.025,z],b:[18,outside.y+.025,z],ca:inside.color,cb:outside.color});
      }
      for(let i=0;i<rows.length-1;i++){
        const a=rows[i],b0=rows[i+1];quad([a.a,b0.a,b0.b,a.b],[a.ca,b0.ca,b0.cb,a.cb]);
        for(const side of['a','b']){const x=a[side],y=b0[side],ca=a[side==='a'?'ca':'cb'],cb=b0[side==='a'?'ca':'cb'];quad([x,y,[y[0],y[1]-1.2,y[2]],[x[0],x[1]-1.2,x[2]]],[ca,cb,cb,ca]);}
      }
      const geometry=finishGeometry(T,geometries,b);geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
      const material=legal.material.clone();material.side=T.DoubleSide;material.vertexColors=true;materials.add(material);
      const apron=new T.Mesh(geometry,material);apron.name='forest-edge-visual-apron';apron.receiveShadow=true;
      apron.userData={visualOnly:true,addsCollision:false,raycastTerrain:false,source:'actual legal and skirt triangles',bounds:{minX:13.98,maxX:18,minZ:-10,maxZ:35},sharedTexture:true};
      group.add(apron);meshes.add(apron);apronTriangles=geometry.index.count/3;
    }
    parent.add(group);
    const triangles = [...meshes].reduce((sum, mesh) => {
      const base = Math.floor(Number(mesh.geometry?.index?.count ?? mesh.geometry?.attributes?.position?.count ?? 0) / 3);
      return sum + base * (mesh.isInstancedMesh ? mesh.count : 1);
    }, 0);
    const stats = Object.freeze({
      meshes: meshes.size,
      triangles,
      paths: ROUTES.length,
      pathWidth: FOREST_PATH.width * 2,
      signs: ROUTES.length,
      signLabel: '下山回小城',
      textures: 0,
      addsCollision: false,
      clearedPlants,apronTriangles,
      resourceOwner: 'forest-edge-forest'
    });
    const disposed = { value: false };
    const dispose = disposeOwned(group, meshes, materials, geometries, disposed, stats);
    return { group, stats, dispose, height: (point = {}) => readHeight(point.x, point.z) };
  }

  return Object.freeze({ createCity, createForest, routes: ROUTES, cityBounds: CITY_BOUNDS });
});
