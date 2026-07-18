import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { state, cfg } from './state.js';
import { REAL_TRACKS } from './tracks.js';

export function generateCircuit() {
    const realTrackKey = (cfg.seed || '').trim().toUpperCase();
    const realTrack = REAL_TRACKS[realTrackKey];

    let points;
    if (realTrack) {
        // Recognized real-world circuit seed: use its hand-authored layout verbatim.
        points = realTrack.map(p => new THREE.Vector3(p.x, 0, p.z));
    } else {
        // Unknown seed: fall back to the original deterministic procedural generator
        // so arbitrary seed strings keep producing a unique, repeatable track.
        points = []; const segments = 30; const noiseZ = state.rng() * 100;
        for (let i = 0; i < segments; i++) {
            const t = (i / segments) * Math.PI * 2; const r = 220 + Math.sin(t * 3) * 50 + Math.cos(t * 2 + noiseZ) * 50 + (state.rng() * 30);
            const x = Math.cos(t) * r; const z = Math.sin(t) * r; points.push(new THREE.Vector3(x, 0, z));
        }
    }
    state.trackCurve = new THREE.CatmullRomCurve3(points, true); state.trackCurve.tension = 0.5; state.trackPoints = state.trackCurve.getSpacedPoints(cfg.trackRes);
    const distFirstLast = state.trackPoints[0].distanceTo(state.trackPoints[state.trackPoints.length - 1]); if (distFirstLast < 1.0) state.trackPoints.pop();
    state.checkpoints = [state.trackPoints[0], state.trackPoints[Math.floor(state.trackPoints.length / 3)], state.trackPoints[Math.floor(state.trackPoints.length * 2 / 3)]];

    const grassGeo = new THREE.PlaneGeometry(1200, 1200); grassGeo.rotateX(-Math.PI / 2);
    const grassCol = cfg.time === 'sunset' ? 0x2e3b28 : 0x2e8b57; const grassMat = new THREE.MeshStandardMaterial({ color: grassCol, roughness: 1.0, side: THREE.DoubleSide });
    const grass = new THREE.Mesh(grassGeo, grassMat); grass.position.y = -0.1; grass.receiveShadow = true; state.scene.add(grass);

    const roadWidth = cfg.roadWidth; const trackGeo = new THREE.BufferGeometry();
    const vertices = []; const colors = []; const indices = []; const cAsphalt = new THREE.Color(0x555555); const cKerbRed = new THREE.Color(0xcc0000); const cKerbWhite = new THREE.Color(0xffffff); const cLine = new THREE.Color(0xffffff);
    const len = state.trackPoints.length; const sandMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 1.0 }); const sandTrapsMesh = new THREE.Group();

    for (let i = 0; i < len; i++) {
        const p1 = state.trackPoints[i]; const p2 = state.trackPoints[(i + 1) % len]; const p3 = state.trackPoints[(i + 2) % len];
        const tangent = new THREE.Vector3().subVectors(p2, p1).normalize(); const up = new THREE.Vector3(0, 1, 0); const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
        const v1 = new THREE.Vector3().subVectors(p2, p1).normalize(); const v2 = new THREE.Vector3().subVectors(p3, p2).normalize(); const crossY = v1.x * v2.z - v1.z * v2.x;
        if (Math.abs(crossY) > 0.04 && state.rng() > 0.5) {
            const isLeftTurn = crossY > 0; const dir = isLeftTurn ? -1 : 1; const trapRadius = 10 + state.rng() * 5; const offset = (roadWidth / 2) + trapRadius + 1.0;
            const trapPos = p2.clone().add(side.clone().multiplyScalar(dir * offset)); const sandGeo = new THREE.CircleGeometry(trapRadius, 8); sandGeo.rotateX(-Math.PI / 2);
            const sm = new THREE.Mesh(sandGeo, sandMat); sm.position.copy(trapPos); sm.position.y = trapPos.y + 0.02; sandTrapsMesh.add(sm); state.sandTraps.push({ pos: trapPos, r: trapRadius });
        }
        const w = roadWidth / 2; const kw = 2.0; const offsets = [-w - kw, -w, -w + 0.5, w - 0.5, w, w + kw];
        for (let j = 0; j < offsets.length; j++) {
            const os = offsets[j]; const v = new THREE.Vector3().copy(p1).add(side.clone().multiplyScalar(os)); vertices.push(v.x, v.y + 0.05, v.z);
            let col = cAsphalt; if (j === 0 || j === 5) { const seg = Math.floor(i / 5); col = (seg % 2 === 0) ? cKerbRed : cKerbWhite; } else if (j === 1 || j === 4) { col = cLine; } colors.push(col.r, col.g, col.b);
        }
        const row = 6; const base = i * row; const nextBase = ((i + 1) % len) * row;
        for (let k = 0; k < 5; k++) { indices.push(base + k, base + k + 1, nextBase + k); indices.push(base + k + 1, nextBase + k + 1, nextBase + k); }
    }
    state.scene.add(sandTrapsMesh); trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); trackGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    trackGeo.setIndex(indices); trackGeo.computeVertexNormals();
    const trackRough = cfg.weather === 'wet' ? 0.2 : 0.8; const trackMetal = cfg.weather === 'wet' ? 0.4 : 0.0;
    const trackMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: trackRough, metalness: trackMetal, flatShading: false, side: THREE.DoubleSide });
    const trackMesh = new THREE.Mesh(trackGeo, trackMat); trackMesh.receiveShadow = true; state.scene.add(trackMesh);

    const trimeshVerts = vertices; const trimeshIndices = indices; const trackShape = new CANNON.Trimesh(trimeshVerts, trimeshIndices);
    const trackBody = new CANNON.Body({ mass: 0, material: state.world.defaultMaterial }); trackBody.addShape(trackShape); state.world.addBody(trackBody);
    const groundBody = new CANNON.Body({ mass: 0, material: state.world.defaultMaterial }); const groundShape = new CANNON.Plane(); groundBody.addShape(groundShape); groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); groundBody.position.y = -0.1; state.world.addBody(groundBody);

    // Start Line Marking
    const startPos = state.trackCurve.getPoint(0); const nextPos = state.trackCurve.getPoint(0.01); const lineGeo = new THREE.BoxGeometry(cfg.roadWidth, 0.02, 1.5);
    const lineMesh = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({ color: 0xffffff })); lineMesh.position.copy(startPos); lineMesh.position.y = startPos.y + 0.06; lineMesh.lookAt(nextPos); state.scene.add(lineMesh);

    // Start Line Gantry
    const tan = new THREE.Vector3().subVectors(nextPos, startPos).normalize(); const side = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
    const gantryGroup = new THREE.Group(); const pillarGeo = new THREE.BoxGeometry(1.5, 12, 1.5); const pillarMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5 });
    const pLeft = new THREE.Mesh(pillarGeo, pillarMat); pLeft.position.copy(startPos.clone().add(side.clone().multiplyScalar(-cfg.roadWidth / 2 - 2.5))); pLeft.position.y += 6;
    const pRight = new THREE.Mesh(pillarGeo, pillarMat); pRight.position.copy(startPos.clone().add(side.clone().multiplyScalar(cfg.roadWidth / 2 + 2.5))); pRight.position.y += 6;
    const bridgeGeo = new THREE.BoxGeometry(cfg.roadWidth + 6, 2.5, 2); const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.3 });
    const bridge = new THREE.Mesh(bridgeGeo, bridgeMat); bridge.position.copy(startPos); bridge.position.y += 12;
    gantryGroup.add(pLeft); gantryGroup.add(pRight); gantryGroup.add(bridge); gantryGroup.rotation.y = Math.atan2(nextPos.x - startPos.x, nextPos.z - startPos.z); state.scene.add(gantryGroup);

    // Starting Grid Paint
    const gridSlotGroup = new THREE.Group(); const gridGeo = new THREE.BoxGeometry(2.5, 0.02, 5.0);
    const gridMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    // Must match the spawn formula in main.js init() or painted slots drift from the cars.
    const slotSpacing = Math.max(0.5, state.trackPoints[0].distanceTo(state.trackPoints[1]));
    for (let i = 0; i < 12; i++) {
        const distBack = Math.max(2, Math.round((8 + i * 7) / slotSpacing)); let idx = (cfg.trackRes + 0 - distBack) % cfg.trackRes; if (idx < 0) idx += cfg.trackRes;
        const pSlot = state.trackPoints[idx]; const pNext = state.trackPoints[(idx + 1) % cfg.trackRes];

        const tanSlot = new THREE.Vector3().subVectors(pNext, pSlot).normalize();
        const upSlot = new THREE.Vector3(0, 1, 0);
        const sideSlot = new THREE.Vector3().crossVectors(tanSlot, upSlot).normalize();

        const offset = (i % 2 === 0) ? -3 : 3; const sCenter = pSlot.clone().add(sideSlot.clone().multiplyScalar(offset));

        const leftLine = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 5.0), gridMat); leftLine.position.set(-1.25, 0, 0);
        const topLine = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.02, 0.2), gridMat); topLine.position.set(0, 0, 2.5);
        const rightLine = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 5.0), gridMat); rightLine.position.set(1.25, 0, 0);

        const sGroup = new THREE.Group(); sGroup.add(leftLine); sGroup.add(topLine); sGroup.add(rightLine);
        sGroup.position.copy(sCenter); sGroup.position.y += 0.055; sGroup.rotation.y = Math.atan2(tanSlot.x, tanSlot.z);
        gridSlotGroup.add(sGroup);
    }
    state.scene.add(gridSlotGroup);

    generatePitLane();
}

export function generatePitLane() {
    const pitLen = 60; const pitVertices = []; const pitIndices = []; const pitUvs = [];
    const pitWidth = 8; const trackEdge = cfg.roadWidth / 2; const wallWidth = 2.0;

    const garageGroup = new THREE.Group(); const linesGroup = new THREE.Group(); const grandstandGroup = new THREE.Group();
    const garageMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 }); const doorMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const bollardMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.6 }); const bollardGeo = new THREE.ConeGeometry(0.3, 0.8, 8); bollardGeo.translate(0, 0.4, 0);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x3498db, roughness: 0.9 }); const structureMat = new THREE.MeshStandardMaterial({ color: 0x555555 });

    for (let i = -pitLen; i <= pitLen; i++) {
        let idx = ((cfg.trackRes + i) % cfg.trackRes + cfg.trackRes) % cfg.trackRes; let nextIdx = ((cfg.trackRes + i + 1) % cfg.trackRes + cfg.trackRes) % cfg.trackRes;
        const p1 = state.trackPoints[idx]; const p2 = state.trackPoints[nextIdx]; const dist = p1.distanceTo(p2);
        const tan = new THREE.Vector3().subVectors(p2, p1).normalize(); const side = new THREE.Vector3(tan.z, 0, -tan.x).normalize();

        const rampLen = 25; let t = 0;
        if (i < -pitLen + rampLen) { t = (i - (-pitLen)) / rampLen; t = t * t * (3 - 2 * t); } else if (i > pitLen - rampLen) { t = (pitLen - i) / rampLen; t = t * t * (3 - 2 * t); } else { t = 1; }
        const currentIn = trackEdge; const currentOut = trackEdge + Math.max(0.1, t * (wallWidth + pitWidth));
        const vIn = p1.clone().add(side.clone().multiplyScalar(currentIn)); const vOut = p1.clone().add(side.clone().multiplyScalar(currentOut));
        pitVertices.push(vIn.x, vIn.y + 0.05, vIn.z); pitVertices.push(vOut.x, vOut.y + 0.05, vOut.z);
        const uvY = (i + pitLen) / (pitLen * 2); pitUvs.push(0, uvY * 10); pitUvs.push(1, uvY * 10);

        if (i < pitLen) {
            const base = (i + pitLen) * 2; pitIndices.push(base, base + 1, base + 2); pitIndices.push(base + 1, base + 3, base + 2);
            const segmentWidth = currentOut - currentIn;
            if (segmentWidth > 0.5) {
                const floorCenter = p1.clone().add(side.clone().multiplyScalar((currentIn + currentOut) / 2));
                const floorShape = new CANNON.Box(new CANNON.Vec3(segmentWidth / 2, 0.1, dist / 2 + 0.1));
                const floorBody = new CANNON.Body({ mass: 0, material: state.world.defaultMaterial }); floorBody.addShape(floorShape); floorBody.position.copy(floorCenter); floorBody.position.y += 0.04; floorBody.quaternion.setFromEuler(0, Math.atan2(tan.x, tan.z), 0); state.world.addBody(floorBody);
            }
        }

        if (t > 0 && t < 1 && i % 3 === 0) { const bPos = p1.clone().add(side.clone().multiplyScalar(trackEdge + (currentOut - trackEdge) * 0.2)); const bollard = new THREE.Mesh(bollardGeo, bollardMat); bollard.position.copy(bPos); bollard.position.y += 0.05; linesGroup.add(bollard); }
        if (t === 1) {
            // No physical pit wall anymore: cars in the pit lane are ghosted (no car-car
            // collisions), so the wall's protective role is gone. wallWidth is still part of
            // the lane's lateral layout (pit box / getPitLaneOffset), so it stays.
            if (i % 5 === 0 && i < pitLen - rampLen - 5) {
                const garageDepth = 8; const garageWidth = dist * 5; const garageCenter = p1.clone().add(side.clone().multiplyScalar(currentOut + garageDepth / 2 + 0.5));
                if (isSpaceClear(garageCenter, trackEdge + 3.0)) {
                    const gGroup = new THREE.Group(); gGroup.position.copy(garageCenter); gGroup.rotation.y = Math.atan2(tan.x, tan.z);
                    const gMesh = new THREE.Mesh(new THREE.BoxGeometry(garageDepth, 5, garageWidth - 0.2), garageMat); gMesh.position.y = 2.5; gGroup.add(gMesh);
                    const roof = new THREE.Mesh(new THREE.BoxGeometry(garageDepth + 1, 0.5, garageWidth + 0.5), roofMat); roof.position.y = 5.25; gGroup.add(roof);
                    const door = new THREE.Mesh(new THREE.PlaneGeometry(garageWidth - 1.5, 3.5), doorMat); door.position.set(-garageDepth / 2 - 0.01, 1.75, 0); door.rotation.y = -Math.PI / 2; gGroup.add(door); garageGroup.add(gGroup);
                }
            }
        }
        if (i === -pitLen + rampLen || i === pitLen - rampLen) { const lineCenter = p1.clone().add(side.clone().multiplyScalar((currentIn + currentOut) / 2)); const lineGeo = new THREE.PlaneGeometry(currentOut - currentIn, 0.6); lineGeo.rotateX(-Math.PI / 2); const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); const lineMesh = new THREE.Mesh(lineGeo, lineMat); lineMesh.position.copy(lineCenter); lineMesh.position.y += 0.055; lineMesh.rotation.y = Math.atan2(tan.x, tan.z); linesGroup.add(lineMesh); }
        if (i === 0) {
            // Pit box target used by AI pit stops and the player pit autopilot. No visual marker
            // is drawn here anymore: the player is auto-driven to this point rather than having to
            // manually stop inside a marked box.
            const boxCenter = p1.clone().add(side.clone().multiplyScalar(trackEdge + wallWidth + pitWidth / 2)); state.pitBoxPosition = { x: boxCenter.x, y: boxCenter.y, z: boxCenter.z, radius: 15 };
        }

        // STADIUM GRANDSTANDS
        if (i % 8 === 0 && i > -pitLen + 5 && i < pitLen - 5) {
            const standWidth = dist * 8; const standDepth = 15; const standCenter = p1.clone().add(side.clone().multiplyScalar(-trackEdge - standDepth / 2 - 5));
            if (isSpaceClear(standCenter, trackEdge + 5.0)) {
                const gsGroup = new THREE.Group(); gsGroup.position.copy(standCenter); gsGroup.rotation.y = Math.atan2(tan.x, tan.z);
                for (let s = 0; s < 4; s++) { const tier = new THREE.Mesh(new THREE.BoxGeometry(standDepth - (s * 3), 1, standWidth - 0.5), seatMat); tier.position.set((s * 1.5), s * 1 + 0.5, 0); gsGroup.add(tier); }
                const roofGeo = new THREE.BoxGeometry(standDepth + 2, 0.5, standWidth); const roof = new THREE.Mesh(roofGeo, structureMat); roof.position.set(0, 8, 0); roof.rotation.z = -0.1; gsGroup.add(roof);
                const pillarGeo = new THREE.CylinderGeometry(0.2, 0.2, 8); const p1Mesh = new THREE.Mesh(pillarGeo, structureMat); p1Mesh.position.set(-6, 4, standWidth / 3); const p2Mesh = new THREE.Mesh(pillarGeo, structureMat); p2Mesh.position.set(-6, 4, -standWidth / 3); gsGroup.add(p1Mesh); gsGroup.add(p2Mesh);
                grandstandGroup.add(gsGroup);
            }
        }
    }

    state.scene.add(garageGroup); state.scene.add(linesGroup); state.scene.add(grandstandGroup);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pitVertices, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(pitUvs, 2)); geo.setIndex(pitIndices); geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.95, side: THREE.DoubleSide }); const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; state.scene.add(mesh);
}

export function generateScenery() {
    const treeCount = 800; const trunkGeo = new THREE.CylinderGeometry(0.6, 0.8, 3, 7); const leavesGeo = new THREE.ConeGeometry(3.5, 9, 7);
    trunkGeo.translate(0, 1.5, 0); leavesGeo.translate(0, 7.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 1.0 });
    const leavesMat = new THREE.MeshStandardMaterial({ color: cfg.time === 'sunset' ? 0x2d4c1e : 0x184a22, roughness: 0.8 });
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount); const leavesMesh = new THREE.InstancedMesh(leavesGeo, leavesMat, treeCount);
    trunkMesh.castShadow = true; leavesMesh.castShadow = true; trunkMesh.receiveShadow = true; leavesMesh.receiveShadow = true;
    const dummy = new THREE.Object3D(); let placed = 0; let attempts = 0;
    while (placed < treeCount && attempts < 5000) {
        attempts++; const x = (state.rng() - 0.5) * 900; const z = (state.rng() - 0.5) * 900; let tooClose = false;
        for (let i = 0; i < state.trackPoints.length; i += 4) { const dx = x - state.trackPoints[i].x; const dz = z - state.trackPoints[i].z; if (dx * dx + dz * dz < 1800) { tooClose = true; break; } }
        if (!tooClose) {
            const scale = 0.7 + state.rng() * 0.6; dummy.position.set(x, 0, z); dummy.scale.set(scale, scale, scale); dummy.rotation.y = state.rng() * Math.PI * 2;
            dummy.updateMatrix(); trunkMesh.setMatrixAt(placed, dummy.matrix); leavesMesh.setMatrixAt(placed, dummy.matrix); placed++;
        }
    }
    state.scene.add(trunkMesh); state.scene.add(leavesMesh); state.sceneryMeshes.push(trunkMesh, leavesMesh);
}

// Helper to check if a 2D layout space is clear of other track points (to prevent scenery/building clipping)
export function isSpaceClear(pos, radius) {
    const radSq = radius * radius;
    const buffer = 75; // Exclude the start/finish straight and pit lane itself
    for (let j = 0; j < state.trackPoints.length; j++) {
        if (j <= buffer || j >= state.trackPoints.length - buffer) continue;
        const tp = state.trackPoints[j];
        const dx = pos.x - tp.x;
        const dz = pos.z - tp.z;
        if (dx * dx + dz * dz < radSq) {
            return false;
        }
    }
    return true;
}

// Incremental/temporal local track point search (using 3D distance to handle crossovers)
export function findClosestTrackPoint(pos, lastIdx = -1) {
    if (lastIdx === -1 || state.trackPoints.length === 0) {
        let minD = Infinity, closestIdx = 0;
        for (let i = 0; i < state.trackPoints.length; i++) {
            const tp = state.trackPoints[i];
            const d = (pos.x - tp.x) ** 2 + (pos.y - tp.y) ** 2 + (pos.z - tp.z) ** 2;
            if (d < minD) { minD = d; closestIdx = i; }
        }
        return closestIdx;
    } else {
        let minD = Infinity, closestIdx = lastIdx;
        const range = 40;
        for (let i = -range; i <= range; i++) {
            const idx = (lastIdx + i + state.trackPoints.length) % state.trackPoints.length;
            const tp = state.trackPoints[idx];
            const d = (pos.x - tp.x) ** 2 + (pos.y - tp.y) ** 2 + (pos.z - tp.z) ** 2;
            if (d < minD) { minD = d; closestIdx = idx; }
        }
        if (minD > 900) {
            return findClosestTrackPoint(pos, -1);
        }
        return closestIdx;
    }
}

export function getPitLaneOffset(idx) {
    const pitLen = 60;
    const rampLen = 25;
    let i = idx;
    if (i > cfg.trackRes / 2) i -= cfg.trackRes;
    if (i < -pitLen || i > pitLen) return 0;
    let t = 0;
    if (i < -pitLen + rampLen) { t = (i - (-pitLen)) / rampLen; t = t * t * (3 - 2 * t); }
    else if (i > pitLen - rampLen) { t = (pitLen - i) / rampLen; t = t * t * (3 - 2 * t); }
    else { t = 1; }
    const trackEdge = cfg.roadWidth / 2;
    const wallWidth = 2.0;
    const pitWidth = 8;
    return trackEdge + (t * (wallWidth + pitWidth)) / 2;
}

let mapScale = 1; let mapOffsetX = 0; let mapOffsetY = 0; let minimapBgCanvas = null;
export function setupMinimap() {
    const canvas = document.getElementById('minimap'); if (state.trackPoints.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    state.trackPoints.forEach(p => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z; });
    const trackW = maxX - minX; const trackH = maxZ - minZ; const pad = 10;
    const scaleX = (canvas.width - pad * 2) / trackW; const scaleZ = (canvas.height - pad * 2) / trackH;
    mapScale = Math.min(scaleX, scaleZ); mapOffsetX = canvas.width / 2 - ((minX + trackW / 2) * mapScale); mapOffsetY = canvas.height / 2 - ((minZ + trackH / 2) * mapScale);

    // Pre-render the static track path to offscreen canvas
    minimapBgCanvas = document.createElement('canvas');
    minimapBgCanvas.width = canvas.width;
    minimapBgCanvas.height = canvas.height;
    const bgCtx = minimapBgCanvas.getContext('2d');
    const toMap = (p) => ({ x: p.x * mapScale + mapOffsetX, y: p.z * mapScale + mapOffsetY });
    bgCtx.beginPath(); bgCtx.strokeStyle = 'rgba(255,255,255,0.5)'; bgCtx.lineWidth = 2; bgCtx.lineJoin = 'round';
    if (state.trackPoints.length > 0) {
        const p0 = toMap(state.trackPoints[0]); bgCtx.moveTo(p0.x, p0.y);
        for (let i = 1; i < state.trackPoints.length; i++) { const p = toMap(state.trackPoints[i]); bgCtx.lineTo(p.x, p.y); }
        bgCtx.closePath(); bgCtx.stroke();
    }
}

export function updateMinimap() {
    const canvas = document.getElementById('minimap'); const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (minimapBgCanvas) ctx.drawImage(minimapBgCanvas, 0, 0);
    const toMap = (p) => ({ x: p.x * mapScale + mapOffsetX, y: p.z * mapScale + mapOffsetY });
    ctx.fillStyle = '#3498db'; for (let ai of state.aiCars) { const c = toMap(ai.vehicle.chassisBody.position); ctx.beginPath(); ctx.arc(c.x, c.y, 2, 0, Math.PI * 2); ctx.fill(); }
    if (state.chassisBody) { const c = toMap(state.chassisBody.position); ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(c.x, c.y, 3, 0, Math.PI * 2); ctx.fill(); }
}

// Finds a track point near startIdx that isn't already occupied by another car, so a
// respawning/recovering car doesn't get dropped on top of (or inside) one still racing.
// Tries the exact spot first, then walks outward along the track in both directions.
function findClearRespawnIdx(startIdx, excludeBody) {
    const clearRadiusSq = 8 * 8;
    const others = [];
    if (state.chassisBody && state.chassisBody !== excludeBody) others.push(state.chassisBody);
    state.aiCars.forEach(ai => { if (ai.body !== excludeBody) others.push(ai.body); });
    const isClear = (idx) => {
        const tp = state.trackPoints[idx];
        return others.every(b => { const dx = b.position.x - tp.x, dz = b.position.z - tp.z; return dx * dx + dz * dz > clearRadiusSq; });
    };
    if (isClear(startIdx)) return startIdx;
    for (let step = 5; step <= 60; step += 5) {
        const fwd = (startIdx + step) % state.trackPoints.length; if (isClear(fwd)) return fwd;
        const back = (startIdx - step + state.trackPoints.length) % state.trackPoints.length; if (isClear(back)) return back;
    }
    return startIdx; // no clear gap found nearby; drop at the original spot anyway
}

export function teleportToTrack(body) {
    let minD = Infinity, closest = state.trackPoints[0], closestIdx = 0; const p = body.position;
    for (let i = 0; i < state.trackPoints.length; i += 10) { const tp = state.trackPoints[i]; const dx = p.x - tp.x; const dy = p.y - tp.y; const dz = p.z - tp.z; const d = dx * dx + dy * dy + dz * dz; if (d < minD) { minD = d; closest = state.trackPoints[i]; closestIdx = i; } }
    closestIdx = findClearRespawnIdx(closestIdx, body); closest = state.trackPoints[closestIdx];
    const nextP = state.trackPoints[(closestIdx + 20) % state.trackPoints.length]; body.position.set(closest.x, closest.y + 2, closest.z); body.velocity.set(0, 0, 0); body.angularVelocity.set(0, 0, 0); const dummy = new THREE.Object3D(); dummy.position.copy(closest); dummy.lookAt(nextP); body.quaternion.copy(dummy.quaternion);

    if (body === state.chassisBody) {
        state.playerLastClosestIdx = closestIdx;
    } else {
        const ai = state.aiCars.find(car => car.body === body);
        if (ai) ai.lastClosestIdx = closestIdx;
    }
}
