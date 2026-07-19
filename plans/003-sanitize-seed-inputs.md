# Plan 003: Sanitize Seed Inputs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat da8288d..HEAD -- js/ui-controls.js js/main.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `da8288d`, 2026-07-19

## Why this matters

The custom circuit seed input (`seed-input`) is currently passed directly to the game initialization event without sanitization. While it is presently only used for seeded random number generation (RNG) and looking up pre-authored track templates, failing to sanitize user-facing inputs creates potential security vulnerabilities (e.g., Cross-Site Scripting or HTML injection) if the seed is later logged, stored, or rendered on screens (like leaderboard summaries or HUD information).

Sanitizing the seed using the same alphanumeric regex filter applied to the driver name ensures the seed is clean and secure before use.

## Current state

- File: `js/ui-controls.js` — Controls the start menu buttons and user settings.
- Excerpt from [js/ui-controls.js:L20-22](file:///home/g/Documents/Python/f1/js/ui-controls.js#L20-22):
  ```javascript
  window.startGame = function() {
      const seed = document.getElementById('seed-input').value || "MONZA"; const btn = document.getElementById('start-btn'); btn.innerText = "INITIALIZING..."; btn.disabled = true;
      setTimeout(() => { window.dispatchEvent(new CustomEvent('init-game', { detail: { mode: gameMode, seed: seed, time: selectedTime, laps: selectedLaps, seasonLen: seasonRaces, difficulty: selectedDifficulty, zoom: selectedZoom, opponents: selectedCars, weather: selectedWeather, qualifying: useQualifying, carClass: selectedClass, controlStyle: selectedControlStyle, startCompound: selectedStartTyre, noTyreWear: selectedNoWear, teamColor: selectedTeamColor, driverName: (document.getElementById('driver-name-input').value || '').trim(), raceStyle: selectedStyle, surface: selectedSurface } })); }, 100);
  };
  ```

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Syntax check | `node --check js/ui-controls.js` | exit 0, no output |

## Scope

**In scope**:
- `js/ui-controls.js`

**Out of scope**:
- `js/main.js`

## Git workflow

- Branch: `advisor/003-sanitize-seed-inputs`
- Commit message format: `sec: sanitize custom circuit seed input`

## Steps

### Step 1: Sanitize seed input in startGame()

Modify the `window.startGame` function in `js/ui-controls.js` to clean the seed input. Filter it using the same regex replacement used for the driver name input (allowing only alphanumeric characters, spaces, dots, underscores, and dashes), and limit the length to 12 characters.

In `js/ui-controls.js`, update the definition of `seed` in `window.startGame` to:
```javascript
    const seed = (document.getElementById('seed-input').value || '').replace(/[^A-Za-z0-9 _.\-]/g, '').trim().substring(0, 12) || "MONZA";
```

**Verify**:
- Run `node --check js/ui-controls.js` to ensure the file has no syntax errors.

---

## Test plan

- Playtest locally:
  1. Open a browser and load `http://localhost:8000/index.html`.
  2. Input a seed containing special characters, e.g. `MONZA#@!<script>`.
  3. Start the race and check `cfg.seed` (or trace using console logs/debugger) to verify it is stored as `MONZA`.

---

## Done criteria

- [x] `node --check js/ui-controls.js` exits 0 with no errors.
- [x] Special characters are successfully stripped from the custom seed input.
- [x] `plans/README.md` status row updated.

---

## STOP conditions

- The syntax check command fails after editing.
- The structure of `window.startGame` in `js/ui-controls.js` differs significantly from the excerpt.
