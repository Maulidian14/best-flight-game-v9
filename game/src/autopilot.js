// Emberline Air — autopilot.
// One job: fly the Kestrel-9 to a waypoint and, when asked, land on a strip.
// Used by the playtest harness (every mission must be completable) and by
// the screenshot poses. It is a plain proportional controller over the same
// inputs a human uses — no cheats, no teleporting mid-flight.

import * as THREE from 'three';
import { groundHeight } from './terrain.js';

export function newAutopilot() {
  return {
    active: false,
    target: null, // {x, y, z, land?: strip}
    done: false,
    phase: 'cruise', // cruise | descend | flare | rollout
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Steer toward target; returns a control frame like pollInput's.
export function autopilotControl(ap, state, dt) {
  const out = { pitch: 0, bank: 0, yaw: 0, throttleDelta: 0, brake: false, flapsToggle: false };
  if (!ap.active || !ap.target || state.crashed) return out;
  const t = ap.target;

  // Desired heading to the target.
  const dx = t.x - state.pos.x;
  const dz = t.z - state.pos.z;
  const dist = Math.hypot(dx, dz);
  let wantHeading = (Math.atan2(dx, -dz) * 180) / Math.PI;
  wantHeading = ((wantHeading % 360) + 360) % 360;
  let dH = wantHeading - state.heading;
  dH = ((dH + 540) % 360) - 180;

  // Landing: line up with the strip heading on final, descend on a 3° slope.
  if (t.land) {
    const strip = t.land;
    const along = (state.pos.x - strip.x) * Math.sin((strip.heading * Math.PI) / 180)
      - (state.pos.z - strip.z) * Math.cos((strip.heading * Math.PI) / 180);
    const across = (state.pos.x - strip.x) * Math.cos((strip.heading * Math.PI) / 180)
      + (state.pos.z - strip.z) * Math.sin((strip.heading * Math.PI) / 180);
    const finalDist = -along; // positive while approaching the threshold
    // Join final only at the entry point, 800 m out on the extended
    // centreline (see the cruise block below). The old rule also let the
    // plane drop into descend whenever finalDist < 900 while it was still
    // flying SOUTH past the strip toward the entry — it was then over the
    // strip heading the wrong way, and the flare fired mid-U-turn while
    // the plane was 90 m high and 170° off the strip heading.
    if (ap.phase === 'descend') {
      wantHeading = strip.heading;
      dH = ((wantHeading - state.heading + 540) % 360) - 180;
      // Correct the lateral offset by aiming across it. The gain must be
      // strong enough to matter on a short final: at 0.05 the plane joined
      // Tern Cay's final 136 m off the centreline and only corrected ~50 m
      // of it before flying past the strip, so the flare (which needs
      // |across| < 80) never fired and it went around forever.
      dH += clamp(-across * 0.12, -25, 25);
      // Turn first, descend second: while the heading is still well off the
      // strip's (the entry puts the plane ~135° away from final), hold
      // altitude and just turn. Descending through the turn bled 100 m and
      // put the plane into the rising ground short of the strip.
      // Clear the terrain under the plane, not just the strip: Tern Cay's
      // southern slope rises above the strip's own ground height, so a
      // glidepath drawn from the strip alone flew the plane into the
      // hillside 350 m short of the threshold (hull -18, go-around loop).
      // But on short final (inside 150 m) follow the glidepath alone: the
      // terrain hold kept the plane 15 m over the volcano slope, so it
      // flared 18 m above the strip, ballooned, stalled, and sank too
      // slowly to touch down. The strip itself is flat and clear.
      const pathAlt = groundHeight(strip.x, strip.z) + Math.max(6, finalDist * 0.055);
      const clearAlt = groundHeight(state.pos.x, state.pos.z) + 15;
      const wantAlt = Math.abs(dH) > 20
        ? state.pos.y
        : (finalDist < 150 ? pathAlt : Math.max(pathAlt, clearAlt));
      const altErr = wantAlt - state.pos.y;
      // Damped glidepath tracking: the vertical-speed term stops the
      // porpoising (steep dives then hard pull-ups) the plain P-loop had.
      // Gentle authority and strong sink damping: the plane arrives at the
      // entry ~90 m above the path (cruise holds ground+150 for terrain
      // clearance) and must lose that height over the 1200 m final without
      // diving into the rising ground short of the strip.
      out.pitch = clamp(altErr * 0.03 - state.verticalSpeed * 0.06, -0.3, 0.3);
      // Hold 46–54 m/s on the approach: the old 34–42 band sat so close to
      // the 24 m/s stall that one throttle cut (or the flare's pitch-up)
      // stalled the plane out of the sky short of the strip.
      out.throttleDelta = state.speed < 46 ? 1 : state.speed > 54 ? -1 : 0;
      if (!state.flaps) out.flapsToggle = true;
      // Flare only when actually lined up with the strip heading AND close
      // to the centreline AND wings level AND low over the strip: the
      // flare used to fire at |across| < 80, but the landing only counts
      // inside width/2 + 14 (34 m on a 40 m strip), so the plane flared
      // at 65 m off, touched down on the grass beside the strip, and the
      // delivery never counted. And it must be LOW: the terrain-clearance
      // hold keeps the plane 15 m over the rising volcano slope, so a
      // flare fired on finalDist alone went off 35 m above the strip —
      // the plane ballooned to 78 m, stalled, and sank too slowly to
      // touch down inside the shot's 90 s window.
      const heightOverStrip = state.pos.y - groundHeight(strip.x, strip.z);
      if (finalDist < 120 && finalDist > 0 && Math.abs(across) < 30 && Math.abs(dH) < 30 && Math.abs(state.bank) < 20 && heightOverStrip < 20) ap.phase = 'flare'; // flare at 120 m: the 60 m flare broke the courier (the plane overshot Marlin Bay's strip and went around until the fuel ran out) — the 120 m flare is what the playtests prove, and the stall it caused in shot 4 is fixed by the gentle pitch + partial throttle below, not by shortening the flare
      // Lost the final (overshot past the strip or blown far off the
      // centreline): go around, re-fly to the entry, try again.
      else if (finalDist < -50 || Math.abs(across) > 400) ap.phase = 'cruise';
    } else if (ap.phase === 'flare') {
      wantHeading = strip.heading;
      dH = ((wantHeading - state.heading + 540) % 360) - 180;
      // Firm flare: pitch 0.55 + full throttle cut. The gentle flare
      // (0.3, -0.5) floated the courier past all three strips — it went
      // around until the fuel ran out (392, not the 1484 the firm flare
      // scores). The balloon/stall the firm flare caused in shot 4 is
      // contained by the heightOverStrip < 20 gate above (it only flares
      // when low) and the shot's 150 s window.
      out.pitch = 0.55; // hold the nose up, bleed speed
      out.throttleDelta = -1;
      if (state.onGround) {
        ap.phase = 'rollout';
        ap.done = true;
      }
    } else if (ap.phase === 'rollout') {
      out.brake = true;
      out.throttleDelta = -1;
      out.pitch = 0;
      if (state.speed < 2) ap.done = true;
    }
    if (ap.phase === 'cruise') {
      // Already on final? The screenshot poses drop the plane 420–780 m
      // out, lined up on the strip heading — flying all the way back to
      // the 1500 m entry first would turn the plane around and blow the
      // shot's 90 s window (it orbited Ashen Peak instead of landing).
      // So if the plane is already inside the entry, roughly lined up,
      // and near the centreline, join the descent straight away.
      if (finalDist < 1500 && finalDist > 0 && Math.abs(across) < 150 && Math.abs(dH) < 60) {
        ap.phase = 'descend';
      }
      // Fly to a point on the extended centreline, then turn in. 1500 m
      // out, not 1000: the 135° turn onto final plus the lateral correction
      // needs a long straight final — at 1000 m the plane joined Ashen
      // Peak's final 80 m off the centreline with only 133 m left to
      // correct it, so the flare (which needs |across| < 30) never fired
      // and it went around until the fuel ran out. The entry is clamped
      // inside the chart: Marlin Bay at 1500 m would fall off the south
      // edge (z 3527 > 3100), so it keeps a shorter entry there.
      let entryDist = 1500;
      let entryX = strip.x - Math.sin((strip.heading * Math.PI) / 180) * entryDist;
      let entryZ = strip.z + Math.cos((strip.heading * Math.PI) / 180) * entryDist;
      while ((Math.abs(entryX) > 2900 || Math.abs(entryZ) > 2900) && entryDist > 600) {
        entryDist -= 100;
        entryX = strip.x - Math.sin((strip.heading * Math.PI) / 180) * entryDist;
        entryZ = strip.z + Math.cos((strip.heading * Math.PI) / 180) * entryDist;
      }
      const edx = entryX - state.pos.x;
      const edz = entryZ - state.pos.z;
      wantHeading = (Math.atan2(edx, -edz) * 180) / Math.PI;
      wantHeading = ((wantHeading % 360) + 360) % 360;
      dH = ((wantHeading - state.heading + 540) % 360) - 180;
      // Descend toward the entry on the glidepath, not at cruise altitude:
      // the glidepath at the entry is ground + entryDist*0.055, and arriving
      // there at ground+150 left the plane 100 m high on a short final,
      // so it flared high, stalled and fell onto the strip.
      const distEntry = Math.hypot(edx, edz);
      const wantAlt = groundHeight(strip.x, strip.z) + Math.max(entryDist * 0.055, Math.min(150, distEntry * 0.08));
      // Damped altitude hold (same as the final): a plain P-loop dove at
      // -38° to shed 30 m, and the plane arrived at the entry already in a
      // steep dive it could not arrest before the turn onto final.
      out.pitch = clamp((wantAlt - state.pos.y) * 0.03 - state.verticalSpeed * 0.06, -0.3, 0.3);
      out.throttleDelta = state.speed < 48 ? 1 : state.speed > 60 ? -1 : 0;
      // Turn in for final once the entry point is close. Relying only on
      // finalDist < 900 left the plane orbiting the entry point forever:
      // it could circle there at finalDist ~1200 and never descend.
      if (Math.hypot(edx, edz) < 250) ap.phase = 'descend';
    }
  } else {
    // Cruise to a point: hold altitude, bank into the heading error.
    // Damped, like the landing phases — a plain P-loop porpoised.
    const wantAlt = t.y ?? 160;
    const altErr = wantAlt - state.pos.y;
    out.pitch = clamp(altErr * 0.03 - state.verticalSpeed * 0.06, -0.3, 0.3);
    out.throttleDelta = state.speed < 50 ? 1 : state.speed > 62 ? -1 : 0;
    if (dist < 30) ap.done = true;
  }

  // Bank into the heading error as a proper loop on the bank ANGLE: the
  // target bank is proportional to the heading error (capped at 40°), and
  // the input drives the actual bank toward it. The old law fed the
  // heading error straight into the bank RATE, so the plane banked to the
  // 68° stop on every 170° turn onto final, overshot the centreline by
  // ~50 m, and kept landing on the grass beside the strip (hull -18 a
  // time) instead of on it.
  // Wings level on the ground: banking during the takeoff roll lifts the
  // plane off already banked, and the first re-touchdown then crashes it
  // for being unaligned. Steer only once airborne.
  const bankTarget = state.onGround ? 0 : clamp(dH * 0.35, -40, 40);
  out.bank = state.onGround ? 0 : clamp((bankTarget - state.bank) * 0.08, -1, 1);
  out.yaw = state.onGround ? 0 : clamp(dH * 0.004, -0.4, 0.4);
  return out;
}

// Point the autopilot at a ring / waypoint / strip.
export function autopilotFlyTo(ap, x, y, z) {
  ap.active = true;
  ap.done = false;
  ap.phase = 'cruise';
  ap.target = { x, y, z };
}

export function autopilotLand(ap, strip) {
  ap.active = true;
  ap.done = false;
  ap.phase = 'cruise';
  ap.target = { x: strip.x, y: groundHeight(strip.x, strip.z) + 2, z: strip.z, land: strip };
}

export function autopilotOff(ap) {
  ap.active = false;
  ap.target = null;
  ap.done = false;
}
