// Emberline Air — particles.
// One job: short-lived visual feedback — ring bursts, touchdown dust,
// splash, and crash smoke. Cheap points sprites, pooled, no allocations in
// the hot loop beyond reuse.

import * as THREE from 'three';

export function newParticles(scene, max = 420) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.4, vertexColors: true, transparent: true, opacity: 0.9,
    depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.name = 'particles';
  scene.add(points);
  return {
    points, pos, col, max,
    list: [], // {x,y,z,vx,vy,vz,life,maxLife,r,g,b}
    geo,
  };
}

function spawn(P, x, y, z, vx, vy, vz, life, r, g, b) {
  if (P.list.length >= P.max) P.list.shift();
  P.list.push({ x, y, z, vx, vy, vz, life, maxLife: life, r, g, b });
}

export function burstRing(P, x, y, z) {
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    const sp = 14 + Math.random() * 16;
    spawn(P, x, y, z, Math.cos(a) * sp, Math.sin(a) * sp * 0.6, Math.sin(a * 1.3) * sp, 0.9, 1.0, 0.75, 0.15);
  }
}

export function dust(P, x, y, z, n = 12) {
  for (let i = 0; i < n; i++) {
    // Low and tight: dust hugs the ground behind the wheels, it must never
    // rise up and swallow the aircraft in a beige blob.
    spawn(P, x + (Math.random() - 0.5) * 4, y + 0.2 + Math.random() * 0.6, z + (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 7, 0.5 + Math.random() * 1.5, (Math.random() - 0.5) * 7,
      1.1, 0.85, 0.8, 0.66);
  }
}

export function splash(P, x, y, z, n = 26) {
  for (let i = 0; i < n; i++) {
    spawn(P, x, y + 0.5, z, (Math.random() - 0.5) * 10, 4 + Math.random() * 8, (Math.random() - 0.5) * 10,
      0.8, 0.65, 0.85, 1.0);
  }
}

export function smokePuff(P, x, y, z) {
  for (let i = 0; i < 6; i++) {
    spawn(P, x, y, z, (Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3,
      1.6, 0.25, 0.24, 0.22);
  }
}

export function updateParticles(P, dt) {
  const alive = [];
  for (const p of P.list) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.vy -= 3.5 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    alive.push(p);
  }
  P.list = alive;
  for (let i = 0; i < P.max; i++) {
    if (i < alive.length) {
      const p = alive[i];
      const fade = p.life / p.maxLife;
      P.pos[i * 3] = p.x;
      P.pos[i * 3 + 1] = p.y;
      P.pos[i * 3 + 2] = p.z;
      P.col[i * 3] = p.r * fade;
      P.col[i * 3 + 1] = p.g * fade;
      P.col[i * 3 + 2] = p.b * fade;
    } else {
      P.pos[i * 3 + 1] = -1000; // park the dead below the world
    }
  }
  P.geo.attributes.position.needsUpdate = true;
  P.geo.attributes.color.needsUpdate = true;
}
