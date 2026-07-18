import * as CANNON from 'cannon-es';
import * as THREE from 'three';

// Central mutable game state, shared across modules. Grouping everything that
// used to be one big closure's module-scope variables into a single object
// keeps every module's imports explicit instead of relying on hidden globals.
export const state = {
    scene: null, camera: null, renderer: null, world: null,

    vehicle: null, chassisBody: null, playerTailMat: null, playerTyreStripes: [],

    visualWheels: [], isRunning: false, isPaused: false, raceState: 'ready', rng: null, animId: null,

    trackCurve: null, trackPoints: [], checkpoints: [], sandTraps: [],

    currentLap: 1, totalLaps: 5, startTime: 0, raceStartTime: 0,
    bestTime: Infinity, nextCheckpoint: 1, sessionType: 'race',

    tyreLife: 100.0, tyreCompoundIdx: 1, nextTyreCompoundIdx: 1,
    // Player pit-lane autopilot state machine: 'none' -> 'entering' -> 'stopped' -> 'exiting' -> 'none'.
    // While not 'none', animate() bypasses inputs.up/left/right/brake and drives the car itself.
    pitBoxPosition: null, pitPhase: 'none', pitTimer: 0,

    aiCars: [],

    currentSteer: 0, resetTimer: 0, inSand: false, playerFlipTimer: 0,

    audioCtx: null, engineOsc: null, turboOsc: null, skidOsc: null,
    engineGain: null, turboGain: null, skidGain: null, audioMuted: false,

    skidmarks: [], skidGeo: null, skidMat: null, particles: [], rainSystem: null, sceneryMeshes: [],

    zoomLevel: 2,

    playerLastClosestIdx: 0, playerGhostMats: [],
    // Rally surface modifiers, set in init() from RALLY_SURFACES (1/1/null in F1 style).
    surfaceGrip: 1.0, surfaceForce: 1.0, surfaceDust: null,
    inputsInitialized: false,
};

export const cfg = {
    seed: "MONZA", laps: 5, time: "day", roadWidth: 18, trackRes: 800,
    difficulty: 'medium', opponents: 6, weather: 'dry', qualifying: false, carClass: 'f1',
    controlStyle: 'manual', startCompound: 1, noTyreWear: false, driverName: 'Player', teamColor: 0xdc0000,
    raceStyle: 'f1', surface: 'tarmac'
};

export const season = { active: false, currentRaceIdx: 0, totalRaces: 3, seeds: [], drivers: [], currentGrid: [] };

export const inputs = { up: false, brake: false, left: false, right: false, down: false };

// Geometries/materials registered here are shared across race sessions and must
// survive cleanup() between races instead of being disposed with the scene.
export const globalGeometries = new Set();
export const globalMaterials = new Set();

// Pre-allocated scratch objects reused every frame to avoid GC churn in the animate loop.
export const scratch = {
    cameraTargetPos: new THREE.Vector3(),
    cameraLookAtTarget: new THREE.Vector3(),
    aiTargetVec: new CANNON.Vec3(),
    aiLocalPoint: new CANNON.Vec3(),
    downforceVec: new CANNON.Vec3(),
    zeroVec: new CANNON.Vec3(0, 0, 0),
    cScratch3: new CANNON.Vec3(),
    localVel: new CANNON.Vec3(),
    flipUpVec: new CANNON.Vec3(),
};
