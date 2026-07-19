# Plan 005: Add Linter and Formatter

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: Confirm that `package.json` exists in the repository root.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/004-add-automated-tests.md
- **Category**: dx
- **Planned at**: commit `da8288d`, 2026-07-19

## Why this matters

The project does not have a linter or formatter configured. Code styles differ across files, and simple syntax issues, unused imports/variables, or type-coercion bugs are not flagged automatically. 

Integrating ESLint (with standard JavaScript recommendations) and Prettier ensures consistent style guidelines and helps developers catch common bugs during code editing before they reach production.

## Current state

- File: `package.json` — App manifest and scripts configuration (created in Plan 004).

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Install   | `npm install` | exit 0 |
| Lint check | `npm run lint` | exit 0 |
| Format    | `npm run format` | exit 0 |

## Scope

**In scope**:
- `package.json` (dependencies and scripts)
- `.eslintrc.json` (create)
- `.prettierrc` (create)

**Out of scope**:
- Direct logic modifications in `js/` unless fixing minor linter errors.

## Git workflow

- Branch: `advisor/005-add-linter-formatter`
- Commit message format: `dx: configure eslint and prettier`

## Steps

### Step 1: Install ESLint and Prettier

Install `eslint`, `prettier`, and `eslint-config-prettier` (to disable ESLint formatting rules that conflict with Prettier) as development dependencies.

Run:
```bash
npm install -D eslint prettier eslint-config-prettier
```

Update `package.json` scripts block to include `lint` and `format` scripts:
```json
  "scripts": {
    "test": "vitest run",
    "lint": "eslint \"js/**/*.js\"",
    "format": "prettier --write \"js/**/*.js\" \"css/**/*.css\" \"*.html\""
  }
```

**Verify**:
- Command `npm run lint` or `npm run format` runs (even if errors are printed).

### Step 2: Configure ESLint and Prettier

1. Create a `.eslintrc.json` file in the root directory:
```json
{
  "env": {
    "browser": true,
    "es2021": true,
    "node": true
  },
  "extends": [
    "eslint:recommended",
    "prettier"
  ],
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "rules": {
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": "off"
  }
}
```

2. Create a `.prettierrc` configuration file in the root directory:
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 4,
  "trailingComma": "es5",
  "printWidth": 120
}
```

**Verify**:
- Run `npm run lint` and `npm run format`. Ensure they run successfully. Fix any simple formatting/linting issues that crop up in the process.

---

## Test plan

- Run `npm run lint` to ensure ESLint rules pass.
- Run `npm run format` to ensure Prettier formats files consistently.

---

## Done criteria

- [x] `.eslintrc.json` and `.prettierrc` files exist in the root directory.
- [x] `npm run lint` runs successfully.
- [x] `npm run format` runs successfully.
- [x] `plans/README.md` status row updated.

---

## STOP conditions

- `npm install` fails due to environment issues.
- ESLint fails to parse ES modules without complex Babel setups.
