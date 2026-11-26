// Emberline Air — screenshot poses.
// One job: put the game into a photogenic state for ?shot=1..4 and tell the
// outside world when the frame is ready (window.__shotReady). Every pose is
// a real moment of the real game — autopilot flying, never a staged render.

import * as THREE from 'three';
import { RING_COURSE, STRIPS } from './config.js';
import { groundHeight } from './terrain.js';
import { autopilotFlyTo, autopilotLand } from './autopilot.js';
import { dust } from './particles.js';

export function shotNumber() {
  const m = /[?&]shot=(\d)/.exec(window.location.search);
  return m ? parseInt(m[1], 10) : 0;
}

// Teleport the plane (pose setup only — the game then flies honestly).
function place(state, x, y, z, heading, speed, throttle) {
  state.pos.set(x, y, z);
  state.heading = heading;
  state.pitch = 0;
  state.bank = 0;
  state.speed = speed;
  state.throttle = throttle;
  state.rpm = throttle;
  state.onGround = false;
  state.airborne = true;
  state.verticalSpeed = 0;
}

export function setupShot(n, ctx) {
  const { state, mission, autopilot, P, camera } = ctx;
  if (n === 1) {
    // COVER — Ring Run: threading the canyon rings over Gull Rock, sun and
    // clouds ahead, HUD full. Fly at ring 0 and let the shot catch the pass.
    ctx.startMission('rings');
    const r0 = RING_COURSE[0];
    // Start 370 m southwest of ring 0, heading 45° straight at it; the
    // autopilot aims at ring 0 itself so the shot catches the pass.
    place(state, r0.x - 260, r0.y + 8, r0.z + 260, 45, 52, 0.78);
    autopilotFlyTo(autopilot, r0.x, r0.y, r0.z);
    camera.mode = 'chase';
    ctx.shotReadyWhen = () => {
      const d = Math.hypot(state.pos.x - r0.x, state.pos.y - r0.y, state.pos.z - r0.z);
      return d < 55 || (ctx.mission && ctx.mission.ringsHit > 0);
    };
  } else if (n === 2) {
    // Courier — final approach to the Ember Isle runway, gear down, flaps
    // down, threshold bars and windsock ahead.
    ctx.startMission('courier');
    const strip = STRIPS[0];
    const h = (strip.heading * Math.PI) / 180;
    const ex = strip.x - Math.sin(h) * 780;
    const ez = strip.z + Math.cos(h) * 780;
    const gy = groundHeight(strip.x, strip.z);
    place(state, ex, gy + 52, ez, strip.heading, 40, 0.45);
    state.gearDown = true;
    state.flaps = 1;
    autopilotLand(autopilot, strip);
    camera.mode = 'chase';
    ctx.shotReadyWhen = () => {
      const d = Math.hypot(state.pos.x - strip.x, state.pos.z - strip.z);
      return d < 250; // close enough that the runway fills the frame
    };
  } else if (n === 3) {
    // Rescue — final approach to Tern Cay beach, gear down, the hiker
    // and his tent on the sand ahead, turquoise water behind. (The old
    // pose parked the plane on the sand and the orbit camera circled to
    // a spot where a rise hid the aircraft entirely; a chase camera on
    // final always has the plane in frame, like shots 1, 2 and 4.)
    ctx.startMission('rescue');
    const beach = STRIPS[2];
    const h = (beach.heading * Math.PI) / 180;
    const ex = beach.x - Math.sin(h) * 780;
    const ez = beach.z + Math.cos(h) * 780;
    const gy = groundHeight(beach.x, beach.z);
    place(state, ex, gy + 52, ez, beach.heading, 40, 0.45);
    state.gearDown = true;
    state.flaps = 1;
    autopilotLand(autopilot, beach);
    camera.mode = 'chase';
    ctx.shotReadyWhen = () => {
      const d = Math.hypot(state.pos.x - beach.x, state.pos.z - beach.z);
      return d < 250; // close enough that the beach fills the frame
    };
  } else if (n === 4) {
    // Precision — the moment after touchdown on the Ashen Peak strip, dust
    // in the air, volcano smoke behind.
    ctx.startMission('precision');
    const strip = STRIPS[3];
    const gy = groundHeight(strip.x, strip.z);
    const h = (strip.heading * Math.PI) / 180;
    const ex = strip.x - Math.sin(h) * 420;
    const ez = strip.z + Math.cos(h) * 420;
    place(state, ex, gy + 34, ez, strip.heading, 36, 0.35);
    state.gearDown = true;
    state.flaps = 1;
    autopilotLand(autopilot, strip);
    camera.mode = 'chase';
    let dusted = false;
    let doneElapsed = 0;
    ctx.shotReadyWhen = () => {
      if (!state.onGround) dusted = false; // a go-around earns a fresh dust puff
      if (state.onGround && !dusted) {
        dusted = true;
        dust(P, state.pos.x, state.pos.y, state.pos.z, 12);
      }
      // Fire 1.6 s of GAME time after the scored touchdown. Game time, not
      // wall time: under swiftshader the game runs slower than real time,
      // and the dust (1.1 s life) must be dead before the frame is taken.
      // The MISSION COMPLETE banner (3.2 s) is still up, the plane has
      // rolled out clear of the dust on the strip.
      // NOTE: mission.elapsed freezes when the mission completes (mode
      // 'complete' stops mission updates), so clock it on state.flightTime,
      // which keeps running while the sim runs.
      if (ctx.mission && ctx.mission.done && !doneElapsed) doneElapsed = state.flightTime;
      return doneElapsed > 0 && state.flightTime - doneElapsed > 1.6;
    };
  }
}
