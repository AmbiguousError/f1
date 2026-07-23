// Shared steward-penalty / track-limits plumbing. Both features (js/main.js's
// drive-through speed cap, js/race.js's AI equivalent, and the finish-screen
// penalty display) funnel through the same log/apply/read functions here
// instead of each maintaining its own parallel bookkeeping, since a crash
// penalty and a track-limits penalty are the same underlying concept (an
// incident that adds race time or forces a drive-through).
//
// driverIndex convention (must match getRaceStandings() in race.js exactly):
// 0 = player, ai.id + 1 = AI. Never index by state.aiCars array position.

import * as THREE from 'three';
import { state, cfg } from './state.js';
import { DRIVE_THROUGH_DURATION_MS, GROUP_CAR, MIN_IMPACT_THRESHOLD, TRACK_LIMIT_ESCALATION, DAMAGE_ZONES } from './constants.js';

const DAMAGE_ZONE_BY_KEY = Object.fromEntries(DAMAGE_ZONES.map((z) => [z.key, z]));

function damageObjectFor(driverIndex) {
    if (driverIndex === 0) return state.damage;
    const ai = state.aiCars.find((a) => a.id + 1 === driverIndex);
    return ai ? ai.damage : null;
}

function damageZone(driverIndex, zoneKey, amount) {
    const damage = damageObjectFor(driverIndex);
    if (!damage) return;
    const minHealth = DAMAGE_ZONE_BY_KEY[zoneKey].minHealth;
    damage[zoneKey] = Math.max(minHealth, damage[zoneKey] - amount);
}

// Applies collision damage to both cars, reusing the same longDist/latDist
// nose-to-tail-vs-side-on read already computed for fault classification: a
// rear-end damages the trailing car's front wing and the leading car's
// gearbox; a side-on hit damages both cars' floors (covers sidepod/T-bone
// impacts too - a single "floor" zone is this game's stand-in for both).
function applyCollisionDamage(myDriverIndex, otherDriverIndex, longDist, latDist, impact) {
    const amount = Math.min(40, Math.max(5, impact * 2));
    if (Math.abs(longDist) >= Math.abs(latDist)) {
        if (longDist > 0) {
            damageZone(myDriverIndex, 'frontWing', amount);
            damageZone(otherDriverIndex, 'gearbox', amount);
        } else {
            damageZone(myDriverIndex, 'gearbox', amount);
            damageZone(otherDriverIndex, 'frontWing', amount);
        }
    } else {
        damageZone(myDriverIndex, 'floor', amount);
        damageZone(otherDriverIndex, 'floor', amount);
    }
}

function driverIndexForBody(body) {
    if (body === state.chassisBody) return 0;
    const ai = state.aiCars.find((a) => a.body === body);
    return ai ? ai.id + 1 : null;
}

// Car-local forward/side (via quaternion) and the other car's position relative
// to them - unrelated to the pit-lane track-relative side = (tan.z, -tan.x)
// convention documented in CLAUDE.md/race.js; this is a different question
// ("which way is this car itself facing") and must not be unified with that one.
function relativeGeometry(myBody, otherBody) {
    const myQuat = myBody.quaternion;
    const q = new THREE.Quaternion(myQuat.x, myQuat.y, myQuat.z, myQuat.w);
    const mySide = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const myForward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const toOther = new THREE.Vector3(otherBody.position.x - myBody.position.x, otherBody.position.y - myBody.position.y, otherBody.position.z - myBody.position.z);
    return { longDist: toOther.dot(myForward), latDist: toOther.dot(mySide), mySide };
}

// Classifies fault for a car-car contact. Returns 'rear-ended' (my fault, I hit
// them from behind), 'rear-ended-by' (their fault, they hit me from behind),
// 'side-swiped-by-me', 'side-swiped-by-them', or 'racing-incident' (ambiguous,
// no fault).
function classifyFault(myBody, otherBody, longDist, latDist, mySide) {
    if (Math.abs(longDist) >= Math.abs(latDist)) {
        // Roughly nose-to-tail: whichever car is behind is at fault.
        return longDist > 0 ? 'rear-ended' : 'rear-ended-by';
    }

    // Side-on: compare each car's own lateral velocity toward the other - whichever
    // is closing faster sideways carries the fault; near-equal reads as a racing incident.
    const sideDir = latDist > 0 ? mySide : mySide.clone().negate();
    const myLatSpeed = myBody.velocity.x * sideDir.x + myBody.velocity.y * sideDir.y + myBody.velocity.z * sideDir.z;
    const otherLatSpeed = otherBody.velocity.x * sideDir.x + otherBody.velocity.y * sideDir.y + otherBody.velocity.z * sideDir.z;
    if (Math.abs(myLatSpeed - otherLatSpeed) < 1.5) return 'racing-incident';
    return myLatSpeed > otherLatSpeed ? 'side-swiped-by-me' : 'side-swiped-by-them';
}

function tierForCrashCount(count) {
    if (count <= 1) return 'time5';
    if (count === 2) return 'time10';
    return 'drive-through';
}

// Recently-processed contact pairs, so cannon-es firing 'collide' symmetrically
// on both bodies for one physical contact (and possibly several times across a
// single collision episode) doesn't double up the fault classification/penalty.
const recentPairs = new Map();
const PAIR_DEDUPE_MS = 500;

function handleCarCollision(myDriverIndex, myBody, otherBody, impact) {
    const otherDriverIndex = driverIndexForBody(otherBody);
    if (otherDriverIndex === null) return;
    // Only the lower-driverIndex car's listener processes a given pair - the other
    // body's own listener will see the same contact and skip it here.
    if (myDriverIndex > otherDriverIndex) return;

    const pairKey = `${myDriverIndex}-${otherDriverIndex}`;
    const now = Date.now();
    if (recentPairs.has(pairKey) && now - recentPairs.get(pairKey) < PAIR_DEDUPE_MS) return;
    recentPairs.set(pairKey, now);

    const { longDist, latDist, mySide } = relativeGeometry(myBody, otherBody);

    if (cfg.damageEnabled) applyCollisionDamage(myDriverIndex, otherDriverIndex, longDist, latDist, impact);

    if (!cfg.stewardPenalties) return;
    const fault = classifyFault(myBody, otherBody, longDist, latDist, mySide);
    let atFaultDriverIndex = null;
    if (fault === 'rear-ended') atFaultDriverIndex = myDriverIndex;
    else if (fault === 'rear-ended-by') atFaultDriverIndex = otherDriverIndex;
    else if (fault === 'side-swiped-by-me') atFaultDriverIndex = myDriverIndex;
    else if (fault === 'side-swiped-by-them') atFaultDriverIndex = otherDriverIndex;

    if (atFaultDriverIndex === null) {
        applyPenalty(myDriverIndex, 'warning', 'racing incident');
        return;
    }
    const count = (state.driverOffenseCounts.crash[atFaultDriverIndex] || 0) + 1;
    state.driverOffenseCounts.crash[atFaultDriverIndex] = count;
    applyPenalty(atFaultDriverIndex, tierForCrashCount(count), 'causing a collision');
}

// Attaches a cannon-es 'collide' listener to a car body, wiring it into the
// steward/damage systems. Called once at car-creation time (js/cars.js) only
// when cfg.stewardPenalties || cfg.damageEnabled - cfg is fixed for the whole
// session, so no mid-race toggle needs handling.
export function attachCollisionHandler(body, driverIndex) {
    body.addEventListener('collide', (event) => {
        if (event.body.collisionFilterGroup !== GROUP_CAR) return;
        const impact = Math.abs(event.contact.getImpactVelocityAlongNormal());
        if (impact < MIN_IMPACT_THRESHOLD) return;
        if (cfg.stewardPenalties || cfg.damageEnabled) handleCarCollision(driverIndex, body, event.body, impact);
    });
}

export function resetIncidents() {
    state.penalties = [];
    state.driverPenaltySeconds = {};
    state.driverOffenseCounts = { crash: {}, trackLimits: {} };
    state.driveThroughActive = {};
    state.trackLimits = { offTimer: 0, counted: false };
    recentPairs.clear();
}

// kind: 'warning' | 'time5' | 'time10' | 'drive-through'
export function applyPenalty(driverIndex, kind, reason) {
    state.penalties.push({ lap: state.currentLap, driverIndex, kind, reason, ts: Date.now() });

    if (kind === 'time5') {
        state.driverPenaltySeconds[driverIndex] = (state.driverPenaltySeconds[driverIndex] || 0) + 5;
    } else if (kind === 'time10') {
        state.driverPenaltySeconds[driverIndex] = (state.driverPenaltySeconds[driverIndex] || 0) + 10;
    } else if (kind === 'drive-through') {
        state.driveThroughActive[driverIndex] = { untilTs: Date.now() + DRIVE_THROUGH_DURATION_MS };
    }

    if (driverIndex === 0) {
        const messages = {
            warning: `WARNING: ${reason.toUpperCase()}`,
            time5: `+5.0s PENALTY: ${reason.toUpperCase()}`,
            time10: `+10.0s PENALTY: ${reason.toUpperCase()}`,
            'drive-through': `DRIVE-THROUGH PENALTY: ${reason.toUpperCase()}`,
        };
        const flash = document.getElementById('lap-flash');
        if (flash) {
            flash.innerText = messages[kind] || reason;
            flash.style.display = 'block';
            setTimeout(() => (flash.style.display = 'none'), 2000);
        }
    }
}

// Edge-triggered off-track excursion check, shared by the player (main.js) and
// each AI car (race.js). `timerState` is a small {offTimer, counted} object
// (state.trackLimits for the player, ai.trackLimits per AI) - offTimer only
// needs to exceed 0.3s continuously beyond the track edge to count as one
// excursion (filters momentary kerb clips), and `counted` provides hysteresis
// so a single sustained excursion can't re-trigger every frame; the car must
// return under the threshold before the next excursion can count.
export function checkTrackLimits(driverIndex, timerState, minDSq) {
    if (minDSq > 81) {
        timerState.offTimer += 1 / 60;
        if (timerState.offTimer > 0.3 && !timerState.counted) {
            timerState.counted = true;
            const count = (state.driverOffenseCounts.trackLimits[driverIndex] || 0) + 1;
            state.driverOffenseCounts.trackLimits[driverIndex] = count;
            const tier = TRACK_LIMIT_ESCALATION.find((t) => t.atCount === count);
            if (tier) {
                applyPenalty(driverIndex, tier.kind, 'track limits');
            } else if (count > 10 && (count - 10) % 3 === 0) {
                applyPenalty(driverIndex, 'drive-through', 'track limits');
            }
        }
    } else {
        timerState.offTimer = 0;
        timerState.counted = false;
    }
}

// One-off floor-damage tick for a hard, high-speed off-track excursion (main.js/
// race.js call this on the edge-triggered transition into sand, not continuously -
// a car stuck in a trap shouldn't have its floor health spiral to zero).
export function applyOffTrackDamage(driverIndex, amount = 15) {
    damageZone(driverIndex, 'floor', amount);
}

export function getDriverPenaltySeconds(driverIndex) {
    return state.driverPenaltySeconds[driverIndex] || 0;
}

export function isDriveThroughActive(driverIndex) {
    const active = state.driveThroughActive[driverIndex];
    return !!active && Date.now() < active.untilTs;
}
