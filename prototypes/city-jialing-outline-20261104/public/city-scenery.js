/*
 * Original Taipei toy-city scenery.
 *
 * This module deliberately owns presentation only.  The supplied layout is
 * the authority for every road and building position; no collision shapes or
 * map tiles are invented here.  Repeated window panes and road marks are
 * batched with InstancedMesh to keep the scene friendly to small phones.
 */
(function (root, factory) {
  const api = factory(root);
  if (root) root.CozyCityScenery = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis === 'object' ? globalThis : this, function (root) {
  'use strict';

  const DISTRICT_NAMES = ['大同', '萬華', '中正', '大安', '信義'];
  const DISTRICT_STYLE = {
    大同: { base: 0xd9a887, trim: 0x8d5449, accent: 0xb96656, window: 0x4e7a78, roof: 0x6f7770, low: true, brick: true },
    萬華: { base: 0xd8b08b, trim: 0x8b514a, accent: 0xc4775e, window: 0x547f7a, roof: 0x70786d, low: true, brick: true },
    中正: { base: 0xd9e1d4, trim: 0x5d8e8b, accent: 0x6caaa7, window: 0x4d7e88, roof: 0x607e7e, tech: true },
    大安: { base: 0xd8e0c9, trim: 0x718f7e, accent: 0x90b8a6, window: 0x5c8d86, roof: 0x718477, garden: true },
    信義: { base: 0xcbd9d5, trim: 0x527681, accent: 0x6e9ba2, window: 0x4e7f8e, roof: 0x607b80, glass: true }
  };
  const DEFAULT_STYLE = { base: 0xe1d1b6, trim: 0x7c8a7d, accent: 0x9eae93, window: 0x5a7f7f, roof: 0x6d7d75 };
  // The concept's skyline is a warm, leafy mix rather than one continuous
  // grey-green band.  Keep this palette restrained so it still reads as a
  // Taipei toy city under the daylight tint while giving the distant rows
  // enough grouping and depth on a small screen.
  const DISTANT_FACADE_COLORS = [
    0xe4c7a6, 0xd5b49f, 0xc8d2c6, 0xb5c9bd,
    0xe0b895, 0xc9c6b4, 0xd9c9b8, 0xaec4c1,
    0xd3a98f, 0xc0d0c4, 0xe0d3bc, 0xb9b8aa
  ];
  const DISTANT_ROOF_COLORS = [0xb77d67, 0x8a9b86, 0xc09a73, 0x9eae9b, 0xa87e70, 0x718f87];
  const ROAD_COLORS = {
    road: 0x858d8c,
    roadDark: 0x747e7b,
    sidewalk: 0xd6d0bd,
    curb: 0xc1bcae,
    edge: 0xc96f68,
    marking: 0xf0c74c,
    lane: 0xf3eee0,
    crosswalk: 0xf7eed8,
    sign: 0x547e7c,
    lamp: 0x536d6c
  };

  function number(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function point(value) {
    if (!value) return null;
    const x = Number(value.x), z = Number(value.z);
    return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
  }

  function color(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const raw = value.replace(/^#/, '');
      const parsed = Number.parseInt(raw, 16);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  function districtName(value) {
    const text = String(value || '');
    return DISTRICT_NAMES.find(name => text.indexOf(name) >= 0) || '';
  }

  function styleFor(building, index) {
    const district = districtName(building && (building.district || building.area || building.zone));
    const style = DISTRICT_STYLE[district] || DEFAULT_STYLE;
    return { ...style, district, index };
  }

  function makeMaterial(T, M, value, roughness) {
    if(value===ROAD_COLORS.sidewalk&&root.CozyArchitecture?.paving)return root.CozyArchitecture.paving(value);
    if (M && typeof M.material === 'function') return M.material(value, roughness);
    return new T.MeshStandardMaterial({ color: value, roughness: roughness == null ? .8 : roughness });
  }

  function makeBox(T, M, parent, w, h, d, c, x, y, z, radius) {
    if((c===ROAD_COLORS.road||c===ROAD_COLORS.roadDark)&&root.CozyArchitecture?.road)c=root.CozyArchitecture.road(c);
    if (M && typeof M.box === 'function') return M.box(parent, w, h, d, c, x, y, z, radius == null ? .04 : radius);
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), makeMaterial(T, M, c));
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function makeCylinder(T, M, parent, r1, r2, h, c, x, y, z, segments) {
    if (M && typeof M.cyl === 'function') return M.cyl(parent, r1, r2, h, c, x, y, z, segments || 12);
    const mesh = new T.Mesh(new T.CylinderGeometry(r1, r2, h, segments || 12), makeMaterial(T, M, c));
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function makeSphere(T, M, parent, radius, c, x, y, z, sx, sy, sz) {
    if (M && typeof M.sphere === 'function') return M.sphere(parent, radius, c, x, y, z, sx, sy, sz);
    const mesh = new T.Mesh(new T.SphereGeometry(radius, 12, 8), makeMaterial(T, M, c));
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.scale.set(sx || 1, sy || 1, sz || 1);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function addLampGlow(T, M, parent, radius, c, x, y, z) {
    if (!T || !T.Mesh || !T.SphereGeometry) return makeSphere(T, M, parent, radius, c, x, y, z, 1, 1, 1);
    const material = makeMaterial(T, M, c, .24);
    if (material && material.emissive && typeof material.emissive.setHex === 'function') material.emissive.setHex(c);
    if (material) material.emissiveIntensity = 1.35;
    const mesh = new T.Mesh(new T.SphereGeometry(radius, 10, 8), material);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }

  function addRoadArrow(T, M, parent, x, z, angle, scale) {
    if (!T || !T.Mesh || !T.Shape || !T.ShapeGeometry) return makeBox(T, M, parent, .72 * scale, .018, .16 * scale, 0xf1eadc, x, .112, z, .01);
    const shape = new T.Shape();
    shape.moveTo(-.18, -.5);
    shape.lineTo(.18, -.5);
    shape.lineTo(.18, -.04);
    shape.lineTo(.42, -.04);
    shape.lineTo(0, .52);
    shape.lineTo(-.42, -.04);
    shape.lineTo(-.18, -.04);
    shape.closePath();
    const mesh = new T.Mesh(new T.ShapeGeometry(shape), makeMaterial(T, M, 0xf1eadc, .55));
    mesh.position.set(x, .112, z);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.y = angle;
    mesh.scale.setScalar(scale);
    mesh.name = 'cozy-road-direction-arrow';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }

  function makeGroup(T, M, parent, x, y, z) {
    if (M && typeof M.group === 'function') return M.group(parent, x || 0, y || 0, z || 0);
    const group = new T.Group();
    group.position.set(x || 0, y || 0, z || 0);
    parent.add(group);
    return group;
  }

  function addText(M, parent, text, x, y, z, width, textColor, background) {
    if (!M || typeof M.text !== 'function' || typeof document === 'undefined') return null;
    return M.text(parent, String(text), x, y, z, width, textColor, background);
  }

  function segmentInfo(road) {
    const a = point(road && road.a), b = point(road && road.b);
    if (!a || !b) return null;
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (length < .2) return null;
    return {
      a, b, dx, dz, length,
      mid: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
      angle: Math.atan2(-dz, dx),
      width: Math.max(1.4, number(road.width, road.kind === 'alley' ? 2.8 : 4.2)),
      kind: String(road.kind || 'street').toLowerCase(),
      name: String(road.name || '')
    };
  }

  function nearestRoad(position, segments) {
    let result = null, best = Infinity;
    for (const segment of segments) {
      const t = Math.max(0, Math.min(1, ((position.x - segment.a.x) * segment.dx + (position.z - segment.a.z) * segment.dz) / (segment.length * segment.length)));
      const nearest = { x: segment.a.x + segment.dx * t, z: segment.a.z + segment.dz * t };
      const distance = Math.hypot(position.x - nearest.x, position.z - nearest.z);
      if (distance < best) {
        const side = (position.x - nearest.x) * Math.sin(segment.angle) + (position.z - nearest.z) * Math.cos(segment.angle);
        result = { segment, nearest, distance, side: side < 0 ? -1 : 1 };
        best = distance;
      }
    }
    return result;
  }

  function nodeKey(p) {
    return `${Math.round(p.x * 100) / 100}:${Math.round(p.z * 100) / 100}`;
  }

  function undirectedAngle(angle) {
    const normalized = angle % Math.PI;
    return normalized < 0 ? normalized + Math.PI : normalized;
  }

  function addInstancedBoxes(T, M, parent, entries, geometrySize, materialByKey, role) {
    if (!entries.length || !T || !T.InstancedMesh || !T.BoxGeometry) return 0;
    const grouped = new Map();
    entries.forEach(entry => {
      const key = entry.materialKey || 'default';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(entry);
    });
    const matrix = new T.Matrix4();
    const quaternion = new T.Quaternion();
    const euler = new T.Euler();
    let count = 0;
    for (const [key, items] of grouped) {
      const materialValue = materialByKey[key] || materialByKey.default;
      const mesh = new T.InstancedMesh(
        new T.BoxGeometry(geometrySize.x, geometrySize.y, geometrySize.z),
        makeMaterial(T, M, materialValue, .38),
        items.length
      );
      mesh.name = role || 'cozy-instanced-detail';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      items.forEach((item, index) => {
        euler.set(0, number(item.rotation, 0), 0);
        quaternion.setFromEuler(euler);
        matrix.compose(
          new T.Vector3(item.x, item.y, item.z),
          quaternion,
          new T.Vector3(item.sx || 1, item.sy || 1, item.sz || 1)
        );
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      parent.add(mesh);
      count += items.length;
    }
    return count;
  }

  function layoutBounds(layout, segments) {
    const values = [];
    segments.forEach(segment => values.push(segment.a, segment.b));
    (Array.isArray(layout.buildings) ? layout.buildings : []).forEach(item => {
      const p = point(item);
      if (!p) return;
      const halfW = Math.max(0, number(item.w, 0) / 2), halfD = Math.max(0, number(item.d, 0) / 2);
      values.push({ x: p.x - halfW, z: p.z - halfD }, { x: p.x + halfW, z: p.z + halfD });
    });
    (Array.isArray(layout.parks) ? layout.parks : []).forEach(item => {
      const p = point(item);
      if (!p) return;
      const halfW = Math.max(0, number(item.w, 0) / 2), halfD = Math.max(0, number(item.d, 0) / 2);
      values.push({ x: p.x - halfW, z: p.z - halfD }, { x: p.x + halfW, z: p.z + halfD });
    });
    if (!values.length) return { minX: -45, maxX: 45, minZ: -47, maxZ: 47 };
    const minX = Math.min(...values.map(p => p.x)), maxX = Math.max(...values.map(p => p.x));
    const minZ = Math.min(...values.map(p => p.z)), maxZ = Math.max(...values.map(p => p.z));
    return { minX: minX - 4, maxX: maxX + 4, minZ: minZ - 4, maxZ: maxZ + 4 };
  }

  function addCityBase(T, M, rootGroup, layout, segments, stats) {
    const bounds = layoutBounds(layout, segments);
    const width = Math.max(20, bounds.maxX - bounds.minX);
    const depth = Math.max(20, bounds.maxZ - bounds.minZ);
    const base = makeBox(T, M, rootGroup, width, .2, depth, 0xded8ca, (bounds.minX + bounds.maxX) / 2, -.13, (bounds.minZ + bounds.maxZ) / 2, .2);
    base.name = 'cozy-city-base';
    base.receiveShadow = true;
    stats.base = 1;
  }

  function addBlockPaving(T, M, rootGroup, layout, segments, stats) {
    const pavingEntries = [];
    const jointEntries = [];
    const blocks = [];
    const uniqueSorted = values => {
      const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
      const result = [];
      sorted.forEach(value => {
        if (!result.length || Math.abs(value - result[result.length - 1]) > .08) result.push(value);
      });
      return result;
    };
    const addBlock = (x, z, w, d) => {
      if (![x, z, w, d].every(Number.isFinite) || w < 1.2 || d < 1.2) return;
      // A small road-side reveal keeps the block paving below the raised curb
      // and leaves a visible gray asphalt/curb boundary instead of painting
      // bricks into the carriageway.
      const reveal = .06;
      const pavedW = Math.max(1, w - reveal * 2);
      const pavedD = Math.max(1, d - reveal * 2);
      pavingEntries.push({ x, y: .07, z, sx: pavedW, sy: 1, sz: pavedD, rotation: 0, materialKey: 'blockPaving' });
      const step = .9;
      for (let local = -pavedD / 2 + step; local < pavedD / 2 - .2; local += step) {
        jointEntries.push({ x, y: .099, z: z + local, sx: pavedW, sy: 1, sz: .032, rotation: 0, materialKey: 'blockJoint' });
      }
      for (let local = -pavedW / 2 + step; local < pavedW / 2 - .2; local += step) {
        jointEntries.push({ x: x + local, y: .099, z, sx: .032, sy: 1, sz: pavedD, rotation: 0, materialKey: 'blockJoint' });
      }
      stats.blockPaving += 1;
    };
    const explicitBlocks = Array.isArray(layout.blocks) ? layout.blocks : [];
    explicitBlocks.forEach(block => {
      const p = point(block);
      const w = number(block && block.w, 0), d = number(block && block.d, 0);
      if (p && w > 0 && d > 0) blocks.push({ x: p.x, z: p.z, w, d });
    });
    if (!blocks.length) {
      const vertical = segments.filter(segment => Math.abs(segment.dx) <= .08);
      const horizontal = segments.filter(segment => Math.abs(segment.dz) <= .08);
      const xLines = uniqueSorted(vertical.map(segment => segment.mid.x));
      const zLines = uniqueSorted(horizontal.map(segment => segment.mid.z));
      const lineWidth = (collection, value, axis) => {
        const matches = collection.filter(segment => Math.abs(segment.mid[axis] - value) < .12);
        return matches.length ? Math.max(...matches.map(segment => segment.width)) : 4.2;
      };
      for (let xi = 0; xi < xLines.length - 1; xi++) {
        const west = xLines[xi], east = xLines[xi + 1];
        const westWidth = lineWidth(vertical, west, 'x'), eastWidth = lineWidth(vertical, east, 'x');
        for (let zi = 0; zi < zLines.length - 1; zi++) {
          const north = zLines[zi], south = zLines[zi + 1];
          const northWidth = lineWidth(horizontal, north, 'z'), southWidth = lineWidth(horizontal, south, 'z');
          const x = (west + east) / 2;
          let northEdge=north+northWidth/2,southEdge=south-southWidth/2;
          // Crop the two adjacent block slabs to the wider central asphalt.
          // Without this, their higher paving layer would cover its edges.
          if(Math.abs(west+10)<.01&&Math.abs(east-10)<.01){
            if(Math.abs(north-6)<.01)northEdge=8.5;
            if(Math.abs(south-6)<.01)southEdge=3.1;
          }
          const z = (northEdge+southEdge)/2;
          const w = east - west - westWidth / 2 - eastWidth / 2;
          const d = southEdge-northEdge;
          addBlock(x, z, w, d);
        }
      }
    } else {
      blocks.forEach(block => addBlock(block.x, block.z, block.w, block.d));
    }
    stats.blockJoints += addInstancedBoxes(T, M, rootGroup, jointEntries, { x: 1, y: .012, z: 1 }, { blockJoint: 0xb9b3a8, default: 0xb9b3a8 }, 'cozy-block-paving-joints');
    stats.blockPavingInstances += addInstancedBoxes(T, M, rootGroup, pavingEntries, { x: 1, y: .045, z: 1 }, { blockPaving: 0xd0c9b9, default: 0xd0c9b9 }, 'cozy-block-paving');
  }

  function addRoads(T, M, rootGroup, layout, stats) {
    const rawRoads = Array.isArray(layout.roads) ? layout.roads : [];
    const segments = rawRoads.map(segmentInfo).filter(Boolean);
    // Select tree positions from the whole road graph first.  A fixed index
    // sample used to collapse to a handful of trees when a sampled sidewalk
    // was occupied by a building; candidate selection keeps the requested
    // street-tree density while retaining the layout's clearance rules.
    const treeTarget = Math.min(32, Math.max(28, Math.round(segments.length * .44)));
    const nodes = new Map();
    const centerEntries = [];
    const edgeEntries = [];
    const laneEntries = [];
    const sidewalkJointEntries = [];
    const crosswalkEntries = [];
    const stopEntries = [];
    const drainEntries = [];
    const cornerPavingEntries = [];
    const cornerCurbEntries = [];
    const roundedCorners=makeGroup(T,M,rootGroup,0,0,0);roundedCorners.name='cozy-rounded-sidewalk-corners';
    const cornerGeometry=new Map();
    function roundedCorner(cx,cz,sgnx,sgnz,r){
      if(!T.Shape||!T.ShapeGeometry||!T.ExtrudeGeometry)return;
      const key=r.toFixed(3);let geometries=cornerGeometry.get(key);
      if(!geometries){
        const disk=new T.Shape();disk.moveTo(0,0);disk.lineTo(0,r);disk.absarc(0,0,r,Math.PI/2,Math.PI,false);disk.closePath();
        const wedge=new T.Shape();wedge.moveTo(-r,r);wedge.lineTo(-r,0);wedge.absarc(0,0,r,Math.PI,Math.PI/2,true);wedge.closePath();
        const arc=new T.Shape(),a0=Math.PI/2,a1=a0+Math.PI/16,inner=r-.2;arc.moveTo(r*Math.cos(a0),r*Math.sin(a0));arc.absarc(0,0,r,a0,a1,false);arc.lineTo(inner*Math.cos(a1),inner*Math.sin(a1));arc.absarc(0,0,inner,a1,a0,true);arc.closePath();
        geometries={disk:new T.ShapeGeometry(disk,16),wedge:new T.ShapeGeometry(wedge,16),arc:new T.ExtrudeGeometry(arc,{depth:.12,bevelEnabled:false,curveSegments:3})};cornerGeometry.set(key,geometries);
      }
      const angle=Math.atan2(sgnx,sgnz)-Math.PI/4;
      for(const [geometry,material,y]of[[geometries.wedge,root.CozyArchitecture?.road(ROAD_COLORS.road)||ROAD_COLORS.road,.102],[geometries.disk,ROAD_COLORS.sidewalk,.105]]){const mesh=new T.Mesh(geometry,typeof material==='object'?material:makeMaterial(T,M,material));mesh.position.set(cx,y,cz);mesh.rotation.order='YXZ';mesh.rotation.set(-Math.PI/2,angle,0,'YXZ');mesh.receiveShadow=true;roundedCorners.add(mesh)}
      for(let i=0;i<8;i++){const mesh=new T.Mesh(geometries.arc,makeMaterial(T,M,i<4?ROAD_COLORS.edge:ROAD_COLORS.crosswalk));mesh.position.set(cx,.105,cz);mesh.rotation.set(-Math.PI/2,angle+i*Math.PI/16,0,'YXZ');mesh.castShadow=mesh.receiveShadow=true;roundedCorners.add(mesh);stats.cornerCurbs++}
      stats.cornerPaving++;
    }

    const layoutBuildings = Array.isArray(layout.buildings) ? layout.buildings : [];
    const layoutObstacles = Array.isArray(layout.fixedObstacles) ? layout.fixedObstacles : Array.isArray(layout.obstacles) ? layout.obstacles : [];
    const protectedStands=Array.isArray(layout.protectedStands)?layout.protectedStands:[];
    const treeClear = (x, z) => protectedStands.every(p=>Math.hypot(x-p.x,z-p.z)>2.7) && !layoutBuildings.some(building => {
      const p = point(building);
      if (!p) return false;
      return Math.abs(x - p.x) < number(building.w, 3) / 2 + .78 && Math.abs(z - p.z) < number(building.d, 3) / 2 + .78;
    }) && !layoutObstacles.some(obstacle => {
      const p = point(obstacle);
      if (!p) return false;
      return Math.abs(x - p.x) < number(obstacle.w, 1) / 2 + .4 && Math.abs(z - p.z) < number(obstacle.d, 1) / 2 + .4;
    });
    const treeCandidates = [];
    segments.forEach((segment, index) => {
      if (segment.length <= 8 || !M || typeof M.tree !== 'function') return;
      const isAlley = segment.kind.indexOf('alley') >= 0 || segment.kind.indexOf('lane') >= 0 || segment.kind.indexOf('巷') >= 0;
      const sidewalk = Math.min(.82, Math.max(.42, segment.width * (isAlley ? .2 : .24)));
      const alongOffsets = [0, -Math.min(segment.length * .28, 4.2), Math.min(segment.length * .28, 4.2)];
      const sideOrder = index % 2 ? [1, -1] : [-1, 1];
      for (const along of alongOffsets) {
        for (const treeSide of sideOrder) {
          // The existing long-segment planter occupies the positive-side
          // centre; keep a tree from sharing that small sidewalk footprint.
          if (index % 3 === 0 && segment.length > 12 && Math.abs(along) < .01 && treeSide === 1) continue;
          const normal = treeSide * (segment.width / 2 + sidewalk + .22);
          const treeX = segment.mid.x + Math.cos(segment.angle) * along + Math.sin(segment.angle) * normal;
          const treeZ = segment.mid.z - Math.sin(segment.angle) * along + Math.cos(segment.angle) * normal;
          if (treeClear(treeX, treeZ)) {
            treeCandidates.push({ index, x: treeX, z: treeZ });
            return;
          }
        }
      }
    });
    const selectedTreeCandidates = new Map();
    const selectedTreeCount = Math.min(treeTarget, treeCandidates.length);
    for (let i = 0; i < selectedTreeCount; i++) {
      const candidate = treeCandidates[Math.round(i * (treeCandidates.length - 1) / Math.max(1, selectedTreeCount - 1))];
      selectedTreeCandidates.set(candidate.index, candidate);
    }
    // Keep the new market gate and open counters visible from the main
    // street; retain the other trees and the nine store-front plantings.
    for(const [index,c]of selectedTreeCandidates)if(c.x>12&&c.x<18&&c.z>-6.5&&c.z<-1.5)selectedTreeCandidates.delete(index);
    // Resolve junction membership before laying geometry so each approach can
    // stop outside the node.  The node patch below keeps the centre a clean
    // asphalt square instead of a white crosswalk mesh.
    segments.forEach(segment => {
      for (const item of [
        { point: segment.a, segment, endpoint: -1, angle: segment.angle },
        { point: segment.b, segment, endpoint: 1, angle: segment.angle }
      ]) {
        const key = nodeKey(item.point);
        if (!nodes.has(key)) nodes.set(key, []);
        nodes.get(key).push(item);
      }
    });
    segments.forEach((sourceSegment, index) => {
      // A wider visible carriageway gives the central crossing more room.
      // The canonical route remains at z=6; only its asphalt/curb envelope
      // moves .2m south. Both ends still join the original junction patches.
      const central = Math.abs(sourceSegment.a.x + 10) < .001 && Math.abs(sourceSegment.b.x - 10) < .001 && Math.abs(sourceSegment.a.z - 6) < .001 && Math.abs(sourceSegment.b.z - 6) < .001;
      const segment = central ? { ...sourceSegment, width:5.4, mid:{ ...sourceSegment.mid, z:5.8 } } : sourceSegment;
      const startLinks = nodes.get(nodeKey(segment.a)) || [];
      const endLinks = nodes.get(nodeKey(segment.b)) || [];
      const trimStart = startLinks.length > 1 ? Math.min(segment.length * .34, segment.width / 2 + .82) : 0;
      const trimEnd = endLinks.length > 1 ? Math.min(segment.length * .34, segment.width / 2 + .82) : 0;
      const visibleLength = Math.max(.8, segment.length - trimStart - trimEnd);
      const centreShift = (trimStart - trimEnd) / 2;
      const centre = {
        x: segment.mid.x + Math.cos(segment.angle) * centreShift,
        z: segment.mid.z - Math.sin(segment.angle) * centreShift
      };
      const roadGroup = makeGroup(T, M, rootGroup, centre.x, 0, centre.z);
      if (central) {
        roadGroup.name='cozy-central-carriageway';
        roadGroup.userData={width:5.4,centerZ:5.8,canonicalRouteZ:6};
      }
      roadGroup.rotation.y = segment.angle;
      const isAlley = segment.kind.indexOf('alley') >= 0 || segment.kind.indexOf('lane') >= 0 || segment.kind.indexOf('巷') >= 0;
      const sidewalk = Math.min(.82, Math.max(.42, segment.width * (isAlley ? .2 : .24)));
      makeBox(T, M, roadGroup, visibleLength, .08, segment.width, isAlley ? ROAD_COLORS.roadDark : ROAD_COLORS.road, 0, .02, 0, .025);
      for (const side of [-1, 1]) {
        const z = side * (segment.width / 2 + sidewalk / 2);
        makeBox(T, M, roadGroup, visibleLength, .065, sidewalk, ROAD_COLORS.sidewalk, 0, .065, z, .025);
        makeBox(T, M, roadGroup, visibleLength, .09, .11, ROAD_COLORS.curb, 0, .105, side * (segment.width / 2 + sidewalk + .045), .025);
        // A restrained two-metre tile rhythm makes the continuous sidewalk
        // read as walkable paving instead of one broad beige platform.  The
        // joints are one shared instanced geometry for the whole city.
        for (let localX = -visibleLength / 2 + 1.1; localX < visibleLength / 2 - .45; localX += 2.15) {
          sidewalkJointEntries.push({
            x: centre.x + Math.cos(segment.angle) * localX + Math.sin(segment.angle) * z,
            y: .101,
            z: centre.z - Math.sin(segment.angle) * localX + Math.cos(segment.angle) * z,
            sx: .03,
            sy: 1,
            sz: Math.max(.24, sidewalk * .88),
            rotation: segment.angle,
            materialKey: 'sidewalkJoint'
          });
        }
        // Taiwan-style raised curb, kept just inside the sidewalk edge.  Use
        // short red/white sections so the line reads as a curb, not a single
        // thin red stripe through the city.
        // The .2m curb box is centred .1m into the sidewalk, so its inner
        // edge lands exactly on the asphalt boundary and never cuts into the
        // carriageway or a crossing stripe.
        const edgeZ = side * (segment.width / 2 + .1);
        const curbSection = 1.2;
        for (let localX = -visibleLength / 2; localX < visibleLength / 2 - .1; localX += curbSection) {
          const span = Math.min(curbSection, visibleLength / 2 - localX);
          if (span <= .16) continue;
          edgeEntries.push({
            x: centre.x + Math.cos(segment.angle) * (localX + span / 2) + Math.sin(segment.angle) * edgeZ,
            y: .16,
            z: centre.z - Math.sin(segment.angle) * (localX + span / 2) + Math.cos(segment.angle) * edgeZ,
            sx: span,
            sy: 1,
            sz: .2,
            rotation: segment.angle,
            materialKey: Math.floor((localX + visibleLength / 2) / curbSection) % 2 ? 'edgeWhite' : 'edgeRed'
          });
        }
      }
      // Small curb drains sit on the road side of the raised curb, away from
      // the crossing and centre lines.  They share one dark grate batch.
      if (!isAlley && visibleLength > 8) {
        const drainSide = index % 2 ? -1 : 1;
        for (let localX = -visibleLength / 2 + 2.2; localX < visibleLength / 2 - 1.2; localX += 9.2) {
          const grateZ = drainSide * (segment.width / 2 + .035);
          drainEntries.push({
            x: centre.x + Math.cos(segment.angle) * localX + Math.sin(segment.angle) * grateZ,
            y: .096,
            z: centre.z - Math.sin(segment.angle) * localX + Math.cos(segment.angle) * grateZ,
            sx: .42,
            sy: 1,
            sz: .14,
            rotation: segment.angle,
            materialKey: 'drain'
          });
        }
      }
      // Double yellow centre lines are continuous through each block.  Wide
      // boulevards additionally get a restrained dashed white lane divider.
      for (const localZ of [-.09, .09]) centerEntries.push({
        x: centre.x + Math.sin(segment.angle) * localZ,
        y: .105,
        z: centre.z + Math.cos(segment.angle) * localZ,
        sx: Math.max(1, visibleLength - .3),
        sy: 1,
        sz: .045,
        rotation: segment.angle,
        materialKey: 'center'
      });
      if (!isAlley && segment.width >= 4.8) {
        const dash = 1.2, gap = 2.1;
        for (let x = -visibleLength / 2 + .65; x < visibleLength / 2 - .3; x += dash + gap) {
          const span = Math.min(dash, visibleLength / 2 - .25 - x);
          for (const localZ of [-segment.width * .25, segment.width * .25]) if (span > .2) laneEntries.push({
            x: centre.x + Math.cos(segment.angle) * x + Math.sin(segment.angle) * localZ,
            y: .105,
            z: centre.z - Math.sin(segment.angle) * x + Math.cos(segment.angle) * localZ,
            sx: span,
            sy: 1,
            sz: .045,
            rotation: segment.angle,
            materialKey: 'lane'
          });
        }
      }
      if(!isAlley&&visibleLength>8&&(index%9===0||Math.hypot(centre.x-(layout.spawn?.x||0),centre.z-(layout.spawn?.z||0))<6)&&root.CozyArchitecture?.stencil){const normal=segment.width*.23,paint=root.CozyArchitecture.stencil(rootGroup,'慢行');paint.position.set(centre.x+Math.sin(segment.angle)*normal,0,centre.z+Math.cos(segment.angle)*normal);paint.rotation.y=segment.angle;const ink=makeMaterial(T,M,ROAD_COLORS.crosswalk);for(const x of[1.1,1.55]){const wheel=new T.Mesh(new T.RingGeometry(.105,.13,16),ink);wheel.position.set(x,.114,0);wheel.rotation.x=-Math.PI/2;paint.add(wheel)}const line=new T.LineSegments(new T.BufferGeometry().setFromPoints([new T.Vector3(1.1,.115,0),new T.Vector3(1.22,.115,-.23),new T.Vector3(1.22,.115,-.23),new T.Vector3(1.4,.115,-.23),new T.Vector3(1.4,.115,-.23),new T.Vector3(1.55,.115,0),new T.Vector3(1.55,.115,0),new T.Vector3(1.1,.115,0),new T.Vector3(1.4,.115,-.23),new T.Vector3(1.5,.115,-.35)]),new T.LineBasicMaterial({color:ROAD_COLORS.crosswalk}));paint.add(line)}
      stats.roads += 1;
      if (index % 3 === 0 && segment.length > 12) {
        // A restrained planter rhythm keeps the sidewalks warm without adding
        // a forest of individual meshes along every block.
        const x = centre.x + Math.sin(segment.angle) * (segment.width / 2 + sidewalk + .28);
        const z = centre.z + Math.cos(segment.angle) * (segment.width / 2 + sidewalk + .28);
        if (M && typeof M.plant === 'function') { M.plant(rootGroup, x, z, .48, index % 2 === 0); stats.planters += 1; }
      }
      const treeCandidate = selectedTreeCandidates.get(index);
      if (treeCandidate && M && typeof M.tree === 'function') {
        M.tree(rootGroup, treeCandidate.x, treeCandidate.z, 1 + (index % 4) * .04, false);
        stats.trees += 1;
        stats.streetTrees += 1;
      }
    });
    // A sparse directional cue helps the road read at low camera pitch; it is
    // kept to selected long segments so the markings do not become wallpaper.
    segments.forEach((segment, index) => {
      const isAlley = segment.kind.indexOf('alley') >= 0 || segment.kind.indexOf('lane') >= 0 || segment.kind.indexOf('巷') >= 0;
      if (isAlley || segment.length <= 8 || index % 9 !== 4) return;
      const laneOffset = (index % 2 ? -1 : 1) * Math.min(1.05, Math.max(.82, segment.width * .24));
      const arrowX = segment.mid.x + Math.sin(segment.angle) * laneOffset;
      const arrowZ = segment.mid.z + Math.cos(segment.angle) * laneOffset;
      addRoadArrow(T, M, rootGroup, arrowX, arrowZ, segment.angle, .9);
      stats.arrows += 1;
    });
    stats.roadMarkings += addInstancedBoxes(T, M, rootGroup, centerEntries, { x: 1, y: .012, z: 1 }, { center: ROAD_COLORS.marking, default: ROAD_COLORS.marking }, 'cozy-road-centre-lines');
    stats.roadMarkings += addInstancedBoxes(T, M, rootGroup, laneEntries, { x: 1, y: .012, z: 1 }, { lane: ROAD_COLORS.lane, default: ROAD_COLORS.lane }, 'cozy-road-lane-lines');
    stats.curbLines += addInstancedBoxes(T, M, rootGroup, edgeEntries, { x: 1, y: .12, z: 1 }, { edgeRed: ROAD_COLORS.edge, edgeWhite: 0xf0e8d6, default: ROAD_COLORS.edge }, 'cozy-red-white-raised-curbs');
    stats.sidewalkJoints = addInstancedBoxes(T, M, rootGroup, sidewalkJointEntries, { x: 1, y: .012, z: 1 }, { sidewalkJoint: 0xb5afa3, default: 0xb5afa3 }, 'cozy-sidewalk-tile-joints');
    stats.drainGrates += addInstancedBoxes(T, M, rootGroup, drainEntries, { x: 1, y: .018, z: 1 }, { drain: 0x747a75, default: 0x747a75 }, 'cozy-curb-drain-grates');
    // A node can have several roads.  Each approach gets one crossing, and
    // each node gets a small lamp/sign pair rather than a giant landmark sign.
    const crossingKeys = new Set();
    let nodeIndex = 0;
    for (const [key, links] of nodes) {
      const node = links[0].point;
      const uniqueLinks = [];
      links.forEach(link => {
        const angleKey = Math.round(undirectedAngle(link.angle) * 100) / 100;
        if (!uniqueLinks.some(item => Math.abs(undirectedAngle(item.angle) - angleKey) < .04)) uniqueLinks.push(link);
      });
      if (links.length > 1) {
        const patchRadius = Math.max(...links.map(link => link.segment.width / 2 + .82));
        makeBox(T, M, rootGroup, patchRadius * 2, .075, patchRadius * 2, ROAD_COLORS.road, node.x, .045, node.z, .3);
        stats.nodePatches += 1;
        // Build a sidewalk pad and two continuous raised curb edges at each
        // usable corner.  The old radial scraps could land inside the square
        // asphalt node; these pads derive their footprint from the actual road
        // half-width and sidewalk width, so no curb instance enters a road or
        // crossing lane.
        const outward = [];
        links.forEach(link => {
          const outwardAngle = link.angle + (link.endpoint < 0 ? 0 : Math.PI);
          const normalized = (outwardAngle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          if (!outward.some(item => Math.abs(Math.atan2(Math.sin(item.angle - normalized), Math.cos(item.angle - normalized))) < .08)) {
            const isAlley = link.segment.kind.indexOf('alley') >= 0 || link.segment.kind.indexOf('lane') >= 0 || link.segment.kind.indexOf('巷') >= 0;
            outward.push({
              angle: normalized,
              x: Math.cos(normalized),
              z: -Math.sin(normalized),
              halfRoad: link.segment.width / 2,
              sidewalk: Math.min(.82, Math.max(.42, link.segment.width * (isAlley ? .2 : .24)))
            });
          }
        });
        for (let first = 0; first < outward.length; first++) {
          for (let second = first + 1; second < outward.length; second++) {
            const a = outward[first], b = outward[second];
            const dot = a.x * b.x + a.z * b.z;
            if (Math.abs(dot) > .28) continue;
            let delta = Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle));
            if (delta < 0) delta += Math.PI * 2;
            if (delta > Math.PI) {
              delta = Math.PI * 2 - delta;
            }
            if (delta < 1.05 || delta > 2.1) continue;
            const cornerHalf = Math.max(a.halfRoad, b.halfRoad);
            const sidewalk = Math.min(.82, Math.max(.42, patchRadius - cornerHalf, a.sidewalk, b.sidewalk));
            const centerDistance = cornerHalf + sidewalk / 2;
            const cornerCenter = {
              x: node.x + (a.x + b.x) * centerDistance,
              z: node.z + (a.z + b.z) * centerDistance
            };
            roundedCorner(node.x+(a.x+b.x)*(cornerHalf+sidewalk),node.z+(a.z+b.z)*(cornerHalf+sidewalk),Math.sign(a.x+b.x),Math.sign(a.z+b.z),sidewalk);
            if (stats.planters < 32 && M && typeof M.plant === 'function' && (first + second + key.length) % 3 === 0) {
              if (treeClear(cornerCenter.x, cornerCenter.z)) {
                M.plant(rootGroup, cornerCenter.x, cornerCenter.z, .32, (first + second) % 2 === 0);
                stats.planters += 1;
              }
            }
          }
        }
      }
      uniqueLinks.slice(0, 4).forEach(link => {
        const angle = link.angle;
        const crossingKey = `${key}:${Math.round(undirectedAngle(angle) * 100)}`;
        if (crossingKeys.has(crossingKey)) return;
        crossingKeys.add(crossingKey);
        // Place each crossing on its approach, outside the asphalt node patch;
        // this leaves the junction centre gray and readable from above.
        const approach = link.endpoint < 0 ? 1 : -1;
        const offset = link.segment.width / 2 + .82;
        const crossCenter = {
          x: node.x + Math.cos(angle) * approach * offset,
          z: node.z - Math.sin(angle) * approach * offset
        };
        const width = Math.max(1.5, link.segment.width * .82);
        for (let x = -1.15; x <= 1.15; x += .42) crosswalkEntries.push({
          x: crossCenter.x + Math.cos(angle) * x,
          y: .11,
          z: crossCenter.z - Math.sin(angle) * x,
          sx: .19,
          sy: 1,
          sz: width,
          rotation: angle,
          materialKey: 'crosswalk'
        });
        // Keep a small gray gap between the crossing and the stop bar.  The
        // bar sits farther along the approach, never in the node centre.
        const stopDistance = offset + 1.62;
        const stopPoint = {
          x: node.x + Math.cos(angle) * approach * stopDistance,
          z: node.z - Math.sin(angle) * approach * stopDistance
        };
        stopEntries.push({ x: stopPoint.x, y: .112, z: stopPoint.z, sx: .12, sy: 1, sz: width * .78, rotation: angle, materialKey: 'stop' });
        stats.crosswalks += 1;
      });
      if (stats.lamps < 32) {
        const approachLink = links[0];
        const heading = approachLink.angle;
        const approach = approachLink.endpoint < 0 ? 1 : -1;
        const sidewalk = Math.min(.82, Math.max(.42, approachLink.segment.width * (approachLink.segment.kind.indexOf('alley') >= 0 || approachLink.segment.kind.indexOf('lane') >= 0 || approachLink.segment.kind.indexOf('巷') >= 0 ? .2 : .24)));
        const tangentOffset = Math.max(1.25, approachLink.segment.width / 2 + .82);
        const normalOffset = Math.max(1.25, approachLink.segment.width / 2 + sidewalk * .62);
        const cornerPoint = side => ({
          x: node.x + Math.cos(heading) * approach * tangentOffset + Math.sin(heading) * side * normalOffset,
          z: node.z - Math.sin(heading) * approach * tangentOffset + Math.cos(heading) * side * normalOffset
        });
        const lampSide = stats.lamps % 2 ? -1 : 1;
        const lampPoint = cornerPoint(lampSide);
        const lamp = makeGroup(T, M, rootGroup, lampPoint.x, 0, lampPoint.z);
        lamp.name = `cozy-lamp-${stats.lamps}`;
        makeCylinder(T, M, lamp, .055, .075, 3.4, ROAD_COLORS.lamp, 0, 1.7, 0, 12);
        makeBox(T, M, lamp, .5, .08, .08, ROAD_COLORS.lamp, .18, 3.35, 0, .02);
        makeCylinder(T, M, lamp, .24, .19, .09, 0xd8bf88, .4, 3.18, 0, 10);
        makeBox(T, M, lamp, .4, .08, .3, 0x687570, .4, 3.37, 0, .025);
        addLampGlow(T, M, lamp, .17, 0xffe6ad, .4, 3.22, 0);
        stats.lamps += 1;
        const signPoint = cornerPoint(-lampSide);
        const sign = makeGroup(T, M, rootGroup, signPoint.x, 0, signPoint.z);
        sign.name = `cozy-road-sign-${stats.roadSigns}`;
        makeCylinder(T, M, sign, .035, .045, 2.05, ROAD_COLORS.lamp, 0, 1.03, 0, 8);
        const board = makeBox(T, M, sign, 1.15, .34, .055, ROAD_COLORS.sign, 0, 2.12, 0, .025);
        sign.rotation.y = heading;
        const district=(layout.districts||[]).reduce((best,d)=>!best||Math.hypot(d.x-node.x,d.z-node.z)<Math.hypot(best.x-node.x,best.z-node.z)?d:best,null);
        const label = district?.name || '小城生活街';
        if (label) {
          const text = addText(M, sign, label.slice(0, 8), 0, 2.12, .035, .98, '#fff5dc', null);
          if(text)text.rotation.y=0;
          const back=addText(M,sign,label.slice(0,8),0,2.12,-.035,.98,'#fff5dc',null);if(back)back.rotation.y=Math.PI;
        }
        stats.roadSigns += 1;
        if (stats.trafficSignals < 6 && nodeIndex % 5 === 0) {
          const signalPoint = {
            x: signPoint.x + Math.cos(heading) * approach * .3,
            z: signPoint.z - Math.sin(heading) * approach * .3
          };
          const signal = makeGroup(T, M, rootGroup, signalPoint.x, 0, signalPoint.z);
          signal.name = `cozy-traffic-signal-${stats.trafficSignals}`;
          makeBox(T, M, signal, .2, .68, .14, 0x46524f, 0, 1.56, 0, .03);
          makeSphere(T, M, signal, .055, 0xd85f55, 0, 1.78, .08, 1, 1, .7);
          makeSphere(T, M, signal, .055, 0xe1b25c, 0, 1.58, .08, 1, 1, .7);
          makeSphere(T, M, signal, .055, 0x6fa57f, 0, 1.38, .08, 1, 1, .7);
          stats.trafficSignals += 1;
        }
      }
      nodeIndex += 1;
    }
    stats.roadMarkings += addInstancedBoxes(T, M, rootGroup, crosswalkEntries, { x: 1, y: .018, z: 1 }, { crosswalk: ROAD_COLORS.crosswalk, default: ROAD_COLORS.crosswalk }, 'cozy-crosswalk-stripes');
    stats.roadMarkings += addInstancedBoxes(T, M, rootGroup, stopEntries, { x: 1, y: .018, z: 1 }, { stop: ROAD_COLORS.lane, default: ROAD_COLORS.lane }, 'cozy-road-stop-lines');
    if(root.CozyStaticMesh)root.CozyStaticMesh.compile(roundedCorners,{mergeColorMaterials:true});
    stats.cornerPaving += addInstancedBoxes(T, M, rootGroup, cornerPavingEntries, { x: 1, y: .045, z: 1 }, { cornerPaving: ROAD_COLORS.sidewalk, default: ROAD_COLORS.sidewalk }, 'cozy-corner-sidewalk-pads');
    stats.cornerCurbs += addInstancedBoxes(T, M, rootGroup, cornerCurbEntries, { x: 1, y: .12, z: 1 }, { cornerCurb: ROAD_COLORS.curb, default: ROAD_COLORS.curb }, 'cozy-corner-raised-curbs');
    stats.stopLines = stopEntries.length;
    return segments;
  }

  function facadePoint(origin, angle, localX, localZ) {
    return {
      x: origin.x + Math.cos(angle) * localX + Math.sin(angle) * localZ,
      z: origin.z - Math.sin(angle) * localX + Math.cos(angle) * localZ
    };
  }

  function addBuildings(T, M, rootGroup, layout, segments, stats) {
    const buildings = Array.isArray(layout.buildings) ? layout.buildings : [];
    const windows = [];
    const windowFrames = [];
    const awningStripes = [];
    const windowMaterials = {};
    const frameMaterials = {};
    // Presentation-only corrections for the overview camera.  These are
    // stable layout indexes from city-layout.js: they change the visible
    // floor rhythm and shop identity while preserving each source footprint,
    // door, road clearance, and navigation obstacle.
    const presentationOverrides = {
      0: { garden: true, kind: 'flower', label: '街角花園', role: 'raised-corner-garden' },
      1: { floors:2, widen:.4, kind:'bakery', label:'小城麵包', role:'wide-low-street-house' },
      5: { floors:2, kind:'tea', label:'巷口茶屋', role:'low-market-neighbour' },
      12: { floors: 2, kind: 'tea', label: '巷口茶屋', role: 'mid-corner-shop' },
      19: { garden: true, kind: 'flower', label: '街角花園', role: 'raised-corner-garden' },
      // These existing lots sit on the current camera's main-street sightline.
      // Keep their source heights and footprints; the metadata only gives the
      // ground frontage a stable, alternating shop identity.
      21: { kind: 'flower', label: '日常花屋', role: 'main-street-shop' },
      28: { floors: 3, widen:.4, kind: 'bakery', label: '小城麵包', role: 'garden-anchor' },
      29: { garden: true, mergeWith:30, kind: 'flower', label: '街角公園', role: 'mid-block-garden' },
      30: { mergedInto:29 },
      45: { floors:2, widen:.4, kind: 'food', label: '暖食小館', role: 'wide-low-street-house' },
      46: { market:true, role:'visible-market-corner' },
      // Seven existing sightline lots stay on their source footprints, but
      // read as low corner shops so the camera keeps the street hierarchy.
      24: { floors: 1, kind: 'food', label: '良食堂', role: 'low-corner-shop' },
      34: { floors: 1, kind: 'tea', label: '巷口茶屋', role: 'low-corner-shop' },
      47: { floors: 1, kind: 'flower', label: '日常花屋', role: 'low-corner-shop' },
      50: { floors: 1, kind: 'bakery', label: '小城麵包', role: 'low-corner-shop' },
      51: { floors: 1, kind: 'food', label: '暖食小館', role: 'low-corner-shop' },
      68: { floors: 1, kind: 'tea', label: '巷口茶屋', role: 'low-corner-shop' },
      72: { floors: 1, kind: 'flower', label: '日常花屋', role: 'low-corner-shop' }
    };
    // The street kit is supplied by models.js when available.  Keep the
    // scenery fallback below for older previews, but never add both the kit
    // facade and the legacy floating window batches to the same building.
    const streetKit = (root && root.CozyStreetKit && typeof root.CozyStreetKit.building === 'function')
      ? root.CozyStreetKit
      : (M && M.CozyStreetKit && typeof M.CozyStreetKit.building === 'function' ? M.CozyStreetKit : null);
    buildings.forEach((building, index) => {
      const presentation = presentationOverrides[index];
      if (presentation?.mergedInto != null) return;
      let p = point(building);
      if (!p) return;
      let w = Math.max(1, number(building.w, 4.2))+Math.min(.5,Math.max(0,number(presentation?.widen,0)));
      const d = Math.max(1, number(building.d, 3.4));
      const sourceHeight = Math.max(2, number(building.height, 4 + (index % 3) * .7));
      if (presentation?.mergeWith != null) {
        const adjacent=buildings[presentation.mergeWith];
        // These two solid lots have a .4m raw gap. Navigation already pads
        // both by .29m, overlapping by .18m; the entire combined bed was
        // blocked before this art change. Keep both original server boxes.
        const left=Math.min(p.x-w/2,adjacent.x-adjacent.w/2),right=Math.max(p.x+w/2,adjacent.x+adjacent.w/2);
        p={x:(left+right)/2,z:p.z};w=right-left;
      }
      if (presentation?.market && streetKit?.marketCorner) {
        const market=streetKit.marketCorner(rootGroup,{w,d:5.2,height:4.2,x:p.x,z:p.z,seed:'central-market'});
        market.name=`city-building-${index}`;
        market.userData.presentationRole=presentation.role;
        market.userData.sourceLots=presentation.mergeWith==null?[index]:[index,presentation.mergeWith];
        root.CozyStaticMesh?.compile(market,{mergeColorMaterials:true});
        stats.decorativeMarkets=(stats.decorativeMarkets||0)+1;
        return;
      }
      if (presentation?.garden) {
        // This is a raised planted bed on an existing solid lot. Its visible
        // plinth and railing explain the retained collision rectangle; no
        // path, doorway or saved coordinate is moved by this art-only change.
        const g = makeGroup(T, M, rootGroup, p.x, 0, p.z);
        g.name = `city-building-${index}`;
        g.userData = { modelType:'raised-garden', baseFootprint:{width:w,depth:d}, presentationRole:presentation.role, sourceLots:presentation.mergeWith == null?[index]:[index,presentation.mergeWith] };
        makeBox(T,M,g,w,.48,d,0xe0cbb0,0,.24,0,.06);
        makeBox(T,M,g,w-.3,.045,d-.3,0x77764c,0,.505,0,.02);
        for (const side of [-1,1]) {
          makeBox(T,M,g,w,.09,.14,0xf0dfc1,0,.52,side*(d/2-.06),.02);
          makeBox(T,M,g,.14,.09,d,0xf0dfc1,side*(w/2-.06),.52,0,.02);
          for(let i=0;i<7;i++)makeCylinder(T,M,g,.025,.025,.5,0x5d7961,(i/6-.5)*(w-.3),.79,side*(d/2-.12),6);
          makeBox(T,M,g,w-.25,.055,.055,0x5d7961,0,1.02,side*(d/2-.12),.01);
        }
        const treePositions=index===29?[[-2.05,-.45,1.4],[2.25,.65,1.03]]:[[-.65,-.55,index===0?1.28:1.12],[.78,.95,.68]];
        for (const [x,z,scale] of treePositions) {
          const tree=M.tree(g,x,z,scale,false);tree.position.y=.51;
        }
        for(const [bx,bz,bw,bd] of [[-.8,-1.65,1.8,.65],[1.05,-.6,.7,1.8],[1.1,1.6,1,.6]]){const bush=M.bush(g,bx,bz,bw,bd);bush.position.y=.53;}
        for(let i=0;i<16;i++){
          const a=i*2.39996,flower=M.plant(g,Math.cos(a)*(w*.3),Math.sin(a)*(d*.32),.5+(i%3)*.06,true);flower.position.y=.53;
        }
        const gardenBench=M.bench(g,-.1,d*.21,0);if(gardenBench)gardenBench.position.y=.53;
        M.text(g,presentation.label,0,.3,d/2+.03,2.4,'#4e6f59');
        root.CozyStaticMesh?.compile(g,{mergeColorMaterials:true});
        stats.plantedLots=(stats.plantedLots||0)+1;
        stats.trees+=2;stats.benches+=1;
        return;
      }
      const h = presentation?.floors
        ? (presentation.floors === 1 ? 3.35 : presentation.floors === 2 ? 5.5 : 6.9)
        : sourceHeight;
      const style = styleFor(building, index);
      const baseColor = color(building.color, style.base);
      const road = nearestRoad(p, segments);
      const side = road ? road.side : 1;
      const facadeAngle = road ? road.segment.angle : 0;
      const namedFacing={south:0,north:Math.PI,east:Math.PI/2,west:-Math.PI/2}[building.frontage];
      const orientation=Number.isFinite(namedFacing)?namedFacing:facadeAngle+(side>0?Math.PI:0);
      const visualKind = presentation?.kind || building.kind || '';
      const kind = String(visualKind).toLowerCase();
      const shopfront = kind.indexOf('shop') >= 0 || kind.indexOf('store') >= 0 || kind.indexOf('cafe') >= 0 || kind.indexOf('bakery') >= 0 || index % 4 === 0;
      const signKinds = ['麵包', '食堂', '花店', '咖啡'];
      const label = building.gameShop?.name || presentation?.label || building.label || building.name || (kind.indexOf('cafe') >= 0 ? '咖啡小店' : (shopfront ? signKinds[index % signKinds.length] : ''));
      if (streetKit) {
        try {
          const result = streetKit.building(rootGroup, {
            w: Math.abs(Math.sin(orientation)) > .5 ? d : w,
            d: Math.abs(Math.sin(orientation)) > .5 ? w : d,
            height: h,
            // A few native four-storey anchors add the reference's vertical
            // hierarchy without changing any footprint or playable road.
            accentFloors: presentation?.floors || (
              (Math.abs(p.x) < .1 && Math.abs(p.z + 19.3) < .1) ||
              (Math.abs(p.x - 35.1) < .1 && Math.abs(p.z + 28.7) < .1) ? 4 : 0
            ),
            kind: visualKind || (shopfront ? 'shop' : 'residential'),
            seed: number(building.seed, index + 1),
            label: String(label || '').slice(0, 10),
            facadeSide: 'front',
            district: style.district,
            color: baseColor,
            facadeColor: index===1 ? 0xa6bca8 : index===28 ? 0xe5cfab : undefined,
            upperFloorHeight: index===28 ? 2.35 : undefined,
            surface: index===1 ? 'tile' : undefined
          });
          const kitNode = result && result.group ? result.group : result;
          if (kitNode && typeof kitNode === 'object') {
            if (!kitNode.parent && typeof rootGroup.add === 'function') rootGroup.add(kitNode);
            if (kitNode.position && typeof kitNode.position.set === 'function') kitNode.position.set(p.x, 0, p.z);
            if (kitNode.rotation) kitNode.rotation.y = orientation;
            kitNode.name = `city-building-${index}`;
            if (presentation) kitNode.userData = { ...(kitNode.userData || {}), presentationRole: presentation.role, presentationFloors: presentation.floors };
            if(root.CozyStaticMesh)root.CozyStaticMesh.compile(kitNode,{mergeColorMaterials:true});
            stats.buildings += 1;
            stats.kitBuildings = (stats.kitBuildings || 0) + 1;
            return;
          }
          // A builder that returns no group is treated as unavailable so the
          // local preview remains complete rather than leaving a blank lot.
          stats.kitFallbacks = (stats.kitFallbacks || 0) + 1;
        } catch (error) {
          stats.kitFallbacks = (stats.kitFallbacks || 0) + 1;
        }
      }
      const buildingGroup = makeGroup(T, M, rootGroup, p.x, 0, p.z);
      buildingGroup.name = `city-building-${index}`;
      makeBox(T, M, buildingGroup, w, h, d, baseColor, 0, h / 2, 0, Math.min(.16, Math.min(w, d) * .08));
      makeBox(T, M, buildingGroup, w * .94, .16, d * .94, style.roof, 0, h + .08, 0, .035);
      makeBox(T, M, buildingGroup, w * .88, .16, .06, style.trim, 0, Math.min(h - .2, 1.05), d / 2 + .025, .012);
      const facade = makeGroup(T, M, buildingGroup, 0, 0, 0);
      facade.rotation.y = facadeAngle;
      if (style.brick || String(building.kind || '').toLowerCase().indexOf('shop') >= 0 || String(building.kind || '').toLowerCase().indexOf('store') >= 0) {
        makeBox(T, M, facade, w * .82, .12, .28, style.accent, 0, Math.min(h - .3, 1.9), side * (d / 2 + .16), .025);
        for (let col = -1; col <= 1; col += 2) makeCylinder(T, M, facade, .075, .075, Math.min(2.5, h * .46), style.trim, col * Math.min(1.2, w * .28), .78, side * (d / 2 + .23), 8);
      }
      if (shopfront && h >= 2.4) {
        const frontWidth = Math.min(w * .8, 3.8);
        const frontZ = side * (d / 2 + .085);
        makeBox(T, M, facade, frontWidth, 1.05, .055, 0x6b9d98, 0, .78, frontZ, .012);
        makeBox(T, M, facade, Math.min(.76, frontWidth * .24), 1.05, .075, 0xe6d2b0, frontWidth * .27, .78, side * (d / 2 + .12), .01);
        for (const mullion of [-.34, .34]) makeBox(T, M, facade, .035, .95, .08, 0xe7d8bf, mullion * frontWidth, .79, side * (d / 2 + .13), .004);
        const awningColor = index % 2 ? 0x75a99b : 0xe28b56;
        makeBox(T, M, facade, frontWidth + .18, .12, .38, awningColor, 0, 1.43, side * (d / 2 + .23), .035);
        const stripeCount = Math.max(3, Math.min(7, Math.floor(frontWidth / .52)));
        for (let stripe = 0; stripe < stripeCount; stripe++) {
          const localX = -frontWidth / 2 + (stripe + .5) * frontWidth / stripeCount;
          const world = facadePoint(p, facadeAngle, localX, side * (d / 2 + .24));
          awningStripes.push({ x: world.x, y: 1.43, z: world.z, sx: frontWidth / stripeCount * .53, sy: 1, sz: .39, rotation: facadeAngle, materialKey: stripe % 2 ? 'awningLight' : 'awningDark' });
        }
        stats.storefronts += 1;
      }
      if (style.garden && index % 2 === 0 && M && typeof M.plant === 'function') {
        const plant = M.plant(facade, Math.min(w * .28, 1.05), side * (d / 2 + .34), .38, index % 4 === 0);
        plant.position.y = .04;
        stats.planters += 1;
      }
      if (index % 3 === 0 && h > 3.2) {
        for (const level of [1, 2]) {
          const y = level * 1.75 + .5;
          if (y >= h - .3) continue;
          makeBox(T, M, facade, w * .62, .07, .34, style.trim, 0, y, side * (d / 2 + .18), .018);
          stats.balconies += 1;
        }
      }
      if (label && (shopfront || kind.indexOf('shop') >= 0 || kind.indexOf('store') >= 0 || kind.indexOf('cafe') >= 0 || index % 11 === 0)) {
        const sign = addText(M, facade, String(label).slice(0, 10), 0, Math.min(h - .35, 2.45), side * (d / 2 + .24), Math.min(1.9, w * .48), '#fff4da', '#6b8f7e');
        if (sign && side < 0) sign.rotation.y = Math.PI;
        if (sign) stats.signs += 1;
      }
      if (index % 4 === 1 && h > 3.2) {
        const airconX = Math.min(w * .3, .9);
        makeBox(T, M, facade, .5, .2, .22, 0xb1b8ae, airconX, Math.min(h - .5, 1.25), side * (d / 2 + .22), .025);
        makeBox(T, M, facade, .42, .07, .05, 0x7f918c, airconX, Math.min(h - .39, 1.4), side * (d / 2 + .34), .012);
        stats.aircon += 1;
      }
      if (index % 5 === 0 && h > 4.2) {
        const tankX = Math.min(w * .28, .85), tankZ = Math.min(d * .24, .55);
        makeCylinder(T, M, buildingGroup, .28, .28, .48, 0x9da9a0, tankX, h + .38, tankZ, 12);
        makeCylinder(T, M, buildingGroup, .31, .31, .06, 0xb8c0b7, tankX, h + .64, tankZ, 12);
        stats.waterTanks += 1;
      }
      const floors = Math.max(1, Math.min(8, Math.floor((h - .8) / 1.62)));
      const levels = Array.from({ length: floors }, (_, floor) => .86 + floor * 1.62).filter(y => y < h - .34);
      const frontCount = Math.max(1, Math.min(6, Math.floor(w / 1.22)));
      const sideCount = Math.max(1, Math.min(4, Math.floor(d / 1.18)));
      const windowKey = style.district || 'default';
      windowMaterials[windowKey] = style.window;
      frameMaterials[windowKey] = style.trim;
      const addWindow = (x, y, z, sx, sy, sz) => {
        windows.push({ x, y, z, sx, sy, sz, materialKey: windowKey });
        if (sx >= sz) {
          for (const dy of [-sy * .5, sy * .5]) windowFrames.push({ x, y: y + dy, z, sx: sx * 1.08, sy: .06, sz: sz * 1.2, materialKey: windowKey });
          for (const dx of [-sx * .5, sx * .5]) windowFrames.push({ x: x + dx, y, z, sx: .06, sy: sy * 1.08, sz: sz * 1.2, materialKey: windowKey });
        } else {
          for (const dy of [-sy * .5, sy * .5]) windowFrames.push({ x, y: y + dy, z, sx: sx * 1.2, sy: .06, sz: sz * 1.08, materialKey: windowKey });
          for (const dz of [-sz * .5, sz * .5]) windowFrames.push({ x, y, z: z + dz, sx: sx * 1.2, sy: sy * 1.08, sz: .06, materialKey: windowKey });
        }
      };
      for (const y of levels) {
        for (let i = 0; i < frontCount; i++) {
          const x = frontCount === 1 ? 0 : -w * .35 + (w * .7 * i) / (frontCount - 1);
          addWindow(p.x + x, y, p.z + d / 2 + .065, .78, .82, .10);
          addWindow(p.x + x, y, p.z - d / 2 - .065, .78, .82, .10);
        }
        for (let i = 0; i < sideCount; i++) {
          const z = sideCount === 1 ? 0 : -d * .3 + (d * .6 * i) / (sideCount - 1);
          // Keep side windows visibly clear of the shell; no rotation is
          // needed because the shallow box already faces the side wall.
          addWindow(p.x + w / 2 + .22, y, p.z + z, .10, .82, .72);
          addWindow(p.x - w / 2 - .22, y, p.z + z, .10, .82, .72);
        }
      }
      stats.buildings += 1;
    });
    windowMaterials.default = DISTRICT_STYLE.大安.window;
    frameMaterials.default = DISTRICT_STYLE.大安.trim;
    stats.windows += addInstancedBoxes(T, M, rootGroup, windows, { x: 1, y: 1, z: 1 }, windowMaterials, 'cozy-building-windows');
    stats.windowFrames += addInstancedBoxes(T, M, rootGroup, windowFrames, { x: 1, y: 1, z: 1 }, frameMaterials, 'cozy-building-window-frames');
    stats.awningStripes += addInstancedBoxes(T, M, rootGroup, awningStripes, { x: 1, y: 1, z: 1 }, { awningDark: 0xe28b56, awningLight: 0xf1c18c, default: 0xf1c18c }, 'cozy-shop-awnings');
  }

  function addParks(T, M, rootGroup, layout, stats) {
    const parks = Array.isArray(layout.parks) ? layout.parks : [];
    parks.forEach((park, index) => {
      const p = point(park);
      if (!p) return;
      const w = Math.max(2, number(park.w, 6)), d = Math.max(2, number(park.d, 5));
      const parkGroup = makeGroup(T, M, rootGroup, p.x, 0, p.z);
      parkGroup.name = `city-park-${index}`;
      makeBox(T, M, parkGroup, w, .12, d, index % 2 ? 0x9db792 : 0xa8bf99, 0, .07, 0, .08);
      makeBox(T, M, parkGroup, Math.max(1, w - 1.1), .025, .22, 0xdccba9, 0, .145, 0, .01);
      makeBox(T, M, parkGroup, .22, .025, Math.max(1, d - 1.1), 0xdccba9, 0, .15, 0, .01);
      const treeCount = Math.max(2, Math.min(8, Math.floor((w * d) / 17)));
      for (let i = 0; i < treeCount; i++) {
        const x = -w * .34 + ((i * 1.618) % 1) * w * .68;
        const z = -d * .34 + (((i * .73) + index * .17) % 1) * d * .68;
        if (M && typeof M.tree === 'function') M.tree(parkGroup, x, z, .8 + (i % 3) * .1, i % 5 === 0);
        else { makeCylinder(T, M, parkGroup, .08, .16, .8, 0x927258, x, .5, z, 8); makeSphere(T, M, parkGroup, .48, 0x89a980, x, 1.15, z, 1, 1.2, 1); }
        stats.trees += 1;
      }
      if (M && typeof M.bench === 'function') { M.bench(parkGroup, 0, d * .28, index % 2 ? .4 : -.35); stats.benches += 1; }
      stats.parks += 1;
    });
  }

  function addTraffic(T, M, rootGroup, layout, stats) {
    const loops = Array.isArray(layout.trafficLoops) ? layout.trafficLoops : [];
    loops.forEach((loop, index) => {
      const points = Array.isArray(loop.points) ? loop.points.map(point).filter(Boolean) : [];
      if (!points.length || !M || typeof M.vehicle !== 'function') return;
      const p = points[0];
      const next = points[1] || p;
      const vehicle = M.vehicle(rootGroup, String(loop.type || 'scooter'), p.x, p.z, index % 2 ? 0xd88d64 : 0x719a91);
      vehicle.group.rotation.y = Math.atan2(next.x - p.x, next.z - p.z);
      vehicle.group.userData = { trafficLoop: points, speed: number(loop.speed, 1.5), type: loop.type || 'scooter' };
      stats.traffic += 1;
    });
  }

  function addDistrictLabels(T, M, rootGroup, layout, stats) {
    const districts = Array.isArray(layout.districts) ? layout.districts : [];
    districts.forEach(district => {
      const p = point(district);
      if (!p) return;
      const label = String(district.name || '').slice(0, 8);
      if (!label) return;
      const sign = makeGroup(T, M, rootGroup, p.x, 0, p.z);
      makeBox(T, M, sign, 1.45, .06, .62, 0xe2d0ad, 0, .03, 0, .025);
      const text = addText(M, sign, label, 0, .62, .03, 1.25, '#4e7169', '#f4e8ce');
      if (text) stats.labels += 1;
    });
  }

  // A pair of small, walkable junction vignettes gives the foreground road
  // hierarchy the same everyday cues as the reference image.  These are
  // presentation only: their coordinates sit on the existing corner
  // sidewalks, and their metadata makes it explicit that collision and route
  // authorities remain in scene-rules/nav.
  function addJunctionPresentation(T, M, rootGroup, segments, stats) {
    const junctions = [
      { key: 'west', x: -10, z: 6, streetName: '民生街', crossStreetName: '大同路', sign: { x: -7.35, z: 9.35 }, signHeight: 3.1, signal: { x: -7.35, z: 3.35 }, anchorBuilding: 12 },
      { key: 'east', x: 10, z: 6, streetName: '大同路', sign: { x: 12.7, z: 3.3 }, signal: { x: 12.65, z: 3.35 }, anchorBuilding: 47 }
    ];
    const hasJunction = target => {
      const links = new Set();
      for (const segment of segments || []) {
        if (Math.hypot(segment.a.x - target.x, segment.a.z - target.z) < .05 || Math.hypot(segment.b.x - target.x, segment.b.z - target.z) < .05) {
          links.add(nodeKey(segment.a));
          links.add(nodeKey(segment.b));
        }
      }
      return links.size >= 4;
    };
    const measure = group => {
      let triangles = 0, meshes = 0;
      group.traverse(node => {
        if (!node.isMesh || !node.geometry) return;
        meshes += 1;
        const index = node.geometry.index;
        triangles += index ? Math.floor(index.count / 3) : Math.floor((node.geometry.attributes?.position?.count || 0) / 3);
      });
      return { meshes, triangles, drawUnits: Number(group.userData.staticCompilation?.drawUnits) || meshes };
    };
    const setPresentationMetadata = (group, target, role) => {
      group.userData = {
        ...(group.userData || {}),
        presentationOnly: true,
        nonInteractive: true,
        noCollision: true,
        canonicalJunction: { x: target.x, z: target.z },
        layoutRegion: '中正文創',
        fictionalStreetName: true,
        streetName: target.streetName,
        ...(target.crossStreetName ? { crossStreetName: target.crossStreetName } : {}),
        role
      };
    };
    const addSign = (parent, target) => {
      const sign = makeGroup(T, M, parent, target.sign.x, 0, target.sign.z);
      sign.name = `cozy-junction-sign-${target.key}`;
      setPresentationMetadata(sign, target, 'double-faced-street-sign');
      const signHeight = number(target.signHeight, 2.55);
      makeCylinder(T, M, sign, .045, .06, signHeight, ROAD_COLORS.lamp, 0, signHeight / 2, 0, 10);
      const componentNames = [];
      const addBoard = (label, y, rotation, suffix) => {
        const boardGroup = makeGroup(T, M, sign, 0, 0, 0);
        boardGroup.name = `cozy-junction-sign-layer-${target.key}-${suffix}`;
        boardGroup.rotation.y = rotation;
        const boardName = `cozy-junction-sign-board-${target.key}-${suffix}`;
        makeBox(T, M, boardGroup, 2.2, .4, .08, ROAD_COLORS.sign, 0, y, 0, .025).name = boardName;
        const frontName = `cozy-junction-sign-front-${target.key}-${suffix}`;
        const front = addText(M, boardGroup, label, 0, y, .047, 1.86, '#fff8df', null);
        if (front) {
          front.name = frontName;
          front.userData.presentationOnly = true;
        }
        const backName = `cozy-junction-sign-back-${target.key}-${suffix}`;
        const back = addText(M, boardGroup, label, 0, y, -.047, 1.86, '#fff8df', null);
        if (back) {
          back.rotation.y = Math.PI;
          back.name = backName;
          back.userData.presentationOnly = true;
        }
        componentNames.push(boardName, frontName, backName);
      };
      addBoard(target.streetName, signHeight, 0, 'primary');
      if (target.crossStreetName) addBoard(target.crossStreetName, Math.max(2.55, signHeight - .48), Math.PI / 2, 'cross');
      sign.userData.componentNames = componentNames;
      sign.userData.signHeight = signHeight;
      return sign;
    };
    const addSignal = (parent, target) => {
      const signal = makeGroup(T, M, parent, target.signal.x, 0, target.signal.z);
      signal.name = `cozy-junction-traffic-${target.key}`;
      setPresentationMetadata(signal, target, 'traffic-signal');
      makeCylinder(T, M, signal, .06, .075, 3.25, ROAD_COLORS.lamp, 0, 1.63, 0, 10);
      // The short arm points over the near lane while leaving the corner and
      // crossing clear for the player camera and natural walking route.
      makeBox(T, M, signal, 1.65, .09, .1, ROAD_COLORS.lamp, -.78, 3.2, 0, .02);
      makeBox(T, M, signal, .26, .72, .2, 0x46524f, -1.52, 2.82, 0, .03);
      makeSphere(T, M, signal, .065, 0xd85f55, -1.52, 3.02, .11, 1, 1, .7);
      makeSphere(T, M, signal, .065, 0xe1b25c, -1.52, 2.82, .11, 1, 1, .7);
      makeSphere(T, M, signal, .065, 0x6fa57f, -1.52, 2.62, .11, 1, 1, .7);
      signal.userData.componentNames = [`cozy-junction-traffic-arm-${target.key}`, `cozy-junction-traffic-head-${target.key}`];
      return signal;
    };
    const addScooterBay = (parent, target, index, x) => {
      // Keep the bay's outer edge just inside the south sidewalk line
      // (z=3.8 at these two canonical junctions), leaving the crossing and
      // the road centre visually clear.
      const bay = makeGroup(T, M, parent, x, 0, 3.05);
      bay.name = `cozy-scooter-bay-${target.key}-${index}`;
      setPresentationMetadata(bay, target, 'scooter-waiting-bay');
      bay.userData.scooterBay = true;
      makeBox(T, M, bay, .82, .035, 1.42, 0xd4aa4d, 0, .035, 0, .008);
      makeBox(T, M, bay, .055, .045, 1.28, 0xf4e4a7, -.34, .06, 0, .004);
      makeBox(T, M, bay, .055, .045, 1.28, 0xf4e4a7, .34, .06, 0, .004);
      bay.userData.componentNames = [`cozy-scooter-bay-marking-${target.key}-${index}`];
      return bay;
    };
    const addWarmActivity = (parent, target) => {
      const building = parent.getObjectByName(`city-building-${target.anchorBuilding}`);
      if (!building || !building.userData?.baseFootprint) return null;
      const footprint = building.userData.baseFootprint;
      // Keep the lower counter inside the source lot's local footprint.  Only
      // the shallow canopy is allowed to overhang the facade by a few
      // centimetres for a readable warm street edge.
      const activity = makeGroup(T, M, building, 0, 0, footprint.depth / 2 - .28);
      activity.name = `cozy-junction-warm-${target.key}`;
      setPresentationMetadata(activity, target, 'anchored-storefront-warmth');
      activity.userData.anchorBuilding = building.name;
      activity.userData.footprintAnchor = true;
      const awningGroup = makeGroup(T, M, activity, 0, 0, 0);
      awningGroup.name = `cozy-junction-warm-awning-${target.key}`;
      makeBox(T, M, awningGroup, Math.min(footprint.width - .3, 3.7), .1, .58, 0xe28b56, 0, 2.62, .08, .025);
      const lightingGroup = makeGroup(T, M, activity, 0, 0, 0);
      lightingGroup.name = `cozy-junction-warm-lighting-${target.key}`;
      for (const x of [-Math.min(footprint.width * .3, 1.05), Math.min(footprint.width * .3, 1.05)]) {
        makeCylinder(T, M, lightingGroup, .035, .045, .62, 0x6a6556, x, 2.27, .08, 8);
        addLampGlow(T, M, lightingGroup, .12, 0xffc16f, x, 1.94, .08);
      }
      const counterGroup = makeGroup(T, M, activity, 0, 0, 0);
      counterGroup.name = `cozy-junction-warm-counter-${target.key}`;
      const counter = makeBox(T, M, counterGroup, Math.min(footprint.width - .7, 2.6), .55, .12, 0x9b6d4e, 0, .78, .11, .02);
      counter.name = `cozy-junction-warm-counter-body-${target.key}`;
      makeBox(T, M, counterGroup, Math.min(footprint.width - .95, 2.35), .34, .03, 0xffc77d, 0, .91, .19, .006);
      const label = addText(M, counterGroup, '日常暖店', 0, 1.33, .2, Math.min(2.05, footprint.width - .75), '#754a3b', '#ffe4b4');
      if (label) label.name = `cozy-junction-warm-label-${target.key}`;
      activity.userData.componentNames = [awningGroup.name, lightingGroup.name, counterGroup.name];
      return activity;
    };

    for (const target of junctions) {
      if (!hasJunction(target)) continue;
      const junction = makeGroup(T, M, rootGroup, 0, 0, 0);
      junction.name = `cozy-junction-presentation-${target.key}`;
      setPresentationMetadata(junction, target, 'foreground-junction');
      const sign = addSign(junction, target);
      const signal = addSignal(junction, target);
      const bayA = target.key === 'west' ? -13.9 : 7.0;
      const bayB = target.key === 'west' ? -15.0 : 5.9;
      addScooterBay(junction, target, 0, bayA);
      addScooterBay(junction, target, 1, bayB);
      const bayLabel = addText(M, junction, '機車', bayA, .085, 3.04, .48, '#6d5139', null);
      if (bayLabel) {
        bayLabel.rotation.x = -Math.PI / 2;
        bayLabel.name = `cozy-scooter-label-${target.key}`;
        bayLabel.userData.presentationOnly = true;
      }
      const warm = addWarmActivity(rootGroup, target);
      // Compile each named component in place so runtime inspection and
      // culling retain sign/signal/bay identities while still merging their
      // repeated native materials.
      if (root.CozyStaticMesh) {
        junction.children.forEach(component => {
          if (!component.isMesh) root.CozyStaticMesh.compile(component, { mergeColorMaterials: true });
        });
      }
      if (warm && root.CozyStaticMesh) {
        warm.children.forEach(component => root.CozyStaticMesh.compile(component, { mergeColorMaterials: true }));
      }
      const groups = [junction, warm].filter(Boolean);
      const metrics = groups.reduce((total, group) => {
        const value = measure(group);
        return { meshes: total.meshes + value.meshes, triangles: total.triangles + value.triangles, drawUnits: total.drawUnits + value.drawUnits };
      }, { meshes: 0, triangles: 0, drawUnits: 0 });
      junction.userData.presentationStats = metrics;
      stats.junctionDetails += 1;
      stats.junctionSigns += sign ? 1 : 0;
      stats.junctionSignals += signal ? 1 : 0;
      stats.scooterBays += 2;
      stats.warmActivities += warm ? 1 : 0;
      stats.junctionPresentationMeshes += metrics.meshes;
      stats.junctionPresentationTriangles += metrics.triangles;
      stats.junctionPresentationDrawUnits += metrics.drawUnits;
    }
  }

  function addDistantContext(T, M, rootGroup, layout, segments, stats) {
    const sourceBounds = layout && layout.bounds;
    const bounds = sourceBounds && [sourceBounds.minX, sourceBounds.maxX, sourceBounds.minZ, sourceBounds.maxZ].every(Number.isFinite)
      ? sourceBounds
      : layoutBounds(layout || {}, segments || []);
    const width = Math.max(20, bounds.maxX - bounds.minX);
    const depth = Math.max(20, bounds.maxZ - bounds.minZ);
    const context = makeGroup(T, M, rootGroup, 0, 0, 0);
    context.name = 'city-distant-context';
    context.userData.contextOnly = true;
    context.userData.nonInteractive = true;
    context.userData.noCollision = true;
    context.userData.bounds = { ...bounds };
    context.userData.cameraObstacles = [];

    // One continuous low ground plane bridges the playable floor and the
    // outer skyline.  It sits just below the core ground top (about -.02),
    // so it cannot float above roads or cover their walking surface.
    // The outer rows below reach 24m beyond the playable bounds.  Extend one
    // shared floor beneath them so the horizon remains grounded rather than
    // becoming floating strips at the edge of the phone camera.
    const groundPad = 110;
    const groundMinX = bounds.minX - groundPad, groundMaxX = bounds.maxX + groundPad;
    const groundMinZ = bounds.minZ - groundPad, groundMaxZ = bounds.maxZ + groundPad;
    const contextGround = makeBox(T, M, context, groundMaxX - groundMinX, .12, groundMaxZ - groundMinZ, 0xb2b89d, (groundMinX + groundMaxX) / 2, -.13, (groundMinZ + groundMaxZ) / 2, .16);
    contextGround.name = 'city-distant-ground';
    stats.distantBase = 1;

    // A low presentation-only green edge closes the playable city without
    // changing the navigation bounds or adding a collision obstacle.  Read
    // the shared outdoor bounds when available so this remains aligned with
    // the native movement authority rather than the larger scenery bounds.
    const playableBounds = root.CozySceneRules?.bounds?.outdoor;
    const edgeBounds = playableBounds && [playableBounds.minX, playableBounds.maxX, playableBounds.minZ, playableBounds.maxZ].every(Number.isFinite)
      ? playableBounds
      : bounds;
    const edgeOffset = .4, edgeHeight = .16, edgeThickness = .6, edgeY = -.07 + edgeHeight / 2;
    const edge = makeGroup(T, M, context, 0, 0, 0);
    edge.name = 'city-playable-boundary';
    edge.userData.contextOnly = true;
    edge.userData.nonInteractive = true;
    edge.userData.noCollision = true;
    const edgeColor = 0x9b9878;
    const edgeWidth = edgeBounds.maxX - edgeBounds.minX + edgeThickness;
    const edgeDepth = edgeBounds.maxZ - edgeBounds.minZ + edgeThickness;
    makeBox(T, M, edge, edgeWidth, edgeHeight, edgeThickness, edgeColor,
      (edgeBounds.minX + edgeBounds.maxX) / 2, edgeY, edgeBounds.minZ - edgeOffset, .035);
    makeBox(T, M, edge, edgeWidth, edgeHeight, edgeThickness, edgeColor,
      (edgeBounds.minX + edgeBounds.maxX) / 2, edgeY, edgeBounds.maxZ + edgeOffset, .035);
    makeBox(T, M, edge, edgeThickness, edgeHeight, edgeDepth, edgeColor,
      edgeBounds.minX - edgeOffset, edgeY, (edgeBounds.minZ + edgeBounds.maxZ) / 2, .035);
    makeBox(T, M, edge, edgeThickness, edgeHeight, edgeDepth, edgeColor,
      edgeBounds.maxX + edgeOffset, edgeY, (edgeBounds.minZ + edgeBounds.maxZ) / 2, .035);
    // Keep the four sides as a garden edge instead of a wall.  Each bush is
    // presentation-only and remains outside the native bounds: with a .6m
    // depth and a .4m centre offset, its nearest nominal edge is still .1m
    // beyond the playable boundary.  Four-metre segments keep the compiled
    // greenery light on phones while reading as one continuous planting band.
    const plantSpacing = 4.2, plantWidth = 4.8, plantDepth = .6;
    const addPlantBand = (horizontal, fixed) => {
      if (!M || typeof M.bush !== 'function') return;
      const min = horizontal ? edgeBounds.minX : edgeBounds.minZ;
      const max = horizontal ? edgeBounds.maxX : edgeBounds.maxZ;
      const count = Math.max(1, Math.ceil((max - min) / plantSpacing));
      for (let i = 0; i < count; i++) {
        const along = min + (i + .5) * (max - min) / count;
        const bush = horizontal
          ? M.bush(edge, along, fixed, plantWidth, plantDepth)
          : M.bush(edge, fixed, along, plantWidth, plantDepth);
        if (!horizontal) bush.rotation.y = Math.PI / 2;
        bush.position.y = edgeY + edgeHeight / 2 - .02;
      }
    };
    addPlantBand(true, edgeBounds.minZ - edgeOffset);
    addPlantBand(true, edgeBounds.maxZ + edgeOffset);
    addPlantBand(false, edgeBounds.minX - edgeOffset);
    addPlantBand(false, edgeBounds.maxX + edgeOffset);

    const windowEntries = [];
    const windowMaterials = { cream: 0xf1d7b0, peach: 0xd89b7d, mint: 0x86aaa0, blue: 0x7899a0, default: 0xd9c7ad };
    const palette = DISTANT_FACADE_COLORS;
    const streetKit = root && root.CozyStreetKit && typeof root.CozyStreetKit.building === 'function'
      ? root.CozyStreetKit
      : null;
    const makeEdgeRow = (count, edge) => {
      const horizontal = edge === 'north' || edge === 'south';
      const edgeIndex = { north: 0, east: 1, south: 2, west: 3 }[edge] || 0;
      const span = horizontal ? edgeBounds.maxX - edgeBounds.minX : edgeBounds.maxZ - edgeBounds.minZ;
      const depthProfile = [4.8, 5.2, 5.6, 4.95, 5.35];
      const facadeSetback = 2, canopyProjection = .95;
      const step = span / count;
      for (let i = 0; i < count; i++) {
        const localWidth = Math.max(4.8, Math.min(6.2, step - .10));
        const depth = depthProfile[(i + edgeIndex * 2) % depthProfile.length];
        const h = [3.7, 4.35, 5.05, 4.15, 5.55, 4.7][(i + edgeIndex * 2) % 6];
        // A slight tangential stagger breaks the rigid four-sided wall while
        // keeping every house and its camera obstacle inside the same row.
        const along = (i + .5) * step + ((i % 3) - 1) * .22;
        let x, z, facadeSide;
        if (edge === 'north') {
          x = edgeBounds.minX + along;
          z = edgeBounds.minZ - depth / 2 - facadeSetback - canopyProjection;
          facadeSide = 'front';
        } else if (edge === 'south') {
          x = edgeBounds.minX + along;
          z = edgeBounds.maxZ + depth / 2 + facadeSetback + canopyProjection;
          facadeSide = 'back';
        } else if (edge === 'west') {
          x = edgeBounds.minX - depth / 2 - facadeSetback - canopyProjection;
          z = edgeBounds.minZ + along;
          facadeSide = 'right';
        } else {
          x = edgeBounds.maxX + depth / 2 + facadeSetback + canopyProjection;
          z = edgeBounds.minZ + along;
          facadeSide = 'left';
        }
        const cameraDepth = depth + canopyProjection;
        const worldW = horizontal ? localWidth : cameraDepth;
        const worldD = horizontal ? cameraDepth : localWidth;
        context.userData.cameraObstacles.push({ x, z, w: worldW, d: worldD, height: h });
        const seed = `edge-${edge}-${i}`;
        const facadeColor = DISTANT_FACADE_COLORS[(edgeIndex * 3 + Math.floor(i / 3) * 2 + i) % DISTANT_FACADE_COLORS.length];
        const surface = (i + edgeIndex) % 4 === 1 ? 'tile' : undefined;
        let building = null;
        if (streetKit) {
          try {
            const result = streetKit.building(context, {
              w: localWidth,
              d: depth,
              height: h,
              kind: ['bakery', 'tea', 'flower', 'food'][i % 4],
              seed,
              label: ['小城麵包', '巷口茶屋', '日常花屋', '良食堂'][i % 4],
              facadeSide,
              facadeColor,
              surface
            });
            building = result && result.group ? result.group : result;
          } catch (error) {
            building = null;
          }
        }
        if (!building) {
          building = makeGroup(T, M, context, x, 0, z);
          makeBox(T, M, building, localWidth, h, depth, facadeColor, 0, h / 2, 0, .1);
          makeBox(T, M, building, localWidth * .94, .14, depth * .94, DISTANT_ROOF_COLORS[(i + edgeIndex) % DISTANT_ROOF_COLORS.length], 0, h + .07, 0, .03);
        }
        if (!building.parent && typeof context.add === 'function') context.add(building);
        if (building.position && typeof building.position.set === 'function') building.position.set(x, 0, z);
        building.userData = { ...(building.userData || {}), contextOnly: true, nonInteractive: true, noCollision: true };
        building.name = `distant-street-house-${edge}-${i}`;
        // Background contact planes do not help the distant silhouette and
        // would otherwise become one extra retained draw unit per house.
        const contactPlanes = [];
        building.traverse?.(mesh => { if (mesh.userData?.contactShadow) contactPlanes.push(mesh); });
        contactPlanes.forEach(mesh => mesh.parent?.remove(mesh));
        stats.distantBuildings += 1;
        stats.distantStreetHouses = (stats.distantStreetHouses || 0) + 1;
      }
    };
    const makeHorizonRow = (count, edge, layer) => {
      const edgeIndex = { north: 0, east: 1, south: 2, west: 3 }[edge] || 0;
      const baseSpan = edge === 'north' || edge === 'south' ? width : depth;
      // Three compact rings give the skyline a readable street-to-horizon
      // falloff.  The middle ring is deliberately close enough to fill the
      // green/fog band, while the far ring stays well outside the playable
      // bounds and remains a soft, low-midrise backdrop.
      const span = baseSpan * (layer === 0 ? 1.15 : (layer === 1 ? 1.45 : 1.85));
      const alongInset = (span - baseSpan) / 2;
      const margin = layer === 0 ? 15 : (layer === 1 ? 31 : 52);
      // Keep the far ring readable as small groups instead of a repeated
      // curtain.  Each four-building cluster gets a different height band;
      // widths and depths vary within that band to leave small slices of sky.
      const widthProfile = layer === 0
        ? [5.4, 7.2, 6.1, 8.0, 5.0, 6.6, 7.5]
        : (layer === 1
          ? [6.3, 7.8, 9.1, 5.8, 8.4, 6.9, 9.2]
          : [6.2, 8.1, 9.5, 6.4, 10.2, 7.6, 6.8, 9.1, 8.3]);
      const depthProfile = layer === 0
        ? [3.4, 4.5, 3.8, 5.1, 3.6]
        : (layer === 1 ? [3.6, 4.8, 4.1, 5.2, 3.8] : [3.8, 4.8, 4.2, 5.5, 4.0, 4.9]);
      const nearFloorBands = [2, 4, 3, 5, 2, 4, 3];
      const middleFloorBands = [2, 3, 4, 3, 5, 2, 4, 3];
      const farFloorBands = [2, 3, 4, 2, 5, 3, 4, 3, 2];
      for (let i = 0; i < count; i++) {
        const t = (i + .5) / count;
        const cluster = Math.floor(i / 4);
        const profile = (cluster + edgeIndex * 2 + layer * 3) % widthProfile.length;
        const widthJitter = ((i % 3) - 1) * .18;
        const w = Math.max(3.5, widthProfile[profile] + widthJitter);
        const d = depthProfile[(i + edgeIndex * 2 + layer) % depthProfile.length];
        const floorBands = layer === 0 ? nearFloorBands : (layer === 1 ? middleFloorBands : farFloorBands);
        const floorBand = floorBands[(cluster + edgeIndex + layer) % floorBands.length];
        const floorDelta = layer === 0
          ? ((i + edgeIndex) % 3 === 0 ? 1 : 0)
          : ((i + edgeIndex) % 4 === 0 ? 1 : ((i + edgeIndex) % 5 === 0 ? -1 : 0));
        const massMode = (i + cluster * 2 + edgeIndex + layer) % 6;
        const landmark = massMode === 0 && (layer === 0 ? cluster % 5 === 0 : layer === 1 ? cluster % 4 === 0 : cluster % 3 === 0);
        const floors = Math.max(2, Math.min(landmark ? 6 : 5, floorBand + floorDelta));
        const h = 1.35 + floors * 1.35;
        const wave = (i % 4 - 1.5) * (.72 + layer * .24);
        const radialJitter = ((i + edgeIndex * 3 + layer) % 5 - 2) * (layer === 2 ? 2.8 : (layer === 1 ? 1.9 : 1.25));
        const rowMargin = Math.max(14, margin + radialJitter);
        let x, z;
        if (edge === 'north') { x = bounds.minX - alongInset + t * span + wave; z = bounds.minZ - rowMargin; }
        else if (edge === 'south') { x = bounds.minX - alongInset + t * span + wave; z = bounds.maxZ + rowMargin; }
        else if (edge === 'west') { x = bounds.minX - rowMargin; z = bounds.minZ - alongInset + t * span + wave; }
        else { x = bounds.maxX + rowMargin; z = bounds.minZ - alongInset + t * span + wave; }
        const towerLandmark = massMode === 0 && (layer === 0 ? cluster % 5 === 0 : layer === 1 ? cluster % 4 === 0 : cluster % 3 === 0);
        const towerHeight = towerLandmark ? (layer === 2 ? 1.08 : .92) : 0;
        const wingHeight = massMode === 3 ? .68 : (massMode === 4 ? .34 : 0);
        const detailRise = Math.max(towerHeight, wingHeight);
        context.userData.cameraObstacles.push({ x, z, w, d, height: h + detailRise + .06 });
        const colorValue = palette[(i + layer * 2 + edgeIndex * 2) % palette.length];
        const roofColor = DISTANT_ROOF_COLORS[(i + layer + edgeIndex) % DISTANT_ROOF_COLORS.length];
        const building = makeGroup(T, M, context, x, 0, z);
        building.name = `distant-horizon-${layer}-${edge}-${i}`;
        building.userData.contextOnly = true;
        building.userData.nonInteractive = true;
        building.userData.noCollision = true;
        // Stepped podiums/terraces are more useful here than extra towers:
        // they break the long roof line while keeping the skyline low and
        // varied.  Use them in a few middle/far clusters and only occasionally
        // in the near ring so the native windows still read clearly.
        const setback = (layer === 0 && (massMode === 0 || (massMode === 3 && cluster % 3 === 0)))
          || (layer > 0 && (massMode === 0 || massMode === 3));
        const topW = setback ? w * .7 : w, topD = setback ? d * .72 : d;
        if (setback) {
          makeBox(T, M, building, w, h * .46, d, colorValue, 0, h * .23, 0, .1);
          makeBox(T, M, building, w * .98, .12, d * .98, roofColor, 0, h * .46 + .06, 0, .03);
          makeBox(T, M, building, topW, h * .54, topD, colorValue, 0, h * .73, 0, .08);
        } else makeBox(T, M, building, w, h, d, colorValue, 0, h / 2, 0, .1);
        makeBox(T, M, building, topW * .94, .12, topD * .94, roofColor, 0, h + .06, 0, .03);
        if (towerHeight > 0) {
          const towerW = massMode === 1 ? topW * .24 : (massMode === 2 ? topW * .58 : topW * .42);
          const towerD = massMode === 1 ? topD * .38 : topD * .58;
          const towerX = massMode === 2 ? 0 : (i % 2 ? -topW * .16 : topW * .16);
          const towerZ = i % 3 === 0 ? topD * .08 : -topD * .1;
          makeBox(T, M, building, towerW, towerHeight, towerD, palette[(i + edgeIndex + 3) % palette.length], towerX, h + .06 + towerHeight / 2, towerZ, .04);
          if (massMode === 1) makeBox(T, M, building, towerW * .72, .08, towerD * .84, roofColor, towerX, h + .1 + towerHeight, towerZ, .02);
        }
        if (wingHeight > 0) {
          const wingSide = i % 2 ? -1 : 1;
          const wingW = topW * (massMode === 4 ? .2 : .28);
          makeBox(T, M, building, wingW, wingHeight, topD * .46, roofColor, wingSide * (topW / 2 - wingW / 2), h + .06 + wingHeight / 2, .04, .035);
        }
        if (layer > 0 && (i + edgeIndex + cluster * 2) % 7 === 0) {
          const hutW = Math.min(2.2, topW * .3), hutD = Math.min(1.45, topD * .34), hutH = layer === 2 ? .42 : .5;
          makeBox(T, M, building, hutW, hutH, hutD, palette[(i + edgeIndex + 1) % palette.length], -topW * .16, h + .06 + hutH / 2, topD * .12, .05);
          makeBox(T, M, building, hutW * 1.08, .08, hutD * 1.08, roofColor, -topW * .16, h + .06 + hutH + .04, topD * .12, .025);
        }
        const paneCount = Math.max(2, Math.min(4, Math.floor(w / 1.35)));
        const windowKey = ['cream', 'peach', 'mint', 'blue'][(i + layer + edgeIndex) % 4];
        for (let floor = 0; floor < floors; floor++) {
          const y = 1.05 + floor * 1.65;
          for (let pane = 0; pane < paneCount; pane++) {
            const faceW = setback && y > h * .46 ? topW : w, faceD = setback && y > h * .46 ? topD : d;
            const local = paneCount === 1 ? 0 : -faceW * .3 + (faceW * .6 * pane) / (paneCount - 1);
            for (const side of [-1, 1]) windowEntries.push({ x: x + local, y, z: z + side * (faceD / 2 + .045), sx: .46, sy: .72, sz: .04, materialKey: windowKey });
            if (pane < 2) for (const side of [-1, 1]) windowEntries.push({ x: x + side * (faceW / 2 + .045), y, z: z + (pane ? -.26 : .26) * faceD, sx: .04, sy: .72, sz: .46, materialKey: windowKey });
          }
        }
        stats.distantBuildings += 1;
      }
    };
    // Keep the near ring as four-sided low street houses.  They are placed
    // outside the playable bounds with a two-metre facade setback; only the
    // presentation group sees them, while the existing horizon ring remains
    // farther out as a second visual layer.
    makeEdgeRow(Math.ceil(width / 5.7), 'north');
    makeEdgeRow(Math.ceil(depth / 5.7), 'west');
    makeEdgeRow(Math.ceil(depth / 5.7), 'east');
    makeEdgeRow(Math.ceil(width / 5.7), 'south');
    const horizonWidthCount = Math.max(10, Math.ceil(width / 8.2));
    const horizonDepthCount = Math.max(10, Math.ceil(depth / 8.2));
    for (let layer = 0; layer < 3; layer++) {
      const countFactor = layer === 0 ? 1 : (layer === 1 ? .85 : 1.15);
      makeHorizonRow(Math.ceil(horizonWidthCount * countFactor), 'north', layer);
      makeHorizonRow(Math.ceil(horizonDepthCount * countFactor), 'east', layer);
      makeHorizonRow(Math.ceil(horizonWidthCount * countFactor), 'south', layer);
      makeHorizonRow(Math.ceil(horizonDepthCount * countFactor), 'west', layer);
    }
    // Keep distant geometry in spatial chunks. Compiling the whole ring into
    // one material batch gave each mesh city-wide bounds, so every phone drew
    // houses and windows behind its camera as well as the visible skyline.
    const chunks = new Map();
    function chunkAt(x, z) {
      const key = Math.floor((x - bounds.minX) / 24) + ':' + Math.floor((z - bounds.minZ) / 24);
      if (!chunks.has(key)) {
        const chunk = makeGroup(T, M, context, 0, 0, 0);
        chunk.name = 'city-context-chunk-' + key;
        chunk.userData.contextOnly = true;
        chunk.userData.nonInteractive = true;
        chunks.set(key, chunk);
      }
      return chunks.get(key);
    }
    for (const child of [...context.children]) {
      if (child === contextGround || child === edge) continue;
      chunkAt(child.position.x, child.position.z).add(child);
    }
    const windowChunks = new Map();
    for (const entry of windowEntries) {
      const chunk = chunkAt(entry.x, entry.z);
      if (!windowChunks.has(chunk)) windowChunks.set(chunk, []);
      windowChunks.get(chunk).push(entry);
    }
    for (const [chunk, entries] of windowChunks) {
      stats.distantWindows += addInstancedBoxes(T, M, chunk, entries, { x: 1, y: 1, z: 1 }, windowMaterials, 'city-distant-windows');
    }
    if (root.CozyStaticMesh) {
      for (const chunk of chunks.values()) root.CozyStaticMesh.compile(chunk, { mergeColorMaterials: true });
      root.CozyStaticMesh.compile(edge, { mergeColorMaterials: true });
    }
    stats.distantChunks = chunks.size;
  }

  function build(options) {
    const opts = options || {};
    const T = opts.T || root.THREE;
    const M = opts.M || root.CozyModels;
    const layout = opts.layout || {};
    if (!T || !M) throw new Error('CozyCityScenery.build requires THREE and CozyModels');
    const parent = opts.parent || new T.Group();
    const scenery = new T.Group();
    scenery.name = 'cozy-city-scenery';
    parent.add(scenery);
    const stats = {
      roads: 0, roadMarkings: 0, arrows: 0, curbLines: 0, sidewalkJoints: 0, crosswalks: 0, stopLines: 0, cornerPaving: 0, cornerCurbs: 0, drainGrates: 0, nodePatches: 0, lamps: 0, roadSigns: 0, trafficSignals: 0,
      blockPaving: 0, blockPavingInstances: 0, blockJoints: 0,
      buildings: 0, kitBuildings: 0, kitFallbacks: 0, windows: 0, windowFrames: 0, balconies: 0, waterTanks: 0, planters: 0,
      signs: 0, storefronts: 0, awningStripes: 0, aircon: 0,
      base: 0, parks: 0, trees: 0, streetTrees: 0, benches: 0, traffic: 0, labels: 0,
      junctionDetails: 0, junctionSigns: 0, junctionSignals: 0, scooterBays: 0, warmActivities: 0,
      junctionPresentationMeshes: 0, junctionPresentationTriangles: 0, junctionPresentationDrawUnits: 0,
      distantBuildings: 0, distantStreetHouses: 0, distantWindows: 0, distantBase: 0,
      children: 0
    };
    const segments = addRoads(T, M, scenery, layout, stats);
    addCityBase(T, M, scenery, layout, segments, stats);
    addBlockPaving(T, M, scenery, layout, segments, stats);
    addBuildings(T, M, scenery, layout, segments, stats);
    addJunctionPresentation(T, M, scenery, segments, stats);
    addParks(T, M, scenery, layout, stats);
    addTraffic(T, M, scenery, layout, stats);
    addDistrictLabels(T, M, scenery, layout, stats);
    addDistantContext(T, M, scenery, layout, segments, stats);
    scenery.userData.cityLayout = layout;
    scenery.userData.pedestrianRoutes = Array.isArray(layout.pedestrianRoutes) ? layout.pedestrianRoutes : [];
    scenery.userData.obstacles = Array.isArray(layout.obstacles) ? layout.obstacles : [];
    stats.children = scenery.children.length;
    return { group: scenery, stats };
  }

  return { build };
}));
