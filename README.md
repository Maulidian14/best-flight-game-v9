# Emberline Air — Meridian Archipelago Courier

[![make.fun](https://make.fun/c/best-flight-game-20261126-0057/badge.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/c/best-flight-game-20261126-0057/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![prize $500](https://make.fun/c/best-flight-game-20261126-0057/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

A bush-pilot flight game for make.fun's **best flight game** bounty. You fly
the Kestrel-9, a single-engine STOL courier plane, across the Meridian
Archipelago — threading sky rings, landing mail on island strips, picking up
a stranded hiker, and putting her down feather-soft on a volcano strip.

## Play

Open `game/index.html` in desktop Chrome (or run `node serve.ts` and open
http://localhost:8080). No network, no build step, no install.

| Key | Action |
| --- | --- |
| ↑ / ↓ | Pitch up / down |
| ← / → | Bank and turn |
| W / S | Throttle up / down |
| Q / E | Rudder |
| Space | Brake |
| F | Flaps up / down |
| G | Gear up / down |
| C | Camera (chase / near) |
| P | Pause |
| M | Sound on / off |
| R | Back to the menu |
| 1 / 2 / 3 / 4 | Pick a mission |
| Mouse | Hold and drag to steer; click the mission cards |

## The four missions

1. **Ring Run** — thread 8 sky rings in order over Gull Rock. Fast and clean
   scores; a clipped ring costs hull.
2. **Courier Delivery** — land at three island strips in order (Marlin Bay,
   Tern Cay beach, Ashen Peak) and drop the mail. Refuel by parking on a strip.
3. **Rescue Pickup** — land on Tern Cay beach, hold still while the stranded
   hiker boards, then fly them home to Ember Isle.
4. **Precision Landing** — land on the short gravel strip under the Ashen Peak
   volcano. Dead centre and feather soft scores up to 1000.

## What makes it fly

- **Real 3D** (three.js, vendored): chase camera over recognisable terrain —
  five named islands, a lighthouse, a smoking volcano, beaches, palms, boats.
- **Honest flight model**: lift needs speed, a bank turns the heading, a stall
  drops the nose, and the ground is always there. Fuel burns with throttle;
  hard landings and hillsides damage the hull.
- **Instruments that read**: airspeed, altitude, vertical speed and heading,
  a compass strip, an attitude ball, a live chart (minimap), throttle / fuel /
  hull bars, and a mission objective bar.
- **Synthesised sound**: engine drone, wind, ring chimes, touchdown thumps —
  built from oscillators at run time, no audio files.
- **Original**: the world, the aircraft, the names, the art and the sound are
  all our own.

## Layout

```
game/
  index.html            page, import map, HUD
  vendor/
    three.module.min.js three.js r160 (vendored)
  src/
    config.js     world numbers, islands, missions, strips
    terrain.js    heightfield, sea, sky, clouds, strips, rings, labels
    props.js      hiker, palms, boats, buoys
    aircraft.js   the Kestrel-9 mesh + prop + damage smoke
    physics.js    flight model, ground, stalls, crashes
    camera.js     chase / near / orbit camera
    hud.js        instruments, attitude ball, minimap
    missions.js   the four sorties + scoring + refuel
    audio.js      synthesised engine, wind, chimes
    input.js      keyboard + mouse
    particles.js  ring bursts, dust, splash, smoke
    autopilot.js  playtest + screenshot poses
    shots.js      ?shot=1..4 photogenic poses
    main.js       boot, loop, menus, states
main.ts             hands game/ + screenshots/ to /output + dossier.json
tools/
  shots.mjs       headless-Chromium screenshot + playtest driver (dev only)
  README.md       how to run it
```

## Screenshots

Four real renders of the game, taken by its own screenshot poses
(`?shot=1..4`): the ring run (cover), the runway approach, the rescue beach,
and the precision touchdown.
