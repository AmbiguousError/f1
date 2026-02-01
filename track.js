import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export function generateCircuit(scene, world, cfg, rng) {
    let trackCurve;
    let trackPoints = [];
    let checkpoints = [];
    let sandTraps = [];
    let pitBoxPosition = null;

    const points = []; const segments = 30; const noiseZ = rng() * 100;
    for (let i = 0; i < segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        const r = 220 + Math.sin(t * 3) * 50 + Math.cos(t * 2 + noiseZ) * 50 + (rng() * 30);
        const x = Math.cos(t) * r; const z = Math.sin(t) * r;
        points.push(new THREE.Vector3(x, 0, z));
    }
    trackCurve = new THREE.CatmullRomCurve3(points, true);
    trackCurve.tension = 0.5;
    trackPoints = trackCurve.getSpacedPoints(cfg.trackRes);
    const distFirstLast = trackPoints[0].distanceTo(trackPoints[trackPoints.length-1]);
    if(distFirstLast < 1.0) trackPoints.pop();
    checkpoints = [ trackPoints[0], trackPoints[Math.floor(trackPoints.length/3)], trackPoints[Math.floor(trackPoints.length*2/3)] ];

    const grassGeo = new THREE.PlaneGeometry(1200, 1200); grassGeo.rotateX(-Math.PI/2);
    const grassCol = cfg.time === 'sunset' ? 0x2e3b28 : 0x2e8b57;
    const grassMat = new THREE.MeshStandardMaterial({ color: grassCol, roughness: 1.0, side: THREE.DoubleSide });
    const grass = new THREE.Mesh(grassGeo, grassMat); grass.position.y = -0.1; grass.receiveShadow = true; scene.add(grass);

    const roadWidth = cfg.roadWidth;
    const trackGeo = new THREE.BufferGeometry();
    const vertices = []; const colors = []; const indices = [];
    const cAsphalt = new THREE.Color(0x555555); const cKerbRed = new THREE.Color(0xcc0000);
    const cKerbWhite = new THREE.Color(0xffffff); const cLine = new THREE.Color(0xffffff);
    const len = trackPoints.length;
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 1.0 });
    const sandTrapsMesh = new THREE.Group();

    for(let i=0; i<len; i++) {
        const p1 = trackPoints[i]; const p2 = trackPoints[(i+1)%len]; const p3 = trackPoints[(i+2)%len];
        const tangent = new THREE.Vector3().subVectors(p2, p1).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
        const v1 = new THREE.Vector3().subVectors(p2, p1).normalize();
        const v2 = new THREE.Vector3().subVectors(p3, p2).normalize();
        const crossY = v1.x * v2.z - v1.z * v2.x;
        if (Math.abs(crossY) > 0.04 && rng() > 0.5) {
            const isLeftTurn = crossY > 0; const dir = isLeftTurn ? -1 : 1;
            const trapRadius = 10 + rng() * 5;
            const offset = (roadWidth/2) + trapRadius + 1.0;
            const trapPos = p2.clone().add(side.clone().multiplyScalar(dir * offset));
            const sandGeo = new THREE.CircleGeometry(trapRadius, 8); sandGeo.rotateX(-Math.PI/2);
            const sm = new THREE.Mesh(sandGeo, sandMat); sm.position.copy(trapPos); sm.position.y = 0.02;
            sandTrapsMesh.add(sm); sandTraps.push({ pos: trapPos, r: trapRadius });
        }
        const w = roadWidth / 2; const kw = 2.0;
        const offsets = [-w - kw, -w, -w + 0.5, w - 0.5, w, w + kw];
        for(let j=0; j<offsets.length; j++) {
            const os = offsets[j];
            const v = new THREE.Vector3().copy(p1).add(side.clone().multiplyScalar(os));
            vertices.push(v.x, v.y + 0.05, v.z);
            let col = cAsphalt;
            if (j === 0 || j === 5) { const seg = Math.floor(i / 5); col = (seg % 2 === 0) ? cKerbRed : cKerbWhite; }
            else if (j === 1 || j === 4) { col = cLine; }
            colors.push(col.r, col.g, col.b);
        }
        const row = 6; const base = i * row; const nextBase = ((i + 1) % len) * row;
        for(let k=0; k<5; k++) {
            indices.push(base + k, nextBase + k, base + k + 1);
            indices.push(nextBase + k, nextBase + k + 1, base + k + 1);
        }
    }
    scene.add(sandTrapsMesh);
    trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    trackGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    trackGeo.setIndex(indices); trackGeo.computeVertexNormals();

    // WET WEATHER TRACK MATERIAL
    const trackRough = cfg.weather === 'wet' ? 0.2 : 0.8;
    const trackMetal = cfg.weather === 'wet' ? 0.4 : 0.0;

    const trackMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: trackRough, metalness: trackMetal, flatShading: false, side: THREE.DoubleSide });
    const trackMesh = new THREE.Mesh(trackGeo, trackMat); trackMesh.receiveShadow = true; scene.add(trackMesh);

    // PHYSICS MESH FOR TRACK
    // Convert BufferGeometry to Trimesh
    const trimeshVerts = vertices;
    const trimeshIndices = indices;
    const trackShape = new CANNON.Trimesh(trimeshVerts, trimeshIndices);
    const trackBody = new CANNON.Body({ mass: 0, material: world.defaultMaterial });
    trackBody.addShape(trackShape);
    world.addBody(trackBody);

    // GRASS PLANE (Lowered slightly so we fall to it)
    const groundBody = new CANNON.Body({ mass: 0, material: world.defaultMaterial });
    const groundShape = new CANNON.Plane(); groundBody.addShape(groundShape); groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    groundBody.position.y = -0.1;
    world.addBody(groundBody);

    const startPos = trackCurve.getPoint(0); const nextPos = trackCurve.getPoint(0.01);
    const lineGeo = new THREE.BoxGeometry(cfg.roadWidth, 0.02, 1.5);
    const lineMesh = new THREE.Mesh(lineGeo, new THREE.MeshBasicMaterial({color:0xffffff}));
    lineMesh.position.copy(startPos); lineMesh.position.y = 0.06; lineMesh.lookAt(nextPos); scene.add(lineMesh);

    // --- PIT LANE GENERATION ---
    pitBoxPosition = generatePitLane(scene, world, cfg, trackPoints);

    return { trackPoints, trackCurve, checkpoints, sandTraps, pitBoxPosition };
}

function generatePitLane(scene, world, cfg, trackPoints) {
    let pitBoxPos = null;
    const pitLen = 80; // Extended length
    const pitVertices = []; const pitIndices = [];
    const pitWidth = 10;
    const maxOffset = (cfg.roadWidth / 2) + 10; // Moved back closer

    for(let i = -pitLen; i <= pitLen; i++) {
        let idx = (cfg.trackRes + i) % cfg.trackRes;
        let nextIdx = (cfg.trackRes + i + 1) % cfg.trackRes;

        const p1 = trackPoints[idx]; const p2 = trackPoints[nextIdx];
        const tan = new THREE.Vector3().subVectors(p2, p1).normalize();
        const side = new THREE.Vector3(tan.z, 0, -tan.x).normalize();

        let currentOffset = 0;
        const rampLen = 20;

        // VISUAL FIX: Start offset so the INNER edge of pit lane aligns with OUTER edge of track
        // Track Edge = cfg.roadWidth / 2
        // Pit Lane Inner Edge = currentOffset - (pitWidth / 2)
        // Therefore, Start Offset = (cfg.roadWidth / 2) + (pitWidth / 2)

        const startOffset = (cfg.roadWidth / 2) + (pitWidth / 2);

        if (i < -pitLen + rampLen) {
            const t = (i - (-pitLen)) / rampLen;
            currentOffset = startOffset + (t * (maxOffset - startOffset));
        } else if (i > pitLen - rampLen) {
            const t = (pitLen - i) / rampLen;
            currentOffset = startOffset + (t * (maxOffset - startOffset));
        } else {
            currentOffset = maxOffset;
        }

        const w = pitWidth / 2;
        const vIn = p1.clone().add(side.clone().multiplyScalar(currentOffset - w));
        const vOut = p1.clone().add(side.clone().multiplyScalar(currentOffset + w));

        pitVertices.push(vIn.x, vIn.y + 0.05, vIn.z);
        pitVertices.push(vOut.x, vOut.y + 0.05, vOut.z);

        if (i < pitLen) {
            const base = (i + pitLen) * 2;
            pitIndices.push(base, base+1, base+2);
            pitIndices.push(base+1, base+3, base+2);
        }

        if (i === 0) {
            const boxCenter = p1.clone().add(side.clone().multiplyScalar(maxOffset));
            pitBoxPos = { x: boxCenter.x, y: boxCenter.y, z: boxCenter.z, radius: 15 };

            // Rotated/Resized Pit Box (Long side parallel to track)
            // Width (X) = 10, Length (Z) = 26.
            const boxGeo = new THREE.PlaneGeometry(10, 26); boxGeo.rotateX(-Math.PI/2);
            const boxMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
            const boxMesh = new THREE.Mesh(boxGeo, boxMat);
            boxMesh.position.copy(boxCenter); boxMesh.position.y += 0.051;
            // Standard angle aligns Plane Height (Y->Z) with Forward
            const angle = Math.atan2(tan.x, tan.z); boxMesh.rotation.y = angle;
            scene.add(boxMesh);

            const markGeo = new THREE.PlaneGeometry(8, 22); markGeo.rotateX(-Math.PI/2);
            const markMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
            const markMesh = new THREE.Mesh(markGeo, markMat);
            markMesh.position.copy(boxCenter); markMesh.position.y += 0.052; markMesh.rotation.y = angle;
            scene.add(markMesh);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pitVertices, 3));
    geo.setIndex(pitIndices); geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
    const mesh = new THREE.Mesh(geo, mat); scene.add(mesh);

    if (pitVertices.length > 0) {
        const pitShape = new CANNON.Trimesh(pitVertices, pitIndices);
        const pitBody = new CANNON.Body({ mass: 0, material: world.defaultMaterial });
        pitBody.addShape(pitShape); world.addBody(pitBody);
    }

    return pitBoxPos;
}
