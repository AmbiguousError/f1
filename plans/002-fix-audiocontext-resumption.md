# Plan 002: Fix AudioContext Resumption

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat da8288d..HEAD -- js/audio.js js/main.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `da8288d`, 2026-07-19

## Why this matters

Under modern browser autoplay policies, `AudioContext` is created in a suspended state. It cannot play audio until a user interaction (like a mouse click or key press) occurs on the document. Currently, the game initializes the audio context inside `init()`, which is triggered via a `CustomEvent` inside a `setTimeout` in `ui-controls.js`'s `startGame()` function. Because this setup is detached from the direct click event handler's callstack, some browsers keep the `AudioContext` suspended, resulting in silent gameplay unless the user manually toggles the mute/unmute button.

Adding a global gesture listener that automatically resumes the `AudioContext` upon the user's first click or keystroke ensures audio always plays seamlessly.

## Current state

- File: `js/audio.js` — Handles Web Audio API setup and initialization.
- Excerpt from [js/audio.js:L3-15](file:///home/g/Documents/Python/f1/js/audio.js#L3-15):
  ```javascript
  export function setupAudio() {
      try {
          const AC = window.AudioContext || window.webkitAudioContext; state.audioCtx = new AC();
          state.engineOsc = state.audioCtx.createOscillator(); state.engineOsc.type = 'sawtooth'; state.engineOsc.frequency.value = 60; state.engineGain = state.audioCtx.createGain(); state.engineGain.gain.value = 0.1;
          state.turboOsc = state.audioCtx.createOscillator(); state.turboOsc.type = 'square'; state.turboOsc.frequency.value = 80; state.turboGain = state.audioCtx.createGain(); state.turboGain.gain.value = 0.05;
          state.skidOsc = state.audioCtx.createOscillator(); state.skidOsc.type = 'sawtooth'; state.skidOsc.frequency.value = 800; state.skidGain = state.audioCtx.createGain(); state.skidGain.gain.value = 0;
          const filter = state.audioCtx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 4000;
          state.engineOsc.connect(state.engineGain); state.turboOsc.connect(state.turboGain); state.engineGain.connect(filter); state.turboGain.connect(filter);
          const skidFilter = state.audioCtx.createBiquadFilter(); skidFilter.type = "bandpass"; skidFilter.frequency.value = 1000;
          state.skidOsc.connect(state.skidGain); state.skidGain.connect(skidFilter); skidFilter.connect(state.audioCtx.destination); filter.connect(state.audioCtx.destination);
          state.engineOsc.start(); state.turboOsc.start(); state.skidOsc.start();
      } catch (e) { console.warn("Audio fail"); }
  }
  ```

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Syntax check | `node --check js/audio.js` | exit 0, no output |

## Scope

**In scope**:
- `js/audio.js`

**Out of scope**:
- `js/main.js` (except for verification/playtesting)
- Any HTML UI modifications

## Git workflow

- Branch: `advisor/002-fix-audiocontext-resumption`
- Commit message format: `fix: auto-resume AudioContext on first user interaction`

## Steps

### Step 1: Add interaction listeners to resume AudioContext in setupAudio

Modify the `setupAudio()` function in `js/audio.js` to check if `state.audioCtx` is in a suspended state. If it is, register temporary interaction event listeners (`click`, `keydown`, `touchstart`) on the `window` to resume the context and clean themselves up once triggered.

Insert the following logic at the end of the `try` block in `setupAudio()`:

```javascript
        if (state.audioCtx && state.audioCtx.state === 'suspended') {
            const resume = () => {
                if (state.audioCtx && state.audioCtx.state === 'suspended') {
                    state.audioCtx.resume();
                }
                window.removeEventListener('click', resume);
                window.removeEventListener('keydown', resume);
                window.removeEventListener('touchstart', resume);
            };
            window.addEventListener('click', resume);
            window.addEventListener('keydown', resume);
            window.addEventListener('touchstart', resume);
        }
```

**Verify**:
- Run `node --check js/audio.js` to ensure the file has no syntax errors.

---

## Test plan

- Playtest locally:
  1. Open a browser and load `http://localhost:8000/index.html`.
  2. Start a race.
  3. Verify that the engine and game sounds are immediately audible upon clicking "ENTER COCKPIT" or pressing standard steering keys, without needing to toggle the mute button.

---

## Done criteria

- [x] `node --check js/audio.js` exits 0 with no errors.
- [x] `AudioContext` successfully transitions out of `suspended` state on first user click or key down.
- [x] `plans/README.md` status row updated.

---

## STOP conditions

- The syntax check command fails after editing.
- The structure of `setupAudio()` differs significantly from the excerpt in "Current State".
