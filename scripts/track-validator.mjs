// Retained validator for js/tracks.js REAL_TRACKS entries, replacing the earlier
// throwaway/not-kept Node script mentioned in tracks.js's header comment. Runs the
// exact production resampling pipeline (three.js CatmullRomCurve3 + getSpacedPoints)
// so results match what the game actually builds, then checks the 5 invariants
// documented in that header comment. Used by both scripts/validate-tracks.mjs (CLI
// diagnostic) and tests/tracks.geometry.test.js (permanent regression guard).
//
// The actual implementation now lives in js/track-shape.js so the SAME checks can
// also run live in the browser (js/track.js's procedural generator uses them for
// rejection-sampling random layouts) - this file re-exports it for Node tooling.

export { resampleTrack, validateTrack, VALIDATOR_CONSTANTS } from '../js/track-shape.js';
