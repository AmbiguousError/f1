#!/usr/bin/env node
// CLI diagnostic: run scripts/track-validator.mjs's 5 invariant checks against
// every js/tracks.js REAL_TRACKS entry at production values (trackRes 800,
// roadWidth 18), printing the worst offender per check per track. Use this while
// re-authoring a track's control points - iterate until every track is clean.
//
//   node scripts/validate-tracks.mjs

import { validateTrack } from './track-validator.mjs';

// js/tracks.js assigns a `window` global at module-eval time (browser-only,
// consumed by ui-controls.js) - stub it before dynamically importing so the
// module doesn't throw under Node. A static import would be hoisted ahead of
// this assignment, so the import has to be dynamic here.
globalThis.window = globalThis.window || {};
const { REAL_TRACKS } = await import('../js/tracks.js');

const CHECK_ORDER = ['continuity', 'self-intersection', 'min-separation', 'turn-radius', 'pit-zone-radius'];

let anyFailed = false;

for (const [name, points] of Object.entries(REAL_TRACKS)) {
    const { ok, violations } = validateTrack(points, { trackRes: 800, roadWidth: 18 });
    if (ok) {
        console.log(`PASS  ${name}`);
        continue;
    }
    anyFailed = true;
    console.log(`FAIL  ${name} (${violations.length} violation${violations.length === 1 ? '' : 's'})`);
    for (const check of CHECK_ORDER) {
        const matches = violations.filter((v) => v.check === check);
        if (matches.length === 0) continue;
        // Worst offender: smallest radius/separation, or largest jump.
        const worst =
            check === 'continuity'
                ? matches.reduce((a, b) => (b.value > a.value ? b : a))
                : matches.reduce((a, b) => (b.value < a.value ? b : a));
        console.log(`  ${check}: ${matches.length} sample(s), worst at index ${worst.index} - ${worst.detail}`);
    }
}

process.exit(anyFailed ? 1 : 0);
