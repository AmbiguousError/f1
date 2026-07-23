// Offline authoring tool for new js/tracks.js REAL_TRACKS entries. Kept afterward,
// same spirit as add-chicanes.mjs/validate-tracks.mjs. Unlike a corner-by-corner
// freehand/turtle-walk builder (which routinely failed closure by hundreds of
// units in a past session - see the f1-track-geometry-lessons memory), this
// generates each circuit from js/track-shape.js's periodic harmonic-loop
// generator, which always closes exactly by construction, then validates and
// prints the result as a ready-to-paste {x,z} array in the exact format every
// existing REAL_TRACKS entry uses.
//
// Each preset below is a hand-picked starting point (base radius + a few harmonic
// terms) chosen to evoke that circuit's distinguishing character - NOT survey
// accuracy, matching tracks.js's own documented philosophy. If a preset doesn't
// validate as-is, this script nudges its harmonic phases with a local seeded RNG
// and retries (bounded), rather than hand-tuning further - the same
// rejection-sampling approach js/track.js's procedural generator uses at runtime.
//
// Usage: node scripts/gen-real-track.mjs [NAME]   (omit NAME to run all presets)

import { generateHarmonicLoop, straightenPitZone, validateTrack } from '../js/track-shape.js';
import { createRNG } from '../js/utils.js';

const CORE_FRAC_CANDIDATES = [0.15, 0.17, 0.19, 0.21, 0.23];
const MAX_RETRIES = 30;

// { baseRadius, harmonics: [{freq, amplitude(fraction of baseRadius), phase}], pointCount, note }
const PRESETS = {
    BAHRAIN: {
        baseRadius: 620,
        pointCount: 72,
        harmonics: [
            { freq: 3, amp: 0.05, phase: 0.4 },
            { freq: 5, amp: 0.025, phase: 2.1 },
        ],
        note: 'Sakhir - desert permanent circuit, multiple long braking-zone straights joined by a busy tighter infield sequence (higher-frequency harmonic layered on a broad 3-lobe base).',
    },
    MELBOURNE: {
        baseRadius: 700,
        pointCount: 68,
        harmonics: [
            { freq: 2, amp: 0.06, phase: 1.0 },
            { freq: 3, amp: 0.02, phase: 4.2 },
        ],
        note: 'Albert Park - flows around the lake, broad sweeping character from a dominant low-frequency wobble with only a light secondary harmonic.',
    },
    MIAMI: {
        baseRadius: 680,
        pointCount: 76,
        harmonics: [
            { freq: 3, amp: 0.045, phase: 0.8 },
            { freq: 4, amp: 0.03, phase: 3.5 },
        ],
        note: 'Hard Rock Stadium circuit - a long straight run plus a busier stadium-infield section (mid-frequency mix).',
    },
    IMOLA: {
        baseRadius: 640,
        pointCount: 70,
        harmonics: [
            { freq: 2, amp: 0.055, phase: 2.4 },
            { freq: 4, amp: 0.02, phase: 0.9 },
        ],
        note: 'Santerno hills - narrow, flowing, historic circuit character from a gentle dominant wobble with a light higher-frequency ripple.',
    },
    MONTREAL: {
        baseRadius: 660,
        pointCount: 74,
        harmonics: [
            { freq: 3, amp: 0.05, phase: 1.7 },
            { freq: 6, amp: 0.02, phase: 5.0 },
        ],
        note: "Notre Dame Island - long straights into chicanes (a Wall-of-Champions-style tight final complex), higher-frequency ripple for the chicane character.",
    },
    ABUDHABI: {
        baseRadius: 760,
        pointCount: 78,
        harmonics: [
            { freq: 2, amp: 0.045, phase: 3.0 },
            { freq: 3, amp: 0.025, phase: 0.2 },
        ],
        note: 'Yas Marina - modern, wide, marina-hugging layout: the largest base radius here for its long straights and sweeping hairpins.',
    },
};

function tryPreset(name, preset) {
    const rng = createRNG('gen-real-track:' + name);
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const jitter = attempt === 0 ? 0 : (rng() - 0.5) * 0.6;
        const harmonics = preset.harmonics.map((h) => ({
            freq: h.freq,
            amplitude: preset.baseRadius * h.amp,
            phase: h.phase + jitter * attempt * 0.15,
        }));
        const loop = generateHarmonicLoop({ pointCount: preset.pointCount, baseRadius: preset.baseRadius, harmonics });
        for (const coreFrac of CORE_FRAC_CANDIDATES) {
            const straightened = straightenPitZone(loop, coreFrac, 0.08);
            const result = validateTrack(straightened, { trackRes: 800, roadWidth: 18 });
            if (result.ok) {
                return { points: straightened, attempt, coreFrac };
            }
        }
    }
    return null;
}

function formatPoints(points) {
    return points.map((p) => `        { x: ${p.x.toFixed(2)}, z: ${p.z.toFixed(2)} },`).join('\n');
}

const requested = process.argv[2];
const names = requested ? [requested.toUpperCase()] : Object.keys(PRESETS);

for (const name of names) {
    const preset = PRESETS[name];
    if (!preset) {
        console.error(`Unknown preset "${name}". Available: ${Object.keys(PRESETS).join(', ')}`);
        process.exitCode = 1;
        continue;
    }
    const result = tryPreset(name, preset);
    if (!result) {
        console.error(`${name}: FAILED to validate after ${MAX_RETRIES} attempts`);
        process.exitCode = 1;
        continue;
    }
    console.log(`\n    // ${preset.note}`);
    console.log(`    ${name}: [`);
    console.log(formatPoints(result.points));
    console.log(`    ],`);
    console.error(`// ${name}: validated on attempt ${result.attempt + 1}, coreFrac ${result.coreFrac}, ${result.points.length} points`);
}
