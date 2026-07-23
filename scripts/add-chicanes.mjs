#!/usr/bin/env node
// One-off authoring aid (not part of the shipped game): for each REAL_TRACKS
// entry, finds its single longest straight run (every track here has exactly
// one dominant "back straight" - see the header comment in js/tracks.js) and
// inserts a small chicane-style S-kink into the middle of it, giving each
// long straight the same "straight into a chicane, back onto a straight"
// character most real F1 back straights actually have (Monza's Ascari,
// Baku's back straight, Suzuka's Casio Triangle, etc), instead of one
// uninterrupted arc-free run. Every inserted point is re-validated with
// scripts/track-validator.mjs before being accepted.
//
// Usage: node scripts/add-chicanes.mjs            - validate + print summary
//        node scripts/add-chicanes.mjs --emit NAME - print the new array for one track

globalThis.window = globalThis.window || {};
const { REAL_TRACKS } = await import('../js/tracks.js');
const { validateTrack } = await import('./track-validator.mjs');

// Per-track {offset, span} chicane tuning: offset is the lateral kink depth,
// span is the fraction of the straight's length given to the kink (centered).
// Some tracks needed a smaller offset/span to keep the ~48-unit turn-radius
// floor and ~30-unit min-separation invariants comfortably clear.
const TUNING = {
    MONZA: { offset: 18, span: 0.24 },
    SPA: { offset: 18, span: 0.2 },
    MONACO: { offset: 14, span: 0.28 },
    SILVERSTONE: { offset: 16, span: 0.24 },
    INTERLAGOS: { offset: 11, span: 0.22 },
    SUZUKA: { offset: 16, span: 0.2 },
    COTA: { offset: 15, span: 0.22 },
    ZANDVOORT: { offset: 11, span: 0.22 },
    BAKU: { offset: 16, span: 0.2 },
    SINGAPORE: { offset: 13, span: 0.26 },
};

function longestGapIndex(pts) {
    let best = { len: 0, i: 0 };
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i],
            b = pts[(i + 1) % pts.length];
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d > best.len) best = { len: d, i };
    }
    return best;
}

// Inserts a straight-kink-straight chicane into the gap between pts[i] and
// pts[i+1]: two new points offset laterally by +offset/-offset (a left-right
// flick), placed symmetrically around the gap's midpoint, spanning `span`
// fraction of the gap's length.
function insertChicane(pts, i, offset, span) {
    const n = pts.length;
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x,
        dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const tx = dx / len,
        tz = dz / len;
    // Perpendicular (matches the cross(tangent, up) convention used for
    // racing-line/track-shape purposes elsewhere in this file - NOT the
    // pit-lane-specific (tan.z, -tan.x) convention track.js's generatePitLane
    // uses; this is plain geometric authoring, not pit-lane placement).
    const px = -tz,
        pz = tx;
    const mid = 0.5;
    const halfSpan = span / 2;
    const t1 = mid - halfSpan,
        t2 = mid + halfSpan;
    const p1 = { x: a.x + dx * t1 + px * offset, z: a.z + dz * t1 + pz * offset };
    const p2 = { x: a.x + dx * t2 - px * offset, z: a.z + dz * t2 - pz * offset };
    const out = pts.slice(0, i + 1);
    out.push(p1, p2);
    out.push(...pts.slice(i + 1));
    return out;
}

// INTERLAGOS and ZANDVOORT are excluded: every one of their straights is
// already tight enough (checked empirically - each candidate gap either
// fails the general turn-radius floor at some OTHER existing corner, or the
// pit-zone radius floor near the wraparound) that inserting a chicane
// anywhere, even a barely-perceptible one, tips something under threshold.
// They were authored with less margin than the other 8 to begin with; left
// unmodified rather than risk their existing validated geometry.
const SKIP = new Set(['INTERLAGOS', 'ZANDVOORT']);

const args = process.argv.slice(2);
const emit = args.includes('--emit');
const only = args.filter((a) => !a.startsWith('--'));
const names = (only.length ? only : Object.keys(REAL_TRACKS)).filter((n) => only.length || !SKIP.has(n));

let anyFailed = false;
const results = {};

for (const name of names) {
    const original = REAL_TRACKS[name];
    if (!original) {
        console.error(`Unknown track: ${name}`);
        anyFailed = true;
        continue;
    }
    const { offset, span } = TUNING[name];
    const { i } = longestGapIndex(original);
    const withChicane = insertChicane(original, i, offset, span);
    const { ok, violations } = validateTrack(withChicane, { trackRes: 800, roadWidth: 18 });
    results[name] = withChicane;
    if (ok) {
        console.log(`PASS  ${name}  (${original.length} -> ${withChicane.length} control points, chicane at gap index ${i})`);
    } else {
        anyFailed = true;
        console.log(`FAIL  ${name}  (${violations.length} violations)`);
        const byCheck = {};
        for (const v of violations) (byCheck[v.check] ||= []).push(v);
        for (const [check, vs] of Object.entries(byCheck)) {
            const worst = check === 'continuity' ? vs.reduce((a, b) => (b.value > a.value ? b : a)) : vs.reduce((a, b) => (b.value < a.value ? b : a));
            console.log(`  ${check}: ${vs.length} sample(s), worst at index ${worst.index} - ${worst.detail}`);
        }
    }
}

if (emit) {
    for (const name of names) {
        if (!results[name]) continue;
        console.log(`\n    ${name}: [`);
        for (const p of results[name]) {
            console.log(`        { x: ${p.x.toFixed(2)}, z: ${p.z.toFixed(2)} },`);
        }
        console.log(`    ],`);
    }
}

process.exit(anyFailed ? 1 : 0);
