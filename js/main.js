import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { state, cfg, season, inputs, scratch, globalGeometries, globalMaterials } from './state.js';
import {
    AI_DRIVERS,
    ZOOM_LEVELS,
    TYRE_COMPOUNDS,
    TYRE_COLORS,
    RALLY_SURFACES,
    DRIVE_THROUGH_CAP_KPH,
    DAMAGE_ZONES,
    BASE_PIT_HOLD_T,
} from './constants.js';
import { createRNG, formatTime, pitEase } from './utils.js';
import { setupAudio, updateAudio } from './audio.js';
import {
    generateCircuit,
    generateScenery,
    setupMinimap,
    updateMinimap,
    findClosestTrackPoint,
    getPitLaneOffset,
} from './track.js';
import { createF1Car, createAICar, setCarGhost } from './cars.js';
import { setupInputs } from './input.js';
import { spawnDust, updateParticles, setupSkidmarkPool, updateSkidmarks, dustMaterials } from './effects.js';
import { updateLogic, resetCar, updateStrategyUI } from './race.js';
import { resetIncidents, isDriveThroughActive, checkTrackLimits, applyOffTrackDamage } from './incidents.js';

window.addEventListener('init-game', (e) => {
    const d = e.detail;
    cfg.time = d.time;
    cfg.laps = d.laps;
    cfg.difficulty = d.difficulty;
    cfg.opponents = d.opponents;
    cfg.weather = d.weather;
    cfg.qualifying = d.qualifying;
    cfg.carClass = d.carClass;
    state.zoomLevel = d.zoom;
    cfg.controlStyle = d.controlStyle || 'manual';
    cfg.startCompound = d.startCompound === undefined ? 1 : d.startCompound;
    cfg.noTyreWear = !!d.noTyreWear;
    cfg.stewardPenalties = !!d.stewardPenalties;
    cfg.trackLimits = !!d.trackLimits;
    cfg.damageEnabled = !!d.damageEnabled;
    // Chosen name is display-only; the internal id stays "Player" everywhere (standings,
    // finish detection and season logic all compare against that literal).
    // Name goes into results innerHTML, so keep it to plain characters.
    cfg.driverName =
        (d.driverName || '')
            .replace(/[^A-Za-z0-9 _.\-]/g, '')
            .trim()
            .substring(0, 12) || 'Player';
    cfg.teamColor = d.teamColor || 0xdc0000;
    cfg.raceStyle = d.raceStyle || 'f1';
    cfg.surface = cfg.raceStyle === 'rally' ? d.surface || 'tarmac' : 'tarmac';
    season.drivers = [];
    season.drivers.push({ name: 'Player', color: cfg.teamColor, points: 0, isPlayer: true, lastLapTime: 0 });
    const aiCount = cfg.opponents - 1;
    for (let i = 0; i < aiCount; i++) {
        const entry = AI_DRIVERS[i % AI_DRIVERS.length];
        // Small random jitter so championship order is a strong tendency, not a script.
        const perf = entry.performance + Math.random() * 0.02;
        season.drivers.push({
            name: entry.name,
            color: entry.color,
            points: 0,
            isPlayer: false,
            lastLapTime: 0,
            performance: perf,
        });
    }
    season.currentGrid = [];
    for (let i = 1; i < season.drivers.length; i++) season.currentGrid.push(i);
    season.currentGrid.push(0);

    if (d.mode === 'season') {
        season.active = true;
        season.currentRaceIdx = 0;
        season.totalRaces = d.seasonLen;
        season.seeds = [];
        for (let i = 0; i < d.seasonLen; i++) season.seeds.push(Math.random().toString(16).substr(2, 8).toUpperCase());
        cfg.seed = season.seeds[0];
    } else {
        season.active = false;
        cfg.seed = d.seed;
    }

    if (state.isRunning) cleanup();
    state.sessionType = cfg.qualifying ? 'qualifying' : 'race';
    setTimeout(init, 50);
});

window.addEventListener('next-action', () => {
    if (state.sessionType === 'qualifying') {
        state.sessionType = 'race';
        cleanup();
        document.getElementById('finish-screen').style.display = 'none';
        setTimeout(init, 50);
        return;
    }
    if (season.active && season.currentRaceIdx < season.totalRaces - 1) {
        season.currentRaceIdx++;
        cfg.seed = season.seeds[season.currentRaceIdx];
        if (cfg.qualifying) {
            state.sessionType = 'qualifying';
        } else {
            state.sessionType = 'race';
            season.currentGrid = [];
            for (let i = 1; i < season.drivers.length; i++) season.currentGrid.push(i);
            season.currentGrid.push(0);
        }
        cleanup();
        document.getElementById('finish-screen').style.display = 'none';
        setTimeout(init, 50);
    } else {
        cleanup();
        resetUI();
    }
});

window.addEventListener('reset-game', () => {
    cleanup();
    resetUI();
});
window.addEventListener('restart-race', () => {
    togglePause(false);
    cleanup();
    document.getElementById('finish-screen').style.display = 'none';
    setTimeout(init, 50);
});
window.addEventListener('quit-game', () => {
    togglePause(false);
    cleanup();
    resetUI();
});
window.addEventListener('toggle-pause', () => {
    togglePause();
});
window.addEventListener('toggle-mute', () => {
    state.audioMuted = !state.audioMuted;
    const btn = document.getElementById('mute-btn');
    btn.innerText = state.audioMuted ? '🔇' : '🔊';
    btn.style.opacity = state.audioMuted ? '0.5' : '1.0';
    if (state.audioCtx) {
        if (state.audioMuted) state.audioCtx.suspend();
        else state.audioCtx.resume();
    }
});
window.addEventListener('toggle-cam', () => {
    state.zoomLevel = (state.zoomLevel + 1) % ZOOM_LEVELS.length;
});

function resetUI() {
    document.getElementById('finish-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
    document.getElementById('leaderboard-hud').style.display = 'none';
    document.getElementById('mute-btn').style.display = 'none';
    document.getElementById('cam-btn').style.display = 'none';
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.style.display = 'none';
    document.getElementById('pause-menu').style.display = 'none';
    document.getElementById('start-screen').style.display = 'flex';
    const btn = document.getElementById('start-btn');
    btn.innerText = 'ENTER COCKPIT';
    btn.disabled = false;
}

function init() {
    state.rng = createRNG(cfg.seed);
    state.currentLap = 1;
    state.startTime = 0;
    state.raceStartTime = 0;
    state.playerFinishTime = 0;
    state.bestTime = Infinity;
    state.nextCheckpoint = 1;
    state.skidmarks = [];
    state.trackPoints = [];
    state.checkpoints = [];
    state.visualWheels = [];
    state.sandTraps = [];
    state.aiCars = [];
    state.particles = [];
    state.tyreLife = 100.0;
    state.tyreCompoundIdx = cfg.startCompound;
    state.nextTyreCompoundIdx = cfg.startCompound;
    state.pitBoxPosition = null;
    state.pitPhase = 'none';
    state.pitStartTime = 0;
    state.pitHoldT = BASE_PIT_HOLD_T;
    state.pitRepairsApplied = false;
    state.damage = { frontWing: 100, floor: 100, gearbox: 100 };
    state.pitRepairSelection = { frontWing: false, floor: false, gearbox: false };
    state.tempNextTyreCompoundIdx = cfg.startCompound;
    state.playerTyreStripes = [];
    const modal = document.getElementById('pit-selection-modal');
    if (modal) modal.style.display = 'none';
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.style.display = 'none';
    const surf = cfg.raceStyle === 'rally' ? RALLY_SURFACES[cfg.surface] : RALLY_SURFACES.tarmac;
    state.surfaceGrip = surf.grip;
    state.surfaceForce = surf.force;
    state.surfaceDust = surf.dust;
    resetIncidents();

    setupGraphics();
    if (cfg.raceStyle === 'rally') {
        if (cfg.surface === 'snow') {
            state.skidMat.color.setHex(0xb0c4de);
            state.skidMat.opacity = 0.45;
        } else if (cfg.surface === 'mud') {
            state.skidMat.color.setHex(0x3a2512);
            state.skidMat.opacity = 0.75;
        } else {
            state.skidMat.color.setHex(0x111111);
            state.skidMat.opacity = 0.6;
        }
    } else {
        state.skidMat.color.setHex(0x111111);
        state.skidMat.opacity = 0.6;
    }
    setupPhysics();
    generateCircuit();
    generateScenery();
    setupMinimap();
    setupSkidmarkPool();

    if (state.sessionType === 'qualifying') {
        state.totalLaps = 1;
        const spawnIdx = Math.floor(cfg.trackRes * 0.96);
        createF1Car(spawnIdx, true, 0);
    } else {
        state.totalLaps = cfg.laps;
        const grid = season.currentGrid;
        // Staggered 2-wide F1-style grid: ~7 world units per slot instead of the old
        // 20-track-index (~45 unit) single-file spread. Convert units -> point indices
        // via actual point spacing, since it varies per track length.
        const ptSpacing = Math.max(0.5, state.trackPoints[0].distanceTo(state.trackPoints[1]));
        for (let i = 0; i < grid.length; i++) {
            const driverIdx = grid[i];
            const distBack = Math.max(2, Math.round((8 + i * 7) / ptSpacing));
            let spawnPtIdx = (cfg.trackRes + 0 - distBack) % cfg.trackRes;
            if (spawnPtIdx < 0) spawnPtIdx += cfg.trackRes;

            const offset = i % 2 === 0 ? -3 : 3;

            if (driverIdx === 0) {
                createF1Car(spawnPtIdx, false, offset);
            } else {
                const driverInfo = season.drivers[driverIdx];
                const col = new THREE.Color(driverInfo.color);
                createAICar(spawnPtIdx, offset, col, driverIdx - 1, driverInfo.name);
            }
        }
    }

    setupAudio();
    setupInputs(togglePause);
    state.isRunning = true;
    state.isPaused = false;
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('hud').style.display = 'flex';
    document.getElementById('mute-btn').style.display = 'flex';
    document.getElementById('cam-btn').style.display = 'flex';
    const rBtn = document.getElementById('reset-btn');
    if (rBtn) rBtn.style.display = 'flex';
    document.getElementById('lap-val').innerText =
        state.sessionType === 'qualifying' ? 'QUALIFYING' : `1/${state.totalLaps}`;
    document.getElementById('tyre-val').innerText = '100%';
    document.getElementById('tyre-val').style.color = '#2ecc71';
    updateStrategyUI();
    const stratSection = document.getElementById('strat-section');
    if (stratSection) stratSection.style.display = cfg.noTyreWear ? 'none' : '';
    const damageRow = document.getElementById('damage-row');
    if (damageRow) damageRow.style.display = cfg.damageEnabled ? 'flex' : 'none';
    const badgeEl = document.getElementById('compound-badge');
    if (badgeEl) {
        badgeEl.innerText = TYRE_COMPOUNDS[state.tyreCompoundIdx].label;
        if (state.tyreCompoundIdx === 0) {
            badgeEl.style.backgroundColor = '#eb2f06';
            badgeEl.style.color = '#fff';
        } else if (state.tyreCompoundIdx === 1) {
            badgeEl.style.backgroundColor = '#f1c40f';
            badgeEl.style.color = '#000';
        } else {
            badgeEl.style.backgroundColor = '#f5f6fa';
            badgeEl.style.color = '#000';
        }
    }
    document.getElementById('pit-msg').style.display = 'none';

    // Auto-accelerate scheme: no separate throttle/reverse touch buttons needed, since the
    // single brake button covers both slowing down and reversing (see animate()).
    const isAuto = cfg.controlStyle === 'auto';
    document.getElementById('btn-g').style.display = isAuto ? 'none' : '';
    document.getElementById('btn-rev').style.display = isAuto ? 'none' : '';
    document.getElementById('btn-b').innerText = isAuto ? 'BRAKE/REV' : 'BRAKE';

    const flash = document.getElementById('lap-flash');
    if (state.sessionType === 'qualifying') {
        flash.innerText = 'FLYING LAP';
        flash.style.display = 'block';
        setTimeout(() => (flash.style.display = 'none'), 3000);
        startCountdown(true);
    } else {
        if (season.active) {
            flash.innerText = `ROUND ${season.currentRaceIdx + 1} / ${season.totalRaces}`;
            flash.style.display = 'block';
            setTimeout(() => (flash.style.display = 'none'), 3000);
        }
        startCountdown(false);
    }
    if (state.audioCtx && state.audioMuted) state.audioCtx.suspend();
}

function cleanup() {
    state.isRunning = false;
    cancelAnimationFrame(state.animId);
    if (state.audioCtx) {
        try {
            state.audioCtx.close();
        } catch (e) {}
        state.audioCtx = null;
    }
    if (state.scene) {
        state.scene.traverse((node) => {
            if (node.isMesh) {
                if (node.geometry && !globalGeometries.has(node.geometry)) {
                    node.geometry.dispose();
                }
                if (node.material) {
                    const mats = Array.isArray(node.material) ? node.material : [node.material];
                    mats.forEach((m) => {
                        if (!globalMaterials.has(m) && !Object.values(dustMaterials).includes(m)) {
                            m.dispose();
                        }
                    });
                }
            }
        });
    }
    if (state.renderer) {
        state.renderer.dispose();
        if (document.body.contains(state.renderer.domElement)) document.body.removeChild(state.renderer.domElement);
    }
    if (typeof state.sceneryMeshes !== 'undefined') {
        state.sceneryMeshes.forEach((m) => {
            if (state.scene) state.scene.remove(m);
        });
        state.sceneryMeshes = [];
    }
    state.scene = null;
    state.world = null;
    state.vehicle = null;
}

function togglePause(force) {
    if (!state.isRunning) return;
    state.isPaused = typeof force !== 'undefined' ? force : !state.isPaused;
    const menu = document.getElementById('pause-menu');
    menu.style.display = state.isPaused ? 'flex' : 'none';
    if (state.audioCtx && !state.audioMuted) state.isPaused ? state.audioCtx.suspend() : state.audioCtx.resume();
}

function startCountdown(instant) {
    state.raceState = 'countdown';
    const el = document.getElementById('countdown');
    if (instant) {
        state.raceState = 'racing';
        state.raceStartTime = Date.now();
        state.startTime = Date.now();
        animate();
        return;
    }
    el.style.display = 'block';
    let count = 5;
    el.innerText = '● ● ● ● ●';
    el.style.color = '#ff0000';
    el.style.fontSize = '80px';
    el.style.letterSpacing = '20px';
    const timer = setInterval(() => {
        if (!state.isRunning) {
            clearInterval(timer);
            return;
        }
        count--;
        if (count > 0) {
            el.style.letterSpacing = '0px';
            el.style.fontSize = '150px';
            el.innerText = count;
        } else {
            el.innerText = 'LIGHTS OUT';
            el.style.color = '#2ecc71';
            el.style.fontSize = '100px';
            state.raceState = 'racing';
            const now = Date.now();
            state.raceStartTime = now;
            state.startTime = now;
            setTimeout(() => {
                el.style.display = 'none';
            }, 1000);
            clearInterval(timer);
        }
    }, 1000);
    animate();
}

function setupGraphics() {
    state.scene = new THREE.Scene();
    let ambientInt = 0.6;
    let skyColor = 0x87ceeb;
    let fogColor = 0x87ceeb;
    if (cfg.time === 'sunset') {
        skyColor = 0x3e2723;
        fogColor = 0x3e2723;
        ambientInt = 0.3;
    } else if (cfg.weather === 'wet') {
        skyColor = 0x4a5a6a;
        fogColor = 0x5a6a7a;
        ambientInt = 0.4;
    }

    state.scene.background = new THREE.Color(skyColor);
    state.scene.fog = new THREE.Fog(fogColor, 100, cfg.weather === 'wet' ? 500 : 900);
    const ambient = new THREE.AmbientLight(0xffffff, ambientInt);
    state.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, cfg.weather === 'wet' ? 0.8 : 1.5);
    sun.position.set(100, 200, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048; // Optimized from 4096 to 2048
    const d = 150;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    state.scene.add(sun);
    state.sun = sun;

    state.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 2000);
    state.camera.position.set(0, 50, 0);
    state.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(state.renderer.domElement);
    state.skidGeo = new THREE.PlaneGeometry(0.8, 0.8);
    state.skidMat = new THREE.MeshBasicMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
    });
    globalGeometries.add(state.skidGeo);
    globalMaterials.add(state.skidMat);

    if (cfg.weather === 'wet') {
        const rainCount = 10000;
        const rainGeo = new THREE.BufferGeometry();
        const rainPos = [];
        for (let i = 0; i < rainCount; i++) {
            const x = (Math.random() - 0.5) * 400;
            const y = Math.random() * 200;
            const z = (Math.random() - 0.5) * 400;
            rainPos.push(x, y, z);
        }
        rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(rainPos, 3));
        const rainMat = new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.5, transparent: true, opacity: 0.6 });
        state.rainSystem = new THREE.Points(rainGeo, rainMat);
        state.scene.add(state.rainSystem);
    }

    window.addEventListener('resize', () => {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function setupPhysics() {
    state.world = new CANNON.World();
    state.world.gravity.set(0, -9.82, 0);
    state.world.broadphase = new CANNON.SAPBroadphase(state.world);
    const defMat = new CANNON.Material('default');
    const wheelMat = new CANNON.Material('wheel');
    const grip = cfg.weather === 'wet' ? 2.2 : 5.0;
    const contact = new CANNON.ContactMaterial(wheelMat, defMat, {
        friction: grip,
        restitution: 0.0,
        contactEquationStiffness: 1e8,
        contactEquationRelaxation: 3,
    });
    state.world.addContactMaterial(contact);
    state.world.defaultMaterial = defMat;
}

function animate() {
    if (!state.isRunning || state.isPaused) return;
    state.animId = requestAnimationFrame(animate);

    if (state.raceState === 'racing' || state.raceState === 'finished') {
        state.world.step(1 / 60);
        const speed = state.chassisBody.velocity.length();
        const kph = speed * 3.6;
        let force = 0;
        let brakeVal = 0;
        let steering = 0;

        if (state.playerTailMat) state.playerTailMat.color.setHex(inputs.brake && kph > 5 ? 0xff0000 : 0x440000);

        state.playerLastClosestIdx = findClosestTrackPoint(state.chassisBody.position, state.playerLastClosestIdx);
        const cIdx = state.playerLastClosestIdx;
        const pos = state.chassisBody.position;
        const tp = state.trackPoints[cIdx];
        const minDSq = (pos.x - tp.x) ** 2 + (pos.z - tp.z) ** 2;

        if (cfg.trackLimits && state.raceState === 'racing' && state.pitPhase === 'none') {
            checkTrackLimits(0, state.trackLimits, minDSq);
        }

        if (state.raceState === 'finished') {
            // Race is over: this autopilot-to-finish-line branch owns the car exclusively. Make
            // sure a pit autopilot sequence can never also claim control (e.g. player crossed
            // the line while driving into the pits) and clean up its HUD if it was active.
            if (state.pitPhase !== 'none') {
                state.pitPhase = 'none';
                state.pitStartTime = 0;
                document.getElementById('pit-msg').style.display = 'none';
                setCarGhost(state.chassisBody, state.playerGhostMats, false);
                state.playerTyreStripes.forEach((s) => (s.visible = true));
            }
            const lookAhead = 10;
            const targetIdx = (cIdx + lookAhead) % state.trackPoints.length;
            scratch.aiTargetVec.set(
                state.trackPoints[targetIdx].x,
                state.trackPoints[targetIdx].y,
                state.trackPoints[targetIdx].z
            );
            state.chassisBody.pointToLocalFrame(scratch.aiTargetVec, scratch.aiLocalPoint);
            const targetSteer = Math.atan2(scratch.aiLocalPoint.x, scratch.aiLocalPoint.z);
            if (kph < 80) force = -3000;
            else if (kph > 100) brakeVal = 50;
            steering = state.currentSteer + (targetSteer - state.currentSteer) * 0.1;
            state.resetTimer = 0;
        } else {
            // Cumulative line chart style acceleration: rapid at start, plateauing at top speed
            let baseEnginePower = cfg.carClass === 'mini' ? -4500 : cfg.carClass === 'rally' ? -8500 : -12000;
            let topSpeedKph = cfg.carClass === 'mini' ? 180 : cfg.carClass === 'rally' ? 260 : 340;
            let baseReversePower = cfg.carClass === 'mini' ? 2800 : cfg.carClass === 'rally' ? 4000 : 5500;
            let reverseTopSpeedKph = cfg.carClass === 'mini' ? 70 : cfg.carClass === 'rally' ? 85 : 100;

            // Damage performance multipliers: never fully disables the car (DAMAGE_ZONES'
            // minHealth keeps state.damage[...] >= 40, so the worst case here is a 0.7x factor).
            if (cfg.damageEnabled) {
                baseEnginePower *= 0.5 + 0.5 * (state.damage.gearbox / 100);
                topSpeedKph *= 0.5 + 0.5 * (state.damage.floor / 100);
            }

            if (cfg.stewardPenalties && isDriveThroughActive(0)) {
                topSpeedKph = Math.min(topSpeedKph, DRIVE_THROUGH_CAP_KPH);
            }

            // Calculate Player Slipstream (Drafting)
            let playerSlipstream = false;
            if (
                state.chassisBody &&
                state.playerLastClosestIdx !== undefined &&
                state.raceState === 'racing' &&
                state.pitPhase === 'none'
            ) {
                const pPos = state.chassisBody.position;
                const pQuat = state.chassisBody.quaternion;
                const pSide = new THREE.Vector3(1, 0, 0).applyQuaternion(pQuat);
                const pForward = new THREE.Vector3(0, 0, 1).applyQuaternion(pQuat);

                let closestAIDistSq = Infinity;
                let closestAICarAhead = null;

                state.aiCars.forEach((ai) => {
                    let diff = ai.lastClosestIdx - state.playerLastClosestIdx;
                    if (diff < -cfg.trackRes / 2) diff += cfg.trackRes;
                    else if (diff > cfg.trackRes / 2) diff -= cfg.trackRes;

                    if (diff >= 3 && diff <= 25) {
                        const dx = ai.body.position.x - pPos.x;
                        const dy = ai.body.position.y - pPos.y;
                        const dz = ai.body.position.z - pPos.z;
                        const distSq = dx * dx + dy * dy + dz * dz;
                        if (distSq < 1600 && distSq < closestAIDistSq) {
                            closestAIDistSq = distSq;
                            closestAICarAhead = ai;
                        }
                    }
                });

                if (closestAICarAhead) {
                    const toAI = new THREE.Vector3().subVectors(closestAICarAhead.body.position, pPos);
                    const latDist = toAI.dot(pSide);
                    const longDist = toAI.dot(pForward);
                    if (Math.abs(latDist) < 4.0 && longDist > 4) {
                        playerSlipstream = true;
                    }
                }
            }
            if (playerSlipstream) {
                baseEnginePower *= 1.25;
                topSpeedKph += 20;
            }
            const slipIndicator = document.getElementById('slipstream-indicator');
            if (slipIndicator) {
                slipIndicator.style.display = playerSlipstream ? 'inline' : 'none';
            }

            // --- Pit lane entry detection (the player's own choice/positioning, not automatic) ---
            // The pit lane only physically diverges from the main straight along its entry ramp
            // (track index i in [-PIT_LEN, -PIT_LEN+PIT_RAMP_LEN], mirroring generatePitLane()/
            // getPitLaneOffset()). A player is only "entering the pits" once they've steered
            // laterally past the main track's kerb onto that extra tarmac while inside that ramp
            // window - checking the index window alone would also fire for a driver simply
            // holding the racing line through the same stretch, so we require both.
            const PIT_LEN = 60;
            const PIT_RAMP_LEN = 25;
            const PIT_ENTRY_LATERAL_THRESHOLD = 8.5;
            if (state.pitPhase === 'none' && state.pitBoxPosition) {
                let pitRelIdx = cIdx;
                if (pitRelIdx > cfg.trackRes / 2) pitRelIdx -= cfg.trackRes;
                if (pitRelIdx >= -PIT_LEN && pitRelIdx <= -PIT_LEN + PIT_RAMP_LEN) {
                    const p1e = state.trackPoints[cIdx];
                    const p2e = state.trackPoints[(cIdx + 1) % state.trackPoints.length];
                    const tanEx = p2e.x - p1e.x,
                        tanEz = p2e.z - p1e.z;
                    const tanELen = Math.hypot(tanEx, tanEz) || 1;
                    // side = (tan.z, -tan.x), matching generatePitLane()'s own side convention (NOT
                    // the cross(tangent, up) used elsewhere) so "positive lateral" really means
                    // "towards the rendered pit lane/garages", not the grandstand side.
                    const sideEx = tanEz / tanELen,
                        sideEz = -tanEx / tanELen;
                    const lateral = (pos.x - p1e.x) * sideEx + (pos.z - p1e.z) * sideEz;
                    if (lateral > PIT_ENTRY_LATERAL_THRESHOLD) {
                        state.pitPhase = 'pitting';
                        state.pitStartTime = Date.now();
                        state.pitTyresApplied = false;
                        state.pitRepairsApplied = false;
                        state.pitUIShown = false;
                        // Mutable, live-extendable hold duration (see togglePitRepairZone()) - starts
                        // at the base duration and grows if the player selects damage repairs during
                        // the hold. NOTE: this must stay a state field, not a local const recomputed
                        // per frame - reintroducing a local `const PIT_HOLD_T` here would silently
                        // break repair-time extension (the stop would always take the base duration
                        // regardless of what's selected, with no error).
                        state.pitHoldT = BASE_PIT_HOLD_T;
                        state.pitRepairSelection = { frontWing: false, floor: false, gearbox: false };
                        setCarGhost(state.chassisBody, state.playerGhostMats, true);
                        state.chassisBody.velocity.set(0, 0, 0);
                        state.chassisBody.angularVelocity.set(0, 0, 0);

                        // Capture where/how the car was facing right as it crossed the line - the
                        // drive-in animation starts here so there's no jump-cut at entry.
                        state.pitEntryPos = {
                            x: state.chassisBody.position.x,
                            y: state.chassisBody.position.y,
                            z: state.chassisBody.position.z,
                        };
                        const entryQ = state.chassisBody.quaternion;
                        state.pitEntryQuat = { x: entryQ.x, y: entryQ.y, z: entryQ.z, w: entryQ.w };

                        const boxDummy = new THREE.Object3D();
                        boxDummy.position.set(state.trackPoints[0].x, state.trackPoints[0].y, state.trackPoints[0].z);
                        boxDummy.lookAt(state.trackPoints[5]);
                        state.pitBoxQuat = {
                            x: boxDummy.quaternion.x,
                            y: boxDummy.quaternion.y,
                            z: boxDummy.quaternion.z,
                            w: boxDummy.quaternion.w,
                        };

                        const exitIdx = (PIT_LEN - PIT_RAMP_LEN + 10) % state.trackPoints.length;
                        const e1 = state.trackPoints[exitIdx];
                        const e2 = state.trackPoints[(exitIdx + 5) % state.trackPoints.length];
                        const exitDummy = new THREE.Object3D();
                        exitDummy.position.copy(e1);
                        exitDummy.lookAt(e2);
                        // Release the car still offset into the merge lane (same side = (tan.z, -tan.x)
                        // convention as generatePitLane()/getPitLaneOffset(), not cross(tan,up)) rather
                        // than directly on the racing line - so pit exit is a lateral merge the player
                        // drives themselves, not a teleport straight into on-track traffic.
                        const exitTanX = e2.x - e1.x,
                            exitTanZ = e2.z - e1.z;
                        const exitTanLen = Math.hypot(exitTanX, exitTanZ) || 1;
                        const exitSideX = exitTanZ / exitTanLen,
                            exitSideZ = -exitTanX / exitTanLen;
                        const exitLaneOffset = getPitLaneOffset(exitIdx);
                        state.pitExitPos = {
                            x: e1.x + exitSideX * exitLaneOffset,
                            y: e1.y,
                            z: e1.z + exitSideZ * exitLaneOffset,
                        };
                        state.pitExitQuat = {
                            x: exitDummy.quaternion.x,
                            y: exitDummy.quaternion.y,
                            z: exitDummy.quaternion.z,
                            w: exitDummy.quaternion.w,
                        };

                        // Drive-in/out duration comes from actual distance at a believable pit-lane
                        // pace, not a fixed time - so the car looks driven at a real speed over
                        // whatever the pit lane geometry actually is, instead of warping to cover
                        // however far it happens to be in a fixed window. Clamped so a freak short/
                        // long pit lane can't make it feel instant or draggy.
                        const PIT_DRIVE_SPEED = 70 / 3.6; // pit-lane-limit pace, matches the exit release speed below
                        const boxPos = state.pitBoxPosition;
                        const driveInDist = Math.hypot(boxPos.x - state.pitEntryPos.x, boxPos.z - state.pitEntryPos.z);
                        const driveOutDist = Math.hypot(state.pitExitPos.x - boxPos.x, state.pitExitPos.z - boxPos.z);
                        state.pitDriveInT = Math.max(0.8, Math.min(15.0, driveInDist / PIT_DRIVE_SPEED));
                        state.pitDriveOutT = Math.max(0.8, Math.min(15.0, driveOutDist / PIT_DRIVE_SPEED));

                        state.currentSteer = 0;
                    }
                }
            }

            if (state.pitPhase !== 'none') {
                // --- Pit stop: a scripted (non-physics) animation, not a drive-through simulation.
                // Drive-in/out each take as long as covering that distance at PIT_DRIVE_SPEED
                // actually would (computed once at entry - see state.pitDriveInT/pitDriveOutT above)
                // so the car looks driven at a real pace instead of warping to fit a fixed window.
                // The tyre change itself takes at least BASE_PIT_HOLD_T, real-pit-stop-like, longer
                // if damage repairs are selected (state.pitHoldT - see togglePitRepairZone(), which
                // extends it live while the player is stopped). Physics velocity is zeroed every
                // frame so it can't fight the animation. PIT_HOLD_T reads state.pitHoldT directly
                // (not a local snapshot) so a mid-hold selection change immediately extends the wait.
                const PIT_DRIVE_IN_T = state.pitDriveInT;
                const PIT_HOLD_T = state.pitHoldT;
                const PIT_DRIVE_OUT_T = state.pitDriveOutT;
                const PIT_EXIT_SPEED = 70 / 3.6; // pit-lane-limit pace to blend back into race speed, not a dead stop
                const msgEl = document.getElementById('pit-msg');
                msgEl.style.display = 'block';
                msgEl.style.borderColor = '#3498db';

                state.chassisBody.velocity.set(0, 0, 0);
                state.chassisBody.angularVelocity.set(0, 0, 0);
                // Wall-clock elapsed time, not frame count: a fixed per-frame increment (e.g. 1/60)
                // would make the stop's duration depend on the browser actually sustaining 60fps,
                // which it won't on a slower device or a throttled/backgrounded tab - the stop would
                // silently run in slow motion.
                const t = (Date.now() - state.pitStartTime) / 1000;
                const boxP = state.pitBoxPosition;

                if (t < PIT_DRIVE_IN_T) {
                    const f = pitEase(t / PIT_DRIVE_IN_T);
                    const a = state.pitEntryPos;
                    state.chassisBody.position.set(
                        a.x + (boxP.x - a.x) * f,
                        a.y + (boxP.y - a.y) * f + 2,
                        a.z + (boxP.z - a.z) * f
                    );
                    const qa = new THREE.Quaternion(
                        state.pitEntryQuat.x,
                        state.pitEntryQuat.y,
                        state.pitEntryQuat.z,
                        state.pitEntryQuat.w
                    );
                    const qb = new THREE.Quaternion(
                        state.pitBoxQuat.x,
                        state.pitBoxQuat.y,
                        state.pitBoxQuat.z,
                        state.pitBoxQuat.w
                    );
                    qa.slerp(qb, f);
                    state.chassisBody.quaternion.copy(qa);
                    msgEl.innerText = 'ENTERING PITS';
                    brakeVal = 150;
                    force = 0;
                    steering = 0;
                } else if (t < PIT_DRIVE_IN_T + PIT_HOLD_T) {
                    if (!state.pitUIShown) {
                        state.pitUIShown = true;
                        // Show the tyre-selection modal only once the car has glided into the box,
                        // not the instant pit entry is detected - otherwise it pops up center-screen
                        // (right where the chase camera holds the car) and hides the drive-in
                        // animation this whole rework was meant to make visible.
                        if (window.showPitSelectionUI) window.showPitSelectionUI();
                    }
                    state.chassisBody.position.set(boxP.x, boxP.y + 2, boxP.z);
                    const holdT = t - PIT_DRIVE_IN_T;
                    const pct = Math.floor((holdT / PIT_HOLD_T) * 100);
                    msgEl.innerText = `CHANGING TYRES... ${pct}%`;
                    // Low-res "tyres being changed" visual: blink the compound stripes.
                    const stripeOn = Math.floor(holdT * 4) % 2 === 0;
                    state.playerTyreStripes.forEach((s) => (s.visible = stripeOn));
                    brakeVal = 150;
                    force = 0;
                    steering = 0;
                } else if (t < PIT_DRIVE_IN_T + PIT_HOLD_T + PIT_DRIVE_OUT_T) {
                    if (!state.pitRepairsApplied) {
                        state.pitRepairsApplied = true;
                        if (cfg.damageEnabled) {
                            for (const zone of DAMAGE_ZONES) {
                                if (state.pitRepairSelection[zone.key]) state.damage[zone.key] = 100;
                            }
                        }
                    }
                    if (!state.pitTyresApplied) {
                        state.pitTyresApplied = true;
                        state.playerTyreStripes.forEach((s) => (s.visible = true));
                        state.nextTyreCompoundIdx = state.tempNextTyreCompoundIdx;
                        if (state.tyreLife < 100 || state.tyreCompoundIdx !== state.nextTyreCompoundIdx) {
                            state.tyreLife = 100;
                            state.tyreCompoundIdx = state.nextTyreCompoundIdx;
                            state.playerTyreStripes.forEach((s) =>
                                s.material.color.setHex(TYRE_COLORS[state.tyreCompoundIdx])
                            );
                            const badgeEl = document.getElementById('compound-badge');
                            if (badgeEl) {
                                const comp = TYRE_COMPOUNDS[state.tyreCompoundIdx];
                                badgeEl.innerText = comp.label;
                                if (state.tyreCompoundIdx === 0) {
                                    badgeEl.style.backgroundColor = '#eb2f06';
                                    badgeEl.style.color = '#fff';
                                } else if (state.tyreCompoundIdx === 1) {
                                    badgeEl.style.backgroundColor = '#f1c40f';
                                    badgeEl.style.color = '#000';
                                } else if (state.tyreCompoundIdx === 2) {
                                    badgeEl.style.backgroundColor = '#f5f6fa';
                                    badgeEl.style.color = '#000';
                                } else if (state.tyreCompoundIdx === 3) {
                                    badgeEl.style.backgroundColor = '#2ecc71';
                                    badgeEl.style.color = '#fff';
                                }
                            }
                        }
                        const modal = document.getElementById('pit-selection-modal');
                        if (modal) modal.style.display = 'none';
                    }
                    const f = pitEase((t - PIT_DRIVE_IN_T - PIT_HOLD_T) / PIT_DRIVE_OUT_T);
                    const c = state.pitExitPos;
                    state.chassisBody.position.set(
                        boxP.x + (c.x - boxP.x) * f,
                        boxP.y + (c.y - boxP.y) * f + 2,
                        boxP.z + (c.z - boxP.z) * f
                    );
                    const qa = new THREE.Quaternion(
                        state.pitBoxQuat.x,
                        state.pitBoxQuat.y,
                        state.pitBoxQuat.z,
                        state.pitBoxQuat.w
                    );
                    const qb = new THREE.Quaternion(
                        state.pitExitQuat.x,
                        state.pitExitQuat.y,
                        state.pitExitQuat.z,
                        state.pitExitQuat.w
                    );
                    qa.slerp(qb, f);
                    state.chassisBody.quaternion.copy(qa);
                    msgEl.innerText = 'GO! GO! GO!';
                    msgEl.style.borderColor = '#2ecc71';
                    brakeVal = 150;
                    force = 0;
                    steering = 0;
                } else {
                    const c = state.pitExitPos;
                    // Match normal ride height (spawn/reset use trackY + 1) rather than the +2 used
                    // throughout the kinematic animation, so there's no extra height for gravity to
                    // settle out the instant physics control resumes.
                    state.chassisBody.position.set(c.x, c.y + 1, c.z);
                    const qb = new THREE.Quaternion(
                        state.pitExitQuat.x,
                        state.pitExitQuat.y,
                        state.pitExitQuat.z,
                        state.pitExitQuat.w
                    );
                    state.chassisBody.quaternion.copy(qb);
                    state.currentSteer = 0;
                    setCarGhost(state.chassisBody, state.playerGhostMats, false);

                    // Leave the pit lane already rolling at pit-lane pace rather than from a dead
                    // stop, so the car blends into the race instead of getting run over from behind.
                    const exitForward = new THREE.Vector3(0, 0, 1).applyQuaternion(qb);
                    state.chassisBody.velocity.set(
                        exitForward.x * PIT_EXIT_SPEED,
                        0,
                        exitForward.z * PIT_EXIT_SPEED
                    );

                    msgEl.innerText = 'GO! GO! GO!';
                    msgEl.style.borderColor = '#2ecc71';
                    state.pitPhase = 'none';
                    state.pitStartTime = 0;
                    setTimeout(() => {
                        if (state.pitPhase === 'none') msgEl.style.display = 'none';
                    }, 1000);
                    // Don't force the max-brake/zero-engine override below on this transition frame -
                    // it would stomp the exit velocity we just set on the very next physics step.
                }

                // Pit stop owns the car: never let a stale/held brake input arm the reset-hold timer.
                state.resetTimer = 0;
                document.getElementById('reset-bar').style.display = 'none';
            } else if (cfg.controlStyle === 'auto') {
                // Auto-accelerate scheme: the car always drives forward on its own; the single
                // brake input covers both jobs a "BRAKE" pedal does intuitively - slow down while
                // still rolling forward, and once nearly stopped, keep holding it to reverse -
                // rather than requiring a separate reverse key.
                const autoActive = inputs.brake || inputs.down;
                state.chassisBody.vectorToLocalFrame(state.chassisBody.velocity, scratch.localVel);
                const movingForward = scratch.localVel.z > 0.5;
                if (autoActive && movingForward) {
                    state.autoBrakeTime += 1 / 60;
                    const durationRamp = Math.min(1.0, state.autoBrakeTime / 0.6);
                    const baseBrake = 30 + 120 * durationRamp;
                    const steerReduction = Math.max(0.4, 1.0 - Math.abs(state.currentSteer) * 0.6);
                    const speedReduction = kph < 60 ? Math.max(0.3, kph / 60) : 1.0;
                    brakeVal = baseBrake * steerReduction * speedReduction;
                    force = 0;
                } else if (autoActive) {
                    state.autoBrakeTime = 0;
                    let speedRatio = Math.min(1.0, kph / reverseTopSpeedKph);
                    let torqueMultiplier = 1.0 - Math.pow(speedRatio, 2);
                    let launchRamp = Math.min(1.0, 0.4 + kph / 20);
                    force = baseReversePower * Math.max(0.05, torqueMultiplier) * launchRamp;
                } else {
                    state.autoBrakeTime = 0;
                    let speedRatio = Math.min(1.0, kph / topSpeedKph);
                    let torqueMultiplier = 1.0 - Math.pow(speedRatio, 2);
                    let launchRamp = Math.min(1.0, 0.4 + kph / 20);
                    force = baseEnginePower * Math.max(0.05, torqueMultiplier) * launchRamp;
                }

                let maxSteer = Math.max(0.2, 0.6 - speed * 0.008);
                if (cfg.weather === 'wet') maxSteer *= 0.8;
                let inputVal = inputs.left ? 1 : inputs.right ? -1 : 0;
                if (inputVal !== 0) {
                    const steerSpeed = 0.1;
                    state.currentSteer += inputVal * steerSpeed;
                } else {
                    state.currentSteer *= 0.8;
                }
                if (state.currentSteer > 1) state.currentSteer = 1;
                if (state.currentSteer < -1) state.currentSteer = -1;
                const curve = Math.abs(state.currentSteer) ** 1.5;
                steering = Math.sign(state.currentSteer) * curve * maxSteer;
                // Stuck-reset uses a tighter near-zero threshold than manual mode: since the brake
                // button also drives a deliberate reverse maneuver here, a loose "<10kph" threshold
                // would misfire mid-reverse. Speed only lingers under ~2kph while genuinely stuck
                // (wedged against a wall, flipped, etc), not while actively backing out.
                if (kph < 2 && autoActive) {
                    state.resetTimer += 0.02;
                    if (state.resetTimer > 1.5) resetCar();
                    document.getElementById('reset-bar').style.display = 'block';
                    document.getElementById('reset-progress').style.width = (state.resetTimer / 1.5) * 100 + '%';
                } else {
                    state.resetTimer = 0;
                    document.getElementById('reset-bar').style.display = 'none';
                }
            } else {
                if (inputs.up) {
                    let speedRatio = Math.min(1.0, kph / topSpeedKph);
                    let torqueMultiplier = 1.0 - Math.pow(speedRatio, 2);
                    // Anti-wheelie launch ramp: applying full torque the instant the car is
                    // stationary was pitching the nose up hard (all thrust reacts at the
                    // ground-level contact patch, well below the raised chassis CoM, with zero
                    // aero downforce to resist it at v=0). Ramp available torque in over the
                    // first ~20 kph instead of slamming 100% down from a standstill.
                    let launchRamp = Math.min(1.0, 0.4 + kph / 20);
                    force = baseEnginePower * Math.max(0.05, torqueMultiplier) * launchRamp;
                } else if (inputs.down) {
                    // Reverse gear: same shape as the forward curve (ramped launch, tapering
                    // as it approaches its own top speed) but scaled to a lower, distinct
                    // reverse top speed. Works whether the car is still rolling forward
                    // (opposing force decelerates it first, same as engine braking) or already
                    // stopped/reversing - no extra branching needed.
                    let speedRatio = Math.min(1.0, kph / reverseTopSpeedKph);
                    let torqueMultiplier = 1.0 - Math.pow(speedRatio, 2);
                    let launchRamp = Math.min(1.0, 0.4 + kph / 20);
                    force = baseReversePower * Math.max(0.05, torqueMultiplier) * launchRamp;
                }
                if (inputs.brake) {
                    brakeVal = 150;
                    force = 0;
                }

                let maxSteer = Math.max(0.3, 0.65 - speed * 0.006);
                if (cfg.weather === 'wet') maxSteer *= 0.8;
                let inputVal = inputs.left ? 1 : inputs.right ? -1 : 0;
                if (inputVal !== 0) {
                    const steerSpeed = 0.1;
                    state.currentSteer += inputVal * steerSpeed;
                } else {
                    state.currentSteer *= 0.8;
                }
                if (state.currentSteer > 1) state.currentSteer = 1;
                if (state.currentSteer < -1) state.currentSteer = -1;
                const curve = Math.abs(state.currentSteer) ** 1.5;
                steering = Math.sign(state.currentSteer) * curve * maxSteer;
                if (kph < 10 && inputs.brake) {
                    state.resetTimer += 0.02;
                    if (state.resetTimer > 1.5) resetCar();
                    document.getElementById('reset-bar').style.display = 'block';
                    document.getElementById('reset-progress').style.width = (state.resetTimer / 1.5) * 100 + '%';
                } else {
                    state.resetTimer = 0;
                    document.getElementById('reset-bar').style.display = 'none';
                }
            }
        }

        state.vehicle.setSteeringValue(steering, 0);
        state.vehicle.setSteeringValue(steering, 1);

        let onSurface = 'tarmac';
        const wasInSand = state.inSand;
        state.inSand = false;
        if (minDSq > 81) {
            for (let trap of state.sandTraps) {
                const distSq = (pos.x - trap.pos.x) ** 2 + (pos.z - trap.pos.z) ** 2;
                if (distSq < trap.r * trap.r && Math.abs(pos.y - trap.pos.y) < 3.0) {
                    state.inSand = true;
                    break;
                }
            }
            if (state.inSand) onSurface = 'sand';
            else if (minDSq > 400) onSurface = 'grass';
        }
        // Edge-triggered (entry only, not continuous) so a car stuck in the trap
        // doesn't take repeated damage every frame it stays there.
        if (cfg.damageEnabled && state.inSand && !wasInSand && speed * 3.6 > 150) {
            applyOffTrackDamage(0);
        }

        if (onSurface === 'sand') {
            force *= 0.7;
            state.chassisBody.velocity.scale(0.98, state.chassisBody.velocity);
            spawnDust(pos, 0xd2b48c);
        } else if (onSurface === 'grass') {
            force *= 0.7;
            state.chassisBody.velocity.scale(0.98, state.chassisBody.velocity);
            if (speed > 5) spawnDust(pos, 0x2e8b57);
        }

        let surfaceMultiplier = 1.0;
        if (onSurface === 'sand') surfaceMultiplier = 2.5;
        else if (onSurface === 'grass') surfaceMultiplier = 1.8;

        if (state.raceState === 'racing' && speed > 5) {
            const compound = TYRE_COMPOUNDS[state.tyreCompoundIdx];
            const baseWear = speed * 0.00015 + Math.abs(state.currentSteer) * speed * 0.0006;
            const brakingWear = inputs.brake && speed > 10 ? speed * 0.0004 : 0;
            // compound.wear ratios (1.5/1.0/0.6) already encode the 2/3/5-lap target; this
            // coefficient sets the absolute pace so Medium depletes over ~3 laps at race speed.
            const wearRate = (baseWear + brakingWear) * compound.wear * surfaceMultiplier * 0.72;
            if (!cfg.noTyreWear) state.tyreLife -= wearRate;
            if (state.tyreLife < 0) state.tyreLife = 0;

            const tyreEl = document.getElementById('tyre-val');
            tyreEl.innerText = Math.ceil(state.tyreLife) + '%';
            if (state.tyreLife > 70) tyreEl.style.color = '#2ecc71';
            else if (state.tyreLife > 40) tyreEl.style.color = '#f1c40f';
            else tyreEl.style.color = '#e74c3c';

            if (cfg.damageEnabled) {
                const worstHealth = Math.min(state.damage.frontWing, state.damage.floor, state.damage.gearbox);
                const damageEl = document.getElementById('damage-val');
                if (damageEl) {
                    damageEl.innerText = Math.ceil(worstHealth) + '%';
                    damageEl.style.color = worstHealth > 70 ? '#2ecc71' : worstHealth > 40 ? '#f1c40f' : '#e74c3c';
                }
            }

            const badgeEl = document.getElementById('compound-badge');
            if (badgeEl) {
                badgeEl.innerText = compound.label;
                if (state.tyreCompoundIdx === 0) {
                    badgeEl.style.backgroundColor = '#eb2f06';
                    badgeEl.style.color = '#fff';
                } else if (state.tyreCompoundIdx === 1) {
                    badgeEl.style.backgroundColor = '#f1c40f';
                    badgeEl.style.color = '#000';
                } else if (state.tyreCompoundIdx === 2) {
                    badgeEl.style.backgroundColor = '#f5f6fa';
                    badgeEl.style.color = '#000';
                } else if (state.tyreCompoundIdx === 3) {
                    badgeEl.style.backgroundColor = '#2ecc71';
                    badgeEl.style.color = '#fff';
                }
            }
        }
        const compound = TYRE_COMPOUNDS[state.tyreCompoundIdx];
        const baseGrip = cfg.weather === 'wet' ? 2.0 : 4.8;
        const wearFactor = 0.4 + 0.6 * Math.pow(state.tyreLife / 100, 1.5);
        let surfaceGripMod = state.surfaceGrip;
        if ((cfg.surface === 'snow' || cfg.surface === 'mud') && state.tyreCompoundIdx !== 3) {
            surfaceGripMod *= 0.35; // F1 slicks spin heavily on soft surfaces
        }
        const frontWingFactor = cfg.damageEnabled ? 0.5 + 0.5 * (state.damage.frontWing / 100) : 1;
        const currentGrip = baseGrip * compound.grip * wearFactor * surfaceGripMod * frontWingFactor;
        state.vehicle.wheelInfos.forEach((w) => (w.frictionSlip = currentGrip));

        // Pit lane messaging/tyre-change/state transitions are now handled entirely by the pit
        // autopilot block above (state.pitPhase); there is no more separate "did the player stop
        // correctly in the box" check here.

        if (cfg.raceStyle === 'rally') {
            const f = force * state.surfaceForce * 0.5;
            state.vehicle.applyEngineForce(f, 0);
            state.vehicle.applyEngineForce(f, 1);
            state.vehicle.applyEngineForce(f, 2);
            state.vehicle.applyEngineForce(f, 3);
        } else {
            state.vehicle.applyEngineForce(force * state.surfaceForce, 2);
            state.vehicle.applyEngineForce(force * state.surfaceForce, 3);
        }
        let absBrakeVal = brakeVal;
        if (Math.abs(steering) > 0.1) {
            absBrakeVal *= Math.max(0.4, 1.0 - Math.abs(steering) * 0.8);
        }
        state.vehicle.setBrake(absBrakeVal, 0);
        state.vehicle.setBrake(absBrakeVal, 1);
        state.vehicle.setBrake(absBrakeVal * 0.5, 2);
        state.vehicle.setBrake(absBrakeVal * 0.5, 3);
        if ((inputs.brake && speed > 5) || (Math.abs(state.currentSteer) > 0.4 && speed > 15)) {
            spawnDust(state.visualWheels[2].position, 0xaaaaaa);
            spawnDust(state.visualWheels[3].position, 0xaaaaaa);
        }
        if (cfg.weather === 'wet' && onSurface === 'tarmac' && speed > 20) {
            if (Math.random() > 0.5) {
                spawnDust(state.visualWheels[2].position, 0xffffff);
                spawnDust(state.visualWheels[3].position, 0xffffff);
            }
        }
        if (state.surfaceDust !== null && onSurface === 'tarmac' && speed > 15) {
            if (Math.random() > 0.5) {
                spawnDust(state.visualWheels[2].position, state.surfaceDust);
                spawnDust(state.visualWheels[3].position, state.surfaceDust);
            }
        }

        // Flat baseline term keeps some downward pressure/grip at launch, where aero
        // downforce (speed^2 term) would otherwise be zero right when full torque hits.
        let downforce = speed * speed * 3.0 + 2000;
        if (downforce > 20000) downforce = 20000;
        if (cfg.damageEnabled) downforce *= 0.5 + 0.5 * (state.damage.floor / 100);
        scratch.downforceVec.set(0, -downforce, 0);
        state.chassisBody.applyLocalForce(scratch.downforceVec, scratch.zeroVec);

        const up = scratch.cScratch3;
        up.set(0, 1, 0);
        state.chassisBody.quaternion.vmult(up, up);

        // Flip/crash recovery: up.y is the world-space Y of the car's local up vector - 1 means
        // upright, <=0.2 means rolled onto its side or roof. Manual hold-brake reset still exists
        // as a backup, but a flipped car can't easily brake its way to a stop to trigger that, so
        // auto-recover it the same way AI cars recover from going off-track.
        if (up.y < 0.2 && state.pitPhase === 'none') {
            state.playerFlipTimer += 1 / 60;
            if (state.playerFlipTimer > 2.0) {
                resetCar();
                state.playerFlipTimer = 0;
                const flash = document.getElementById('lap-flash');
                flash.innerText = 'CAR RECOVERED';
                flash.style.display = 'block';
                setTimeout(() => (flash.style.display = 'none'), 1500);
            }
        } else {
            state.playerFlipTimer = 0;
        }

        document.getElementById('speed-val').innerText = Math.round(kph);
        updateAudio(speed);
        let gear = 1;
        if (cfg.carClass === 'mini') {
            gear = Math.min(6, Math.max(1, Math.ceil(kph / 30)));
        } else if (cfg.carClass === 'rally') {
            gear = Math.min(7, Math.max(1, Math.ceil(kph / 35)));
        } else {
            gear = Math.min(9, Math.max(1, Math.ceil(kph / 38)));
        }
        // Local-frame velocity: front wheels sit at positive local z (see cars.js), so a
        // negative local z component means the car is actually moving backward, not just
        // that the reverse key is held (e.g. holding it while still rolling forward first
        // decelerates the car, and should still read as a forward gear until it flips).
        state.chassisBody.vectorToLocalFrame(state.chassisBody.velocity, scratch.cScratch3);
        const isReversing = scratch.cScratch3.z < -0.5;
        let gearText = isReversing ? 'R' : gear;
        if (state.raceState === 'countdown') gearText = 'N';
        document.getElementById('gear-val').innerText = gearText;
        document.getElementById('time-val').innerText = formatTime(Date.now() - state.startTime);
        document.getElementById('total-time-val').innerText = formatTime(
            state.playerFinishTime > 0 ? state.playerFinishTime : Date.now() - state.raceStartTime
        );
        if (state.sun) {
            state.sun.position.set(
                state.chassisBody.position.x + 100,
                state.chassisBody.position.y + 200,
                state.chassisBody.position.z + 50
            );
            state.sun.target.position.copy(state.chassisBody.position);
            state.sun.target.updateMatrixWorld();
        }
        updateLogic();
        updateSkidmarks();
        updateParticles();
        updateMinimap();
    }

    if (state.chassisBody.userData.mesh) {
        state.chassisBody.userData.mesh.position.copy(state.chassisBody.position);
        state.chassisBody.userData.mesh.quaternion.copy(state.chassisBody.quaternion);
    }
    for (let i = 0; i < state.vehicle.wheelInfos.length; i++) {
        state.vehicle.updateWheelTransform(i);
        const t = state.vehicle.wheelInfos[i].worldTransform;
        if (state.visualWheels[i]) {
            state.visualWheels[i].position.copy(t.position);
            state.visualWheels[i].quaternion.copy(t.quaternion);
        }
    }

    if (state.chassisBody) {
        const carPos = state.chassisBody.position;
        const offset = ZOOM_LEVELS[state.zoomLevel];
        scratch.cameraTargetPos.set(carPos.x + offset.dist, carPos.y + offset.y, carPos.z + offset.dist);
        if (state.raceState === 'racing') {
            const speed = state.chassisBody.velocity.length();
            const kph = speed * 3.6;
            let shakeAmt = 0;
            if (state.inSand) shakeAmt = 0.5;
            else if (kph > 250) shakeAmt = (kph - 250) * 0.005;
            if (shakeAmt > 0) {
                scratch.cameraTargetPos.x += (Math.random() - 0.5) * shakeAmt;
                scratch.cameraTargetPos.y += (Math.random() - 0.5) * shakeAmt;
                scratch.cameraTargetPos.z += (Math.random() - 0.5) * shakeAmt;
            }
        }
        state.camera.position.lerp(scratch.cameraTargetPos, 0.1);
        scratch.cameraLookAtTarget.set(carPos.x, carPos.y, carPos.z);
        state.camera.lookAt(scratch.cameraLookAtTarget);
        const roll = state.vehicle.wheelInfos[0].steering * -0.05;
        state.camera.rotation.z = roll;
        if (state.rainSystem) {
            state.rainSystem.position.set(carPos.x, carPos.y, carPos.z);
            const positions = state.rainSystem.geometry.attributes.position.array;
            for (let i = 1; i < positions.length; i += 3) {
                positions[i] -= 2;
                if (positions[i] < -100) positions[i] = 100;
            }
            state.rainSystem.geometry.attributes.position.needsUpdate = true;
        }
    }
    state.renderer.render(state.scene, state.camera);
}

// Global functions for interactive pit stop selection
window.showPitSelectionUI = function () {
    state.tempNextTyreCompoundIdx = state.nextTyreCompoundIdx;
    const modal = document.getElementById('pit-selection-modal');
    if (modal) modal.style.display = 'block';
    window.selectPitCompound(state.nextTyreCompoundIdx);
    const repairSection = document.getElementById('pit-repair-section');
    if (repairSection) repairSection.style.display = cfg.damageEnabled ? 'block' : 'none';
    if (cfg.damageEnabled) {
        for (const zone of DAMAGE_ZONES) window.updatePitRepairRow(zone.key);
    }
};

window.updatePitRepairRow = function (zoneKey) {
    const zone = DAMAGE_ZONES.find((z) => z.key === zoneKey);
    const row = document.getElementById(`pit-repair-${zoneKey}`);
    const healthEl = document.getElementById(`pit-repair-${zoneKey}-health`);
    if (!row || !healthEl) return;
    const health = Math.ceil(state.damage[zoneKey]);
    const selected = state.pitRepairSelection[zoneKey];
    healthEl.innerText = selected ? `REPAIRING (+${zone.repairSeconds}s)` : `${health}%`;
    row.style.borderColor = selected ? '#2ecc71' : '#444';
    row.style.background = selected ? 'rgba(46, 204, 113, 0.15)' : 'transparent';
};

// Live-recomputes state.pitHoldT from BASE_PIT_HOLD_T plus the repair time of every
// currently-selected zone, so a mid-hold selection change immediately extends the
// remaining wait (the per-frame branch condition in animate() reads state.pitHoldT
// directly, not a snapshot, so this takes effect on the very next frame).
window.togglePitRepairZone = function (zoneKey) {
    state.pitRepairSelection[zoneKey] = !state.pitRepairSelection[zoneKey];
    state.pitHoldT = BASE_PIT_HOLD_T + DAMAGE_ZONES.filter((z) => state.pitRepairSelection[z.key]).reduce((sum, z) => sum + z.repairSeconds, 0);
    window.updatePitRepairRow(zoneKey);
};

window.selectPitCompound = function (idx) {
    state.tempNextTyreCompoundIdx = idx;
    const colors = ['#eb2f06', '#f1c40f', '#f5f6fa', '#2ecc71'];
    const textColors = ['#fff', '#000', '#000', '#fff'];
    const ids = ['s', 'm', 'h', 'r'];
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`pit-opt-${ids[i]}`);
        if (btn) {
            if (i === idx) {
                btn.style.background = colors[i];
                btn.style.color = textColors[i];
                btn.style.boxShadow = `0 0 10px ${colors[i]}`;
            } else {
                btn.style.background = '#222';
                btn.style.color = colors[i];
                btn.style.boxShadow = 'none';
            }
        }
    }
};

window.confirmPitStop = function () {
    state.nextTyreCompoundIdx = state.tempNextTyreCompoundIdx;
    const modal = document.getElementById('pit-selection-modal');
    if (modal) modal.style.display = 'none';
};

window.triggerReset = function () {
    resetCar();
};

// Keyboard listener for pit lane tyre selection
window.addEventListener('keydown', (e) => {
    if (state.pitPhase !== 'pitting') return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        const idx = (state.tempNextTyreCompoundIdx - 1 + 4) % 4;
        window.selectPitCompound(idx);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        const idx = (state.tempNextTyreCompoundIdx + 1) % 4;
        window.selectPitCompound(idx);
    } else if (e.key === 'Enter' || e.key === ' ') {
        window.confirmPitStop();
    }
});


