// Retained validator for js/tracks.js REAL_TRACKS entries, replacing the earlier
// throwaway/not-kept Node script mentioned in tracks.js's header comment. Runs the
// exact production resampling pipeline (three.js CatmullRomCurve3 + getSpacedPoints)
// so results match what the game actually builds, then checks the 5 invariants
// documented in that header comment. Used by both scripts/validate-tracks.mjs (CLI
// diagnostic) and tests/tracks.geometry.test.js (permanent regression guard).

import * as THREE from 'three';

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
    // Sampled at a stride to keep this O(N^2/stride) - full O(N^2) at N=800 is
    // fine (640k pairs), so no stride needed in practice, but skip near-adjacent
    // pairs which are naturally close.
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
