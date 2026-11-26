// Emberline Air — world configuration.
// One job: every number that defines the Meridian Archipelago, the Kestrel-9
// and the four missions. No other file hard-codes a world constant.

export const WORLD = {
  size: 6400, // playable square, metres, centred on (0, 0)
  waterLevel: 0,
  skyTop: 900,
  fogNear: 900,
  fogFar: 5200,
  gravity: 9.81,
};

// Islands: cone-shaped landmasses. heightAt(x, z) sums them, so the mesh, the
// physics and the minimap all agree on where the ground is.
export const ISLANDS = [
  {
    name: 'Ember Isle',
    x: 0, z: 0, radius: 1150, height: 150,
    beach: 0.16, rock: 0.62, // colour bands by normalised height
    color: 0x4d8f4a, sand: 0xe8d9a0, rockColor: 0x8a7a68,
    runway: { x: -260, z: 120, heading: 90, length: 420, width: 26 },
    hangar: { x: -420, z: 260 },
    lighthouse: { x: 620, z: -560 },
    label: 'EMBER ISLE — HOME BASE',
  },
  {
    name: 'Gull Rock',
    x: -1650, z: -1050, radius: 520, height: 210,
    beach: 0.10, rock: 0.45,
    color: 0x5d7a4a, sand: 0xd9c98f, rockColor: 0x7a6a58,
    label: 'GULL ROCK',
  },
  {
    name: 'Tern Cay',
    x: 1650, z: -1250, radius: 460, height: 42,
    beach: 0.55, rock: 0.9,
    color: 0x6fae5e, sand: 0xf2e2b0, rockColor: 0x9a8a72,
    beachStrip: { x: 1650, z: -1080, heading: 160, length: 300, width: 20 },
    hiker: { x: 1710, z: -1010 },
    label: 'TERN CAY — RESCUE BEACH',
  },
  {
    name: 'Ashen Peak',
    x: 1050, z: 1750, radius: 700, height: 320,
    beach: 0.05, rock: 0.35,
    color: 0x5a5a52, sand: 0x3d3a35, rockColor: 0x2e2c28,
    volcano: { x: 1050, z: 1750 },
    shortStrip: { x: 620, z: 1420, heading: 35, length: 240, width: 18 },
    label: 'ASHEN PEAK — VOLCANO',
  },
  {
    name: 'Marlin Bay',
    x: -700, z: 1950, radius: 640, height: 60,
    beach: 0.45, rock: 0.85,
    color: 0x58a06a, sand: 0xead9a4, rockColor: 0x8a7a68,
    label: 'MARLIN BAY',
  },
];

// Ring courses: each ring is {x, y, z, r, tilt} — tilt rotates the torus so
// some rings stand vertical, some lean, some lie flat-ish for dives.
export const RING_COURSE = [
  { x: 300, y: 150, z: -700, r: 26, tilt: 0 },
  { x: -500, y: 190, z: -1100, r: 24, tilt: 0.35 },
  { x: -1250, y: 230, z: -1150, r: 24, tilt: -0.3 },
  { x: -1750, y: 260, z: -700, r: 26, tilt: 0 },
  { x: -1400, y: 200, z: 200, r: 24, tilt: 0.5 },
  { x: -600, y: 160, z: 900, r: 26, tilt: 0 },
  { x: 200, y: 210, z: 1300, r: 24, tilt: -0.4 },
  { x: 900, y: 280, z: 1000, r: 26, tilt: 0 },
];

export const PLANE = {
  maxSpeed: 92, // m/s (~179 kt) at full throttle, level
  cruiseSpeed: 55,
  stallSpeed: 24, // m/s (~47 kt) — below this the nose drops
  takeoffSpeed: 28,
  maxThrottle: 1,
  fuelCapacity: 100, // percent
  fuelBurn: 0.55, // % per second at full throttle
  fuelBurnIdle: 0.06,
  hullMax: 100,
  turnRate: 0.55, // rad/s at full bank
  pitchRate: 0.5,
  climbRate: 9, // m/s at full power, level pitch
};

export const MISSIONS = [
  {
    id: 'rings', num: 1, key: '1',
    name: 'Ring Run',
    goal: 'Thread all 8 sky rings in order — fast and clean.',
    brief: 'The canyon course is live. Thread every ring in order. A missed ring costs time; a clipped ring costs hull.',
    par: 150, // seconds
  },
  {
    id: 'courier', num: 2, key: '2',
    name: 'Courier Delivery',
    goal: 'Land at three island strips in order and drop the mail.',
    brief: 'Three parcels, three strips: Marlin Bay, Tern Cay beach, Ashen Peak. Land soft, take off, keep the fuel for the leg home.',
    par: 420,
  },
  {
    id: 'rescue', num: 3, key: '3',
    name: 'Rescue Pickup',
    goal: 'Land on Tern Cay beach, pick up the stranded hiker, fly home.',
    brief: 'A hiker is stranded on Tern Cay beach. Put her down on the sand, hold still for the pickup, then bring them both home to Ember Isle.',
    par: 360,
  },
  {
    id: 'precision', num: 4, key: '4',
    name: 'Precision Landing',
    goal: 'Land on the short strip at Ashen Peak — dead centre, feather soft.',
    brief: 'Ashen Peak strip is 240 metres of gravel under a smoking volcano. Touch down on the marker: centre earns 100, soft earns the rest.',
    par: 240,
  },
];

export const STRIPS = [
  { id: 'home', name: 'Ember Isle Runway', x: -260, z: 120, heading: 90, length: 420, width: 40 },
  { id: 'marlin', name: 'Marlin Bay Strip', x: -700, z: 2050, heading: 190, length: 300, width: 40 },
  { id: 'tern', name: 'Tern Cay Beach', x: 1650, z: -1080, heading: 30, length: 300, width: 40 },
  { id: 'ashen', name: 'Ashen Peak Strip', x: 620, z: 1420, heading: 35, length: 240, width: 40 },
];

export const COLORS = {
  sky: 0x87b5e0,
  skyHorizon: 0xcfe4f2,
  water: 0x2e6f9e,
  waterDeep: 0x1d4f78,
  sun: 0xfff2c0,
  ring: 0xffb020,
  ringNext: 0xffd23f,
  ringDone: 0x37d67a,
  hudPanel: 'rgba(10, 22, 38, 0.72)',
  hudAmber: '#ffb020',
  hudGreen: '#37d67a',
  hudRed: '#ff5252',
};
