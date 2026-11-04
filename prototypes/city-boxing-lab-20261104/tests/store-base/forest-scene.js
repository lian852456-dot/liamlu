/*
 * Isolated A-forest presentation.  It owns its small render resources and
 * never writes collision/navigation state; the caller remains authoritative
 * for rules.obstacles and for the actual scene transition.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CozyForestScene = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    bounds: Object.freeze({ minX: -14, maxX: 14, minZ: -10, maxZ: 35 }),
    entry: Object.freeze({ x: -7, z: -7 }),
    exit: Object.freeze({ x: -7, z: -7 }),
    vista: Object.freeze({ x: 8, z: 30 }),
    obstacles: Object.freeze([
      Object.freeze({ x: 2, w: 4, z: -1, d: 14 }),
      Object.freeze({ x: 2, w: 4, z: 16, d: 14 }),
      Object.freeze({ x: 2, w: 4, z: 31, d: 8 })
    ]),
    water: Object.freeze([
      Object.freeze({ x: 2, w: 4, z: -1, d: 14 }),
      Object.freeze({ x: 2, w: 4, z: 14.5, d: 17 }),
      Object.freeze({ x: 2, w: 4, z: 29, d: 12 })
    ])
  });

  const TREE_POINTS = Object.freeze([
    [-12, -7, 1.0], [-10.3, -3.3, .9], [-12.1, 2.5, 1.1], [-10.8, 8.8, .95],
    [-12.2, 14.3, 1.0], [-10.8, 20.2, 1.08], [-12.0, 27.1, .96], [-10.3, 33, 1.05],
    [-9.4, -2, .9], [-9.6, 5, 1.02], [-9.3, 11.7, .92], [-9.7, 17.1, 1.08],
    [-9.2, 23.5, .94], [-9.7, 30, 1.02], [-8.6, 34, .9],
    [9.2, -7.2, 1.02], [11.5, -3.1, .92], [12.2, 1.4, 1.1], [10.3, 5.1, .9],
    [12.1, 9.8, 1.05], [10.8, 14.7, .94], [12.3, 19.7, 1.06], [10.7, 24.1, .92],
    [12, 29.1, 1.04], [11.4, 33.4, .94], [7.8, -2.5, .88], [8.7, 12.1, .9],
    [8.9, 18.2, 1.04], [9.4, 22.4, .9], [10.5, 34.1, 1.02]
  ]);

  // Visual-only perimeter trees.  They are deliberately separate from
  // TREE_POINTS: forest-rules.js derives legal obstacles from TREE_POINTS and
  // must not inherit any of these distant presentation silhouettes.
  const DECORATIVE_TREE_POINTS = Object.freeze([
    [-18, -20, .95], [-23, -14, 1.15], [-28, -5, .9], [-20, 2, 1.1],
    [-25, 11, 1], [-19, 18, 1.18], [-27, 27, .94], [-21, 34, 1.08],
    [-29, 43, .95], [-22, 52, 1.12], [-28, 61, .88], [-20, 69, 1],
    [18, -20, 1.02], [24, -14, .92], [28, -5, 1.14], [20, 3, .9],
    [26, 11, 1.06], [19, 19, .96], [28, 27, 1.12], [21, 35, .94],
    [29, 44, 1.1], [22, 53, .9], [28, 62, 1.04], [20, 71, .92],
    [-31, 43, .88], [-22, 46, .96], [-13, 48, .82], [13, 48, .86],
    [22, 46, 1], [31, 45, .9], [-30, 56, 1.06], [-18, 58, .9],
    [18, 58, .98], [30, 57, 1.1], [-28, 68, .9], [-16, 70, 1.08],
    [16, 69, .94], [28, 70, 1.04], [-30, 80, .98], [-20, 82, .88],
    [20, 81, .96], [30, 84, .9], [-25, 92, .82], [25, 94, .86]
  ]);

  function finite(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function mergeRules(input = {}) {
    const value = input && typeof input === 'object' ? input : {};
    return {
      heightVersion:value.heightVersion||'legacy-planar',
      bounds: { ...DEFAULTS.bounds, ...(value.bounds || {}) },
      entry: { ...DEFAULTS.entry, ...(value.entry || {}) },
      exit: { ...DEFAULTS.exit, ...(value.exit || {}) },
      vista: { ...DEFAULTS.vista, ...(value.vista || {}) },
      height: typeof value.height === 'function' ? value.height : position => Math.max(0, Math.min(3, (position.z + 7) * .075)),
      obstacles: Array.isArray(value.obstacles) && value.obstacles.length ? value.obstacles : DEFAULTS.obstacles,
      water: Array.isArray(value.water) && value.water.length ? value.water : DEFAULTS.water
    };
  }

  function create(options = {}) {
    const T = options.THREE || (typeof THREE !== 'undefined' ? THREE : null);
    const parent = options.parent;
    if (!T || !parent || !T.Group || !T.InstancedMesh) throw new TypeError('CozyForestScene.create requires THREE, InstancedMesh, and parent');
    const rules = mergeRules(options.rules);
    const geometries = new Set();
    const materials = new Set();
    const meshes = new Set();
    const group = new T.Group();
    group.name = 'cozy-forest-scene';
    group.userData.forestScene = true;
    group.userData.collisionAuthority = 'rules.obstacles';
    group.userData.noAdditionalObstacles = true;
    parent.add(group);

    const ownGeometry = geometry => { geometries.add(geometry); return geometry; };
    const ownMaterial = material => { materials.add(material); return material; };
    const addMesh = mesh => { meshes.add(mesh); group.add(mesh); return mesh; };
    const addTo = (container, mesh) => { meshes.add(mesh); container.add(mesh); return mesh; };
    const heightProbe={x:0,z:0};const terrainHeight=(x,z)=>{heightProbe.x=x;heightProbe.z=z;return finite(rules.height(heightProbe),0);};
    const waterSegments = rules.water;
    const WATER_BED_DEPTH=.92;
    const riverCenter=z=>2+.34*Math.sin(z*.18)+.16*Math.sin(z*.47+1);
    const riverHalfWidth=z=>1.03+.20*Math.sin(z*.26+.6);
    const riverSurfaceY=z=>terrainHeight(riverCenter(z),z)-.72+(z>=10?.16:0)+(z>=20?.16:0);
    const terrainY=(x,z)=>{
      const base=terrainHeight(x,z);
      // Carve only within the pre-existing non-walkable water strip.  Outside
      // x=0..4 every legal floor retains the exact shared rules.height value.
      if(x<0||x>4||z<-8||z>35)return base;
      const edge=Math.abs(x-riverCenter(z))-riverHalfWidth(z),blend=Math.max(0,Math.min(1,(edge+.06)/.48));
      return base-WATER_BED_DEPTH*(1-blend*blend*(3-2*blend));
    };
    const bounds = rules.bounds;
    const distantVisualHeight = (x, z) => {
      const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, x));
      const clampedZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, z));
      const base = terrainHeight(clampedX, clampedZ);
      const southOutside = Math.max(bounds.minZ - z, 0);
      const outside = Math.max(Math.abs(x) - bounds.maxX, Math.abs(x) + bounds.minX, 0);
      const sideWave = Math.sin(x * .13 + z * .045) * .24 + Math.cos(z * .17 - x * .06) * .16;
      const foothillRise = outside > 0 ? Math.min(9, 7*(1-Math.exp(-outside/7))*(.72+.28*Math.sin(z*.17+Math.sin(x*.10))**2)) : 0;
      return base - Math.min(6,Math.max(0,z-bounds.maxZ)*.22) - .04 + foothillRise - Math.min(3, southOutside * .38) + sideWave * Math.min(1, Math.max(outside, southOutside) / 4);
    };

    function terrainGeometry() {
      const columns = 56, rows = 90;
      const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
      const colors = new Float32Array((columns + 1) * (rows + 1) * 3);
      const indices = [];
      let offset = 0, colorOffset = 0;
      for (let row = 0; row <= rows; row++) {
        const z = bounds.minZ + (bounds.maxZ - bounds.minZ) * row / rows;
        for (let column = 0; column <= columns; column++) {
          const x = bounds.minX + (bounds.maxX - bounds.minX) * column / columns;
          positions[offset++] = x;
          positions[offset++] = terrainY(x, z);
          positions[offset++] = z;
          const tone=.92+.07*Math.sin(x*.82+z*.47)+.035*Math.cos(z*1.23-x*.56),bank=Math.exp(-(((x-riverCenter(z))/2.4)**2)),shade=Math.abs(x)>8?.80:1;
          colors[colorOffset++]=(.25+bank*.08)*tone*shade;
          colors[colorOffset++]=(.38-bank*.07)*tone*shade;
          colors[colorOffset++]=(.14-bank*.01)*tone*shade;
        }
      }
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const a = row * (columns + 1) + column, b = a + 1, c = a + columns + 1, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
      const geometry = ownGeometry(new T.BufferGeometry());
      geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    }

    const groundMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0xffffff, roughness: .94, vertexColors: true }));
    const ground = new T.Mesh(terrainGeometry(), groundMaterial);
    ground.name = 'forest-ground-terrain';
    ground.receiveShadow = true;
    ground.castShadow = false;
    ground.userData.raycastTerrain = true;
    addMesh(ground);

    // A non-walkable visual valley continues around all four sides of the
    // legal rectangle. It is a native low-poly terrain mesh rather than a
    // flat card, so the horizon has sloped foothills instead of a blue void.
    function distantTerrainGeometry() {
      const positions = [], indices = [];
      let offset = 0;
      const appendPatch = (minX, maxX, minZ, maxZ, columns, rows) => {
        const start = offset / 3;
        for (let row = 0; row <= rows; row++) {
          const z = minZ + (maxZ - minZ) * row / rows;
          for (let column = 0; column <= columns; column++) {
            const x = minX + (maxX - minX) * column / columns;
            positions[offset++] = x;
            positions[offset++] = distantVisualHeight(x, z);
            positions[offset++] = z;
          }
        }
        for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
          const a = start + row * (columns + 1) + column, b = a + 1, c = a + columns + 1, d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      };
      // Four strips share the exact legal bounds edges.  The playable center
      // is intentionally absent, preventing the visual shell from covering
      // legal ground, stream, or the root-owned south city terrace.
      appendPatch(bounds.minX - 48, bounds.minX+.12, bounds.minZ - 42, bounds.maxZ + 106, 8, 28);
      appendPatch(bounds.maxX-.12, bounds.maxX + 48, bounds.minZ - 42, bounds.maxZ + 106, 8, 28);
      appendPatch(bounds.minX, bounds.maxX, bounds.minZ - 42, bounds.minZ+.12, 18, 8);
      appendPatch(bounds.minX, bounds.maxX, bounds.maxZ-.12, bounds.maxZ + 106, 18, 20);
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(positions), 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    }
    const distantSkirtGeometry = ownGeometry(distantTerrainGeometry());
    const distantSkirtMaterial = ownMaterial(new T.MeshStandardMaterial({ color: new T.Color(.25,.38,.14), roughness: 1, fog: true }));
    const distantSkirt = new T.Mesh(distantSkirtGeometry, distantSkirtMaterial);
    distantSkirt.name = 'forest-distant-ground-skirt';
    distantSkirt.position.set(0, 0, 0);
    distantSkirt.receiveShadow = true;
    distantSkirt.castShadow = false;
    distantSkirt.userData.nonWalkable = true;
    distantSkirt.userData.raycastTerrain = false;
    distantSkirt.userData.terrainRole = 'distant-skirt';
    distantSkirt.raycast = () => {};
    addMesh(distantSkirt);

    const riverMaterial=ownMaterial(new T.MeshStandardMaterial({color:0x73aeb1,roughness:.36,metalness:0,transparent:true,opacity:.91,depthWrite:false,side:T.DoubleSide}));
    function waterRibbon(segment,index){
      const z=finite(segment.z,0),depth=finite(segment.d,8),zs=[];
      const min=z-depth/2,max=z+depth/2;
      for(let zz=min;zz<max;zz+=.65)zs.push(zz);zs.push(max);
      for(const step of[10,20])if(step>min&&step<max)zs.push(step-.002,step);
      zs.sort((a,b)=>a-b);const positions=[],indices=[];
      zs.forEach((zz,row)=>{const center=riverCenter(zz),half=riverHalfWidth(zz);for(const side of[-1,1])positions.push(center+side*half,riverSurfaceY(zz)+.008*Math.sin(zz*2.1),zz);if(row){const a=(row-1)*2,c=row*2;indices.push(a,c,a+1,a+1,c,c+1);}});
      const geometry=ownGeometry(new T.BufferGeometry());geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      const mesh=new T.Mesh(geometry,riverMaterial);mesh.name='forest-stream-water-'+index;mesh.renderOrder=1;mesh.castShadow=false;mesh.receiveShadow=false;return addMesh(mesh);
    }
    waterSegments.forEach(waterRibbon);

    const FOAM_COUNT = 14, foamGeometry = ownGeometry(new T.BoxGeometry(.42, .018, 1.15));
    const foamMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0xe5f4ec, emissive: 0xcbeee5, emissiveIntensity: .22, roughness: .58, transparent: true, opacity: .78, depthWrite: false }));
    const foamLines = new T.InstancedMesh(foamGeometry, foamMaterial, FOAM_COUNT);
    foamLines.name = 'forest-stream-foam-lines';
    foamLines.castShadow = false;
    foamLines.receiveShadow = false;
    addMesh(foamLines);
    const foamState = [];
    for (let index = 0; index < FOAM_COUNT; index++) foamState.push({ phase: index / FOAM_COUNT * 43, offset: -1 + (index % 4) * .66, angle: index % 2 ? .08 : -.06, width: .78 + (index % 3) * .1 });
    const foamMatrix = new T.Matrix4(), foamPosition = new T.Vector3(), foamScale = new T.Vector3(), foamQuaternion = new T.Quaternion(), foamEuler = new T.Euler();
    const identityQuaternion = new T.Quaternion();
    function updateFoam(now) {
      const elapsed = finite(now, 0) * .00055;
      for (let index = 0; index < FOAM_COUNT; index++) {
        const state=foamState[index],streamOffset=(state.phase+elapsed)%43,z=index<2?(index===0?9.96:19.96):35-streamOffset,x=riverCenter(z)+(index<2?0:state.offset*.72);
        foamPosition.set(x,riverSurfaceY(z)+.035,z);
        foamEuler.set(0, state.angle + Math.sin(elapsed * .7 + state.phase) * .08, 0);
        foamQuaternion.setFromEuler(foamEuler);
        foamScale.set(index<2?riverHalfWidth(z)*4.2:state.width,1,index<2?.30:.35+(index%3)*.10);
        foamMatrix.compose(foamPosition, foamQuaternion, foamScale);
        foamLines.setMatrixAt(index, foamMatrix);
      }
      foamLines.instanceMatrix.needsUpdate = true;
    }

    const streamStepPoints = waterSegments.slice(0, -1).map(segment => ({
      x: finite(segment.x, 2),
      z: finite(segment.z, 0) + Math.max(.5, finite(segment.d, 8) / 2)
    }));
    const stoneMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0xb7a887, roughness: .96 }));
    const pathGeometry=ownGeometry(new T.CylinderGeometry(.48,.55,.07,7));
    const pathPoints = [];
    for(let i=0;i<21;i++){if(i%3===1)continue;const z=-7+i*1.55+.28*Math.sin(i*2.3);pathPoints.push({x:-7+.4*Math.sin(z*.24),z});}
    for(let i=0;i<13;i++){if(i%3===2)continue;const t=i/12;pathPoints.push({x:5+3*t+.24*Math.sin(t*8),z:7.5+22.5*t});}
    const pathStones = new T.InstancedMesh(pathGeometry, stoneMaterial, pathPoints.length + streamStepPoints.length);
    pathStones.name = 'forest-stone-path';
    const pathMatrix = new T.Matrix4(), pathPosition = new T.Vector3(), pathQuaternion = new T.Quaternion(), pathScale = new T.Vector3(1, 1, 1), pathEuler = new T.Euler();
    pathPoints.forEach((point, index) => {
      pathPosition.set(point.x, terrainY(point.x, point.z) + .075, point.z);
      pathEuler.set(0,index*1.713,0);
      pathQuaternion.setFromEuler(pathEuler);
      pathScale.set(.72+(index%4)*.15,1,.68+(index%3)*.14);
      pathMatrix.compose(pathPosition, pathQuaternion, pathScale);
      pathStones.setMatrixAt(index, pathMatrix);
    });
    // Reuse the path batch for two low creek ledges; this adds no draw call or
    // owned material while remaining purely visual.
    streamStepPoints.forEach((step, index) => {
      pathPosition.set(step.x, terrainHeight(step.x, step.z) - WATER_BED_DEPTH + .11, step.z);
      pathScale.set(3.55, .9, .31);
      pathMatrix.compose(pathPosition, identityQuaternion, pathScale);
      pathStones.setMatrixAt(pathPoints.length + index, pathMatrix);
    });
    pathStones.instanceMatrix.needsUpdate = true;
    pathStones.receiveShadow = true;
    addMesh(pathStones);

    // A continuous earthen ribbon makes the two canonical walking lines read
    // as a trail; the existing stones remain as sparse stepping details.
    const dirtPaths = [
      [[-7, -8], [-7, 7.5], [-7, 25], [-7, 33]],
      [[5, 7.5], [5.5, 14], [6.5, 22], [8, 30]],
      [[-7, 7.5], [-6.5, 7.5]], [[5.72, 7.5], [5, 7.5]],
      [[-7, 25], [-6.5, 25]], [[5.72, 25], [7.35, 25.8]]
    ];
    const dirtPositions = [], dirtIndices = [];
    let dirtVertex = 0;
    const appendDirtRibbon = points => {
      for (let index = 1; index < points.length; index++) {
        const [x0, z0] = points[index - 1], [x1, z1] = points[index];
        const dx=x1-x0,dz=z1-z0,length=Math.max(.001,Math.hypot(dx,dz)),steps=Math.max(1,Math.ceil(length/.8));
        for(let step=0;step<steps;step++){
          const t0=step/steps,t1=(step+1)/steps,nx=-dz/length,nz=dx/length;
          const edge=(t,side)=>{const z=z0+dz*t,x=x0+dx*t,bend=length>4?.35*Math.sin(z*.30):0,half=.85+.12*Math.sin(z*.63+side*.6);return[x+nx*(bend+side*half),z+nz*(bend+side*half)];};
          for(const [x,z]of[edge(t0,1),edge(t0,-1),edge(t1,-1),edge(t1,1)])dirtPositions.push(x,terrainHeight(x,z)+.012,z);
          dirtIndices.push(dirtVertex,dirtVertex+2,dirtVertex+1,dirtVertex,dirtVertex+3,dirtVertex+2);dirtVertex+=4;
        }
      }
    };
    dirtPaths.forEach(appendDirtRibbon);
    // Bake the ribbon into the existing legal terrain mesh: this keeps one
    // draw call and keeps raycast x/z semantics unchanged while the ribbon is
    // exactly +.012 above the legal ground.
    const mergedTerrainGeometry = ground.geometry;
    const basePositions = mergedTerrainGeometry.attributes.position.array;
    const baseColors = mergedTerrainGeometry.attributes.color.array;
    const baseIndices = mergedTerrainGeometry.index.array;
    const terrainVertexCount = basePositions.length / 3;
    const mergedPositions = new Float32Array(basePositions.length + dirtPositions.length);
    mergedPositions.set(basePositions);
    mergedPositions.set(dirtPositions, basePositions.length);
    const mergedColors = new Float32Array(baseColors.length + dirtPositions.length);
    mergedColors.set(baseColors);
    for (let index = baseColors.length; index < mergedColors.length; index += 3) {
      mergedColors[index] = .36;
      mergedColors[index + 1] = .29;
      mergedColors[index + 2] = .16;
    }
    const mergedIndices = new Uint32Array(baseIndices.length + dirtIndices.length);
    mergedIndices.set(baseIndices);
    dirtIndices.forEach((index, offset) => { mergedIndices[baseIndices.length + offset] = terrainVertexCount + index; });
    mergedTerrainGeometry.setAttribute('position', new T.Float32BufferAttribute(mergedPositions, 3));
    mergedTerrainGeometry.setAttribute('color', new T.Float32BufferAttribute(mergedColors, 3));
    mergedTerrainGeometry.setIndex(Array.from(mergedIndices));
    mergedTerrainGeometry.deleteAttribute('normal');
    mergedTerrainGeometry.computeVertexNormals();
    ground.userData.dirtRibbon = { width: 2, elevation: .012, visualOnly: true };

    const bridgeWood = ownMaterial(new T.MeshStandardMaterial({ color: 0x936746, roughness: .9 }));
    const plankGeometry = ownGeometry(new T.BoxGeometry(.9, .16, 1.55));
    const bridgePlankCount = 24;
    const bridgePlanks = new T.InstancedMesh(plankGeometry, bridgeWood, bridgePlankCount);
    bridgePlanks.name = 'forest-bridge-decks';
    const plankMatrix = new T.Matrix4(), plankPosition = new T.Vector3(), plankQuaternion = new T.Quaternion(), plankScale = new T.Vector3(1, 1, 1);
    for (let bridge = 0; bridge < 2; bridge++) for (let index = 0; index < 12; index++) {
      const z = bridge ? 25 : 7.5, x = -6.5 + index * 1.02;
      plankPosition.set(x, terrainHeight(x, z) + .17, z);
      plankMatrix.compose(plankPosition, plankQuaternion, plankScale);
      bridgePlanks.setMatrixAt(bridge * 12 + index, plankMatrix);
    }
    bridgePlanks.instanceMatrix.needsUpdate = true;
    bridgePlanks.castShadow = true;
    bridgePlanks.receiveShadow = true;
    addMesh(bridgePlanks);

    const postGeometry = ownGeometry(new T.CylinderGeometry(.09, .13, 1.2, 6));
    const railGeometry = ownGeometry(new T.BoxGeometry(2.05, .1, .1));
    const postCount = 2 * 2 * 6;
    const bridgePosts = new T.InstancedMesh(postGeometry, bridgeWood, postCount);
    // Two low-profile rails per span read as a hand-built timber bridge while
    // remaining one instanced resource (and preserving the crossing width).
    const bridgeRails = new T.InstancedMesh(railGeometry, bridgeWood, 2 * 2 * 5 * 2);
    bridgePosts.name = 'forest-bridge-posts';
    bridgeRails.name = 'forest-bridge-rails';
    const railMatrix = new T.Matrix4(), railPosition = new T.Vector3(), railScale = new T.Vector3(1, 1, 1);
    let postIndex = 0, railIndex = 0;
    for (let bridge = 0; bridge < 2; bridge++) {
      const z = bridge ? 25 : 7.5;
      for (const side of [-.72, .72]) {
        for (let index = 0; index < 6; index++) {
          const x = -6.1 + index * 2.1;
          railPosition.set(x, terrainHeight(x, z) + .78, z + side);
          railMatrix.compose(railPosition, plankQuaternion, railScale);
          bridgePosts.setMatrixAt(postIndex++, railMatrix);
        }
        for (let index = 0; index < 5; index++) {
          const x = -5.1 + index * 2.05;
          for (const railY of [.88, 1.05]) {
            railPosition.set(x, terrainHeight(x, z) + railY, z + side);
            railMatrix.compose(railPosition, plankQuaternion, railScale);
            bridgeRails.setMatrixAt(railIndex++, railMatrix);
          }
        }
      }
    }
    bridgePosts.instanceMatrix.needsUpdate = true;
    bridgeRails.instanceMatrix.needsUpdate = true;
    bridgePosts.castShadow = bridgeRails.castShadow = true;
    addMesh(bridgePosts);
    addMesh(bridgeRails);

    const trunkGeometry = ownGeometry(new T.CylinderGeometry(.13, .22, 2.4, 8));
    const trunkMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0x836147, roughness: .94 }));
    const leafGeometry = ownGeometry(new T.SphereGeometry(1,10,6));
    const leafMaterial = ownMaterial(new T.MeshStandardMaterial({ color:0xffffff,roughness:.95 }));
    const treeChunks = [
      { name: 'forest-tree-chunk-front', center: { x: -2, z: 5 }, trees: [] },
      { name: 'forest-tree-chunk-back', center: { x: 1, z: 26 }, trees: [] }
    ];
    TREE_POINTS.forEach(([x, z, scale]) => treeChunks[z <= 14 ? 0 : 1].trees.push({ x, z, scale }));
    DECORATIVE_TREE_POINTS.forEach(([x, z, scale]) => treeChunks[z <= 14 ? 0 : 1].trees.push({ x, z, scale, decorative: true }));
    const visualTreeCount = treeChunks.reduce((total, chunk) => total + chunk.trees.length, 0);
    const treeMeshes = [];
    const leafColor = new T.Color();
    for (const chunk of treeChunks) {
      const chunkGroup = new T.Group();
      chunkGroup.name = chunk.name;
      chunkGroup.userData.chunkCenter = chunk.center;
      group.add(chunkGroup);
      const trunks = new T.InstancedMesh(trunkGeometry, trunkMaterial, chunk.trees.length);
      const leaves = new T.InstancedMesh(leafGeometry, leafMaterial, chunk.trees.length * 4);
      trunks.name = `${chunk.name}-trunks`;
      leaves.name = `${chunk.name}-leaves`;
      const trunkMatrix = new T.Matrix4(), leafMatrix = new T.Matrix4(), treePosition = new T.Vector3(), treeQuaternion = new T.Quaternion(), treeScale = new T.Vector3();
      let leafIndex = 0;
      chunk.trees.forEach((tree, index) => {
        const height = tree.decorative ? distantVisualHeight(tree.x, tree.z) : terrainHeight(tree.x, tree.z), phase = (index + 1) * 1.73;
        const trunkHeightScale = 1.7;
        treePosition.set(tree.x, height + 1.2 * trunkHeightScale * tree.scale, tree.z);
        // Keep x/z trunk footprint unchanged; only presentation height grows.
        treeScale.set(tree.scale, trunkHeightScale * tree.scale, tree.scale);
        trunkMatrix.compose(treePosition, treeQuaternion, treeScale);
        trunks.setMatrixAt(index, trunkMatrix);
        const shades=[0x7b9847,0x8ca24f,0xa5b462,0x718e45,0xb2bc6c];
        for (let crown = 0; crown < 4; crown++) {
          const angle = phase + crown * 2.1;
          const lowCrown = crown === 3;
          const radius = (lowCrown ? .68 : .45 + crown * .24) * tree.scale;
          const crownHeight=lowCrown?3.65:4.45+(crown===1?.68:crown===2?.17:0);
          treePosition.set(tree.x + Math.cos(angle) * radius, height + crownHeight * tree.scale, tree.z + Math.sin(angle) * radius * .72);
          treeScale.set((lowCrown ? 1.02 : (1.05 - crown * .08) * 1.6) * tree.scale, (lowCrown?.88:1.08+crown*.14) * tree.scale, (lowCrown ? .84 : (.86 + crown * .08) * 1.6) * tree.scale);
          treeQuaternion.setFromEuler(new T.Euler(.04 * Math.sin(angle), angle, .03 * Math.cos(angle)));
          leafMatrix.compose(treePosition, treeQuaternion, treeScale);
          leaves.setMatrixAt(leafIndex, leafMatrix);
          if (leaves.setColorAt) { leafColor.setHex(shades[(index + crown) % shades.length]); leaves.setColorAt(leafIndex, leafColor); }
          leafIndex += 1;
        }
      });
      trunks.instanceMatrix.needsUpdate = true;
      leaves.instanceMatrix.needsUpdate = true;
      if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
      trunks.castShadow = leaves.castShadow = true;
      trunks.receiveShadow = leaves.receiveShadow = true;
      chunkGroup.add(trunks, leaves);
      meshes.add(trunks); meshes.add(leaves);
      treeMeshes.push({ group: chunkGroup, trunk: trunks, leaves });
    }

    const rockGeometry = ownGeometry(new T.SphereGeometry(.42, 8, 5));
    const rockMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
    const rocks = [];
    for (let segment = 0; segment < waterSegments.length; segment++) {
      const z0 = finite(waterSegments[segment].z, 0), d = Math.max(.5, finite(waterSegments[segment].d, 8));
      for (let i = 0; i < 5; i++) rocks.push({ x: 1.2 + (i % 2) * 1.55, z: z0 - d / 2 + (i + .5) * d / 5, s: .7 + (i % 3) * .12 });
      // A few larger stones sit just outside each bank.  They are decoration
      // only; collision remains entirely owned by forest-rules.js.
      const bankCount = Math.max(5, Math.ceil(d / 1.25));
      for (const bank of [-1, 1]) for (let i = 0; i < bankCount; i++) {
        rocks.push({
          x:riverCenter(z0-d/2+(i+.5)*d/bankCount)+bank*(riverHalfWidth(z0-d/2+(i+.5)*d/bankCount)+.02+.12*Math.sin(i*2.4)),
          z: z0 - d / 2 + (i + .5) * d / bankCount,
          s:.64+(i%5)*.19,
          bank: true
        });
      }
    }
    const riverRocks = new T.InstancedMesh(rockGeometry, rockMaterial, rocks.length);
    riverRocks.name = 'forest-stream-rocks';
    const rockMatrix = new T.Matrix4(), rockPosition = new T.Vector3(), rockScale = new T.Vector3();
    const rockColor = new T.Color();
    rocks.forEach((rock, index) => {
      rockPosition.set(rock.x, terrainY(rock.x, rock.z) + (rock.bank ? .3 : .25), rock.z);
      rockScale.set(rock.s*(.85+.25*Math.sin(index*1.9)),rock.bank?.70:.65,rock.s*(.7+.3*Math.cos(index*2.1)));
      identityQuaternion.setFromAxisAngle(new T.Vector3(0,1,0),index*1.7);
      rockMatrix.compose(rockPosition, identityQuaternion, rockScale);
      riverRocks.setMatrixAt(index, rockMatrix);
      if (riverRocks.setColorAt) {
        rockColor.setHex(rock.bank ? [0x667c68, 0x789075, 0x8c9670][index % 3] : 0x807c6a);
        riverRocks.setColorAt(index, rockColor);
      }
    });
    identityQuaternion.identity();
    riverRocks.instanceMatrix.needsUpdate = true;
    if (riverRocks.instanceColor) riverRocks.instanceColor.needsUpdate = true;
    riverRocks.receiveShadow = true;
    addMesh(riverRocks);

    // One bounded instanced mesh supplies real low-poly fern clusters.  The
    // points follow stream banks and outer forest shelves, never the canonical
    // walk stones, bridge decks, or the central vista sightline.
    const fernPositions = [], fernIndices = [];
    for (let blade = 0; blade < 4; blade++) {
      const angle = blade * Math.PI / 2, dx = Math.cos(angle), dz = Math.sin(angle), px = -dz * .16, pz = dx * .16;
      const base = blade * 4;
      fernPositions.push(0, 0, 0, px, .24, pz, -px, .24, -pz, dx * .28, .72, dz * .28);
      fernIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    const fernGeometry = ownGeometry(new T.BufferGeometry());
    fernGeometry.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(fernPositions), 3));
    fernGeometry.setIndex(fernIndices);
    fernGeometry.computeVertexNormals();
    const groundcoverMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0x5d8749, roughness: .96, side: T.DoubleSide }));
    const groundcoverPoints = [];
    for (let z = -8; z <= 34; z += 1.5) {
      groundcoverPoints.push({ x: -.72 + .12 * Math.sin(z * .72), z });
      if (z <= 4) groundcoverPoints.push({ x: 4.72 + .12 * Math.cos(z * .68), z: z + .18 });
    }
    for (const side of [-1, 1]) for (let z = -9; z <= 35; z += 2.05) {
      groundcoverPoints.push({ x: side * (10.4 + (Math.floor((z + 9) / 2.05) % 3) * .72), z: z + .25 * side });
    }
    for (let z = 39; z <= 62; z += 2.15) {
      groundcoverPoints.push({ x: -18 + ((z / 2.15) % 4) * 2.5, z });
      groundcoverPoints.push({ x: 18 - ((z / 2.15) % 4) * 2.2, z: z + .45 });
    }
    const groundcover = new T.InstancedMesh(fernGeometry, groundcoverMaterial, groundcoverPoints.length);
    groundcover.name = 'forest-understory-fern-clusters';
    const groundcoverMatrix = new T.Matrix4(), groundcoverPosition = new T.Vector3(), groundcoverScale = new T.Vector3();
    const groundcoverColor = new T.Color();
    groundcoverPoints.forEach((point, index) => {
      const outside = point.x < bounds.minX || point.x > bounds.maxX || point.z < bounds.minZ || point.z > bounds.maxZ;
      groundcoverPosition.set(point.x, (outside ? distantVisualHeight(point.x, point.z) : terrainHeight(point.x, point.z)) + .03, point.z);
      groundcoverScale.set(.72 + (index % 3) * .12, .72 + (index % 4) * .11, .58 + (index % 2) * .12);
      groundcoverMatrix.compose(groundcoverPosition, identityQuaternion, groundcoverScale);
      groundcover.setMatrixAt(index, groundcoverMatrix);
      if (groundcover.setColorAt) {
        groundcoverColor.setHex([0x4d783f, 0x6f9449, 0x88a957][index % 3]);
        groundcover.setColorAt(index, groundcoverColor);
      }
    });
    groundcover.instanceMatrix.needsUpdate = true;
    if (groundcover.instanceColor) groundcover.instanceColor.needsUpdate = true;
    groundcover.receiveShadow = true;
    addMesh(groundcover);

    // Dense, low, passable understory occupies the banks and outer grove,
    // with a clear corridor along both walking trails and bridge approaches.
    const shrubPoints=[];
    for(let z=-8;z<35;z+=1.35)for(const x of[-12.6,-10.3,-8.9,-2.3,-1.2,4.8,9.6,11.4,13.1]){
      const xx=x+.23*Math.sin(z*2.3+x),zz=z+.22*Math.cos(x*1.7+z);
      if(Math.abs(xx+7)<1.7||Math.hypot(xx-8,zz-30)<2.6||Math.hypot(xx+7,zz+7)<2.5)continue;
      if(zz>=6&&Math.abs(xx-(5+3*Math.min(1,Math.max(0,(zz-7.5)/22.5))))<1.7)continue;
      if((Math.abs(zz-7.5)<1.8||Math.abs(zz-25)<1.8)&&xx>-8&&xx<8)continue;
      shrubPoints.push([xx,zz]);
    }
    const shrubGeometry=ownGeometry(new T.SphereGeometry(1,7,4)),shrubMaterial=ownMaterial(new T.MeshStandardMaterial({color:0xffffff,roughness:1}));
    const shrubs=new T.InstancedMesh(shrubGeometry,shrubMaterial,shrubPoints.length);shrubs.name='forest-bank-understory';
    const shrubMatrix=new T.Matrix4(),shrubPosition=new T.Vector3(),shrubScale=new T.Vector3(),shrubColor=new T.Color();
    shrubPoints.forEach(([x,z],i)=>{const scale=.52+(i%4)*.12;shrubPosition.set(x,terrainHeight(x,z)+.25,z);shrubScale.set(scale,.26+(i%3)*.07,scale*.8);shrubMatrix.compose(shrubPosition,identityQuaternion,shrubScale);shrubs.setMatrixAt(i,shrubMatrix);shrubColor.setHex([0x5c7e3d,0x769344,0x90a454,0x526e35][i%4]);shrubs.setColorAt(i,shrubColor);});
    shrubs.instanceMatrix.needsUpdate=true;shrubs.instanceColor.needsUpdate=true;shrubs.receiveShadow=true;addMesh(shrubs);
    const flowerPoints=shrubPoints.filter((_,i)=>i%3===0),flowerGeometry=ownGeometry(new T.SphereGeometry(.105,5,3)),flowerMaterial=ownMaterial(new T.MeshStandardMaterial({color:0xffffff,roughness:.9}));
    const flowers=new T.InstancedMesh(flowerGeometry,flowerMaterial,flowerPoints.length*3);flowers.name='forest-wildflowers';
    flowerPoints.forEach(([x,z],i)=>{for(let j=0;j<3;j++){shrubPosition.set(x+.24*Math.cos(j*2.1),terrainHeight(x,z)+.56,z+.24*Math.sin(j*2.1));shrubScale.set(1,.65,1);shrubMatrix.compose(shrubPosition,identityQuaternion,shrubScale);flowers.setMatrixAt(i*3+j,shrubMatrix);shrubColor.setHex([0xe8d6ad,0xd9ac8a,0xf1ead3,0xc3ce97][i%4]);flowers.setColorAt(i*3+j,shrubColor);}});
    flowers.instanceMatrix.needsUpdate=true;flowers.instanceColor.needsUpdate=true;addMesh(flowers);

    // A connected terrain ridge exposes only a top surface; unlike a scaled
    // sphere it cannot show a floating underside above the distant town.
    const ridgePositions=[],ridgeIndices=[],ridgeCols=40,ridgeRows=12;
    for(let row=0;row<=ridgeRows;row++)for(let col=0;col<=ridgeCols;col++){const x=-75+150*col/ridgeCols,t=row/ridgeRows,z=90+60*t,y=-3+Math.sin(Math.PI*t)**1.3*(4+3*Math.sin(x*.06+1)**2+2*Math.cos(x*.12)**2);ridgePositions.push(x,y,z);}
    for(let row=0;row<ridgeRows;row++)for(let col=0;col<ridgeCols;col++){const a=row*(ridgeCols+1)+col,b=a+1,c=a+ridgeCols+1,d=c+1;ridgeIndices.push(a,c,b,b,c,d);}
    const mountainGeometry=ownGeometry(new T.BufferGeometry());mountainGeometry.setAttribute('position',new T.Float32BufferAttribute(ridgePositions,3));mountainGeometry.setIndex(ridgeIndices);mountainGeometry.computeVertexNormals();
    const mountainMaterial=ownMaterial(new T.MeshStandardMaterial({color:0x8fa9a6,roughness:1,fog:true}));
    const mountains=new T.Mesh(mountainGeometry,mountainMaterial);mountains.name='forest-distant-mountains';mountains.castShadow=false;addMesh(mountains);

    const towerBodyGeometry = ownGeometry(new T.BoxGeometry(1, 1, 1));
    const towerSpireGeometry = ownGeometry(new T.ConeGeometry(.24, 1.25, 5));
    const towerMaterial = ownMaterial(new T.MeshStandardMaterial({ color: 0x78959d, roughness: .82 }));
    const tower = new T.Group();
    tower.name = 'forest-distant-101-silhouette';
    tower.position.set(22,distantVisualHeight(22,65),65);tower.scale.set(1.4,2.2,1.4);
    const towerBody = new T.InstancedMesh(towerBodyGeometry, towerMaterial, 8);
    towerBody.name = 'forest-distant-101-stepped-body';
    const towerMatrix = new T.Matrix4(), towerPosition = new T.Vector3(), towerScale = new T.Vector3();
    let towerBase = .12;
    for (let index = 0; index < 8; index++) {
      const height = .48, width = 1.42 - index * .105;
      towerPosition.set(0, towerBase + height / 2, 0);
      towerScale.set(width, height, width);
      towerMatrix.compose(towerPosition, identityQuaternion, towerScale);
      towerBody.setMatrixAt(index, towerMatrix);
      towerBase += height + .08;
    }
    towerBody.instanceMatrix.needsUpdate = true;
    towerBody.castShadow = true;
    tower.add(towerBody); meshes.add(towerBody);
    const towerSpire = new T.Mesh(towerSpireGeometry, towerMaterial); towerSpire.position.y = towerBase + .62; tower.add(towerSpire); meshes.add(towerSpire);
    group.add(tower);

    const contextApi=typeof CozyForestCityContext!=='undefined'?CozyForestCityContext:typeof require==='function'?require('./forest-city-context.js'):null;
    if(!contextApi)throw new Error('FOREST_CITY_CONTEXT_REQUIRED');
    const cityContext=contextApi.create({THREE:T,parent:group,height:distantVisualHeight,ownGeometry,ownMaterial,addMesh});

    const maxTreeDistance = 30 * 30;
    let disposed = false;
    const counted = { meshes: 0, triangles: 0 };
    group.traverse(node => {
      if (!node.isMesh) return;
      counted.meshes += 1;
      const indexCount = node.geometry?.index?.count, positionCount = node.geometry?.attributes?.position?.count;
      counted.triangles += Math.floor(Number(indexCount ?? positionCount ?? 0) / 3) * (node.isInstancedMesh ? node.count : 1);
    });
    const stats = Object.freeze({
      heightVersion:rules.heightVersion,
      meshes: counted.meshes,
      triangles: counted.triangles,
      trees: TREE_POINTS.length,
      chunks: 2,
      bridges: 2,
      understoryShrubs:shrubPoints.length,
      wildflowers:flowerPoints.length*3,
      waterSegments: waterSegments.length,
      pathStones: pathPoints.length + streamStepPoints.length,
      counters: Object.freeze({ treeTrunks: visualTreeCount, treeLeaves: visualTreeCount * 4, decorativeTrees: DECORATIVE_TREE_POINTS.length, bridgePlanks: bridgePlankCount, bridgePosts: postCount, bridgeRails: 2 * 2 * 5 * 2, riverRocks: rocks.length, foamLines: FOAM_COUNT, groundcover: groundcoverPoints.length, streamSteps: streamStepPoints.length, towerSegments: 8, remoteBuildings: cityContext.stats.buildings }),
      foamLines: FOAM_COUNT,
      distantSkirt: true,
      towerSegments: 8,
      remoteBuildings: cityContext.stats.buildings,
      remoteMountainZ: 120,
      bounds: Object.freeze({ ...bounds }),
      entry: Object.freeze({ ...rules.entry }),
      vista: Object.freeze({ ...rules.vista }),
      collisionSource: 'rules.obstacles',
      addsCollision: false,
      terrainRaycastable: true,
      resourceOwner: 'forest-scene'
    });

    function update(now = 0, position = null) {
      if (disposed) return false;
      updateFoam(now);
      const px = finite(position?.x, NaN), pz = finite(position?.z, NaN);
      for (const item of treeMeshes) {
        const center = item.group.userData.chunkCenter;
        const visible = !Number.isFinite(px) || !Number.isFinite(pz) || ((px - center.x) ** 2 + (pz - center.z) ** 2 <= maxTreeDistance);
        item.group.visible = visible;
      }
      riverMaterial.opacity=.90+.015*Math.sin(finite(now,0)*.0016);
      return true;
    }

    function dispose() {
      if (disposed) return { disposed: true, ...stats };
      disposed = true;
      group.removeFromParent?.();
      while (group.children.length) group.remove(group.children[0]);
      for (const mesh of meshes) mesh.dispose?.();
      for (const material of materials) material.dispose?.();
      for (const geometry of geometries) geometry.dispose?.();
      return { disposed: true, ...stats };
    }

    update(0, null);
    return { group, ground, update, dispose, stats };
  }

  return Object.freeze({ create, defaults: DEFAULTS, treePoints:TREE_POINTS });
});
