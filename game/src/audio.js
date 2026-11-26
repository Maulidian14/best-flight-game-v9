// Emberline Air — synthesised sound.
// One job: every sound the game makes, built from oscillators and filtered
// noise at runtime. No audio files, nothing copied: engine drone, wind,
// ring chime, touchdown thump, warning beep, mission fanfare.

let ctx = null;
let master = null;
let engineOsc = null;
let engineOsc2 = null;
let engineGain = null;
let windSrc = null;
let windGain = null;
let muted = false;
let started = false;

export function isMuted() { return muted; }

export function initAudio() {
  if (started) return;
  started = true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // Engine: two detuned saws through a low-pass, pitch follows rpm.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 82;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    engineOsc.connect(lp);
    engineOsc2.connect(lp);
    lp.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineOsc2.start();

    // Wind: looped noise buffer through a band-pass, gain follows airspeed.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0.0;
    windSrc.connect(bp);
    bp.connect(windGain);
    windGain.connect(master);
    windSrc.start();
  } catch (e) {
    ctx = null;
  }
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

export function updateEngine(rpm, speed, onGround) {
  if (!ctx || !engineOsc) return;
  const t = ctx.currentTime;
  const f = 48 + rpm * 95;
  engineOsc.frequency.setTargetAtTime(f, t, 0.08);
  engineOsc2.frequency.setTargetAtTime(f * 1.494, t, 0.08);
  const target = muted ? 0 : (onGround ? 0.03 + rpm * 0.05 : 0.02 + rpm * 0.075);
  engineGain.gain.setTargetAtTime(target, t, 0.1);
  windGain.gain.setTargetAtTime(muted ? 0 : Math.min(0.12, speed * 0.0013), t, 0.15);
}

function tone(freq, dur, type = 'sine', vol = 0.22, when = 0) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export function sfxRing() { tone(880, 0.35, 'sine', 0.25); tone(1318, 0.4, 'sine', 0.18, 0.08); }
export function sfxThump() { tone(70, 0.3, 'sine', 0.4); tone(140, 0.18, 'triangle', 0.2, 0.02); }
export function sfxCrash() {
  tone(55, 0.9, 'sawtooth', 0.35);
  tone(38, 1.1, 'square', 0.25, 0.05);
}
export function sfxBeep() { tone(1180, 0.12, 'square', 0.12); }
export function sfxClick() { tone(660, 0.07, 'sine', 0.15); }
export function sfxFanfare() {
  [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 'triangle', 0.22, i * 0.13));
}
export function sfxPickup() { tone(784, 0.25, 'sine', 0.2); tone(988, 0.35, 'sine', 0.2, 0.1); }
