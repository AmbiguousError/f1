# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based 3D arcade F1 racing game. Pure static HTML/CSS/JS — no build step, no bundler, no package.json/npm scripts. Three.js and cannon-es are loaded at runtime from the `esm.sh` CDN via the import map in `index.html`; there is nothing to `npm install`.

## Running and checking the code

- Serve the directory over HTTP and open it in a browser — ES module imports and the CDN import map require `http(s)://`, not `file://`:
  ```
  python3 -m http.server 8000
  ```
  then visit `http://localhost:8000/index.html`.
- There is no test suite and no linter/formatter configured. The only automated check available is Node's syntax checker on a single file, e.g.:
  ```
  node --check js/race.js
  ```
- To verify a gameplay change, actually drive the affected flow in a browser (or via Playwright) — start a race, force the relevant condition (e.g. drive into the pits, complete a lap, run out of tyre life), and observe the HUD/car behavior. Type-checking doesn't exist here and syntax-checking doesn't validate game logic.
- `to_do.md` is the user's running wishlist of gameplay issues/feature ideas (grandstand orientation, pit logic, tyre strategy, braking/handling, race-position bugs, post-finish behavior). Check it for context on outstanding known issues before assuming an area is unfinished or working.

## Architecture

### Module wiring

`index.html` loads `js/ui-controls.js` as a classic (non-module) `<script>` first, then declares the import map (`three`, `three/addons/`, `cannon-es` → esm.sh CDN URLs), then loads `js/main.js` as `type="module"`. Because of this split, the start-screen menu and the game engine can't call each other's functions directly — they communicate through `window` `CustomEvent`s: `init-game`, `next-action`, `reset-game`, `quit-game`, `toggle-pause`, `toggle-mute`, `toggle-cam`. `ui-controls.js` dispatches these from its `onclick` handlers; `main.js` listens for them and drives the actual session lifecycle (`init()` / `cleanup()` / `togglePause()`).

### Central state, not classes

`js/state.js` holds all mutable game state as plain exported objects rather than classes/instances:
- `state` — the live session: scene/camera/renderer/physics world, player vehicle/body, track data, lap/tyre/pit state, etc. Reset in `main.js`'s `init()`/`cleanup()` on every race start/end.
- `cfg` — user-selected race settings (seed, laps, difficulty, weather, car class, etc).
- `season` — season-mode driver roster, points, grid order, seeds across races.
- `inputs` — current keyboard/touch input flags, mutated by `input.js`.
- `scratch` — preallocated `THREE.Vector3`/`CANNON.Vec3` scratch objects reused every animation frame to avoid per-frame GC allocation. Always reuse these in the hot loop rather than `new`-ing vectors inside `animate()`.
- `globalGeometries` / `globalMaterials` — `Set`s of shared geometries/materials (car parts, wheels, skidmark plane, etc.) that must survive `cleanup()` between races. `cleanup()` in `main.js` disposes every mesh's geometry/material found by traversing the scene *except* what's registered in these sets — any new shared/static Three.js resource must be added to one of these sets or it'll leak-dispose and break the next race.

### Per-module responsibilities

- `constants.js` — static tables: tyre compound stats, AI driver names/colors, zoom levels, points system.
- `utils.js` — `createRNG(seed)` (deterministic string-seeded PRNG) and `formatTime()`. The same seed always produces the same procedural track/scenery.
- `tracks.js` — `REAL_TRACKS`: hand-authored `{x,z}` control-point polylines for real-world circuit seeds (MONZA, SPA, MONACO, etc). These aren't survey-accurate — corners are deliberately widened to stay above this game's minimum driveable turn radius, and the first/last ~11% of each lap is kept straight because `generatePitLane()` assumes that. Read the file header comment before touching or adding a track layout; there's a specific set of geometric invariants every entry must satisfy (min turn radius, straight pit zone, no self-intersection).
- `track.js` — turns either a `REAL_TRACKS` entry or a procedurally-generated point loop (seeded by `state.rng`) into: the `CatmullRomCurve3` + resampled `trackPoints`, the track mesh + `CANNON.Trimesh` collision body, pit lane geometry/collision (`generatePitLane`), sand traps, grandstands, scenery (`generateScenery`), the minimap, and helpers used every frame (`findClosestTrackPoint`, `getPitLaneOffset`, `teleportToTrack`, `isSpaceClear`).
- `car-models.js` — builds the Three.js meshes for the player/AI car bodies (F1 and "mini" car class) and tyre-compound color stripes. Shared geometries/materials created here are registered into `globalGeometries`/`globalMaterials` at module load.
- `cars.js` — `createF1Car` (player) / `createAICar` (AI) wire a `car-models.js` mesh to a `CANNON.RaycastVehicle` + chassis body and push AI cars into `state.aiCars`.
- `race.js` — race/lap/checkpoint progression, standings (`getRaceStandings`), finish/qualifying results UI, tyre-strategy UI, and the entire AI driving+pit-stop logic inside `updateLogic()` (steering toward look-ahead track points, cornering speed, tyre wear, pit-lane decision/entry/stop/exit state machine).
- `effects.js` — dust particle spawning/update and a pooled skidmark system (`MAX_SKIDMARKS` reused mesh instances rather than allocating new ones).
- `audio.js` — procedural engine/turbo/skid sound via raw WebAudio oscillators (no audio files).
- `input.js` — keyboard + on-screen touch button handling, written into `inputs`.
- `main.js` — the entry point: session lifecycle (`init`/`cleanup`/`togglePause`/`startCountdown`), Three.js/cannon-es scene+world setup (`setupGraphics`/`setupPhysics`), and the per-frame `animate()` loop (physics step, player input→force/steering/braking, surface detection (tarmac/sand/grass), tyre wear/grip, the **player** pit-lane autopilot state machine, camera follow, downforce, HUD DOM updates).

### Pit lane: the trickiest cross-file coupling

Pit lane behavior is split across three places that must stay in sync:
1. `track.js`'s `generatePitLane()` builds the physical pit lane geometry/collision and sets `state.pitBoxPosition`, using a lateral-offset convention `side = (tangent.z, 0, -tangent.x)`.
2. `track.js`'s `getPitLaneOffset(idx)` recomputes that same offset magnitude for a given track index, used by both AI and player autopilot to steer toward the pit lane centerline.
3. Player pit control is a state machine (`state.pitPhase`: `'none' → 'entering' → 'stopped' → 'exiting' → 'none'`) driven entirely inside `main.js`'s `animate()`, which detects pit entry by lateral position, then takes over input entirely (ignores `inputs.*`) until exit. AI pit control is a parallel but separate state machine (`ai.wantsToPit`/`ai.inPitLane`/`ai.isPitting`) inside `race.js`'s `updateLogic()`.

When touching pit logic, note the deliberate sign convention: pit-lane offset math uses `side = (tan.z, -tan.x)`, *not* the `cross(tangent, up)` convention used for normal racing-line steering elsewhere — mixing them up steers the car toward the grandstand side instead of the pit lane (see the comment in `race.js`'s `updateLogic()`).
