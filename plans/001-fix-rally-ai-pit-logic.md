# Plan 001: Fix AI Pit Strategy in Rally Mode

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 5c64ca1..HEAD -- js/race.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5c64ca1`, 2026-07-19

## Why this matters

In Rally mode, pit lanes and pit boxes are not generated (so `state.pitBoxPosition` remains `null`). However, the start screen configuration does not force `noTyreWear = true` for Rally mode. When tyre wear is active in Rally mode, AI cars eventually wear down their tyres, which triggers `ai.wantsToPit = true`. Because they wants to pit, they set `ai.inPitLane = true` near the start/finish line area and steer with a large lateral offset (into walls/scenery) trying to follow a non-existent pit lane. This bug causes AI cars to crash and get stuck at the start/finish line in Rally mode.

Preventing AI cars from planning a pit stop when no pit lane/pit box exists will ensure they continue racing on the track path even if tyre wear is enabled.

## Current state

- File: `js/race.js` — Handles AI pathing, steering, and pit strategy decision logic.
- Excerpt from [js/race.js:L228-230](file:///home/g/Documents/Python/f1/js/race.js#L228-230):
  ```javascript
  // AI Pit Strategy Decision
  if (state.raceState === 'racing' && !cfg.noTyreWear && !ai.finished && !ai.inPitLane && ai.tyreLife < ai.pitThreshold && (state.totalLaps - ai.lap) >= 1) {
      ai.wantsToPit = true;
  }
  ```

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Syntax check | `node --check js/race.js` | exit 0, no output |

## Scope

**In scope**:
- `js/race.js`

**Out of scope**:
- Anything else under `js/`
- Any HTML UI modifications

## Git workflow

- Branch: `advisor/001-fix-rally-ai-pit-logic`
- Commit message format: `fix: prevent AI pitting strategy when pit lane does not exist`

## Steps

### Step 1: Prevent AI wantsToPit from triggering when there is no pit lane

Modify the AI Pit Strategy Decision conditional statement in [js/race.js:L228](file:///home/g/Documents/Python/f1/js/race.js#L228) to additionally check for the existence of `state.pitBoxPosition` (or that `cfg.raceStyle !== 'rally'`). Using `state.pitBoxPosition` is preferred as it is the direct physical indicator of a functional pit lane.

The conditional check should look like:
```javascript
        // AI Pit Strategy Decision
        if (state.raceState === 'racing' && state.pitBoxPosition && !cfg.noTyreWear && !ai.finished && !ai.inPitLane && ai.tyreLife < ai.pitThreshold && (state.totalLaps - ai.lap) >= 1) {
            ai.wantsToPit = true;
        }
```

**Verify**:
- Run `node --check js/race.js` to ensure the file has no syntax errors.

---

## Test plan

- Playtest locally:
  1. Open a browser and load `http://localhost:8000/index.html`.
  2. Select `STYLE: RALLY`, set `TYRES: SOFT` (do NOT select NO WEAR), and set `LAPS: 5`.
  3. Start the race and observe the AI cars. Let them complete 3-4 laps until their tyre wear becomes low.
  4. Ensure they do not steer off-track at the start/finish line and continue racing normally.

---

## Done criteria

- [x] `node --check js/race.js` exits 0 with no errors.
- [x] AI cars do not set `ai.wantsToPit = true` in Rally mode even when tyre life is low.
- [x] `plans/README.md` status row updated.

---

## STOP conditions

- The conditional check in `js/race.js` at line 228 has been altered or differs significantly from the excerpt in "Current state".
- The syntax check command fails after editing.

---

## Maintenance notes

- If a rally pit lane/service park is ever added to Rally mode in the future (generating a `state.pitBoxPosition`), this check will automatically allow AI cars to pit there without further modifications.
