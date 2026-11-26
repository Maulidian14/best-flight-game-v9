// Emberline Air — missions.
// One job: the four sorties, each a small state machine with its own goal,
// progress, target position (for the minimap + HUD) and score. The flight
// model never knows which mission is running; this file watches the plane
// and decides what counts.

import * as THREE from 'three';
import { MISSIONS, RING_COURSE, STRIPS } from './config.js';
import { groundHeight } from './terrain.js';
import { burstRing, dust, smokePuff } from './particles.js';

export function newMission(kind) {
  const def = MISSIONS.find((m) => m.id === kind);
  return {
    id: kind,
    name: def.name,
    goal: def.goal,
    brief: def.brief,
    par: def.par,
    elapsed: 0,
    score: 0,
    done: false,
    failed: false,
    objectiveText: def.goal,
    nextRingText: '',
    targetPos: null,
    // per-mission state
    ringIndex: 0,
    ringsHit: 0,
    legs: [], // courier: strip ids in order
    legIndex: 0,
    phase: 'fly', // rescue: fly | landed | pickup | return
    pickupTimer: 0,
    landingScore: 0,
    landedStrip: null,
  };
}

const V = new THREE.Vector3();

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function stripById(id) {
  return STRIPS.find((s) => s.id === id);
}

// Is the plane on (or just above) this strip, slow and level? Returns a
// landing quality in [0, 1] or null when not a landing at all.
function landingQuality(state, strip) {
  if (!state.onGround) return null;
  // A NaN state must never fake a landing (it did once, via NaN comparisons).
  if (!Number.isFinite(state.pos.x) || !Number.isFinite(state.pos.z) || !Number.isFinite(state.speed)) return null;
  const d = dist2D(state.pos, strip);
  if (d > strip.length / 2 + 30) return null;
  const along = Math.abs((state.pos.x - strip.x) * Math.sin((strip.heading * Math.PI) / 180)
    - (state.pos.z - strip.z) * Math.cos((strip.heading * Math.PI) / 180));
  const across = Math.abs((state.pos.x - strip.x) * Math.cos((strip.heading * Math.PI) / 180)
    + (state.pos.z - strip.z) * Math.sin((strip.heading * Math.PI) / 180));
  if (along > strip.length / 2 || across > strip.width / 2 + 14) return null;
  // Centreline + softness + speed discipline.
  const centre = 1 - Math.min(1, across / (strip.width / 2 + 14));
  const soft = state.speed < 34 ? 1 : state.speed < 46 ? 0.6 : 0.3;
  return Math.round((centre * 0.6 + soft * 0.4) * 100) / 100;
}

export function updateMission(m, state, ringsGroup, P, dt, events) {
  if (!m || m.done || m.failed) return [];
  m.elapsed += dt;
  const out = [];

  if (m.id === 'rings') {
    const def = RING_COURSE[m.ringIndex];
    if (!def) { m.done = true; m.score += 500; m.objectiveText = 'Course complete — beautiful flying!'; return ['mission-complete']; }
    m.targetPos = def;
    m.nextRingText = `NEXT RING ${m.ringIndex + 1} / ${RING_COURSE.length}`;
    m.objectiveText = `Thread ring ${m.ringIndex + 1} of ${RING_COURSE.length} — ${m.ringsHit} through`;
    // Passed the ring plane within its radius?
    V.set(state.pos.x - def.x, state.pos.y - def.y, state.pos.z - def.z);
    const planeDist = Math.abs(V.x * Math.sin(Math.atan2(-def.x, -def.z)) + V.z * Math.cos(Math.atan2(-def.x, -def.z)));
    const radial = Math.hypot(V.x, V.y, V.z);
    const prev = m._prevRadial ?? Infinity;
    if (radial < def.r + 4 && prev > radial && state.speed > 8) {
      m.ringsHit++;
      m.ringIndex++;
      m.score += 100 + Math.round(state.speed);
      burstRing(P, def.x, def.y, def.z);
      const ring = ringsGroup.getObjectByName(`ring-${m.ringIndex - 1}`);
      if (ring) ring.material.color.setHex(0x37d67a);
      const chev = ringsGroup.getObjectByName(`ring-chevron-${m.ringIndex - 1}`);
      if (chev) chev.visible = false;
      out.push('ring');
      if (m.ringIndex >= RING_COURSE.length) {
        m.done = true;
        m.score += 500 + Math.max(0, Math.round((m.par - m.elapsed) * 2));
        m.objectiveText = 'Course complete — beautiful flying!';
        out.push('mission-complete');
      }
    }
    m._prevRadial = radial;
    if (m.elapsed > m.par + 120) { m.failed = true; m.objectiveText = 'Out of time — the course closed.'; out.push('mission-failed'); }
  }

  if (m.id === 'courier') {
    if (m.legs.length === 0) m.legs = ['marlin', 'tern', 'ashen'];
    const strip = stripById(m.legs[m.legIndex]);
    m.targetPos = strip;
    m.objectiveText = `Deliver parcel ${m.legIndex + 1} of 3 — land at ${strip.name}`;
    if (events.includes('touchdown') || events.includes('hard-landing')) {
      const q = landingQuality(state, strip);
      if (q !== null) {
        m.score += 200 + Math.round(q * 200);
        m.legIndex++;
        dust(P, state.pos.x, state.pos.y, state.pos.z, 14);
        out.push('delivery');
        if (m.legIndex >= m.legs.length) {
          m.done = true;
          m.score += 300;
          m.objectiveText = 'All parcels delivered — Emberline Air thanks you.';
          out.push('mission-complete');
        } else {
          m.objectiveText = `Parcel ${m.legIndex} delivered. Next: ${stripById(m.legs[m.legIndex]).name}`;
        }
      }
    }
    if (m.elapsed > m.par + 180) { m.failed = true; out.push('mission-failed'); }
  }

  if (m.id === 'rescue') {
    const beach = stripById('tern');
    const home = stripById('home');
    if (m.phase === 'fly') {
      m.targetPos = beach;
      m.objectiveText = 'Land on Tern Cay beach — the hiker is waiting by the palms';
      if (state.onGround && landingQuality(state, beach) !== null) {
        m.phase = 'pickup';
        m.pickupTimer = 4;
        out.push('rescue-landed');
      }
    } else if (m.phase === 'pickup') {
      m.targetPos = beach;
      m.pickupTimer -= dt;
      m.objectiveText = `Hiker boarding… ${Math.ceil(m.pickupTimer)}s — hold still`;
      if (!state.onGround) { m.phase = 'fly'; }
      else if (m.pickupTimer <= 0) {
        m.phase = 'return';
        m.score += 250;
        out.push('rescue-picked-up');
      }
    } else if (m.phase === 'return') {
      m.targetPos = home;
      m.objectiveText = 'Bring them home — land at Ember Isle Runway';
      if (events.includes('touchdown') || events.includes('hard-landing')) {
        const q = landingQuality(state, home);
        if (q !== null) {
          m.done = true;
          m.score += 350 + Math.round(q * 250);
          m.objectiveText = 'Rescue complete — the hiker is safe. Emberline Air salutes you.';
          out.push('mission-complete');
        }
      }
    }
    if (m.elapsed > m.par + 180) { m.failed = true; out.push('mission-failed'); }
  }

  if (m.id === 'precision') {
    const strip = stripById('ashen');
    m.targetPos = strip;
    m.objectiveText = 'Land on Ashen Peak strip — dead centre, feather soft';
    if (events.includes('touchdown') || events.includes('hard-landing')) {
      const q = landingQuality(state, strip);
      if (q !== null) {
        m.landingScore = Math.round(q * 1000);
        m.score += m.landingScore;
        m.done = true;
        dust(P, state.pos.x, state.pos.y, state.pos.z, 14);
        m.objectiveText = `Touchdown scored ${m.landingScore} / 1000 — ${q >= 0.85 ? 'textbook!' : q >= 0.6 ? 'solid flying.' : 'rough, but down.'}`;
        out.push('mission-complete');
      }
    }
    if (events.includes('crash')) { m.failed = true; }
    if (m.elapsed > m.par + 120) { m.failed = true; out.push('mission-failed'); }
  }

  // Crash fails every mission; fuel empty strands you.
  if (events.includes('crash')) {
    m.failed = true;
    m.objectiveText = 'Aircraft lost — mission failed.';
    out.push('mission-failed');
  }
  return out;
}

// Refuel when parked on any strip: the ground crew tops the tank.
export function refuelIfParked(state, dt) {
  if (!state.onGround) return false;
  for (const strip of STRIPS) {
    if (dist2D(state.pos, strip) < strip.length / 2) {
      const before = state.fuel;
      state.fuel = Math.min(100, state.fuel + 14 * dt);
      return state.fuel > before;
    }
  }
  return false;
}
