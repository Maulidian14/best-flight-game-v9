// Emberline Air — the Kestrel-9 bush plane.
// One job: build the aircraft mesh (fuselage, wings, tail, prop, gear, lights)
// and animate it (prop spin, control surfaces, damage smoke). No physics here.

import * as THREE from 'three';

const CREAM = 0xf2ede2;
const EMBER = 0xd9481f;
const TEAL = 0x1f7a6d;
const DARK = 0x2b2f36;

export function buildAircraft() {
  const plane = new THREE.Group();
  plane.name = 'kestrel-9';

  const mat = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...extra });

  // Fuselage: a tapered cylinder along -Z (nose at -Z), plus a rounded nose.
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.55, 7.2, 10), mat(CREAM));
  fus.rotation.x = Math.PI / 2;
  fus.position.set(0, 0, 0.4);
  plane.add(fus);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8), mat(EMBER));
  nose.scale.set(1, 1, 1.15);
  nose.position.set(0, 0, -3.2);
  plane.add(nose);

  // Cabin + windows: a dark canopy wedge and side windows.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 8), mat(0x18242e, { emissive: 0x0a1a26 }));
  canopy.scale.set(0.92, 0.72, 1.5);
  canopy.position.set(0, 0.55, -0.9);
  plane.add(canopy);
  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 1.1), mat(0x9fd4e8, { emissive: 0x2a4a5a }));
    win.position.set(s * 0.98, 0.35, -0.7);
    plane.add(win);
  }

  // Main wing (high wing, STOL style) with ember tips.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.22, 2.1), mat(CREAM));
  wing.position.set(0, 0.75, -0.4);
  plane.add(wing);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.26, 2.1), mat(EMBER));
    tip.position.set(s * 6.45, 0.75, -0.4);
    plane.add(tip);
    // Struts from fuselage to wing.
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6), mat(DARK));
    strut.position.set(s * 2.4, -0.15, -0.4);
    strut.rotation.z = s * 0.5;
    plane.add(strut);
  }

  // Tail: horizontal stabiliser + vertical fin with the Emberline mark.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.16, 1.4), mat(CREAM));
  stab.position.set(0, 0.35, 3.6);
  plane.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 1.9), mat(EMBER));
  fin.position.set(0, 1.1, 3.5);
  plane.add(fin);
  const finMark = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.9), mat(0xffe9a0));
  finMark.position.set(0, 1.25, 3.5);
  plane.add(finMark);

  // Propeller: spinner + two blades, spins with rpm.
  const prop = new THREE.Group();
  prop.name = 'prop';
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 10), mat(TEAL));
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.set(0, 0, -4.05);
  prop.add(spinner);
  for (const a of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.4, 0.12), mat(DARK));
    blade.position.set(0, 0, -4.3);
    blade.rotation.z = a;
    prop.add(blade);
  }
  plane.add(prop);

  // Landing gear: three fixed legs with wheels.
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.5, 6), mat(DARK));
    leg.position.set(s * 1.1, -1.15, -1.2);
    leg.rotation.z = s * 0.25;
    plane.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 10), mat(0x14161a));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(s * 1.35, -1.85, -1.2);
    plane.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.22, 8), mat(0x14161a));
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.95, 3.4);
  plane.add(tailWheel);

  // Navigation lights: red left, green right, white tail — they glow.
  const light = (color, x, y, z) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color }),
    );
    m.position.set(x, y, z);
    plane.add(m);
    return m;
  };
  light(0xff2a2a, -6.9, 0.75, -0.4);
  light(0x2aff66, 6.9, 0.75, -0.4);
  light(0xffffff, 0, 0.4, 4.3);

  // Registration on the fuselage side.
  const reg = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x2b2f36, transparent: true, opacity: 0.9 }),
  );
  reg.position.set(1.02, 0.1, 1.4);
  reg.rotation.y = Math.PI / 2;
  plane.add(reg);

  // Damage smoke: a dark puff that appears when the hull is hurt.
  const smokeMat = new THREE.MeshLambertMaterial({ color: 0x2a2a28, transparent: true, opacity: 0.7, flatShading: true });
  const smoke = new THREE.Group();
  smoke.name = 'damage-smoke';
  for (let i = 0; i < 5; i++) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + i * 0.25, 0), smokeMat);
    puff.position.set(0, 0.3, 1.2 + i * 0.5);
    smoke.add(puff);
  }
  smoke.visible = false;
  plane.add(smoke);

  return { plane, prop, smoke };
}

// Animate the prop and the control surfaces from the flight state.
export function animateAircraft(rig, dt, state) {
  rig.prop.rotation.z += dt * (4 + state.rpm * 90);
  // Ailerons read as wing flex: tiny roll of the wing tips is faked by the
  // whole plane's bank, so here we only pulse the nav lights.
  const t = performance.now() * 0.004;
  rig.smoke.visible = state.hull < 55;
  if (rig.smoke.visible) {
    rig.smoke.children.forEach((puff, i) => {
      const s = 0.8 + 0.3 * Math.sin(t + i * 1.7);
      puff.scale.setScalar(s);
    });
  }
}
