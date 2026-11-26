// Emberline Air — boot and game loop.
// One job: wire every system together, run the frame, and own the game
// states (menu, flying, paused, crashed, complete). The flight model flies,
// the missions score, the HUD reports — this file only conducts.

import * as THREE from 'three';
import { WORLD, MISSIONS, STRIPS, RING_COURSE } from './config.js';
import { buildTerrain, groundHeight } from './terrain.js';
import { buildProps } from './props.js';
import { buildAircraft, animateAircraft } from './aircraft.js';
import { newFlightState, stepFlight } from './physics.js';
import { newCameraRig, updateCamera } from './camera.js';
import { initHud, updateHud, showBanner, hideBanner } from './hud.js';
import { newMission, updateMission, refuelIfParked } from './missions.js';
import { initAudio, resumeAudio, toggleMute, updateEngine, sfxRing, sfxThump, sfxCrash, sfxBeep, sfxClick, sfxFanfare, sfxPickup } from './audio.js';
import { newInput, attachInput, pollInput } from './input.js';
import { newParticles, updateParticles, dust, smokePuff, splash } from './particles.js';
import { newAutopilot, autopilotControl, autopilotFlyTo, autopilotLand, autopilotOff } from './autopilot.js';
import { shotNumber, setupShot } from './shots.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe4f2, WORLD.fogNear, WORLD.fogFar);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 12000);

// Light: warm sun + cool sky bounce, one style across terrain and plane.
const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
sun.position.set(-2600, 1500, -4200);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbcd8ee, 0x6a7a5a, 1.15));

const terrain = buildTerrain(scene);
const props = buildProps(scene);
const rig = buildAircraft();
scene.add(rig.plane);
const P = newParticles(scene);
const camRig = newCameraRig(camera);
const state = newFlightState();
const input = newInput();
const autopilot = newAutopilot();
let mission = null;
let mode = 'menu'; // menu | flying | paused | crashed | complete
let flightTime = 0;
let lastTs = performance.now();
let shotReady = false;
let playtest = null;
// Fast-forward (?ff=1): the playtest harness runs the sim without rendering
// or HUD work, on a fixed 0.05 s step driven by setTimeout, so a whole
// mission verifies in seconds instead of minutes under swiftshader. The
// flight model, missions and autopilot are identical — only the presentation
// is skipped. Never used for screenshots (those need the real render).
const ff = new URLSearchParams(window.location.search).get('ff') === '1';

initHud();
attachInput(input, canvas, () => { initAudio(); resumeAudio(); });

// --- Menu ---------------------------------------------------------------------
const menuEl = document.getElementById('menu');
const menuCards = document.getElementById('menu-cards');
for (const def of MISSIONS) {
  const card = document.createElement('button');
  card.className = 'mission-card';
  card.innerHTML = `<span class="mc-num">${def.num}</span>
    <span class="mc-name">${def.name}</span>
    <span class="mc-goal">${def.goal}</span>
    <span class="mc-par">PAR ${Math.floor(def.par / 60)}:${String(def.par % 60).padStart(2, '0')}</span>`;
  card.addEventListener('click', () => { sfxClick(); startMission(def.id); });
  menuCards.appendChild(card);
}
document.getElementById('menu-free').addEventListener('click', () => { sfxClick(); startFreeFlight(); });
document.getElementById('menu-how').addEventListener('click', () => {
  document.getElementById('howto').classList.toggle('open');
});

function startMission(id) {
  mission = newMission(id);
  autopilotOff(autopilot);
  resetPlaneToHome();
  mode = 'flying';
  menuEl.classList.add('hidden');
  showBanner(mission.name.toUpperCase(), mission.brief);
  sfxClick();
  console.log(`[emberline] mission started: ${id}`);
}

function startFreeFlight() {
  mission = null;
  autopilotOff(autopilot);
  resetPlaneToHome();
  mode = 'flying';
  menuEl.classList.add('hidden');
  showBanner('FREE FLIGHT', 'No mission — fly the archipelago. Keys 1–4 start a sortie.');
}

function resetPlaneToHome() {
  const home = STRIPS[0];
  const gy = groundHeight(home.x, home.z);
  Object.assign(state, newFlightState());
  state.pos.set(home.x, gy + 1.9, home.z + 40);
  state.heading = home.heading;
  state.onGround = true;
  state.gearDown = true;
  state.fuel = 100;
  state.hull = 100;
  flightTime = 0;
  camRig.mode = 'chase';
}

function backToMenu() {
  mode = 'menu';
  mission = null;
  autopilotOff(autopilot);
  resetPlaneToHome();
  menuEl.classList.remove('hidden');
  camRig.mode = 'orbit';
  hideBanner();
}

// Exposed for the playtest harness and the screenshot poses.
window.__game = {
  state, get mission() { return mission; }, autopilot, camRig,
  startMission, startFreeFlight, backToMenu,
  version: 'emberline-air-v9',
};

function handleEvents(events) {
  for (const e of events) {
    if (e === 'takeoff') { sfxThump(); showBanner('AIRBORNE', 'Gear up with G when you are climbing away.'); }
    if (e === 'touchdown') { sfxThump(); dust(P, state.pos.x, state.pos.y, state.pos.z, 12); }
    if (e === 'hard-landing') { sfxThump(); showBanner('HARD LANDING', 'Hull took a hit — fly gentle from here.'); dust(P, state.pos.x, state.pos.y, state.pos.z, 14); }
    if (e === 'stall') { sfxBeep(); showBanner('STALL!', 'Nose down, full power.'); }
    if (e === 'scrape') { sfxThump(); smokePuff(P, state.pos.x, state.pos.y + 1, state.pos.z); }
    if (e === 'turn-back') showBanner('EDGE OF THE CHART', 'Turning back toward the islands.');
    if (e === 'crash') {
      sfxCrash();
      smokePuff(P, state.pos.x, state.pos.y + 2, state.pos.z);
      mode = 'crashed';
      autopilotOff(autopilot);
      showBanner('CRASHED', 'Press R to walk back to the hangar and try again.');
      console.log('[emberline] crashed');
    }
    if (e === 'ditch') {
      splash(P, state.pos.x, 0.5, state.pos.z, 40);
      showBanner('DITCHED IN THE SEA', 'Water is not a runway. Press R to try again.');
    }
  }
}

function handleMissionEvents(events) {
  for (const e of events) {
    if (e === 'ring') { sfxRing(); }
    if (e === 'delivery') { sfxThump(); showBanner('PARCEL DELIVERED', mission.objectiveText); }
    if (e === 'rescue-landed') { sfxBeep(); showBanner('ON THE BEACH', 'Hold still — the hiker is coming aboard.'); }
    if (e === 'rescue-picked-up') { sfxPickup(); showBanner('HIKER ABOARD', 'Now bring them home to Ember Isle.'); }
    if (e === 'mission-complete') {
      sfxFanfare();
      mode = 'complete';
      autopilotOff(autopilot);
      // Landed a mission: cut the throttle so the plane rolls out and stops
      // instead of running away at landing power (the autopilot is off now).
      if (state.onGround) state.throttle = 0;
      showBanner('MISSION COMPLETE', `${mission.name} — score ${mission.score}. Press R for the menu, 1–4 for another sortie.`);
      console.log(`[emberline] mission complete: ${mission.id} score=${mission.score} time=${mission.elapsed.toFixed(1)}s`);
      if (playtest) { window.__playtestDone = true; window.__playtestResult = { mission: mission.id, score: mission.score, time: mission.elapsed, ok: true }; }
    }
    if (e === 'mission-failed') {
      sfxBeep();
      showBanner('MISSION FAILED', mission.objectiveText + ' Press R to retry.');
      console.log(`[emberline] mission failed: ${mission.id}`);
      if (playtest) { window.__playtestDone = true; window.__playtestResult = { mission: mission.id, score: mission.score, time: mission.elapsed, ok: false }; }
    }
  }
}

// --- Screenshot poses ---------------------------------------------------------
const shot = shotNumber();
const shotCtx = {
  state, mission: null, autopilot, P, camera: camRig,
  startMission: (id) => { mission = newMission(id); shotCtx.mission = mission; mode = 'flying'; menuEl.classList.add('hidden'); },
  shotReadyWhen: null,
};
if (shot > 0) {
  setupShot(shot, shotCtx);
  mission = shotCtx.mission;
  mode = 'flying';
}

// --- Playtest mode (?playtest=<mission>) ---------------------------------------
const playtestParam = new URLSearchParams(window.location.search).get('playtest');
if (playtestParam) {
  playtest = playtestParam;
  startMission(playtestParam);
  // The autopilot gets its orders from the mission targets each frame.
  console.log(`[emberline] playtest started: ${playtestParam}`);
}

// --- Frame loop -----------------------------------------------------------------
function frame(now) {
  requestAnimationFrame(frame);
  // Fast-forward steps a fixed 0.05 s per tick (the largest step the flight
  // model ever takes). rAF runs at ~60 Hz headless, so the sim advances ~3x
  // wall time while the render/HUD are skipped below.
  let dt = ff ? 0.05 : Math.min(0.05, (now - lastTs) / 1000);
  lastTs = now;

  pollInput(input, dt);

  // Global keys.
  if (input.pressed['p']) {
    if (mode === 'flying') { mode = 'paused'; showBanner('PAUSED', 'Press P to keep flying.'); }
    else if (mode === 'paused') { mode = 'flying'; hideBanner(); }
  }
  if (input.pressed['m']) { const m = toggleMute(); showBanner(m ? 'SOUND OFF' : 'SOUND ON', ''); }
  if (input.pressed['c'] && (mode === 'flying' || mode === 'complete')) {
    camRig.mode = camRig.mode === 'chase' ? 'near' : 'chase';
  }
  if (input.pressed['g'] && (mode === 'flying' || mode === 'complete')) {
    state.gearDown = !state.gearDown;
    showBanner(state.gearDown ? 'GEAR DOWN' : 'GEAR UP', '');
  }
  if (input.pressed['r']) {
    if (mode === 'crashed' || mode === 'complete' || mode === 'flying' || mode === 'paused') backToMenu();
  }
  if (input.pressed['escape'] && mode !== 'menu') backToMenu();
  for (const def of MISSIONS) {
    if (input.pressed[def.key] && mode !== 'menu') startMission(def.id);
  }

  // The sim keeps running after a mission completes (mode 'complete') so
  // the plane keeps flying under the player's stick instead of freezing
  // mid-air; mission scoring only runs while 'flying'.
  const simRunning = mode === 'flying' || mode === 'complete';
  if (simRunning) {
    flightTime += dt;
    state.flightTime = flightTime;

    // Controls: autopilot (playtest / shots) or the human.
    let ctrl;
    if (playtest && mission && !mission.done && !mission.failed) {
      ctrl = drivePlaytest(dt);
    } else if (autopilot.active) {
      ctrl = autopilotControl(autopilot, state, dt);
    } else {
      ctrl = input;
    }
    const events = stepFlight(state, ctrl, dt);
    handleEvents(events);

    // The mission update runs while flying — and on the crash frame itself:
    // handleEvents above just set mode='crashed', so gating on 'flying'
    // alone would swallow the crash and the mission would never fail (the
    // playtest harness hung on exactly that).
    if (mission && (mode === 'flying' || events.includes('crash'))) {
      const mEvents = updateMission(mission, state, terrain.rings, P, dt, events);
      handleMissionEvents(mEvents);
    }
    refuelIfParked(state, dt);

    // Water landing = a very wet crash (kept as a safety net; the flight
    // model already ditches the plane the moment it touches the sea).
    if (!state.onGround && state.pos.y < 0.6 && !state.crashed) {
      state.crashed = true;
      state.hull = 0;
      splash(P, state.pos.x, 0.5, state.pos.z, 40);
      handleEvents(['crash']);
      if (mission) handleMissionEvents(['mission-failed']);
    }

    if (!ff) updateEngine(state.rpm, state.speed, state.onGround);
    if (!ff) updateHud(state, mission, dt);

    // Screenshot pose settled?
    if (shot > 0 && !shotReady && shotCtx.shotReadyWhen && shotCtx.shotReadyWhen()) {
      shotReady = true;
      window.__shotReady = true;
      document.title = 'SHOT-READY';
      console.log(`[emberline] shot ${shot} ready`);
    }
  }

  // The plane mesh follows the flight state.
  rig.plane.position.copy(state.pos);
  rig.plane.rotation.order = 'YXZ';
  rig.plane.rotation.y = (state.heading * Math.PI) / 180 + Math.PI;
  rig.plane.rotation.x = (state.pitch * Math.PI) / 180;
  // Bank sign: positive bank is right-wing-down (right turn). A positive
  // rotation.z would lift the right wing, so the visual roll is -bank.
  rig.plane.rotation.z = -(state.bank * Math.PI) / 180;
  animateAircraft(rig, dt, state);

  // Pulse the next ring so the eye finds the course.
  if (mission && mission.id === 'rings' && !mission.done) {
    const ring = terrain.rings.getObjectByName(`ring-${mission.ringIndex}`);
    if (ring) {
      const s = 1 + 0.05 * Math.sin(now * 0.006);
      ring.scale.setScalar(ring.userData.baseR * s);
    }
  }
  // Volcano smoke drifts.
  terrain.smoke.rotation.y += dt * 0.05;
  terrain.clouds.children.forEach((c, i) => {
    c.position.x += dt * (2 + (i % 3));
    if (c.position.x > 3400) c.position.x = -3400;
  });
  // The hiker waves.
  props.hiker.rotation.y += dt * 0.4;

  updateParticles(P, dt);
  updateCamera(camRig, state, dt, now / 1000);
  if (!ff) renderer.render(scene, camera);
}

// Playtest driver: point the autopilot at whatever the mission needs next.
function drivePlaytest(dt) {
  const m = mission;
  if (!m) return autopilotControl(autopilot, state, dt);
  if (m.id === 'rings') {
    const def = RING_COURSE[m.ringIndex] || null;
    if (def && (!autopilot.target || autopilot.done)) {
      autopilotFlyTo(autopilot, def.x, def.y, def.z);
    }
  } else if (m.id === 'courier') {
    const legs = ['marlin', 'tern', 'ashen'];
    const strip = STRIPS.find((s) => s.id === legs[m.legIndex]);
    if (strip && (!autopilot.target || (autopilot.done && state.onGround))) {
      if (state.onGround && autopilot.done) {
        // Hold on the strip until the tank is full before the next leg:
        // the ground crew refuels at 14/s, and taking off straight away
        // left the plane at fuel 9 on the Ashen Peak leg, where it ran
        // dry 60 m short of the strip and glided into a go-around loop.
        if (state.fuel < 95) {
          return { pitch: 0, bank: 0, yaw: 0, throttleDelta: -1, brake: true, flapsToggle: false };
        }
        // Take off again: throttle up and pitch up once rolling.
        autopilotOff(autopilot);
        return { pitch: 0.6, bank: 0, yaw: 0, throttleDelta: 1, brake: false, flapsToggle: false };
      }
      if (!autopilot.active) autopilotLand(autopilot, strip);
    }
    if (state.onGround && !autopilot.active && m.legIndex < 3) {
      return { pitch: 0.6, bank: 0, yaw: 0, throttleDelta: 1, brake: false, flapsToggle: false };
    }
  } else if (m.id === 'rescue') {
    const beach = STRIPS.find((s) => s.id === 'tern');
    const home = STRIPS.find((s) => s.id === 'home');
    if (m.phase === 'fly' && !autopilot.active) autopilotLand(autopilot, beach);
    if (m.phase === 'pickup') return { pitch: 0, bank: 0, yaw: 0, throttleDelta: -1, brake: true, flapsToggle: false };
    if (m.phase === 'return') {
      // The landing autopilot is spent (phase rollout, done) — switch it
      // off so it stops braking, then take off and re-task for home.
      if (autopilot.active && autopilot.done) autopilotOff(autopilot);
      if (!autopilot.active && state.onGround) {
        return { pitch: 0.6, bank: 0, yaw: 0, throttleDelta: 1, brake: false, flapsToggle: false };
      }
      if (!autopilot.active) autopilotLand(autopilot, home);
    }
  } else if (m.id === 'precision') {
    const strip = STRIPS.find((s) => s.id === 'ashen');
    if (!autopilot.active && !autopilot.done) autopilotLand(autopilot, strip);
  }
  return autopilotControl(autopilot, state, dt);
}

// The playtest driver needs the ring course; it is imported with the rest
// of the world config at the top of this file.
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Menu orbit: the camera circles the parked plane until a mission starts.
camRig.mode = shot > 0 ? 'chase' : 'orbit';
requestAnimationFrame(frame);
console.log('[emberline] Emberline Air v9 ready');
