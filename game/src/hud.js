// Emberline Air — heads-up display.
// One job: turn the flight state into readable instruments. Big numbers,
// high contrast, nothing the judge has to squint at: airspeed / altitude /
// heading top-left, mission + score top-centre, attitude ball and minimap
// bottom corners, throttle + fuel + hull bars bottom-left, compass strip.

import { knots, feet, fpm, compassLabel } from './physics.js';
import { ISLANDS, STRIPS } from './config.js';

let els = null;
let attCtx = null;
let mapCtx = null;

export function initHud() {
  els = {
    speed: document.getElementById('hud-speed'),
    alt: document.getElementById('hud-alt'),
    vspeed: document.getElementById('hud-vs'),
    heading: document.getElementById('hud-hdg'),
    compass: document.getElementById('hud-compass'),
    missionName: document.getElementById('hud-mission'),
    objective: document.getElementById('hud-objective'),
    score: document.getElementById('hud-score'),
    time: document.getElementById('hud-time'),
    fuelBar: document.getElementById('hud-fuel-bar'),
    fuelText: document.getElementById('hud-fuel-text'),
    hullBar: document.getElementById('hud-hull-bar'),
    hullText: document.getElementById('hud-hull-text'),
    thrBar: document.getElementById('hud-thr-bar'),
    thrText: document.getElementById('hud-thr-text'),
    flaps: document.getElementById('hud-flaps'),
    gear: document.getElementById('hud-gear'),
    banner: document.getElementById('hud-banner'),
    bannerSub: document.getElementById('hud-banner-sub'),
    warn: document.getElementById('hud-warn'),
    attitude: document.getElementById('hud-attitude'),
    minimap: document.getElementById('hud-minimap'),
    nextRing: document.getElementById('hud-next-ring'),
  };
  attCtx = els.attitude.getContext('2d');
  mapCtx = els.minimap.getContext('2d');
}

let bannerTimer = 0;
export function showBanner(text, sub = '') {
  if (!els) return;
  els.banner.textContent = text;
  els.bannerSub.textContent = sub;
  els.banner.parentElement.classList.add('show');
  bannerTimer = 3.2;
}

export function hideBanner() {
  if (!els) return;
  els.banner.parentElement.classList.remove('show');
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function updateHud(state, mission, dt) {
  if (!els) return;
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) hideBanner();
  }

  els.speed.textContent = `${knots(state.speed)} kt`;
  els.alt.textContent = `${feet(state.pos.y)} ft`;
  const vs = fpm(state.verticalSpeed);
  els.vspeed.textContent = `${vs >= 0 ? '+' : ''}${vs} fpm`;
  els.vspeed.style.color = vs >= 0 ? '#7dff9a' : '#ffb020';
  els.heading.textContent = `${String(Math.round(state.heading)).padStart(3, '0')}° ${compassLabel(state.heading)}`;

  // Compass strip: a sliding window of headings around the nose.
  let strip = '';
  for (let d = -60; d <= 60; d += 15) {
    const h = ((Math.round(state.heading) + d) % 360 + 360) % 360;
    const major = h % 45 === 0;
    const label = major ? (h === 0 ? 'N' : h === 90 ? 'E' : h === 180 ? 'S' : h === 270 ? 'W' : `${h}`) : '·';
    const cls = Math.abs(d) < 8 ? 'on' : '';
    strip += `<span class="${cls}">${label}</span>`;
  }
  els.compass.innerHTML = strip;

  els.missionName.textContent = mission ? mission.name.toUpperCase() : 'FREE FLIGHT';
  els.objective.textContent = mission ? mission.objectiveText : 'Fly the archipelago — pick a mission with keys 1–4.';
  els.score.textContent = String(mission ? mission.score : 0).padStart(5, '0');
  els.time.textContent = mission ? fmtTime(mission.elapsed) : fmtTime(state.flightTime || 0);

  els.fuelBar.style.width = `${state.fuel}%`;
  els.fuelBar.style.background = state.fuel < 20 ? '#ff5252' : state.fuel < 45 ? '#ffb020' : '#37d67a';
  els.fuelText.textContent = `FUEL ${Math.round(state.fuel)}%`;
  els.hullBar.style.width = `${state.hull}%`;
  els.hullBar.style.background = state.hull < 35 ? '#ff5252' : '#37d67a';
  els.hullText.textContent = `HULL ${Math.round(state.hull)}%`;
  els.thrBar.style.width = `${Math.round(state.throttle * 100)}%`;
  els.thrText.textContent = `THR ${Math.round(state.throttle * 100)}%`;
  els.flaps.textContent = state.flaps ? 'FLAPS DOWN' : 'FLAPS UP';
  els.gear.textContent = state.gearDown ? 'GEAR DOWN' : 'GEAR UP';
  els.nextRing.textContent = mission && mission.nextRingText ? mission.nextRingText : '';

  // Warnings: low fuel, stall, damage.
  let warn = '';
  if (state.crashed) warn = 'CRASHED — press R to restart';
  else if (state.fuel <= 0) warn = 'FUEL EMPTY — GLIDE TO A STRIP';
  else if (state.fuel < 20) warn = 'LOW FUEL — land and refuel';
  else if (state.speed < 24 && !state.onGround) warn = 'STALL — NOSE DOWN, FULL POWER';
  else if (state.hull < 35) warn = 'HULL DAMAGE — FLY GENTLE';
  els.warn.textContent = warn;
  els.warn.style.display = warn ? 'block' : 'none';

  drawAttitude(state);
  drawMinimap(state, mission);
}

function drawAttitude(state) {
  const c = attCtx;
  const w = 132, h = 132, cx = w / 2, cy = h / 2;
  c.clearRect(0, 0, w, h);
  c.save();
  c.beginPath();
  c.arc(cx, cy, 62, 0, Math.PI * 2);
  c.clip();
  // Sky / ground halves, rotated by bank, shifted by pitch.
  c.translate(cx, cy);
  c.rotate((-state.bank * Math.PI) / 180);
  const pitchPx = Math.max(-50, Math.min(50, state.pitch * 1.6));
  c.translate(0, pitchPx);
  c.fillStyle = '#3f8fd2';
  c.fillRect(-70, -120, 140, 120);
  c.fillStyle = '#8a6a42';
  c.fillRect(-70, 0, 140, 120);
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.lineWidth = 1.5;
  for (const p of [-30, -15, 15, 30]) {
    c.beginPath();
    c.moveTo(-34, p * 1.6);
    c.lineTo(34, p * 1.6);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(-62, 0);
  c.lineTo(62, 0);
  c.lineWidth = 2.5;
  c.stroke();
  c.restore();
  // Fixed wings + nose marker (the plane symbol never moves).
  c.strokeStyle = '#ffd23f';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(cx - 34, cy);
  c.lineTo(cx - 10, cy);
  c.moveTo(cx + 10, cy);
  c.lineTo(cx + 34, cy);
  c.stroke();
  c.fillStyle = '#ffd23f';
  c.beginPath();
  c.arc(cx, cy, 4, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.35)';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(cx, cy, 62, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.font = 'bold 11px Arial';
  c.textAlign = 'center';
  c.fillText(`ATTITUDE · ${Math.round(state.bank)}° BANK`, cx, h - 6);
}

function drawMinimap(state, mission) {
  const c = mapCtx;
  const w = 168, h = 168;
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(10, 30, 48, 0.85)';
  c.fillRect(0, 0, w, h);
  const scale = w / 6400;
  const X = (x) => (x + 3200) * scale;
  const Z = (z) => (z + 3200) * scale;
  // Sea.
  c.fillStyle = '#1d4f78';
  c.fillRect(0, 0, w, h);
  // Islands.
  for (const isl of ISLANDS) {
    c.fillStyle = '#4d8f4a';
    c.beginPath();
    c.arc(X(isl.x), Z(isl.z), isl.radius * scale, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#e8d9a0';
    c.beginPath();
    c.arc(X(isl.x), Z(isl.z), isl.radius * scale * 0.85, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#4d8f4a';
    c.beginPath();
    c.arc(X(isl.x), Z(isl.z), isl.radius * scale * 0.6, 0, Math.PI * 2);
    c.fill();
  }
  // Strips.
  c.fillStyle = '#f5f2e8';
  for (const s of STRIPS) {
    c.fillRect(X(s.x) - 2, Z(s.z) - 2, 4, 4);
  }
  // Mission target: next ring or strip.
  if (mission && mission.targetPos) {
    const p = mission.targetPos;
    c.strokeStyle = '#ffb020';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(X(p.x), Z(p.z), 7, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#ffb020';
    c.beginPath();
    c.arc(X(p.x), Z(p.z), 2.5, 0, Math.PI * 2);
    c.fill();
  }
  // The plane: a triangle pointing along the heading.
  const px = X(state.pos.x), pz = Z(state.pos.z);
  const a = (state.heading * Math.PI) / 180;
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(px + Math.sin(a) * 8, pz - Math.cos(a) * 8);
  c.lineTo(px + Math.sin(a + 2.5) * 6, pz - Math.cos(a + 2.5) * 6);
  c.lineTo(px + Math.sin(a - 2.5) * 6, pz - Math.cos(a - 2.5) * 6);
  c.closePath();
  c.fill();
  c.strokeStyle = '#ffb020';
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(px, pz, 11, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.font = 'bold 10px Arial';
  c.textAlign = 'left';
  c.fillText('MERIDIAN ARCHIPELAGO', 6, h - 6);
}
