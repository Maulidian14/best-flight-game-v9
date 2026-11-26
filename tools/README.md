# Screenshot + playtest driver

`shots.mjs` serves `game/` over HTTP and drives it in headless Chromium
(Playwright + swiftshader WebGL). It takes the four screenshot poses and
runs the autopilot through each mission to prove it is completable.

```sh
# Screenshots (1280x720, writes ../screenshots/1..4-*.jpg)
GAME_DIR=../game OUT_DIR=../screenshots \
  CHROME=$HOME/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome \
  node tools/shots.mjs shots

# One shot only
ONLY=4 GAME_DIR=../game OUT_DIR=../screenshots CHROME=... node tools/shots.mjs shots

# Playtest one mission (small viewport, near real-time)
VIEWPORT=480x270 GAME_DIR=../game CHROME=... node tools/shots.mjs playtest rings
```

Setup: this tool needs `playwright-core`. It is NOT installed here — point
`tools/node_modules/playwright-core` at an existing copy:

```sh
mkdir -p tools/node_modules
ln -s /path/to/another/project/node_modules/playwright-core tools/node_modules/playwright-core
```

That symlink is git-ignored (see `../.gitignore`); it is a local dev
dependency only and is never part of the submitted game.
