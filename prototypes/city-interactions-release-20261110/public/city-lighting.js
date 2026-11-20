/*
 * Cached emissive lighting for the Taipei toy-city candidate.
 *
 * The collector runs once at startup.  It only touches materials that already
 * emit light or very small warm-coloured lamp spheres, so opaque walls and the
 * large static colour batches remain unchanged.  No PointLight is created by
 * this module; world.js owns the two nearest-store lights and player fill.
 */
(function (root, factory) {
  const api = factory();
  if (root) root.CozyCityLighting = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_WARM = 0xffe6ad;
  const MAX_MULTIPLIER = 1.8;

  function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return n < 0 ? 0 : n > 1 ? 1 : n;
  }

  function materialsOf(mesh) {
    const material = mesh && mesh.material;
    if (!material) return [];
    return Array.isArray(material) ? material.filter(Boolean) : [material];
  }

  function pathName(mesh) {
    const names = [];
    let node = mesh;
    while (node && names.length < 10) {
      if (node.name) names.push(String(node.name).toLowerCase());
      node = node.parent;
    }
    return names.join('/');
  }

  function colorHex(color) {
    if (!color) return 0;
    if (typeof color.getHex === 'function') return color.getHex() & 0xffffff;
    if (Number.isFinite(color.hex)) return color.hex & 0xffffff;
    const r = Math.round(Number(color.r || 0) * 255);
    const g = Math.round(Number(color.g || 0) * 255);
    const b = Math.round(Number(color.b || 0) * 255);
    return (r << 16) | (g << 8) | b;
  }

  function hasEmissive(material) {
    const emissive = material && material.emissive;
    return !!emissive && colorHex(emissive) !== 0;
  }

  function warmColour(hex) {
    const value = hex & 0xffffff;
    const r = value >> 16 & 255;
    const g = value >> 8 & 255;
    const b = value & 255;
    return r >= g && g >= b && r - b >= 12 && r >= 150 && g >= 105;
  }

  function smallWarmSphere(mesh, material, path) {
    if (!mesh || !material || material.transparent) return false;
    const geometry = mesh.geometry;
    const type = String(geometry && geometry.type || '');
    const radius = Number(geometry && geometry.parameters && geometry.parameters.radius);
    if (!/sphere/i.test(type) || !Number.isFinite(radius) || radius > .24) return false;
    const hex = colorHex(material.color);
    if (!warmColour(hex)) return false;
    // Named lamp/lantern nodes are authoritative.  The radius fallback covers
    // native glow spheres without making opaque building geometry emissive.
    return /lamp|lantern|street-light|store-window|window-light/.test(path) || radius <= .2;
  }

  function makeColor(THREE, hex) {
    if (THREE && typeof THREE.Color === 'function') return new THREE.Color(hex);
    return { hex: hex & 0xffffff, setHex(value) { this.hex = value & 0xffffff; }, getHex() { return this.hex & 0xffffff; } };
  }

  function setHex(color, hex) {
    if (!color) return;
    if (typeof color.setHex === 'function') color.setHex(hex);
    else color.hex = hex & 0xffffff;
  }

  function collect(THREE, outside) {
    const nodes = [];
    const usages = new Map();
    const visit = mesh => {
      if (!mesh || !mesh.material) return;
      const materials = materialsOf(mesh);
      nodes.push({ mesh, path: pathName(mesh), materials });
      for (const material of materials) usages.set(material, (usages.get(material) || 0) + 1);
    };
    if (outside && typeof outside.traverse === 'function') outside.traverse(visit);
    else if (outside && outside.material) visit(outside);

    const candidates = new Map();
    for (const entry of nodes) {
      for (const material of entry.materials) {
        const existing = hasEmissive(material);
        const inferred = !existing && smallWarmSphere(entry.mesh, material, entry.path);
        if (!existing && !inferred) continue;
        const current = candidates.get(material) || { material, existing: false, inferred: 0, usage: usages.get(material) || 1, warmHex: DEFAULT_WARM };
        current.existing = current.existing || existing;
        if (inferred) {
          current.inferred += 1;
          current.warmHex = colorHex(material.color) || DEFAULT_WARM;
        }
        candidates.set(material, current);
      }
    }

    const records = [];
    for (const candidate of candidates.values()) {
      // A new emissive channel is only introduced when the shared material is
      // used exclusively by inferred lamp spheres; intentional emissive
      // materials are already safe to animate across their native instances.
      if (!candidate.existing && candidate.inferred < candidate.usage) continue;
      const material = candidate.material;
      const emissive = material.emissive;
      records.push({
        material,
        inferred: !candidate.existing,
        warmHex: candidate.warmHex,
        baseEmissiveHex: emissive ? colorHex(emissive) : 0,
        baseIntensity: Number.isFinite(Number(material.emissiveIntensity)) ? Number(material.emissiveIntensity) : 0
      });
    }
    return records;
  }

  function create(THREE, outside) {
    // Optional object form for local tooling; the public form is
    // create(THREE, outside).
    if (THREE && !THREE.Color && THREE.THREE) {
      outside = THREE.outside;
      THREE = THREE.THREE;
    }
    const records = collect(THREE, outside);
    let lastLevel = 0;

    function apply(values) {
      const input = values || {};
      const level = Math.max(clamp01(input.nightFactor), clamp01(input.warmFactor));
      const multiplier = 1 + .8 * level;
      for (const record of records) {
        const material = record.material;
        if (!material.emissive) material.emissive = makeColor(THREE, record.warmHex || DEFAULT_WARM);
        if (record.inferred && record.baseEmissiveHex === 0) setHex(material.emissive, record.warmHex || DEFAULT_WARM);
        else if (!record.inferred) setHex(material.emissive, record.baseEmissiveHex);
        material.emissiveIntensity = record.inferred
          ? .9 * level
          : Math.min(record.baseIntensity * MAX_MULTIPLIER, record.baseIntensity * multiplier);
      }
      lastLevel = level;
      return { materials: records.length, level, multiplier };
    }

    function restore() {
      for (const record of records) {
        const material = record.material;
        if (material.emissive) setHex(material.emissive, record.baseEmissiveHex);
        material.emissiveIntensity = record.baseIntensity;
      }
      lastLevel = 0;
      return { materials: records.length, level: 0, multiplier: 1 };
    }

    return Object.freeze({
      apply,
      restore,
      stats() { return { materials: records.length, level: lastLevel, maxMultiplier: MAX_MULTIPLIER }; },
      materials: records.length
    });
  }

  return Object.freeze({ create, MAX_MULTIPLIER });
}));
