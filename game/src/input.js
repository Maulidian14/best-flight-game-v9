// Emberline Air — input.
// One job: keyboard + mouse into a single control frame the flight model
// reads. Arrows pitch/bank, W/S throttle, Q/E rudder, Space brake, F flaps,
// G gear, C camera, P pause, M mute, R restart, 1–4 missions, mouse drag
// steers, click picks a mission card. Also: touch the canvas once and the
// audio unlocks (browsers demand a gesture).

export function newInput() {
  return {
    keys: {},
    pitch: 0, // -1..1, + = nose up (ArrowUp / ArrowDown)
    bank: 0, // -1..1, + = bank right
    yaw: 0,
    throttleDelta: 0,
    brake: false,
    flapsToggle: false,
    mouseDown: false,
    mouseDX: 0,
    mouseDY: 0,
    pressed: {}, // edge-triggered keys, consumed by main
  };
}

export function attachInput(input, canvas, onFirstGesture) {
  let gestured = false;
  const gesture = () => {
    if (!gestured) { gestured = true; onFirstGesture(); }
  };

  window.addEventListener('keydown', (e) => {
    gesture();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (!input.keys[e.key]) input.pressed[e.key.toLowerCase()] = true;
    input.keys[e.key.toLowerCase()] = true;
    input.keys[e.key] = true;
  });
  window.addEventListener('keyup', (e) => {
    input.keys[e.key.toLowerCase()] = false;
    input.keys[e.key] = false;
  });
  window.addEventListener('blur', () => { input.keys = {}; });

  canvas.addEventListener('mousedown', (e) => { gesture(); input.mouseDown = true; });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  window.addEventListener('mousemove', (e) => {
    if (!input.mouseDown) return;
    input.mouseDX += e.movementX || 0;
    input.mouseDY += e.movementY || 0;
  });

  // Mission cards are plain DOM buttons; main wires their clicks.
  return input;
}

// Fold the raw keys into the per-frame control frame.
export function pollInput(input, dt) {
  const k = input.keys;
  const up = k['arrowup'] ? 1 : 0;
  const down = k['arrowdown'] ? 1 : 0;
  const left = k['arrowleft'] ? 1 : 0;
  const right = k['arrowright'] ? 1 : 0;
  // ArrowUp = nose up. Mouse drag: up = nose up, right = bank right.
  let pitch = up - down;
  let bank = right - left;
  if (input.mouseDown) {
    pitch += Math.max(-1, Math.min(1, -input.mouseDY * 0.012));
    bank += Math.max(-1, Math.min(1, input.mouseDX * 0.012));
  }
  input.pitch = Math.max(-1, Math.min(1, pitch));
  input.bank = Math.max(-1, Math.min(1, bank));
  input.yaw = (k['e'] ? 1 : 0) - (k['q'] ? 1 : 0);
  input.throttleDelta = (k['w'] ? 1 : 0) - (k['s'] ? 1 : 0);
  input.brake = !!k[' '];
  input.flapsToggle = !!input.pressed['f'];
  input.mouseDX *= 0.82;
  input.mouseDY *= 0.82;
  input.pressed = {};
  return input;
}
