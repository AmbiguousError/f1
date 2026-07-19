import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { state, cfg, season } from './state.js';
import {
    buildCarMesh,
    buildMiniMesh,
    buildRallyMesh,
    buildTyreStripe,
    wGeoFront,
    wGeoRear,
    wGeoMini,
    wMat,
    rimMat,
} from './car-models.js';
import { GROUP_WORLD, GROUP_CAR } from './constants.js';

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
    const p1 = state.trackPoints[startIdx];
    const nextIdx = (startIdx + 5) % state.trackPoints.length;
    const p2 = state.trackPoints[nextIdx];
    const tangent = new THREE.Vector3().subVectors(p2, p1).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const startPos = p1.clone().add(side.multiplyScalar(offset));
    const body = new CANNON.Body({ mass: isRally ? 1100 : 800 });
    body.linearDamping = 0.05;
    body.angularDamping = 0.5;
    const colSize = isMini
        ? new CANNON.Vec3(0.7, 0.4, 1.2)
        : isRally
          ? new CANNON.Vec3(0.8, 0.45, 1.4)
          : new CANNON.Vec3(0.8, 0.3, 2.2);
    const shape = new CANNON.Box(colSize);
    body.addShape(shape, new CANNON.Vec3(0, isMini ? 0.2 : isRally ? 0.2 : 0.4, 0));
    body.collisionFilterGroup = GROUP_CAR;
    body.collisionFilterMask = GROUP_WORLD | GROUP_CAR;
    body.position.copy(startPos);
    body.position.y += 1;
    const angle = Math.atan2(p2.x - p1.x, p2.z - p1.z);
    body.quaternion.setFromEuler(0, angle, 0);

    const mesh = isMini ? buildMiniMesh(color) : isRally ? buildRallyMesh(color) : buildCarMesh(color);
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
    const wRadiusR = isMini ? 0.3 : isRally ? 0.45 : 0.6;
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
    const fZ = isMini ? 0.9 : isRally ? 1.05 : 1.85;
    const rZ = isMini ? -0.9 : isRally ? -1.15 : -2.1;
    const width = isMini ? 0.7 : isRally ? 0.85 : 1.1;
    const h = isMini ? 0.2 : isRally ? 0.35 : 0.4;
    vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(width, h, fZ) });
    vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(-width, h, fZ) });
    vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(width, h, rZ), radius: wRadiusR });
    vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(-width, h, rZ), radius: wRadiusR });
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
        } else {
            tire = new THREE.Mesh(isRear ? wGeoRear : wGeoFront, wMatCar);
            rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, isRear ? 0.7 : 0.4, 16), rimMatCar);
        }
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        rim.rotation.z = Math.PI / 2;
        grp.add(tire);
        grp.add(rim);
        const stripe = buildTyreStripe(isMini, isRally ? false : isRear, startingCompound);
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
        cornVar = 0.4;
    if (cfg.difficulty === 'easy') {
        speedBase = 230;
        speedVar = 30;
        cornBase = 0.6;
        cornVar = 0.3;
    } else if (cfg.difficulty === 'hard') {
        speedBase = 290;
        speedVar = 30;
        cornBase = 1.0;
        cornVar = 0.4;
    }

    // Scale by driver specific performance factors
    const driverInfo = season.drivers[id + 1];
    const perf = driverInfo && driverInfo.performance ? driverInfo.performance : 1.0;
    speedBase *= perf;
    cornBase *= perf;

    if (isMini) {
        speedBase = Math.floor(speedBase * 0.55);
        speedVar = 20;
    }
    const skill = {
        topSpeed: speedBase + Math.random() * speedVar,
        cornering: cornBase + Math.random() * cornVar,
        lookAhead: 20 + Math.floor(Math.random() * 10),
    };
    const pitThreshold = 30.0 + Math.random() * 10.0;
    state.aiCars.push({
        vehicle,
        body,
        wheels,
        skill,
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
        pitStopTimer: 0,
        lastClosestIdx: startIdx,
        isPitting: false,
        ghostMats: collectCarMaterials(mesh, wheels),
    });
}

export function createF1Car(startIdx, flyingStart, offset = 0) {
    const isMini = cfg.carClass === 'mini';
    const isRally = cfg.carClass === 'rally';
    const p1 = state.trackPoints[startIdx];
    const nextIdx = (startIdx + 5) % state.trackPoints.length;
    const p2 = state.trackPoints[nextIdx];
    const tangent = new THREE.Vector3().subVectors(p2, p1).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();

    const startPos = p1.clone().add(side.multiplyScalar(offset));
    state.chassisBody = new CANNON.Body({ mass: isRally ? 1100 : 800 });
    state.chassisBody.linearDamping = 0.05;
    state.chassisBody.angularDamping = 0.5;
    const colSize = isMini
        ? new CANNON.Vec3(0.7, 0.4, 1.2)
        : isRally
          ? new CANNON.Vec3(0.8, 0.45, 1.4)
          : new CANNON.Vec3(0.8, 0.3, 2.2);
    const chassisShape = new CANNON.Box(colSize);
    state.chassisBody.addShape(chassisShape, new CANNON.Vec3(0, isMini ? 0.2 : isRally ? 0.2 : 0.4, 0));
    state.chassisBody.collisionFilterGroup = GROUP_CAR;
    state.chassisBody.collisionFilterMask = GROUP_WORLD | GROUP_CAR;
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
    const wRadiusR = isMini ? 0.3 : isRally ? 0.45 : 0.6;
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
    const fZ = isMini ? 0.9 : isRally ? 1.05 : 1.85;
    const rZ = isMini ? -0.9 : isRally ? -1.15 : -2.1;
    const width = isMini ? 0.7 : isRally ? 0.85 : 1.1;
    const h = isMini ? 0.2 : isRally ? 0.35 : 0.4;
    state.vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(width, h, fZ) });
    state.vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(-width, h, fZ) });
    state.vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(width, h, rZ), radius: wRadiusR });
    state.vehicle.addWheel({ ...wOpts, chassisConnectionPointLocal: new CANNON.Vec3(-width, h, rZ), radius: wRadiusR });
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
        } else {
            tire = new THREE.Mesh(isRear ? wGeoRear : wGeoFront, wMatCar);
            rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, isRear ? 0.7 : 0.4, 16), rimMatCar);
        }
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        rim.rotation.z = Math.PI / 2;
        grp.add(tire);
        grp.add(rim);
        const stripe = buildTyreStripe(isMini, isRally ? false : isRear, state.tyreCompoundIdx);
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
