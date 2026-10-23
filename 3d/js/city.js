// Geometry builders for the OSM-derived city (buildings, roads, water, green, airport) and the 2033 layout.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const U = {                       // shared animated uniforms
  uT: { value: 0 },                      // 0 = 2026, 1 = 2033
  uNight: { value: 0 },
  uTime: { value: 0 },
};

// ---------- helpers ----------
export function ringsOf(flat, offsets, scale) {
  const out = [];
  for (let i = 0; i < offsets.length; i++) {
    const a = offsets[i], b = i + 1 < offsets.length ? offsets[i + 1] : flat.length;
    const r = [];
    for (let j = a; j < b; j += 2) r.push([flat[j] / scale, flat[j + 1] / scale]);
    out.push(r);
  }
  return out;
}
export const flatToPts = (f, s) => { const r = []; for (let j = 0; j < f.length; j += 2) r.push([f[j] / s, f[j + 1] / s]); return r; };
export function signedArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
export function pointInRing(x, z, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi)) c = !c;
  }
  return c;
}
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// Flat polygon -> BufferGeometry at height y (faces up).
export function flatPolys(rings, y, colorFn) {
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  rings.forEach((r0, k) => {
    if (r0.length < 3) return;
    const r = signedArea(r0) > 0 ? r0 : r0.slice().reverse();
    const pts = r.map(p => new THREE.Vector2(p[0], p[1]));
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch (e) { return; }
    const base = pos.length / 3;
    colorFn(c, k);
    for (const p of r) { pos.push(p[0], y, p[1]); col.push(c.r, c.g, c.b); }
    for (const t of tris) idx.push(base + t[0], base + t[2], base + t[1]);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Polyline -> mitered ribbon. attribute aRoad = (along metres, across 0..1, width)
export function ribbons(lines, y, widthFn, colorFn) {
  const pos = [], col = [], rd = [], idx = [];
  const c = new THREE.Color();
  lines.forEach((pts, k) => {
    if (pts.length < 2) return;
    const w = widthFn(k) / 2;
    colorFn(c, k);
    const yy = typeof y === 'function' ? y(k) : y;
    const base = pos.length / 3;
    let along = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      let nx = -dz, nz = dx, m = 1;
      if (i > 0 && i < pts.length - 1) {
        const d1x = p[0] - a[0], d1z = p[1] - a[1], l1 = Math.hypot(d1x, d1z) || 1;
        const n1x = -d1z / l1, n1z = d1x / l1;
        const cos = nx * n1x + nz * n1z;
        m = Math.min(2.2, 1 / Math.max(0.45, cos));
      }
      if (i > 0) along += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      pos.push(p[0] + nx * w * m, yy, p[1] + nz * w * m, p[0] - nx * w * m, yy, p[1] - nz * w * m);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      rd.push(along, 0, w * 2, along, 1, w * 2);
      if (i > 0) { const v = base + i * 2; idx.push(v - 2, v, v - 1, v - 1, v, v + 1); }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aRoad', new THREE.Float32BufferAttribute(rd, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

// ---------- materials ----------
const WINDOW_GLSL = /* glsl */`
  float whash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;
// Patch a Lambert/Standard material: windows on walls, night emissive, 2026->2033 grow/sink per building.
export function patchBuildingMaterial(mat, { instanced = false, glass = false } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uT = U.uT; sh.uniforms.uNight = U.uNight; sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uT; varying vec2 vWin; varying float vRoof; varying float vSeed; varying float vDistB;
        ${instanced ? 'attribute vec3 aI;' : 'attribute float aWin; attribute vec4 aB;'}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${instanced ? `
          vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec3 lp = position * sc;
          vWin = vec2(lp.x + lp.z + aI.y * 3.0, lp.y);
          vRoof = step(0.5, normal.y);
          vSeed = aI.x;
        ` : `
          float sink = aB.x > 0.5 && aB.x < 1.5 ? uT : 0.0;
          float grow = aB.x > 1.5 ? smoothstep(0.35, 1.0, uT) * aB.y / 50.0 : 0.0;
          transformed.y = transformed.y * (1.0 + grow) * (1.0 - sink) - sink * 4.0;
          vWin = vec2(aWin * 0.25, transformed.y);
          vRoof = step(0.5, normal.y);
          vSeed = aB.z / 255.0;
        `}`);
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvDistB = -mvPosition.z;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight; uniform float uTime; varying vec2 vWin; varying float vRoof; varying float vSeed; varying float vDistB; ${WINDOW_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float winMask = 0.0; float winRnd = 0.0;
        if (vRoof < 0.5) {
          vec2 cell = vec2(vWin.x / ${glass ? '2.4' : '3.4'}, (vWin.y - 0.6) / 3.3);
          vec2 f = fract(cell); vec2 id = floor(cell);
          winMask = step(${glass ? '0.06' : '0.2'}, f.x) * step(f.x, ${glass ? '0.94' : '0.8'}) * step(0.22, f.y) * step(f.y, 0.86) * step(0.0, cell.y);
          winRnd = whash(id + vec2(vSeed * 91.7, vSeed * 13.3));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.42 + vec3(0.06, 0.1, 0.16), winMask * ${glass ? '0.75' : '0.7'} * smoothstep(2600.0, 900.0, vDistB));
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float lit = winMask * step(${glass ? '0.35' : '0.5'}, winRnd) * uNight;
        vec3 wc = mix(vec3(1.0, 0.78, 0.45), vec3(0.7, 0.85, 1.0), step(0.82, winRnd));
        totalEmissiveRadiance += lit * wc * ${glass ? '1.1' : '0.95'};
        totalEmissiveRadiance += (1.0 - vRoof) * uNight * diffuseColor.rgb * 0.05;`);
  };
  mat.customProgramCacheKey = () => 'bld' + (instanced ? 'I' : '') + (glass ? 'G' : '');
  return mat;
}

// depth material that applies the same grow/sink so shadows match
export function buildingDepthMaterial() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uT = U.uT;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uT; attribute vec4 aB;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float sink = aB.x > 0.5 && aB.x < 1.5 ? uT : 0.0;
        float grow = aB.x > 1.5 ? smoothstep(0.35, 1.0, uT) * aB.y / 50.0 : 0.0;
        transformed.y = transformed.y * (1.0 + grow) * (1.0 - sink) - sink * 4.0;`);
  };
  return m;
}

export function patchRoadMaterial(mat, runway = false) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = U.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRoad; varying vec3 vRoad; varying float vDist;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDist = -mvPosition.z;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; varying vec3 vRoad; varying float vDist;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float w = vRoad.z; float a = vRoad.y; float s = vRoad.x;
        float near = smoothstep(${runway ? '1800.0' : '420.0'}, ${runway ? '600.0' : '160.0'}, vDist);
        float edge = (step(a, 0.6 / w) + step(1.0 - 0.6 / w, a)) * step(9.0, w);
        float lanes = floor(w / 3.4);
        float lane = abs(fract(a * lanes) - 0.5);
        float dash = step(0.5, fract(s / 9.0)) * step(lane, 0.12 / w * lanes) * step(9.0, w) * step(0.12, a) * step(a, 0.88);
        ${runway ? `
          float centre = step(abs(a - 0.5), 0.012) * step(0.45, fract(s / 60.0));
          float thr = (step(s, 60.0) + step(vRoad.x, 0.0)) * step(0.5, fract(a * 12.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95), clamp(centre + edge, 0.0, 1.0) * near);
        ` : `
          float yellow = step(abs(a - 0.5), 0.35 / w) * step(14.0, w);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), clamp(edge * 0.8 + dash * 0.9, 0.0, 1.0) * near);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.75, 0.2), yellow * near);
        `}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uNight * vec3(0.10, 0.075, 0.04) * smoothstep(0.0, 0.5, 1.0 - abs(a - 0.5) * 2.0) * step(9.0, w);`);
  };
  mat.customProgramCacheKey = () => 'road' + (runway ? 'R' : '');
  return mat;
}

export function waterMaterial() {
  const m = new THREE.MeshPhongMaterial({ color: 0x2d6e8e, specular: 0xbfe6ff, shininess: 90, transparent: true, opacity: 0.94 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uNight = U.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uNight; varying vec3 vWP;')
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        vec2 q = vWP.xz * 0.045;
        float wv = sin(q.x * 3.1 + uTime * 1.3) * cos(q.y * 2.7 - uTime * 1.1) + sin((q.x + q.y) * 5.3 + uTime * 2.0) * 0.5;
        normal = normalize(normal + vec3(wv * 0.07, 0.0, cos(q.y * 3.3 + uTime) * 0.07));`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.02,0.05,0.09) * (1.0 - uNight);');
  };
  return m;
}

// ---------- buildings ----------
const PALETTE = [0xe9e4da, 0xd8d2c4, 0xc9c2b4, 0xbfb8ad, 0xd9c7b0, 0xc7b39a, 0xb8a58e, 0xe2d9cb, 0xa9a39a, 0xcfd3d6, 0xb9c2c9, 0xd6cfc0];
const TALL = [0x9fb4c4, 0x8ea6b8, 0xa8b7c2, 0x7f97aa, 0xb6c3cc];
export async function buildBuildings(D, limit = Infinity, tileSize = 900, yieldFrame = () => Promise.resolve()) {
  const S = D.scale, B = D.buildings;
  const n = Math.min(B.h.length, limit);
  const tiles = new Map();
  const footprints = [];   // for collisions
  let ptr = 0;
  let lastYield = performance.now();
  for (let i = 0; i < n; i++) {
    if (i % 512 === 0 && performance.now() - lastYield > 12) { await yieldFrame(); lastYield = performance.now(); }
    const np = B.n[i];
    let r = [], x = 0, z = 0;
    for (let j = 0; j < np; j++) { x += B.c[ptr++]; z += B.c[ptr++]; r.push([x / S, z / S]); }
    if (r.length < 3) continue;
    if (signedArea(r) < 0) r.reverse();
    let cx = 0, cz = 0; for (const p of r) { cx += p[0]; cz += p[1]; } cx /= r.length; cz /= r.length;
    const key = Math.floor(cx / tileSize) + ',' + Math.floor(cz / tileSize);
    if (!tiles.has(key)) tiles.set(key, []);
    const g = B.g[i] / 10;
    tiles.get(key).push({ r, h: B.h[i], f: B.f[i], g, seed: hash(i), cx, cz });
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const p of r) { if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]; if (p[1] < minz) minz = p[1]; if (p[1] > maxz) maxz = p[1]; }
    footprints.push({ r, f: B.f[i], h: B.h[i], minx, maxx, minz, maxz });
  }
  const mat = patchBuildingMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const depth = buildingDepthMaterial();
  const group = new THREE.Group();
  const col = new THREE.Color(), roofC = new THREE.Color();
  for (const [key, list] of tiles) {
    let nv = 0; for (const b of list) nv += b.r.length * 4 + b.r.length;
    const P = new Float32Array(nv * 3), N = new Int8Array(nv * 3), C = new Uint8Array(nv * 3), W = new Uint16Array(nv), A = new Uint8Array(nv * 4);
    const idx = [];
    let v = 0;
    for (const b of list) {
      const { r, h, f, g, seed } = b;
      const tall = h > 45;
      col.setHex(tall ? TALL[Math.floor(seed * TALL.length)] : PALETTE[Math.floor(seed * PALETTE.length)]);
      col.offsetHSL(0, 0, (hash(seed * 99) - 0.5) * 0.06);
      if (f === 1) col.lerp(new THREE.Color(0xd0d4d8), 0.5);
      roofC.copy(col).multiplyScalar(0.78);
      const cR = Math.round(col.r * 255), cG = Math.round(col.g * 255), cB = Math.round(col.b * 255);
      let per = 0;
      for (let i = 0; i < r.length; i++) {
        const p = r[i], q = r[(i + 1) % r.length];
        const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz) || 1;
        const nx = dz / len, nz = -dx / len;
        const quad = [[p[0], 0, p[1], per], [q[0], 0, q[1], per + len], [q[0], h, q[1], per + len], [p[0], h, p[1], per]];
        for (const qv of quad) {
          P[v * 3] = qv[0]; P[v * 3 + 1] = qv[1]; P[v * 3 + 2] = qv[2];
          N[v * 3] = Math.round(nx * 127); N[v * 3 + 1] = 0; N[v * 3 + 2] = Math.round(nz * 127);
          C[v * 3] = cR; C[v * 3 + 1] = cG; C[v * 3 + 2] = cB;
          W[v] = Math.min(65535, Math.round(qv[3] * 4));
          A[v * 4] = f; A[v * 4 + 1] = Math.round(g * 50); A[v * 4 + 2] = Math.round(seed * 255);
          v++;
        }
        const b0 = v - 4; idx.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2);
        per += len;
      }
      const rb = v;
      for (const p of r) {
        P[v * 3] = p[0]; P[v * 3 + 1] = h; P[v * 3 + 2] = p[1];
        N[v * 3 + 1] = 127;
        C[v * 3] = Math.round(roofC.r * 255); C[v * 3 + 1] = Math.round(roofC.g * 255); C[v * 3 + 2] = Math.round(roofC.b * 255);
        W[v] = 0;
        A[v * 4] = f; A[v * 4 + 1] = Math.round(g * 50); A[v * 4 + 2] = Math.round(seed * 255);
        v++;
      }
      let tris = [];
      try { tris = THREE.ShapeUtils.triangulateShape(r.map(p => new THREE.Vector2(p[0], p[1])), []); } catch (e) { }
      for (const t of tris) idx.push(rb + t[0], rb + t[2], rb + t[1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3, true));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3, true));
    geo.setAttribute('aWin', new THREE.BufferAttribute(W, 1));
    geo.setAttribute('aB', new THREE.BufferAttribute(A, 4));
    geo.setIndex(idx.length > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    // enlarge bounds so grown buildings are not culled
    geo.boundingSphere.radius += 60;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = 'tile:' + key;
    group.add(mesh);
    if (performance.now() - lastYield > 12) { await yieldFrame(); lastYield = performance.now(); }
  }
  return { group, footprints, material: mat };
}

// ---------- generic low-poly props ----------
export function makeTreeGeometries() {
  const trunk = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 5); trunk.translate(0, 1.2, 0);
  const crownA = new THREE.IcosahedronGeometry(1, 0); crownA.scale(1.6, 1.5, 1.6); crownA.translate(0, 3.6, 0);
  const crownB = new THREE.ConeGeometry(1.5, 4.2, 6); crownB.translate(0, 4.2, 0);
  return { trunk, crownA, crownB };
}

export function makePlane() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f6f8 });
  const tailM = new THREE.MeshLambertMaterial({ color: 0x1f5fa8 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x33373d });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 34, 10), white); body.rotation.z = Math.PI / 2; g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 8), white); nose.position.x = 17; nose.scale.set(1.6, 1, 1); g.add(nose);
  const tailc = new THREE.Mesh(new THREE.ConeGeometry(2, 7, 10), white); tailc.rotation.z = Math.PI / 2; tailc.position.x = -20; g.add(tailc);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 34), white); wing.position.set(1, -0.6, 0); g.add(wing);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 12), white); stab.position.set(-20, 0.6, 0); g.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 0.5), tailM); fin.position.set(-20, 4, 0); g.add(fin);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 4, 8), dark); e.rotation.z = Math.PI / 2; e.position.set(3, -2, s * 7); g.add(e); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeTaxi() {
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.35, metalness: 0.25 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2633, roughness: 0.1, metalness: 0.6 });
  const black = new THREE.MeshLambertMaterial({ color: 0x2b2e33 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 0.8, roughness: 0.25 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.75, 4.5), yellow); body.position.y = 0.75; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.62, 2.4), glass); cabin.position.set(0, 1.42, -0.15); g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 2.0), yellow); roof.position.set(0, 1.76, -0.15); g.add(roof);
  const signMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd34d, emissiveIntensity: 0.6 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.3), signMat); sign.position.set(0, 1.94, -0.1); g.add(sign);
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14), black); w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); g.add(w); wheels.push(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 12), silver); hub.position.y = -Math.sign(x) * 0.15; w.add(hub);  // outer face (wheel is rotated 90° about z)
  }
  const hl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 0.3 });
  for (const x of [-0.65, 0.65]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.05), hl); l.position.set(x, 0.85, 2.26); g.add(l); }
  const tl = new THREE.MeshStandardMaterial({ color: 0x990000, emissive: 0xff2020, emissiveIntensity: 0.4 });
  for (const x of [-0.7, 0.7]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.05), tl); l.position.set(x, 0.85, -2.26); g.add(l); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { wheels, headMat: hl, signMat };
  return g;
}

export function makeTaipei101() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x5f8c8a, roughness: 0.25, metalness: 0.55, emissive: 0x0b3a3a, emissiveIntensity: 0.2 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(62, 90, 62), m); base.position.y = 45; g.add(base);
  let y = 90;
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(30, 22, 31, 4, 1), m);
    seg.rotation.y = Math.PI / 4; seg.position.y = y + 15.5; g.add(seg); y += 31;
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(24, 30, 24), m); top.position.y = y + 15; g.add(top); y += 30;
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.5, 60, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0.3 }));
  spire.position.y = y + 30; g.add(spire);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.mat = m;
  return g;
}

export function makeGrandHotel() {
  const g = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0xb52a1e });
  const roof = new THREE.MeshLambertMaterial({ color: 0xd9a520 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(160, 50, 40), red); body.position.y = 25; g.add(body);
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(4, 52, 22, 4, 1), roof); r.rotation.y = Math.PI / 4; r.scale.set(2.1, 1, 0.75);
    r.position.y = 61 + i * 14; r.scale.multiplyScalar(1 - i * 0.3); g.add(r);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeFerrisWheel() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xff4fa3, emissive: 0xff2a8a, emissiveIntensity: 0.3, roughness: 0.4 });
  const wheel = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(35, 0.9, 6, 48), m); wheel.add(ring);
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.6, 70, 0.6), m); s.rotation.z = i * Math.PI / 12; wheel.add(s);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshLambertMaterial({ color: [0xffd23f, 0x4fc3ff, 0x9cff57][i % 3] }));
    const a = i * Math.PI / 6; cab.position.set(Math.cos(a) * 35, Math.sin(a) * 35, 0); wheel.add(cab);
  }
  wheel.position.y = 70; g.add(wheel);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(2, 72, 2), m);
  for (const s of [-1, 1]) { const l = leg.clone(); l.position.set(s * 12, 36, 0); l.rotation.z = s * 0.17; g.add(l); }
  g.userData.wheel = wheel; g.userData.mat = m;
  return g;
}

export { mergeGeometries };
