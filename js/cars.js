import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { state, cfg, season } from './state.js';
import {
    buildCarMesh,
    buildMiniMesh,
    buildRallyMesh,
    buildDriftMesh,
    buildTyreStripe,
    wGeoFront,
    wGeoRear,
    wGeoMini,
    wMat,
    rimMat,
} from './car-models.js';
import { GROUP_WORLD, GROUP_CAR, AI_DRIVING_STYLES } from './constants.js';
import { attachCollisionHandler } from './incidents.js';

// Ghost a car while it's in the pit lane: it keeps driving on the world (track, pit
// floor) but passes through other cars, and its meshes go semi-transparent. `mats`
// must be the car's own per-car materials — shared materials would fade every car.
export function setCarGhost(body, mats, ghosted) {
    body.collisionFilterMask = ghosted ? GROUP_WORLD : GROUP_WORLD | GROUP_CAR;
    mats.forEach((m) => {
        m.transparent = ghosted;
        m.opacity = ghosted ? 0.35 : 1.0;
    });
}

function collectCarMaterials(mesh, wheels) {
    const mats = new Set();
    mesh.traverse((c) => {
        if (c.material) mats.add(c.material);
    });
    wheels.forEach((g) =>
        g.traverse((c) => {
            if (c.material) mats.add(c.material);
        })
    );
    return [...mats];
}

export function createAICar(startIdx, offset, color, id, name) {
    const isMini = cfg.carClass === 'mini';
    const isRally = cfg.carClass === 'rally';
    const isDrift = cfg.carClass === 'drift';
    const p1 = state.trackPoints[startIdx];
    const nextIdx = (startIdx + 5) % state.trackPoints.length;
    const p2 = state.trackPoints[nextIdx];
    const tangent = new THREE.Vector3().subVectors(p2, p1).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const startPos = p1.clone().add(side.multiplyScalar(offset));
    const body = new CANNON.Body({ mass: isRally ? 1100 : isDrift ? 900 : 800 });
    body.linearDamping = 0.05;
    body.angularDamping = 0.5;
    const colSize = isMini
        ? new CANNON.Vec3(0.7, 0.4, 1.2)
        : isRally
          ? new CANNON.Vec3(0.8, 0.45, 1.4)
          : isDrift
            ? new CANNON.Vec3(0.75, 0.35, 1.5)
            : new CANNON.Vec3(0.8, 0.3, 2.2);
    const shape = new CANNON.Box(colSize);
    body.addShape(shape, new CANNON.Vec3(0, isMini ? 0.2 : isRally ? 0.2 : isDrift ? 0.25 : 0.4, 0));
    body.collisionFilterGroup = GROUP_CAR;
    body.collisionFilterMask = GROUP_WORLD | GROUP_CAR;
    if (cfg.stewardPenalties || cfg.damageEnabled) attachCollisionHandler(body, id + 1);
    body.position.copy(startPos);
    body.position.y += 1;
    const angle = Math.atan2(p2.x - p1.x, p2.z - p1.z);
    body.quaternion.setFromEuler(0, angle, 0);

    const mesh = isMini
        ? buildMiniMesh(color)
        : isRally
          ? buildRallyMesh(color)
          : isDrift
            ? buildDriftMesh(color)
            : buildCarMesh(color);
    state.scene.add(mesh);
    body.userData = { mesh: mesh };
    const vehicle = new CANNON.RaycastVehicle({
        chassisBody: body,
        indexRightAxis: 0,
        indexUpAxis: 1,
        indexForwardAxis: 2,
    });
    const currentGrip = cfg.weather === 'wet' ? 2.0 : 5.0;
    const wRadiusF = isMini ? 0.3 : 0.45;
    const wRadiusR = isMini ? 0.3 : isRally || isDrift ? 0.45 : 0.6;
    const wOpts = {
        radius: wRadiusF,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: 50,
        suspensionRestLength: 0.5,
        frictionSlip: currentGrip,
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,
        maxSuspensionForce: 100000,
        rollInfluence: 0.01,
        axleLocal: new CANNON.Vec3(1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(1, 1, 0),
        maxSuspensionTravel: 0.25,
        useCustomSlidingRotationalSpeed: true,
        customSlidingRotationalSpeed: -30,
    };
    const fZ = isMini ? 0.9 : isRally ? 1.05 : isDrift ? 1.6 : 1.85;
    const rZ = isMini ? -0.9 : isRally ? -1.15 : isDrift ? -1.8 : -2.1;
    const width = isMini ? 0.7 : isRally ? 0.85 : isDrift ? 0.8 : 1.1;
    const h = isMini ? 0.2 : isRally ? 0.35 : isDrift ? 0.3 : 0.4;
    // Drift class: rear wheels get noticeably less grip than the front (classic oversteer
    // setup) so the back end steps out under power/steering instead of gripping through the
    // corner like every other class - this, not a steering-angle change, is what makes it slide.
    // Tuned empirically (headless playtest, sustained full-lock steering at speed): a short
    // wheelbase (fZ/rZ close together) made it spin out almost instantly regardless of grip, so
    // fZ/rZ stay closer to the stable F1 values - the reduced rear grip alone is what produces a
    // progressive, catchable slide instead of an immediate uncontrollable spin.
    const rearGripMultiplier = isDrift ? 0.70 : 1.0;
    vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(width, h, fZ) });
    vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(-width, h, fZ) });
    vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(width, h, rZ), radius: wRadiusR, frictionSlip: currentGrip * rearGripMultiplier });
    vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(-width, h, rZ), radius: wRadiusR, frictionSlip: currentGrip * rearGripMultiplier });
    vehicle.addToWorld(state.world);
    const wheels = [];
    let aiStripes = [];

    let startingCompound = Math.floor(Math.random() * 3); // 0=Soft, 1=Medium, 2=Hard
    if (cfg.raceStyle === 'rally' && (cfg.surface === 'snow' || cfg.surface === 'mud')) {
        startingCompound = 3; // Rally tyres
    }

    // Per-car clones so pit-lane ghosting can fade this car's wheels without fading every car's.
    const wMatCar = wMat.clone();
    const rimMatCar = rimMat.clone();
    vehicle.wheelInfos.forEach((w, i) => {
        const isRear = i > 1;
        const grp = new THREE.Group();
        let tire, rim;
        if (isMini) {
            tire = new THREE.Mesh(wGeoMini, wMatCar);
            rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.15, 16), rimMatCar);
        } else if (isRally) {
            tire = new THREE.Mesh(wGeoFront, wMatCar);
            rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.4, 16), rimMatCar);
        } else if (isDrift) {
            tire = new THREE.Mesh(wGeoFront, wMatCar);
            rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 16), rimMatCar);
        } else {
            tire = new THREE.Mesh(isRear ? wGeoRear : wGeoFront, wMatCar);
            rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, isRear ? 0.7 : 0.4, 16), rimMatCar);
        }
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        rim.rotation.z = Math.PI / 2;
        grp.add(tire);
        grp.add(rim);
        const stripe = buildTyreStripe(isMini, isRally || isDrift ? false : isRear, startingCompound);
        if (i % 2 !== 0) stripe.position.x *= -1;
        grp.add(stripe);
        aiStripes.push(stripe);
        state.scene.add(grp);
        wheels.push(grp);
    });

    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    for (let i = 0; i < 4; i++) {
        vehicle.updateWheelTransform(i);
        const t = vehicle.wheelInfos[i].worldTransform;
        wheels[i].position.copy(t.position);
        wheels[i].quaternion.copy(t.quaternion);
    }

    let speedBase = 260,
        speedVar = 30,
        cornBase = 0.8,
        cornVar = 0.4,
        // Fraction of the player's engine force (baseEnginePower in main.js / baseAccelForce in
        // race.js) this difficulty tier's AI gets. This was previously left flat regardless of
        // difficulty, so even on hard/rival - where topSpeed/cornering above are already tuned to
        // match or beat the player - the AI accelerated far more sluggishly out of every corner
        // and off every start, making the player look artificially quick even at max difficulty.
        accelBase = 0.75;
    if (cfg.difficulty === 'easy') {
        speedBase = 230;
        speedVar = 30;
        cornBase = 0.6;
        cornVar = 0.3;
        accelBase = 0.55;
    } else if (cfg.difficulty === 'hard' || cfg.difficulty === 'rival') {
        // Whole field (perf ~0.96-1.04) now clears the player's 340kph F1 cap on
        // straights and out-corners a clean lap, forcing real overtakes/slipstream
        // battles and defensive driving instead of a guaranteed runaway. Variance is
        // tightened further than the straight-line speed spread so even the back of the
        // grid corners like a front-runner - carving from last to first should mean
        // fighting the whole field, not just the top two.
        speedBase = 320;
        speedVar = 25;
        cornBase = 1.45;
        cornVar = 0.2;
        accelBase = 1.0;
    }

    // Scale by driver specific performance factors
    const driverInfo = season.drivers[id + 1];
    const perf = driverInfo && driverInfo.performance ? driverInfo.performance : 1.0;
    speedBase *= perf;
    cornBase *= perf;
    accelBase *= perf;

    if (isMini) {
        speedBase = Math.floor(speedBase * 0.55);
        speedVar = 20;
    } else if (isRally) {
        // Match the player's F1-to-rally top-speed ratio (main.js) so difficulty tiers
        // produce a real target instead of AI chasing an unreachable circuit-class number.
        speedBase = Math.floor(speedBase * 0.75);
        speedVar = 25;
    } else if (isDrift) {
        // Match the player's F1-to-drift top-speed ratio (main.js) - see comment above.
        speedBase = Math.floor(speedBase * 0.76);
        speedVar = 25;
    }
    const skill = {
        topSpeed: speedBase + Math.random() * speedVar,
        cornering: cornBase + Math.random() * cornVar,
        accel: accelBase,
        lookAhead: 20 + Math.floor(Math.random() * 10),
    };
    const pitThreshold = 30.0 + Math.random() * 10.0;
    // RIVAL difficulty picks one AI driver (id 0, so it's deterministic per seed) to dynamically
    // pace against the player all race instead of just driving at a fixed skill level - see the
    // rival pacing block in race.js's updateLogic().
    const isRival = cfg.difficulty === 'rival' && id === 0;
    // Deterministic by roster id (not random) so a given driver races with the same
    // personality every time - see AI_DRIVING_STYLES in constants.js for what each trait does.
    const style = AI_DRIVING_STYLES[id % AI_DRIVING_STYLES.length];
    state.aiCars.push({
        vehicle,
        body,
        wheels,
        skill,
        style,
        id,
        name,
        lap: 1,
        nextCp: 1,
        finished: false,
        finishTime: 0,
        offTrackTimer: 0,
        flipTimer: 0,
        tailMat: mesh.userData.tailMat,
        tyreStripes: aiStripes,
        compoundIdx: startingCompound,
        tyreLife: 100.0,
        pitThreshold,
        wantsToPit: false,
        inPitLane: false,
        pitStartTime: 0,
        lastClosestIdx: startIdx,
        ghostMats: collectCarMaterials(mesh, wheels),
        isRival,
        trackLimits: { offTimer: 0, counted: false },
        damage: { frontWing: 100, floor: 100, gearbox: 100 },
        pitRepairsApplied: false,
        pitHoldT: 2.0,
        pitRepairPlan: {},
        wasInSand: false,
    });
}

export function createF1Car(startIdx, flyingStart, offset = 0) {
    const isMini = cfg.carClass === 'mini';
    const isRally = cfg.carClass === 'rally';
    const isDrift = cfg.carClass === 'drift';
    const p1 = state.trackPoints[startIdx];
    const nextIdx = (startIdx + 5) % state.trackPoints.length;
    const p2 = state.trackPoints[nextIdx];
    const tangent = new THREE.Vector3().subVectors(p2, p1).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();

    const startPos = p1.clone().add(side.multiplyScalar(offset));
    state.chassisBody = new CANNON.Body({ mass: isRally ? 1100 : isDrift ? 900 : 800 });
    state.chassisBody.linearDamping = 0.05;
    state.chassisBody.angularDamping = 0.5;
    const colSize = isMini
        ? new CANNON.Vec3(0.7, 0.4, 1.2)
        : isRally
          ? new CANNON.Vec3(0.8, 0.45, 1.4)
          : isDrift
            ? new CANNON.Vec3(0.75, 0.35, 1.5)
            : new CANNON.Vec3(0.8, 0.3, 2.2);
    const chassisShape = new CANNON.Box(colSize);
    state.chassisBody.addShape(chassisShape, new CANNON.Vec3(0, isMini ? 0.2 : isRally ? 0.2 : isDrift ? 0.25 : 0.4, 0));
    state.chassisBody.collisionFilterGroup = GROUP_CAR;
    state.chassisBody.collisionFilterMask = GROUP_WORLD | GROUP_CAR;
    if (cfg.stewardPenalties || cfg.damageEnabled) attachCollisionHandler(state.chassisBody, 0);
    state.chassisBody.position.copy(startPos);
    state.chassisBody.position.y += 1;
    const angle = Math.atan2(p2.x - p1.x, p2.z - p1.z);
    state.chassisBody.quaternion.setFromEuler(0, angle, 0);

    if (flyingStart) {
        let speed = 250 / 3.6;
        if (isMini) speed = 140 / 3.6;
        const vx = Math.sin(angle) * speed;
        const vz = Math.cos(angle) * speed;
        state.chassisBody.velocity.set(vx, 0, vz);
    }

    const mesh = isMini
        ? buildMiniMesh(cfg.teamColor)
        : isRally
          ? buildRallyMesh(cfg.teamColor)
          : isDrift
            ? buildDriftMesh(cfg.teamColor)
            : buildCarMesh(cfg.teamColor);
    if (cfg.time === 'sunset') {
        const hLight = new THREE.SpotLight(0xffffff, 5, 300, Math.PI / 5, 0.5, 1);
        hLight.position.set(0, 1, 1);
        hLight.target.position.set(0, 0, 20);
        mesh.add(hLight);
        mesh.add(hLight.target);
    }

    state.scene.add(mesh);
    state.chassisBody.userData = { mesh: mesh };
    state.playerTailMat = mesh.userData.tailMat;
    state.vehicle = new CANNON.RaycastVehicle({
        chassisBody: state.chassisBody,
        indexRightAxis: 0,
        indexUpAxis: 1,
        indexForwardAxis: 2,
    });
    const currentGrip = cfg.weather === 'wet' ? 2.0 : 5.0;
    const wRadiusF = isMini ? 0.3 : 0.45;
    const wRadiusR = isMini ? 0.3 : isRally || isDrift ? 0.45 : 0.6;
    const wOpts = {
        radius: wRadiusF,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: 50,
        suspensionRestLength: 0.5,
        frictionSlip: currentGrip,
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,
        maxSuspensionForce: 100000,
        rollInfluence: 0.01,
        axleLocal: new CANNON.Vec3(1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(1, 1, 0),
        maxSuspensionTravel: 0.25,
        useCustomSlidingRotationalSpeed: true,
        customSlidingRotationalSpeed: -30,
    };
    const fZ = isMini ? 0.9 : isRally ? 1.05 : isDrift ? 1.6 : 1.85;
    const rZ = isMini ? -0.9 : isRally ? -1.15 : isDrift ? -1.8 : -2.1;
    const width = isMini ? 0.7 : isRally ? 0.85 : isDrift ? 0.8 : 1.1;
    const h = isMini ? 0.2 : isRally ? 0.35 : isDrift ? 0.3 : 0.4;
    // Drift class: rear wheels get noticeably less grip than the front (classic oversteer
    // setup) so the back end steps out under power/steering instead of gripping through the
    // corner like every other class - this, not a steering-angle change, is what makes it slide.
    // Tuned empirically (headless playtest, sustained full-lock steering at speed): a short
    // wheelbase (fZ/rZ close together) made it spin out almost instantly regardless of grip, so
    // fZ/rZ stay closer to the stable F1 values - the reduced rear grip alone is what produces a
    // progressive, catchable slide instead of an immediate uncontrollable spin.
    const rearGripMultiplier = isDrift ? 0.70 : 1.0;
    state.vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(width, h, fZ) });
    state.vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(-width, h, fZ) });
    state.vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(width, h, rZ), radius: wRadiusR, frictionSlip: currentGrip * rearGripMultiplier });
    state.vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(-width, h, rZ), radius: wRadiusR, frictionSlip: currentGrip * rearGripMultiplier });
    state.vehicle.addToWorld(state.world);

    const wMatCar = wMat.clone();
    const rimMatCar = rimMat.clone();
    state.vehicle.wheelInfos.forEach((w, i) => {
        const isRear = i > 1;
        const grp = new THREE.Group();
        let tire, rim;
        if (isMini) {
            tire = new THREE.Mesh(wGeoMini, wMatCar);
            rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.15, 16), rimMatCar);
        } else if (isRally) {
            tire = new THREE.Mesh(wGeoFront, wMatCar);
            rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.4, 16), rimMatCar);
        } else if (isDrift) {
            tire = new THREE.Mesh(wGeoFront, wMatCar);
            rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 16), rimMatCar);
        } else {
            tire = new THREE.Mesh(isRear ? wGeoRear : wGeoFront, wMatCar);
            rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, isRear ? 0.7 : 0.4, 16), rimMatCar);
        }
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        rim.rotation.z = Math.PI / 2;
        grp.add(tire);
        grp.add(rim);
        const stripe = buildTyreStripe(isMini, isRally || isDrift ? false : isRear, state.tyreCompoundIdx);
        if (i % 2 !== 0) stripe.position.x *= -1;
        grp.add(stripe);
        state.playerTyreStripes.push(stripe);
        state.scene.add(grp);
        state.visualWheels.push(grp);
    });

    mesh.position.copy(state.chassisBody.position);
    mesh.quaternion.copy(state.chassisBody.quaternion);
    for (let i = 0; i < 4; i++) {
        state.vehicle.updateWheelTransform(i);
        const t = state.vehicle.wheelInfos[i].worldTransform;
        state.visualWheels[i].position.copy(t.position);
        state.visualWheels[i].quaternion.copy(t.quaternion);
    }

    state.playerLastClosestIdx = startIdx;
    state.playerGhostMats = collectCarMaterials(mesh, state.visualWheels);
}
