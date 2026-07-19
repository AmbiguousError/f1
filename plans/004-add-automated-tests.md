# Plan 004: Add Automated Tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: This is a greenfield setup. Confirm that no `package.json` exists in the repository root.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `da8288d`, 2026-07-19

## Why this matters

The codebase currently lacks any automated tests. While game logic and rendering are visual and require playtesting, key helper modules such as [js/utils.js](file:///home/g/Documents/Python/f1/js/utils.js), [js/constants.js](file:///home/g/Documents/Python/f1/js/constants.js), and track/driver performance scaling formulas are highly mathematical and deterministic. Without unit tests, changes to these logic files can easily introduce regressions (such as broken timing formats or non-deterministic track generators) that go unnoticed until manual playtesting.

Setting up Vitest (which supports modern ES modules natively with zero config) and adding baseline unit tests ensures stability.

## Current state

- File: [js/utils.js](file:///home/g/Documents/Python/f1/js/utils.js) — Contains utility helper functions.
- Excerpt from [js/utils.js](file:///home/g/Documents/Python/f1/js/utils.js):
  ```javascript
  export function createRNG(seed) { ... }
  export function formatTime(ms) { ... }
  ```

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Install   | `npm install` | exit 0 |
| Run tests | `npx vitest run` | all tests pass |

## Scope

**In scope**:
- Create `package.json` (if not present)
- Create `tests/utils.test.js`

**Out of scope**:
- Modifying game loop or UI physics.

## Git workflow

- Branch: `advisor/004-add-automated-tests`
- Commit message format: `test: configure vitest and add baseline unit tests`

## Steps

### Step 1: Initialize package.json and install Vitest

Run `npm init -y` (or create a basic `package.json`) and install `vitest` as a development dependency.
Configure the package to use ES modules by specifying `"type": "module"`.

Your `package.json` should contain:
```json
{
  "name": "f1-circuit-gen",
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```

Run:
```bash
npm install
```

**Verify**:
- `npm run` shows the `test` script.

### Step 2: Create unit tests for utils.js

Create a new file `tests/utils.test.js` to test:
1. `formatTime(ms)` formats milliseconds correctly into `M:SS.XXX` format (e.g., `1:05.123` or `0:45.000`).
2. `createRNG(seed)` creates a deterministic PRNG where the same seed always produces the same sequence of numbers, and different seeds produce different numbers.

Example test file content:
```javascript
import { describe, it, expect } from 'vitest';
import { formatTime, createRNG } from '../js/utils.js';

describe('formatTime', () => {
    it('should format milliseconds correctly', () => {
        expect(formatTime(65123)).toBe('1:05.123');
        expect(formatTime(45000)).toBe('0:45.000');
        expect(formatTime(0)).toBe('0:00.000');
    });
});

describe('createRNG', () => {
    it('should be deterministic', () => {
        const rng1 = createRNG('MONZA');
        const rng2 = createRNG('MONZA');
        expect(rng1()).toBe(rng2());
        expect(rng1()).toBe(rng2());
    });

    it('should differ for different seeds', () => {
        const rngMonza = createRNG('MONZA');
        const rngSpa = createRNG('SPA');
        expect(rngMonza()).not.toBe(rngSpa());
    });
});
```

**Verify**:
- Run `npm test` and ensure all tests pass.

---

## Done criteria

- [x] `package.json` is created with `"type": "module"` and `vitest` in devDependencies.
- [x] `npm test` runs successfully and passes.
- [x] `plans/README.md` status row updated.

---

## STOP conditions

- `npm install` fails due to environment issues.
- `vitest` fails to import ES module files.
