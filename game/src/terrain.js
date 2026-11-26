// Emberline Air — terrain, sky, water and landmarks.
// One job: build every static piece of the Meridian Archipelago and answer
// groundHeight(x, z), the one number the physics, the camera and the minimap
// all trust. Deterministic: a hashed noise field, no Math.random at runtime.

import * as THREE from 'three';
import { WORLD, ISLANDS, RING_COURSE, STRIPS, COLORS } from './config.js';

// Small deterministic hash-noise in [0, 1).
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Ground height in metres. Islands are smooth cones with a noise skirt so
// ridges read as terrain instead of geometry. The ground is flattened around
// every airstrip so a runway is a runway, not a hillside.
export function groundHeight(x, z) {
  let h = baseHeight(x, z);
  for (const strip of STRIPS) {
    const dx = x - strip.x, dz = z - strip.z;
    const hd = (strip.heading * Math.PI) / 180;
    const along = Math.abs(dx * Math.sin(hd) - dz * Math.cos(hd));
    const across = Math.abs(dx * Math.cos(hd) + dz * Math.sin(hd));
    const L = strip.length / 2 + 80, W = strip.width / 2 + 60;
    if (along < L && across < W) {
      const t = Math.max(0, 1 - Math.max(along / L, across / W));
      const s = t * t * (3 - 2 * t);
      h = h * (1 - s) + baseHeight(strip.x, strip.z) * s;
    }
  }
  return Math.max(0, h - 2);
}

function baseHeight(x, z) {
  let h = 0;
  for (const isl of ISLANDS) {
    const dx = x - isl.x, dz = z - isl.z;
    const d = Math.sqrt(dx * dx + dz * dz) / isl.radius;
    if (d >= 1) continue;
    const cone = Math.pow(Math.max(0, 1 - d), 1.6);
    const ridge = 1 + 0.35 * (noise2(x * 0.004 + isl.x, z * 0.004) - 0.5) * cone;
    h += isl.height * cone * ridge;
  }
  // Gentle swell far from islands so the sea horizon is never a flat disc.
  h += 2.5 * noise2(x * 0.001, z * 0.001);
  return h;
}

function terrainColor(h, isl) {
  const t = isl ? h / isl.height : 0;
  if (t < isl.beach) return isl.sand;
  if (t > isl.rock) return isl.rockColor;
  return isl.color;
}

export function buildTerrain(scene) {
  const group = new THREE.Group();
  group.name = 'terrain';

  // --- Island heightfield -------------------------------------------------
  const SEG = 110;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cTmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    // Nearest island decides the palette band.
    let best = null, bestD = Infinity;
    for (const isl of ISLANDS) {
      const d = Math.hypot(x - isl.x, z - isl.z) / isl.radius;
      if (d < bestD) { bestD = d; best = isl; }
    }
    if (h <= 0.5) cTmp.setHex(0xd9c98f); // sand rim at the waterline
    else cTmp.setHex(terrainColor(h, best));
    // Speckle so flat shading reads as ground, not plastic.
    const sp = 0.92 + 0.16 * hash2(x * 0.7, z * 0.7);
    colors[i * 3] = cTmp.r * sp;
    colors[i * 3 + 1] = cTmp.g * sp;
    colors[i * 3 + 2] = cTmp.b * sp;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const land = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  land.name = 'islands';
  group.add(land);

  // --- Sea ------------------------------------------------------------------
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size * 2.2, WORLD.size * 2.2, 1, 1),
    new THREE.MeshLambertMaterial({ color: COLORS.water, transparent: true, opacity: 0.94 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = WORLD.waterLevel;
  sea.name = 'sea';
  group.add(sea);

  // --- Sky dome, sun, clouds ------------------------------------------------
  const skyGeo = new THREE.SphereGeometry(6000, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(COLORS.sky) },
      bottom: { value: new THREE.Color(COLORS.skyHorizon) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bottom; void main(){ float t = clamp(normalize(vP).y * 1.6 + 0.25, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = 'sky';
  group.add(sky);

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(180, 24),
    new THREE.MeshBasicMaterial({ color: COLORS.sun, fog: false }),
  );
  sun.position.set(-2600, 1500, -4200);
  sun.lookAt(0, 0, 0);
  sun.name = 'sun';
  group.add(sun);

  // Puffy low-poly clouds: clusters of flattened icosahedrons. Unlit white
  // so they read as clouds from every angle (Lambert shading made the
  // shadowed faces look like grey floating rocks).
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
  const cloudGeo = new THREE.IcosahedronGeometry(1, 0);
  const clouds = new THREE.Group();
  clouds.name = 'clouds';
  for (let i = 0; i < 26; i++) {
    const cluster = new THREE.Group();
    const n = 3 + Math.floor(hash2(i, 7) * 3);
    for (let j = 0; j < n; j++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      const s = 60 + hash2(i * 3 + j, 11) * 90;
      puff.scale.set(s, s * 0.42, s * 0.7);
      puff.position.set((hash2(i, j) - 0.5) * 260, (hash2(j, i) - 0.5) * 24, (hash2(i + j, 3) - 0.5) * 120);
      cluster.add(puff);
    }
    cluster.position.set((hash2(i, 1) - 0.5) * WORLD.size * 0.9, 420 + hash2(i, 2) * 260, (hash2(i, 3) - 0.5) * WORLD.size * 0.9);
    clouds.add(cluster);
  }
  group.add(clouds);

  // --- Landmarks: lighthouse, hangar, windsocks, volcano smoke -------------
  const home = ISLANDS[0];
  const lh = new THREE.Group();
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 9, 46, 10),
    new THREE.MeshLambertMaterial({ color: 0xf2ede2, flatShading: true }),
  );
  tower.position.y = 23;
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(6.4, 7.4, 10, 10),
    new THREE.MeshLambertMaterial({ color: 0xd43d2a, flatShading: true }),
  );
  stripe.position.y = 26;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(5, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0 }),
  );
  lamp.position.y = 49;
  lh.add(tower, stripe, lamp);
  lh.position.set(home.lighthouse.x, groundHeight(home.lighthouse.x, home.lighthouse.z), home.lighthouse.z);
  lh.name = 'lighthouse';
  group.add(lh);

  const hangar = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 16, 34, 12, 1, false, 0, Math.PI),
    new THREE.MeshLambertMaterial({ color: 0xc96a2e, flatShading: true }),
  );
  hangar.rotation.z = Math.PI / 2;
  hangar.rotation.y = 0.6;
  hangar.position.set(home.hangar.x, groundHeight(home.hangar.x, home.hangar.z) + 2, home.hangar.z);
  hangar.name = 'hangar';
  group.add(hangar);

  // Volcano smoke column over Ashen Peak.
  const smokeMat = new THREE.MeshLambertMaterial({ color: 0x555550, flatShading: true, transparent: true, opacity: 0.85 });
  const smoke = new THREE.Group();
  smoke.name = 'volcano-smoke';
  for (let i = 0; i < 7; i++) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(14 + i * 6, 0), smokeMat);
    puff.position.set((hash2(i, 5) - 0.5) * 30, i * 26, (hash2(i, 9) - 0.5) * 30);
    smoke.add(puff);
  }
  const ash = ISLANDS[3];
  smoke.position.set(ash.volcano.x, ash.height + 10, ash.volcano.z);
  group.add(smoke);

  // --- Runway strips: dark asphalt + white centreline + threshold bars -----
  for (const strip of STRIPS) {
    const g = new THREE.Group();
    const h = groundHeight(strip.x, strip.z);
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(strip.length, strip.width),
      new THREE.MeshLambertMaterial({ color: 0x3a3f45 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.4;
    g.add(pad);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
    for (let i = -3; i <= 3; i++) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(18, 1.6), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(i * 48, 0.6, 0);
      g.add(dash);
    }
    for (const end of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(3, strip.width - 4), lineMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(end * (strip.length / 2 - 8), 0.6, 0);
      g.add(bar);
    }
    // Windsock on a pole at the strip's side.
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 12, 6),
      new THREE.MeshLambertMaterial({ color: 0xdddddd }),
    );
    pole.position.set(0, 6, strip.width / 2 + 8);
    const sock = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 9, 8),
      new THREE.MeshLambertMaterial({ color: 0xff7a1a, flatShading: true }),
    );
    sock.rotation.z = Math.PI / 2 - 0.35;
    sock.position.set(5, 11, strip.width / 2 + 8);
    g.add(pole, sock);
    g.position.set(strip.x, h + 0.5, strip.z);
    g.rotation.y = -strip.heading * Math.PI / 180;
    g.name = `strip-${strip.id}`;
    group.add(g);
  }

  // --- Sky rings ------------------------------------------------------------
  const rings = new THREE.Group();
  rings.name = 'rings';
  const ringGeo = new THREE.TorusGeometry(1, 0.09, 10, 40);
  RING_COURSE.forEach((def, i) => {
    const mat = new THREE.MeshBasicMaterial({ color: COLORS.ring, transparent: true, opacity: 0.95 });
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.scale.setScalar(def.r);
    ring.position.set(def.x, def.y, def.z);
    ring.rotation.y = Math.atan2(-def.x, -def.z) + def.tilt;
    ring.userData.index = i;
    ring.userData.baseR = def.r;
    ring.name = `ring-${i}`;
    rings.add(ring);
    // A small floating chevron above the next ring so it reads at distance.
    const chev = new THREE.Mesh(
      new THREE.ConeGeometry(4, 10, 4),
      new THREE.MeshBasicMaterial({ color: COLORS.ringNext }),
    );
    chev.position.set(def.x, def.y + def.r + 16, def.z);
    chev.rotation.x = Math.PI;
    chev.name = `ring-chevron-${i}`;
    rings.add(chev);
  });
  group.add(rings);

  // --- Floating name labels over the landmarks ------------------------------
  const labels = new THREE.Group();
  labels.name = 'labels';
  for (const isl of ISLANDS) {
    const sprite = makeTextSprite(isl.label, 44);
    sprite.position.set(isl.x, isl.height + 150, isl.z);
    sprite.scale.set(340, 42, 1);
    labels.add(sprite);
  }
  group.add(labels);

  scene.add(group);
  return { group, rings, clouds, smoke };
}

// A canvas-text sprite: crisp, readable, no font files to ship.
export function makeTextSprite(text, fontPx = 44) {
  const pad = 18;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = `bold ${fontPx}px Arial, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  cv.width = w;
  cv.height = fontPx + pad * 2;
  const c2 = cv.getContext('2d');
  c2.fillStyle = 'rgba(8, 20, 34, 0.62)';
  c2.beginPath();
  c2.roundRect(0, 0, cv.width, cv.height, 14);
  c2.fill();
  c2.font = `bold ${fontPx}px Arial, sans-serif`;
  c2.fillStyle = '#ffffff';
  c2.textBaseline = 'middle';
  c2.fillText(text, pad, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  return new THREE.Sprite(mat);
}
