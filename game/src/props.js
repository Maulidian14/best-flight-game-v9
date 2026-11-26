// Emberline Air — set dressing.
// One job: the small things that make the archipelago feel inhabited — the
// stranded hiker on Tern Cay, palm trees on the beaches, fishing boats and
// the ring-course buoys. Pure decoration, except the hiker, whom the rescue
// mission watches for.

import * as THREE from 'three';
import { ISLANDS, STRIPS } from './config.js';
import { groundHeight } from './terrain.js';

export function buildProps(scene) {
  const group = new THREE.Group();
  group.name = 'props';

  // --- The stranded hiker on Tern Cay beach ----------------------------------
  const hiker = new THREE.Group();
  hiker.name = 'hiker';
  const suit = new THREE.MeshLambertMaterial({ color: 0xe8a13c, flatShading: true });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64, flatShading: true });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.1, 4, 8), suit);
  body.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), skin);
  head.position.y = 2.35;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.5, 10), new THREE.MeshLambertMaterial({ color: 0x8a2f2f, flatShading: true }));
  hat.position.y = 2.75;
  // Waving arm: a thin box angled up.
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 0.22), suit);
  arm.position.set(0.75, 1.9, 0);
  arm.rotation.z = -0.9;
  hiker.add(body, head, hat, arm);
  const hPos = ISLANDS[2].hiker;
  hiker.position.set(hPos.x, groundHeight(hPos.x, hPos.z), hPos.z);
  group.add(hiker);

  // A little orange tent beside the hiker.
  const tent = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, 2.4, 4),
    new THREE.MeshLambertMaterial({ color: 0xe86a1a, flatShading: true }),
  );
  tent.position.set(hPos.x + 6, groundHeight(hPos.x + 6, hPos.z + 4) + 1.2, hPos.z + 4);
  tent.rotation.y = Math.PI / 4;
  group.add(tent);

  // --- Palm trees on the sandy islands ----------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38, flatShading: true });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a, flatShading: true });
  function palm(x, z, s = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.42 * s, 7 * s, 6), trunkMat);
    trunk.position.y = 3.5 * s;
    trunk.rotation.z = 0.12;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7 * s, 4.4 * s, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.7 * s, 7 * s, Math.sin(a) * 1.7 * s);
      leaf.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      g.add(leaf);
    }
    g.position.set(x, groundHeight(x, z), z);
    return g;
  }
  const palmSpots = [
    [1620, -1120, 1.1], [1690, -1150, 0.9], [1560, -1040, 1.2], [1740, -1000, 1.0],
    [-640, 1990, 1.1], [-760, 1900, 0.9], [-580, 2050, 1.0],
    [420, 320, 1.2], [-180, 480, 1.0], [300, -420, 1.1],
  ];
  for (const [x, z, s] of palmSpots) group.add(palm(x, z, s));

  // --- Fishing boats: hull + mast + sail ---------------------------------------
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xdde8ee, flatShading: true });
  const sailMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, flatShading: true, side: THREE.DoubleSide });
  function boat(x, z, heading) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 8), hullMat);
    hull.position.y = 0.4;
    g.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6), trunkMat);
    mast.position.y = 4;
    g.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 5.5), sailMat);
    sail.position.set(0, 4.2, -1);
    g.add(sail);
    g.position.set(x, 0.4, z);
    g.rotation.y = heading;
    return g;
  }
  group.add(boat(900, 600, 0.8));
  group.add(boat(-1200, 600, 2.4));
  group.add(boat(200, -1600, 1.9));

  // --- Buoys marking the ring course -------------------------------------------
  const buoyMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a, flatShading: true });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), buoyMat);
    b.position.set(Math.cos(a) * 900, 1.2, Math.sin(a) * 900);
    b.scale.y = 0.7;
    group.add(b);
  }

  scene.add(group);
  return { group, hiker };
}
