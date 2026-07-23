// Shared track-geometry helpers used both at runtime (js/track.js's procedural
// generator) and by offline Node tooling (scripts/gen-real-track.mjs,
// scripts/validate-tracks.mjs, tests/tracks.geometry.test.js). Pure three.js math,
// no Node-only or DOM-only APIs, so the same module works unmodified in both the
// browser (resolved via index.html's import map) and Node (resolved via
// node_modules) - track.js already relies on that same dual-resolution property
// for its own `import * as THREE from 'three'`.
//
// validateTrack()/resampleTrack() were moved here from scripts/track-validator.mjs
// (which now re-exports them) so the SAME invariant checks documented in
// tracks.js's header comment can run live in the browser, not just offline.

import * as THREE from 'three';
import { pitEase } from './utils.js';

const MAX_JUMP = 15; // (a) max distance between consecutive resampled points
const MIN_SEPARATION = 30; // (c) min distance between non-adjacent points
const MIN_TURN_RADIUS = 48; // (d) min local turn radius everywhere
const PIT_ZONE_MIN_RADIUS = 400; // (e) min local turn radius within the pit zone
const PIT_ZONE_SAMPLES = 90; // (e) +/- window (of 800) around index 0
const ARC_WINDOW_LENGTH = 15; // (d)/(e) arc-length window for the 3-point radius estimate
const ADJACENCY_GAP = 25; // index gap below which points are considered "adjacent" for (c)/(b)

// Resamples raw {x,z} control points through the same pipeline track.js uses at
// runtime: CatmullRomCurve3(closed) -> getSpacedPoints(trackRes) -> drop the
// duplicate closing point if getSpacedPoints() produced one.
export function resampleTrack(points, trackRes) {
    const pts3 = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
    const curve = new THREE.CatmullRomCurve3(pts3, true);
    curve.tension = 0.5;
    const sampled = curve.getSpacedPoints(trackRes);
    const distFirstLast = sampled[0].distanceTo(sampled[sampled.length - 1]);
    if (distFirstLast < 1.0) sampled.pop();
    return sampled;
}

function circumradius(a, b, c) {
    const ab = a.distanceTo(b);
    const bc = b.distanceTo(c);
    const ca = c.distanceTo(a);
    // Twice the signed area via the shoelace formula (2D, y ignored/zero).
    const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z));
    if (area2 < 1e-9) return Infinity; // collinear -> straight, infinite radius
    return (ab * bc * ca) / (2 * area2);
}

function segmentsIntersect(p1, p2, p3, p4) {
    const d1x = p2.x - p1.x,
        d1z = p2.z - p1.z;
    const d2x = p4.x - p3.x,
        d2z = p4.z - p3.z;
    const denom = d1x * d2z - d1z * d2x;
    if (Math.abs(denom) < 1e-9) return false; // parallel
    const t = ((p3.x - p1.x) * d2z - (p3.z - p1.z) * d2x) / denom;
    const u = ((p3.x - p1.x) * d1z - (p3.z - p1.z) * d1x) / denom;
    return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

// Estimates the arc-length window (in sample-index terms) needed to span
// ARC_WINDOW_LENGTH units, from the track's average per-sample spacing.
function windowRadiusSamples(points) {
    let total = 0;
    for (let i = 0; i < points.length; i++) {
        total += points[i].distanceTo(points[(i + 1) % points.length]);
    }
    const avgSpacing = total / points.length;
    return Math.max(1, Math.round(ARC_WINDOW_LENGTH / 2 / avgSpacing));
}

// Runs all 5 invariant checks against a raw control-point array. Returns
// { ok, violations: [{check, index, value, detail}] }.
export function validateTrack(points, { trackRes = 800, roadWidth = 18 } = {}) {
    const violations = [];
    const n = points.length;
    if (n < 8) {
        return { ok: false, violations: [{ check: 'control-points', index: -1, value: n, detail: 'too few control points' }] };
    }

    const sampled = resampleTrack(points, trackRes);
    const N = sampled.length;
    const k = windowRadiusSamples(sampled);

    // (a) continuity
    for (let i = 0; i < N; i++) {
        const d = sampled[i].distanceTo(sampled[(i + 1) % N]);
        if (d > MAX_JUMP) {
            violations.push({ check: 'continuity', index: i, value: d, detail: `jump ${d.toFixed(1)} > ${MAX_JUMP}` });
        }
    }

    // (b) no self-intersection between non-adjacent segments
    for (let i = 0; i < N; i++) {
        const p1 = sampled[i],
            p2 = sampled[(i + 1) % N];
        for (let j = i + 1; j < N; j++) {
            const gapForward = j - i;
            const gapWrapped = N - gapForward;
            if (Math.min(gapForward, gapWrapped) < ADJACENCY_GAP) continue;
            const p3 = sampled[j],
                p4 = sampled[(j + 1) % N];
            if (segmentsIntersect(p1, p2, p3, p4)) {
                violations.push({ check: 'self-intersection', index: i, value: j, detail: `segment ${i} x segment ${j}` });
            }
        }
    }

    // (c) minimum separation between non-adjacent points
    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            const gapForward = j - i;
            const gapWrapped = N - gapForward;
            if (Math.min(gapForward, gapWrapped) < ADJACENCY_GAP) continue;
            const d = sampled[i].distanceTo(sampled[j]);
            if (d < MIN_SEPARATION) {
                violations.push({ check: 'min-separation', index: i, value: d, detail: `points ${i}/${j} only ${d.toFixed(1)} apart` });
            }
        }
    }

    // (d) minimum turn radius everywhere, (e) stricter minimum within the pit zone
    for (let i = 0; i < N; i++) {
        const a = sampled[(i - k + N) % N];
        const b = sampled[i];
        const c = sampled[(i + k) % N];
        const r = circumradius(a, b, c);

        const distToStart = Math.min((i + N) % N, N - ((i + N) % N));
        const inPitZone = distToStart <= PIT_ZONE_SAMPLES;

        if (r < MIN_TURN_RADIUS) {
            violations.push({ check: 'turn-radius', index: i, value: r, detail: `radius ${r.toFixed(1)} < ${MIN_TURN_RADIUS}` });
        }
        if (inPitZone && r < PIT_ZONE_MIN_RADIUS) {
            violations.push({ check: 'pit-zone-radius', index: i, value: r, detail: `radius ${r.toFixed(1)} < ${PIT_ZONE_MIN_RADIUS} within pit zone` });
        }
    }

    return { ok: violations.length === 0, violations };
}

export const VALIDATOR_CONSTANTS = {
    MAX_JUMP,
    MIN_SEPARATION,
    MIN_TURN_RADIUS,
    PIT_ZONE_MIN_RADIUS,
    PIT_ZONE_SAMPLES,
    ARC_WINDOW_LENGTH,
    ADJACENCY_GAP,
};

// Generates a closed {x,z} control-point loop from a small polar Fourier sum:
// r(t) = baseRadius + sum(amplitude_k * sin(freq_k * t + phase_k)) for t in [0, 2*PI).
// Periodic by construction, so the loop always closes exactly - no closure-equation
// solving, no freehand vertex placement, sidestepping the failure mode documented in
// the f1-track-geometry-lessons memory (turtle-walk/polygon+fillet both routinely
// produced huge closure errors or silent near-180-degree reversals).
export function generateHarmonicLoop({ pointCount = 48, baseRadius = 220, harmonics = [] } = {}) {
    const points = [];
    for (let i = 0; i < pointCount; i++) {
        const t = (i / pointCount) * Math.PI * 2;
        let r = baseRadius;
        for (const h of harmonics) r += h.amplitude * Math.sin(h.freq * t + h.phase);
        points.push({ x: Math.cos(t) * r, z: Math.sin(t) * r });
    }
    return points;
}

// Flattens the control points near index 0 onto a straight line: everything within
// `coreFrac` of the loop's total arc length either side is placed EXACTLY on the
// line (blend=1), then an additional `taperFrac` beyond that eases back to the
// original curved position via pitEase, so there's no sharp kink where straight
// meets curve. The core must stay comfortably larger than the validator's required
// pit-zone arc fraction (+/-90 of 800 samples, ~+/-11.25%) - a single window that's
// both "how far the straightening reaches" and "how gradual the taper is" (as an
// earlier version of this function conflated) can't satisfy that: keeping the taper
// gradual enough to avoid a kink forces the *required* zone to fall in the
// still-curving part of the taper, well short of validator's 400-unit minimum
// pit-zone radius. Decoupling them fixes that: the core has a deliberate, well-defined
// curvature of BOW_TARGET_RADIUS (not exactly zero) regardless of taper shape.
//
// The core is NOT made mathematically exact-straight (infinite radius): CatmullRomCurve3
// evaluates control points in floating point, and when 3+ consecutive points are exactly
// colinear the resampled curve is only straight to within rounding error - the
// validator's circumradius() estimate divides by (twice) that triangle's area, so on an
// almost-but-not-quite-zero area from rounding noise, the radius comes out small and
// erratic (empirically: nonsense values like 15-60 units right next to points reading
// "Infinity") rather than the huge/safe number the geometry actually implies. A gentle,
// explicit bow with a comfortably-large-but-finite target radius sidesteps that
// numerically unstable near-zero-curvature regime entirely, satisfying the
// pit-zone-radius invariant (e) by construction rather than by luck - generatePitLane()
// in track.js assumes this stretch is close to straight, and the original fixed-formula
// procedural generator never explicitly guaranteed it either.
const BOW_TARGET_RADIUS = 700; // comfortably > the 400-unit pit-zone minimum

export function straightenPitZone(points, coreFrac = 0.14, taperFrac = 0.1) {
    const n = points.length;
    const segLen = new Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
        const a = points[i],
            b = points[(i + 1) % n];
        segLen[i] = Math.hypot(b.x - a.x, b.z - a.z);
        total += segLen[i];
    }
    const coreLen = total * coreFrac;
    const targetLen = total * (coreFrac + taperFrac);

    // Signed arc-length offset from index 0: negative walking backward (index n-1,
    // n-2, ...), positive walking forward (index 1, 2, ...). Each direction stops once
    // its accumulated length reaches targetLen (core + taper).
    const offsets = new Map([[0, 0]]);
    let acc = 0;
    for (let step = 1; step < n && acc < targetLen; step++) {
        const idx = (n - step) % n;
        acc += segLen[idx];
        offsets.set(idx, -acc);
    }
    acc = 0;
    for (let step = 1; step < n && acc < targetLen; step++) {
        const idx = step % n;
        acc += segLen[(idx - 1 + n) % n];
        offsets.set(idx, acc);
    }

    let leftIdx = 0,
        rightIdx = 0,
        minS = 0,
        maxS = 0;
    for (const [i, s] of offsets) {
        if (s < minS) {
            minS = s;
            leftIdx = i;
        }
        if (s > maxS) {
            maxS = s;
            rightIdx = i;
        }
    }
    const ptA = points[leftIdx];
    const ptB = points[rightIdx];
    const span = maxS - minS || 1e-6;
    const taperSpan = Math.max(targetLen - coreLen, 1e-6);

    // Unit normal to the A->B chord, signed to lean the same direction the original
    // curve already bulges near index 0 (rather than an arbitrary/inverted lean),
    // so the bow blends continuously into the untouched curve outside the window.
    const abx = ptB.x - ptA.x,
        abz = ptB.z - ptA.z;
    const abLen = Math.hypot(abx, abz) || 1e-6;
    const nx = -abz / abLen,
        nz = abx / abLen;
    const origSide = (points[0].x - ptA.x) * nx + (points[0].z - ptA.z) * nz;
    const bowSign = origSide >= 0 ? 1 : -1;
    const bowHeight = bowSign * (abLen * abLen) / (8 * BOW_TARGET_RADIUS);

    const result = points.map((p) => ({ x: p.x, z: p.z }));
    for (const [i, s] of offsets) {
        const u = (s - minS) / span; // 0 at ptA, 1 at ptB
        const bow = bowHeight * 4 * u * (1 - u); // parabolic arc, 0 at both ends, peak at u=0.5
        const straightX = ptA.x + abx * u + nx * bow;
        const straightZ = ptA.z + abz * u + nz * bow;
        const absS = Math.abs(s);
        // Unconditionally straight within the core; only the taper beyond it eases
        // back to the original curved position, so there's no kink where they meet.
        const blend = absS <= coreLen ? 1 : 1 - pitEase((absS - coreLen) / taperSpan);
        result[i] = {
            x: points[i].x + (straightX - points[i].x) * blend,
            z: points[i].z + (straightZ - points[i].z) * blend,
        };
    }
    return result;
}
