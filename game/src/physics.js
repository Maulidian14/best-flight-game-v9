// Emberline Air — flight model.
// One job: turn throttle, pitch, bank and rudder into motion. Arcade-simple
// but honest: lift needs speed, a bank turns the heading, a stall drops the
// nose, and the ground is always there. No rendering here.

import * as THREE from 'three';
import { PLANE, WORLD } from './config.js';
import { groundHeight } from './terrain.js';

export function newFlightState() {
  return {
    pos: new THREE.Vector3(-260, 40, 320), // parked on the home runway
    heading: 90, // degrees, 0 = north (-Z), 90 = east (+X)
    pitch: 0, // degrees, + = nose up
    bank: 0, // degrees, + = right wing down
    speed: 0, // m/s
    throttle: 0,
    rpm: 0,
    flaps: 0, // 0 or 1
    gearDown: true,
    onGround: true,
    verticalSpeed: 0, // m/s, + = climbing
    fuel: PLANE.fuelCapacity,
    hull: PLANE.hullMax,
    crashed: false,
    airborne: false,
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;

// Apply one simulation step. input: {pitch: -1..1, bank: -1..1, yaw: -1..1,
// throttleDelta, brake, flaps}. Returns events: ['takeoff'|'touchdown'|'crash'|'stall'|...]
export function stepFlight(s, input, dt) {
  const events = [];
  if (s.crashed) return events;

  // --- Throttle and fuel ---------------------------------------------------
  s.throttle = clamp(s.throttle + (input.throttleDelta || 0) * dt * 0.7, 0, PLANE.maxThrottle);
  const burn = PLANE.fuelBurnIdle + (PLANE.fuelBurn - PLANE.fuelBurnIdle) * s.throttle;
  if (!s.onGround || s.throttle > 0.05) s.fuel = Math.max(0, s.fuel - burn * dt);
  s.rpm = lerp(s.rpm, s.throttle * (s.fuel > 0 ? 1 : 0), dt * 2);
  if (input.flapsToggle) s.flaps = s.flaps ? 0 : 1;

  // --- Control authority: mushy when slow, crisp when fast ------------------
  const airspeed = Math.max(0, s.speed);
  const authority = clamp(airspeed / 45, 0.25, 1);
  const stalled = airspeed < PLANE.stallSpeed && !s.onGround;
  if (stalled && !s._stallWarned) { events.push('stall'); s._stallWarned = true; }
  if (!stalled) s._stallWarned = false;

  // --- Attitude --------------------------------------------------------------
  const pitchRate = PLANE.pitchRate * (stalled ? 0.4 : 1) * authority;
  s.pitch = clamp(s.pitch + (input.pitch || 0) * pitchRate * dt * 57.3, -38, 38);
  s.bank = clamp(s.bank + (input.bank || 0) * 0.9 * authority * dt * 57.3, -68, 68);
  // Level the wings gently when the stick is centred; a stall drops the nose.
  if (!input.bank) s.bank = lerp(s.bank, 0, dt * (s.onGround ? 4 : 0.55));
  if (stalled) s.pitch = lerp(s.pitch, -14, dt * 1.4);
  if (!input.pitch && !s.onGround) s.pitch = lerp(s.pitch, 0, dt * 0.25);
  // Rudder yaws the nose a little and coordinates the turn.
  s.heading += (input.yaw || 0) * 22 * authority * dt;
  // A banked turn changes heading: turn rate grows with bank and speed.
  // Sign matters: positive bank is right-wing-down, and it must turn the
  // nose RIGHT (heading increases in the N=0,E=90,S=180,W=270 convention),
  // matching the rudder above and what the autopilot commands. A minus here
  // inverted the turn — the plane banked right and spiralled left, and the
  // autopilot could never reach a target.
  s.heading += Math.sin(rad(s.bank)) * PLANE.turnRate * (0.4 + 0.6 * authority) * dt * 57.3;
  s.heading = ((s.heading % 360) + 360) % 360;

  // --- Speed -----------------------------------------------------------------
  const thrust = s.rpm * 46; // m/s^2 at full power
  const drag = 0.0062 * airspeed * airspeed + (s.flaps ? 3.2 : 0) + (s.gearDown && !s.onGround ? 1.4 : 0);
  const gravityAlong = -WORLD.gravity * Math.sin(rad(s.pitch)) * 0.9;
  let accel = thrust - drag + gravityAlong;
  if (s.onGround) {
    // Rolling resistance + brakes; the plane needs a run to lift off.
    accel -= 2.2 + (input.brake ? 9 : 0);
    if (s.throttle < 0.05 && s.speed < 1) accel = 0;
  }
  s.speed = Math.max(0, s.speed + accel * dt);
  if (s.fuel <= 0) s.speed = Math.max(0, s.speed - 2.5 * dt); // dead stick glide

  // --- Climb / sink -----------------------------------------------------------
  const liftSpeed = s.speed * (s.flaps ? 1.12 : 1);
  const climbTarget = Math.sin(rad(s.pitch)) * liftSpeed * 0.9
    + (s.onGround ? 0 : (s.rpm * PLANE.climbRate - 4.5));
  const vsTarget = s.onGround ? 0 : clamp(climbTarget, -16, 14);
  s.verticalSpeed = lerp(s.verticalSpeed, vsTarget, dt * 1.6);
  if (stalled) s.verticalSpeed = lerp(s.verticalSpeed, -12, dt * 1.2);

  // --- Position ---------------------------------------------------------------
  const hRad = rad(s.heading);
  const vx = Math.sin(hRad) * s.speed;
  const vz = -Math.cos(hRad) * s.speed;
  s.pos.x += vx * dt;
  s.pos.z += vz * dt;
  s.pos.y += s.verticalSpeed * dt;

  // --- Ground ------------------------------------------------------------------
  const ground = groundHeight(s.pos.x, s.pos.z);
  const gearH = ground + 1.9;
  if (s.onGround) {
    s.pos.y = gearH;
    // Gentle pitch settle on the ground: the pilot can still hold the nose
    // up to rotate — a hard settle would make takeoff impossible.
    s.pitch = lerp(s.pitch, 0, dt * 1.2);
    // Lift off when fast enough and the nose is up.
    if (s.speed > PLANE.takeoffSpeed && s.pitch > 4) {
      s.onGround = false;
      s.airborne = true;
      events.push('takeoff');
    }
  } else if (s.pos.y <= gearH) {
    // Touchdown. Water is not a runway: ditching is a crash.
    if (ground < 1) {
      s.hull = 0;
      s.crashed = true;
      s.pos.y = 0.5;
      events.push('ditch');
      events.push('crash');
      return events;
    }
    const vs = s.verticalSpeed;
    const aligned = Math.abs(s.bank) < 18;
    s.pos.y = gearH;
    s.onGround = true;
    s.verticalSpeed = 0;
    s.pitch = 0;
    if (vs < -11 || !aligned) {
      s.hull = 0;
      s.crashed = true;
      events.push('crash');
    } else {
      if (vs < -6.5) {
        s.hull = Math.max(0, s.hull - 18);
        events.push('hard-landing');
      } else {
        events.push('touchdown');
      }
      s.speed = Math.max(0, s.speed - 6);
    }
  }

  // --- Terrain strike while airborne -------------------------------------------
  if (!s.onGround && !s.crashed) {
    const clearance = s.pos.y - ground;
    if (clearance < 1.2) {
      if (s.speed > 26) {
        s.hull = 0;
        s.crashed = true;
        events.push('crash');
      } else {
        // Gentle scrape: bounce off with damage instead of a fireball.
        s.hull = Math.max(0, s.hull - 25);
        s.pos.y = ground + 3;
        s.verticalSpeed = 4;
        events.push('scrape');
        if (s.hull <= 0) { s.crashed = true; events.push('crash'); }
      }
    }
  }

  // --- World bounds: turn back with a warning ----------------------------------
  const lim = 3100;
  if (Math.abs(s.pos.x) > lim || Math.abs(s.pos.z) > lim) {
    s.heading = (s.heading + 180) % 360;
    s.pos.x = clamp(s.pos.x, -lim, lim);
    s.pos.z = clamp(s.pos.z, -lim, lim);
    events.push('turn-back');
  }
  return events;
}

export function compassLabel(heading) {
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return pts[Math.round(((heading % 360) / 22.5)) % 16];
}

export function knots(ms) { return Math.round(ms * 1.94384); }
export function feet(m) { return Math.round(m * 3.28084); }
export function fpm(ms) { return Math.round(ms * 196.85); }
