import * as THREE from 'three';
import { state, cfg, season, scratch } from './state.js';
import { TYRE_COMPOUNDS, TYRE_COLORS, POINTS_SYSTEM } from './constants.js';
import { formatTime } from './utils.js';
import { findClosestTrackPoint, getPitLaneOffset, teleportToTrack } from './track.js';
import { spawnDust } from './effects.js';
import { setCarGhost } from './cars.js';

export function resetCar() { teleportToTrack(state.chassisBody); document.getElementById('reset-bar').style.display = 'none'; state.resetTimer = 0; }

// The internal id "Player" is what every comparison uses; only swap in the chosen
// display name at the point text is rendered.
const displayName = (name) => name === "Player" ? cfg.driverName : name;

const PODIUM_MEDALS = ['🏆', '🥈', '🥉'];
// top3: [{name, color}] in finishing order. Renders as 2-1-3 stepped boxes in team colors.
function makePodium(title, top3, isChampionship) {
    const wrap = document.createElement('div');
    const t = document.createElement('div'); t.className = 'podium-title'; t.innerText = title; wrap.appendChild(t);
    const pod = document.createElement('div'); pod.className = 'podium' + (isChampionship ? ' champ' : '');
    [1, 0, 2].forEach(rank => {
        const d = top3[rank]; if (!d) return;
        const slot = document.createElement('div'); slot.className = 'podium-slot';
        const colorHex = '#' + (d.color >>> 0).toString(16).padStart(6, '0');
        slot.innerHTML = `<div class="podium-medal">${PODIUM_MEDALS[rank]}</div><div class="podium-name">${d.name}</div><div class="podium-step step-${rank + 1}" style="background:${colorHex}">${rank + 1}</div>`;
        pod.appendChild(slot);
    });
    wrap.appendChild(pod);
    return wrap;
}

export function getRaceStandings() {
    const getTotalDistCached = (closestIdx, lap, nextCp) => {
        let dist = ((lap - 1) * state.trackPoints.length) + closestIdx;
        // Lap counters increment ~40 units BEFORE the line (checkpoint-0 trigger radius),
        // while closestIdx only wraps to 0 AT the line. In that gap — and for cars still
        // sitting behind the line at the start (nextCp starts at 1, lap 1) — a high
        // closestIdx would count as nearly a full extra lap, so pull it back by one lap.
        if (nextCp === 1 && closestIdx > state.trackPoints.length * 0.75) {
            dist -= state.trackPoints.length;
        }
        return dist;
    };
    let results = []; const pFinished = state.currentLap > state.totalLaps;
    results.push({
        name: "Player",
        dist: getTotalDistCached(state.playerLastClosestIdx, state.currentLap, state.nextCheckpoint),
        driverIndex: 0,
        finished: pFinished,
        finishTime: pFinished ? (Date.now() - state.raceStartTime) : 0
    });
    state.aiCars.forEach(ai => {
        results.push({
            name: ai.name,
            dist: getTotalDistCached(ai.lastClosestIdx, ai.lap, ai.nextCp),
            driverIndex: ai.id + 1,
            finished: ai.finished,
            finishTime: ai.finishTime
        });
    });
    results.sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.dist - a.dist;
    });
    return results;
}

export function updateFinishScreenUI(results) {
    const el = document.getElementById('finish-screen'); const title = document.getElementById('finish-title'); const sub = document.getElementById('finish-subtitle'); const list = document.getElementById('race-results-list'); const seasonList = document.getElementById('season-results-list'); const nextBtn = document.getElementById('next-btn'); const seasonCol = document.getElementById('season-col'); const header = document.getElementById('res-header-1');
    el.style.display = 'block';
    // Race results dock to the side so the player car stays visible; qualifying keeps
    // the centered layout (no live action worth watching behind it).
    el.classList.toggle('docked', state.sessionType !== 'qualifying');
    document.getElementById('podium-area').innerHTML = '';
    if (state.sessionType === 'qualifying') {
        title.innerText = "QUALIFYING COMPLETE"; sub.innerText = "GRID SET FOR RACE"; header.innerText = "STARTING GRID"; nextBtn.innerText = "START RACE"; seasonCol.style.display = 'none';
        const playerTime = results[0].finishTime;
        let avgSpeed = 65;
        if (cfg.difficulty === 'easy') avgSpeed = 50;
        if (cfg.difficulty === 'hard') avgSpeed = 80;
        if (cfg.weather === 'wet') avgSpeed *= 0.8;
        const trackLen = state.trackCurve.getLength();
        const estimatedAiTime = (trackLen / avgSpeed) * 1000;
        let qualiResults = [];
        qualiResults.push({ name: "Player", time: playerTime, driverIndex: 0 });
        for (let i = 1; i < season.drivers.length; i++) {
            const perf = season.drivers[i].performance || 1.0;
            // AI times scaled by driver performance + smaller randomized noise
            const noise = (Math.random() - 0.5) * 2000;
            let aiTime = (estimatedAiTime / perf) + noise;
            qualiResults.push({ name: season.drivers[i].name, time: aiTime, driverIndex: i });
        }
        qualiResults.sort((a, b) => a.time - b.time);
        season.currentGrid = qualiResults.map(r => r.driverIndex);
        list.innerHTML = '';
        qualiResults.forEach((r, i) => {
            const row = document.createElement('div');
            row.className = 'result-row';
            const diff = r.time - qualiResults[0].time;
            const timeStr = i === 0 ? formatTime(r.time) : `+${(diff / 1000).toFixed(3)}`;
            const nameStr = r.name === "Player" ? `<span style="color:#e74c3c">${displayName(r.name)}</span>` : r.name;
            row.innerHTML = `<span class="pos-${i + 1}">${i + 1}. ${nameStr}</span> <span class="time-gap">${timeStr}</span>`;
            list.appendChild(row);
        });
        return;
    }
    header.innerText = "RACE RESULTS"; results.forEach((r, i) => { const pts = i < POINTS_SYSTEM.length ? POINTS_SYSTEM[i] : 0; season.drivers[r.driverIndex].points += pts; r.pts = pts; });
    document.getElementById('podium-area').appendChild(makePodium('RACE PODIUM', results.slice(0, 3).map(r => ({ name: displayName(r.name), color: season.drivers[r.driverIndex].color }))));
    list.innerHTML = ''; const winnerTime = results[0].finished ? results[0].finishTime : 0; results.forEach((r, i) => { const row = document.createElement('div'); row.className = 'result-row'; let timeStr = ""; if (r.finished) { if (i === 0) { timeStr = formatTime(r.finishTime); } else { const diff = r.finishTime - winnerTime; timeStr = `+${(diff / 1000).toFixed(2)}s`; } } else { timeStr = "--"; } row.innerHTML = `<span class="pos-${i + 1}">${i + 1}. ${displayName(r.name)}</span> <div style="display:flex; gap:10px;"><span class="time-gap">${timeStr}</span><span>+${r.pts} PTS</span></div>`; list.appendChild(row); });
    if (season.active) { seasonCol.style.display = 'block'; sub.innerText = `RACE ${season.currentRaceIdx + 1} / ${season.totalRaces} COMPLETE`; const standings = [...season.drivers].sort((a, b) => b.points - a.points); seasonList.innerHTML = ''; standings.forEach((d, i) => { const row = document.createElement('div'); row.className = 'result-row'; row.innerHTML = `<span class="pos-${i + 1}">${i + 1}. ${displayName(d.name)}</span> <span>${d.points} PTS</span>`; seasonList.appendChild(row); }); if (season.currentRaceIdx >= season.totalRaces - 1) { title.innerText = "SEASON CHAMPION: " + displayName(standings[0].name).toUpperCase(); nextBtn.innerText = "MAIN MENU"; document.getElementById('podium-area').appendChild(makePodium('WORLD CHAMPIONSHIP', standings.slice(0, 3).map(d => ({ name: displayName(d.name), color: d.color })), true)); } else { title.innerText = "RACE FINISHED"; nextBtn.innerText = "START NEXT RACE"; } } else { seasonCol.style.display = 'none'; const pRank = results.findIndex(r => r.name === "Player") + 1; title.innerText = "P" + pRank + " - FINISHED"; sub.innerText = "TIME: " + formatTime(Date.now() - state.raceStartTime); nextBtn.innerText = "MAIN MENU"; }
}

export function updateStrategyUI() {
    const btnS = document.getElementById('strat-s');
    const btnM = document.getElementById('strat-m');
    const btnH = document.getElementById('strat-h');
    if (!btnS || !btnM || !btnH) return;
    btnS.className = 'strat-btn';
    btnM.className = 'strat-btn';
    btnH.className = 'strat-btn';
    if (state.nextTyreCompoundIdx === 0) btnS.classList.add('selected-s');
    else if (state.nextTyreCompoundIdx === 1) btnM.classList.add('selected-m');
    else if (state.nextTyreCompoundIdx === 2) btnH.classList.add('selected-h');
}

export function selectNextCompound(idx) {
    state.nextTyreCompoundIdx = idx;
    updateStrategyUI();
}
window.selectNextCompound = selectNextCompound;

export function completeLap() {
    const now = Date.now(); if (now - state.startTime < 1000) return; state.currentLap++;
    if (state.currentLap > state.totalLaps) {
        state.raceState = 'finished';
        if (state.sessionType === 'qualifying') {
            updateFinishScreenUI([{ name: "Player", dist: 0, driverIndex: 0, finished: true, finishTime: (Date.now() - state.raceStartTime) }]);
        } else {
            // Let the race world breathe for a few seconds (cars keep circulating, engine
            // quiets down) before the results panel appears. Standings are re-read at show
            // time so AI cars finishing during the delay get proper finish times.
            setTimeout(() => { if (state.isRunning && state.raceState === 'finished') updateFinishScreenUI(getRaceStandings()); }, 3000);
        }
    } else { document.getElementById('lap-val').innerText = `${state.currentLap}/${state.totalLaps}`; state.startTime = now; }
}

export function updateLogic() {
    const p = state.chassisBody.position; const targetCP = state.checkpoints[state.nextCheckpoint]; const dx = p.x - targetCP.x; const dy = p.y - targetCP.y; const dz = p.z - targetCP.z;
    if (dx * dx + dy * dy + dz * dz < 1600) { // Optimized Math.sqrt away
        // Checkpoint 0 is the start/finish line under the arch. The 40-unit radius alone
        // would complete the lap well before the line, so additionally require the car to
        // be past the line's plane (dot of offset-from-line with the track tangent >= 0).
        if (state.nextCheckpoint === 0) {
            const t0 = state.trackPoints[0], t1 = state.trackPoints[1];
            if ((p.x - t0.x) * (t1.x - t0.x) + (p.z - t0.z) * (t1.z - t0.z) >= 0) { completeLap(); state.nextCheckpoint = 1; }
        }
        else { const flash = document.getElementById('lap-flash'); if (state.sessionType !== 'qualifying') { if (state.nextCheckpoint === 1) flash.innerText = "SECTOR 1"; else if (state.nextCheckpoint === 2) flash.innerText = "SECTOR 2"; else flash.innerText = "SECTOR"; flash.style.display = 'block'; setTimeout(() => flash.style.display = 'none', 1000); } state.nextCheckpoint++; if (state.nextCheckpoint >= state.checkpoints.length) state.nextCheckpoint = 0; }
    }

    state.aiCars.forEach(ai => {
        ai.lastClosestIdx = findClosestTrackPoint(ai.body.position, ai.lastClosestIdx);
        const cIdx = ai.lastClosestIdx;
        const pos = ai.body.position;
        const tp = state.trackPoints[cIdx];
        const minD = (pos.x - tp.x) ** 2 + (pos.z - tp.z) ** 2;

        // Optimized sand traps: only run the loop if we are off the main road width
        let onSurface = 'tarmac';
        if (minD > 81) {
            for (let trap of state.sandTraps) {
                const distSq = (pos.x - trap.pos.x) ** 2 + (pos.z - trap.pos.z) ** 2;
                if (distSq < trap.r * trap.r && Math.abs(pos.y - trap.pos.y) < 3.0) { onSurface = 'sand'; break; }
            }
            if (onSurface !== 'sand' && minD > 400) onSurface = 'grass';
        }

        if (onSurface !== 'tarmac') { ai.offTrackTimer += 1 / 60; if (ai.offTrackTimer > 2.0) { teleportToTrack(ai.body); ai.offTrackTimer = 0; return; } } else { ai.offTrackTimer = 0; }

        // Flip/crash recovery: off-track detection above only fires on lateral drift, so a car
        // rolled onto its roof/side while still near the racing line would otherwise sit stuck
        // there forever. up.y is the world-space Y of the car's local up vector: 1 = upright,
        // <=0 = on its side or upside down.
        scratch.flipUpVec.set(0, 1, 0); ai.body.quaternion.vmult(scratch.flipUpVec, scratch.flipUpVec);
        if (scratch.flipUpVec.y < 0.2) { ai.flipTimer += 1 / 60; if (ai.flipTimer > 2.0) { teleportToTrack(ai.body); ai.flipTimer = 0; return; } } else { ai.flipTimer = 0; }

        const distToNextCP = (pos.x - state.checkpoints[ai.nextCp].x) ** 2 + (pos.z - state.checkpoints[ai.nextCp].z) ** 2;
        // Same past-the-line plane gate as the player's checkpoint 0 (see updateLogic top).
        if (distToNextCP < 1600) { if (ai.nextCp === 0) { const t0 = state.trackPoints[0], t1 = state.trackPoints[1]; if ((pos.x - t0.x) * (t1.x - t0.x) + (pos.z - t0.z) * (t1.z - t0.z) >= 0) { ai.lap++; ai.nextCp = 1; if (ai.lap > state.totalLaps && !ai.finished) { ai.finished = true; ai.finishTime = Date.now() - state.raceStartTime; } } } else { ai.nextCp++; if (ai.nextCp >= state.checkpoints.length) ai.nextCp = 0; } }

        let lookAheadVal = ai.skill.lookAhead;
        if (onSurface !== 'tarmac') { lookAheadVal = 5; }
        if (cfg.weather === 'wet') { lookAheadVal = Math.max(10, lookAheadVal - 5); }
        const lookAheadIdx = (cIdx + lookAheadVal) % state.trackPoints.length;

        // AI Pit Strategy Decision
        if (state.raceState === 'racing' && !cfg.noTyreWear && !ai.finished && !ai.inPitLane && ai.tyreLife < ai.pitThreshold && (state.totalLaps - ai.lap) >= 1) {
            ai.wantsToPit = true;
        }

        // AI Pit Area Detection and State
        const wasInPitLane = ai.inPitLane;
        let inPitArea = (cIdx >= cfg.trackRes - 60 || cIdx <= 60);
        if (inPitArea) {
            if (ai.wantsToPit || ai.inPitLane) {
                ai.inPitLane = true;
            }
        } else {
            ai.inPitLane = false;
        }
        // Ghost while in the pit lane (no car-car collisions, semi-transparent); restore on exit.
        if (ai.inPitLane !== wasInPitLane) setCarGhost(ai.body, ai.ghostMats, ai.inPitLane);

        // Determine target point with pit lane offset if in pit lane
        let targetOffset = 0;
        if (ai.inPitLane) {
            targetOffset = getPitLaneOffset(lookAheadIdx);
        }

        const targetThree = state.trackPoints[lookAheadIdx];
        const p1_target = targetThree;
        const p2_target = state.trackPoints[(lookAheadIdx + 1) % state.trackPoints.length];
        const tan_target = new THREE.Vector3().subVectors(p2_target, p1_target).normalize();
        // Pit lane offsets are built by generatePitLane()/getPitLaneOffset() using side = (tan.z, 0, -tan.x),
        // the opposite sign from cross(tangent, up) used for normal racing-line steering elsewhere in this
        // function. When targetOffset is 0 (not in the pit lane) the sign is irrelevant, but with a nonzero
        // pit-lane offset the cross(tan,up) convention pushes the AI toward the grandstand side instead of
        // the actual pit lane tarmac, so it must match generatePitLane()'s convention here.
        const side_target = new THREE.Vector3(tan_target.z, 0, -tan_target.x).normalize();
        const offsetTargetPos = p1_target.clone().add(side_target.multiplyScalar(targetOffset));

        scratch.aiTargetVec.set(offsetTargetPos.x, offsetTargetPos.y, offsetTargetPos.z);
        ai.body.pointToLocalFrame(scratch.aiTargetVec, scratch.aiLocalPoint);
        const steer = Math.atan2(scratch.aiLocalPoint.x, scratch.aiLocalPoint.z);
        const speed = ai.body.velocity.length();

        const aiCompound = TYRE_COMPOUNDS[ai.compoundIdx];
        const aiWearFactor = 0.4 + 0.6 * Math.pow(ai.tyreLife / 100, 1.5);
        const gripFactor = aiWearFactor * aiCompound.grip * state.surfaceGrip;

        let topSpeed = ai.finished ? 100 : ai.skill.topSpeed;
        let desiredSpeed = topSpeed / 3.6;

        // Reduce top speed slightly if tyres are worn (less traction out of corners)
        if (ai.tyreLife < 50) {
            desiredSpeed *= (0.9 + 0.1 * (ai.tyreLife / 50));
        }

        if (cfg.weather === 'wet') {
            desiredSpeed *= 0.75;
            if (Math.abs(steer) > 0.05) desiredSpeed *= 0.5;
        }

        // Cornering speed scaling based on steering and tyre grip
        if (Math.abs(steer) > 0.1) desiredSpeed *= 0.5 * ai.skill.cornering * gripFactor;
        if (Math.abs(steer) > 0.3) desiredSpeed *= 0.3 * gripFactor;

        // Pit Lane Speed Control and Stopping in Pit Box
        if (ai.inPitLane) {
            // Pit lane speed limit: 55 km/h
            desiredSpeed = 55 / 3.6;

            // Slow down to stop in the pit box — but only while a stop is still owed;
            // once the tyre change is done (wantsToPit false) drive out at the limiter,
            // otherwise the car parks at the box forever.
            const distToPitBoxSq = (pos.x - state.pitBoxPosition.x) ** 2 + (pos.z - state.pitBoxPosition.z) ** 2;
            if (distToPitBoxSq < 225 && (ai.wantsToPit || ai.isPitting)) {
                const dist = Math.sqrt(distToPitBoxSq);
                if (dist < 4.5) {
                    desiredSpeed = 0; // Stop
                } else {
                    desiredSpeed = Math.min(desiredSpeed, (dist / 15.0) * (55 / 3.6));
                }
            }
        }

        const steerVal = Math.max(-0.5, Math.min(0.5, steer));
        ai.vehicle.setSteeringValue(steerVal, 0);
        ai.vehicle.setSteeringValue(steerVal, 1);

        // AI Tyre Wear
        if (state.raceState === 'racing' && !cfg.noTyreWear && !ai.finished && !ai.isPitting) {
            const aiSpeed = speed;
            let aiOnSurface = onSurface;
            let aiSurfaceMultiplier = 1.0;
            if (aiOnSurface === 'sand') aiSurfaceMultiplier = 2.5;
            else if (aiOnSurface === 'grass') aiSurfaceMultiplier = 1.8;

            const aiBaseWearRate = (aiSpeed * 0.00015) + (Math.abs(steerVal) * aiSpeed * 0.0006);
            const aiWearRate = aiBaseWearRate * aiCompound.wear * aiSurfaceMultiplier * 0.25;
            ai.tyreLife -= aiWearRate;
            if (ai.tyreLife < 0) ai.tyreLife = 0;
        }

        // AI Pit Stop Execution
        if (state.pitBoxPosition && state.raceState === 'racing' && !ai.finished && ai.inPitLane) {
            const adx = pos.x - state.pitBoxPosition.x; const adz = pos.z - state.pitBoxPosition.z;
            const distToPitBoxSq = adx * adx + adz * adz;
            // wantsToPit/isPitting gate: without it, a car accelerating away from its finished
            // stop is still slow + near the box and would immediately begin another stop.
            if (distToPitBoxSq < 225 && speed < 1.5 && (ai.wantsToPit || ai.isPitting)) {
                if (!ai.isPitting) {
                    ai.isPitting = true;
                    ai.pitStopTimer = 0;
                }
                ai.pitStopTimer += 1 / 60;
                // Low-res tyre-change visual: blink the compound stripes during the stop.
                const stripeOn = Math.floor(ai.pitStopTimer * 4) % 2 === 0;
                ai.tyreStripes.forEach(s => s.visible = stripeOn);
                if (ai.pitStopTimer >= 5.0) {
                    // Pit stop complete! Choose next compound strategically based on remaining laps
                    const remainingLaps = state.totalLaps - ai.lap;
                    if (remainingLaps <= 2) {
                        ai.compoundIdx = 0; // Soft (Fast finish)
                    } else if (remainingLaps <= 5) {
                        ai.compoundIdx = 1; // Medium
                    } else {
                        ai.compoundIdx = 2; // Hard (Long stint)
                    }
                    ai.tyreLife = 100.0;
                    ai.tyreStripes.forEach(s => { s.material.color.setHex(TYRE_COLORS[ai.compoundIdx]); s.visible = true; });
                    ai.wantsToPit = false;
                    ai.isPitting = false;
                }
            } else {
                if (ai.isPitting) ai.tyreStripes.forEach(s => s.visible = true);
                ai.isPitting = false;
            }
        } else {
            if (ai.isPitting) ai.tyreStripes.forEach(s => s.visible = true);
            ai.isPitting = false;
        }

        let baseAccelForce = cfg.carClass === 'mini' ? -3500 : -7000;
        let brakeForce = cfg.carClass === 'mini' ? 1200 : 2000;
        let force = 0;
        let brakeVal = 0;

        if (desiredSpeed === 0) {
            brakeVal = 150;
            force = 0;
        } else if (speed < desiredSpeed) {
            let speedRatio = Math.min(1.0, (speed * 3.6) / ai.skill.topSpeed);
            let torqueMultiplier = 1.0 - Math.pow(speedRatio, 2);
            // Same anti-wheelie launch ramp as the player (see main.js): full torque at a
            // dead stop was pitching cars up off the grid at race starts.
            let launchRamp = Math.min(1.0, 0.4 + (speed * 3.6) / 20);
            force = baseAccelForce * Math.max(0.05, torqueMultiplier) * launchRamp;
        } else if (speed > desiredSpeed + 1.0) {
            brakeVal = 80;
            force = 0;
        }

        const distToPlayerSq = (pos.x - state.chassisBody.position.x) ** 2 + (pos.y - state.chassisBody.position.y) ** 2 + (pos.z - state.chassisBody.position.z) ** 2;
        if (distToPlayerSq < 64) {
            brakeVal = Math.max(brakeVal, 100);
            force = 0;
        }

        if (onSurface === 'sand') { force *= 0.7; ai.body.velocity.scale(0.98, ai.body.velocity); spawnDust(pos, 0xd2b48c); }
        else if (onSurface === 'grass') { force *= 0.7; ai.body.velocity.scale(0.98, ai.body.velocity); if (speed > 5) spawnDust(pos, 0x2e8b57); }
        if (cfg.weather === 'wet' && onSurface === 'tarmac' && speed > 20) { if (Math.random() > 0.7) spawnDust(pos, 0xffffff); }
        if (state.surfaceDust !== null && onSurface === 'tarmac' && speed > 15) { if (Math.random() > 0.7) spawnDust(pos, state.surfaceDust); }

        let isBraking = brakeVal > 0;
        if (ai.tailMat) ai.tailMat.color.setHex(isBraking ? 0xff0000 : 0x440000);

        // Update AI wheel friction based on current tyre compound & wear
        const aiBaseGrip = cfg.weather === 'wet' ? 2.0 : 4.8;
        const aiCurrentGrip = aiBaseGrip * gripFactor;
        ai.vehicle.wheelInfos.forEach(w => w.frictionSlip = aiCurrentGrip);

        ai.vehicle.applyEngineForce(force * state.surfaceForce, 2); ai.vehicle.applyEngineForce(force * state.surfaceForce, 3);
        let aiAbsBrakeVal = brakeVal;
        if (Math.abs(steerVal) > 0.1) {
            aiAbsBrakeVal *= Math.max(0.4, 1.0 - Math.abs(steerVal) * 0.8);
        }
        ai.vehicle.setBrake(aiAbsBrakeVal, 0); ai.vehicle.setBrake(aiAbsBrakeVal, 1);
        ai.vehicle.setBrake(aiAbsBrakeVal * 0.5, 2); ai.vehicle.setBrake(aiAbsBrakeVal * 0.5, 3);

        if (ai.body.userData.mesh) { ai.body.userData.mesh.position.copy(ai.body.position); ai.body.userData.mesh.quaternion.copy(ai.body.quaternion); }
        for (let i = 0; i < 4; i++) { ai.vehicle.updateWheelTransform(i); const t = ai.vehicle.wheelInfos[i].worldTransform; ai.wheels[i].position.copy(t.position); ai.wheels[i].quaternion.copy(t.quaternion); }

        // Flat baseline term matches the player's grip-at-launch fix (see main.js).
        scratch.downforceVec.set(0, -(speed * speed * 2 + 1500), 0);
        ai.body.applyLocalForce(scratch.downforceVec, scratch.zeroVec);
    });

    if (state.raceState === 'racing') { if (state.sessionType === 'qualifying') return; const rankings = getRaceStandings(); const playerRank = rankings.findIndex(r => r.name === "Player") + 1; document.getElementById('pos-val').innerText = `${playerRank}/${state.aiCars.length + 1}`; }
}
