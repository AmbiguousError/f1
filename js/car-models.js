import * as THREE from 'three';
import { cfg, globalGeometries, globalMaterials } from './state.js';
import { TYRE_COLORS } from './constants.js';

const bodyGeo = new THREE.BoxGeometry(1.2, 0.5, 3.5);
{
    const pos = bodyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        if (pos.getZ(i) < -0.5) {
            pos.setX(i, pos.getX(i) * 0.6);
            pos.setY(i, pos.getY(i) * 0.7);
        }
    }
    bodyGeo.computeVertexNormals();
}
const noseGeo = new THREE.BoxGeometry(0.6, 0.25, 1.5);
const fwGeo = new THREE.BoxGeometry(2.8, 0.1, 0.6);
const podGeo = new THREE.BoxGeometry(0.6, 0.5, 1.5);
const rwGeo = new THREE.BoxGeometry(2.4, 0.6, 0.1);
const rwTopGeo = new THREE.BoxGeometry(2.4, 0.05, 0.8);
const haloGeo = new THREE.TorusGeometry(0.5, 0.05, 8, 20, Math.PI);
const helmGeo = new THREE.SphereGeometry(0.18);
export const wGeoFront = new THREE.CylinderGeometry(0.45, 0.45, 0.6, 24);
export const wGeoRear = new THREE.CylinderGeometry(0.6, 0.6, 0.85, 24);
export const wGeoMini = new THREE.CylinderGeometry(0.3, 0.3, 0.25, 24);
export const wMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
export const rimMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
const miniBodyGeo = new THREE.BoxGeometry(1.4, 0.6, 2.4);
const miniRoofGeo = new THREE.BoxGeometry(1.3, 0.35, 1.4);
const miniCabinGeo = new THREE.BoxGeometry(1.35, 0.3, 1.8);
const miniLightGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.1, 16);
miniLightGeo.rotateX(Math.PI / 2);
const rallyBodyGeo = new THREE.BoxGeometry(1.4, 0.6, 2.7);
const rallyCabinGeo = new THREE.BoxGeometry(1.2, 0.5, 1.5);
const rallyWingGeo = new THREE.BoxGeometry(1.4, 0.08, 0.4);
const rallyWingStrutGeo = new THREE.BoxGeometry(0.08, 0.25, 0.1);
const rallyLightPodGeo = new THREE.BoxGeometry(0.6, 0.18, 0.25);
const rallySpotlightGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.15, 16);
rallySpotlightGeo.rotateX(Math.PI / 2);
const mudFlapGeo = new THREE.BoxGeometry(0.3, 0.45, 0.04);

// Register static global shapes to protection sets to prevent disposal in cleanup()
[
    bodyGeo,
    noseGeo,
    fwGeo,
    podGeo,
    rwGeo,
    rwTopGeo,
    haloGeo,
    helmGeo,
    wGeoFront,
    wGeoRear,
    wGeoMini,
    miniBodyGeo,
    miniRoofGeo,
    miniCabinGeo,
    miniLightGeo,
    rallyBodyGeo,
    rallyCabinGeo,
    rallyWingGeo,
    rallyWingStrutGeo,
    rallyLightPodGeo,
    rallySpotlightGeo,
    mudFlapGeo,
].forEach((g) => globalGeometries.add(g));
[wMat, rimMat].forEach((m) => globalMaterials.add(m));

export function buildCarMesh(color) {
    const group = new THREE.Group();
    const mainMat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.1, roughness: 0.2 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const body = new THREE.Mesh(bodyGeo, mainMat);
    body.position.set(0, 0.4, 0.2);
    group.add(body);
    const nose = new THREE.Mesh(noseGeo, mainMat);
    nose.position.set(0, 0.3, 2.4);
    group.add(nose);
    const fw = new THREE.Mesh(fwGeo, blackMat);
    fw.position.set(0, 0.15, 3.0);
    group.add(fw);
    const podL = new THREE.Mesh(podGeo, mainMat);
    podL.position.set(0.8, 0.4, -0.2);
    group.add(podL);
    const podR = new THREE.Mesh(podGeo, mainMat);
    podR.position.set(-0.8, 0.4, -0.2);
    group.add(podR);
    const rw = new THREE.Mesh(rwGeo, blackMat);
    rw.position.set(0, 0.8, -2.0);
    group.add(rw);
    const rwTop = new THREE.Mesh(rwTopGeo, mainMat);
    rwTop.position.set(0, 1.1, -2.0);
    group.add(rwTop);
    const halo = new THREE.Mesh(haloGeo, blackMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(0, 0.75, 0.5);
    group.add(halo);
    const helm = new THREE.Mesh(helmGeo, new THREE.MeshStandardMaterial({ color: 0xffff00 }));
    helm.position.set(0, 0.7, 0.3);
    group.add(helm);

    const tailMat = new THREE.MeshBasicMaterial({ color: 0x440000 });
    const tailGeo = new THREE.BoxGeometry(0.5, 0.1, 0.1);
    const tailMesh = new THREE.Mesh(tailGeo, tailMat);
    tailMesh.position.set(0, 0.8, -2.05);
    group.add(tailMesh);
    if (cfg.time === 'sunset') {
        const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const hlGeo = new THREE.BoxGeometry(0.4, 0.1, 0.1);
        const hlL = new THREE.Mesh(hlGeo, hlMat);
        hlL.position.set(0.6, 0.5, 0.55);
        const hlR = new THREE.Mesh(hlGeo, hlMat);
        hlR.position.set(-0.6, 0.5, 0.55);
        group.add(hlL);
        group.add(hlR);
    }
    group.castShadow = true;
    group.traverse((c) => (c.castShadow = true));
    group.userData = { tailMat: tailMat };
    return group;
}

export function buildMiniMesh(color) {
    const group = new THREE.Group();
    const mainMat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.3, roughness: 0.4 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.8, roughness: 0.2 });
    const body = new THREE.Mesh(miniBodyGeo, mainMat);
    body.position.set(0, 0.3, 0);
    group.add(body);
    const roof = new THREE.Mesh(miniRoofGeo, roofMat);
    roof.position.set(0, 0.75, -0.1);
    group.add(roof);
    const cabin = new THREE.Mesh(miniCabinGeo, glassMat);
    cabin.position.set(0, 0.6, -0.1);
    group.add(cabin);
    const lightL = new THREE.Mesh(miniLightGeo, chromeMat);
    lightL.position.set(0.5, 0.4, 1.2);
    group.add(lightL);
    const lightR = new THREE.Mesh(miniLightGeo, chromeMat);
    lightR.position.set(-0.5, 0.4, 1.2);
    group.add(lightR);
    const tailMat = new THREE.MeshBasicMaterial({ color: 0x440000 });
    const tailGeo = new THREE.BoxGeometry(0.3, 0.1, 0.1);
    const tailL = new THREE.Mesh(tailGeo, tailMat);
    tailL.position.set(0.4, 0.4, -1.25);
    const tailR = new THREE.Mesh(tailGeo, tailMat);
    tailR.position.set(-0.4, 0.4, -1.25);
    group.add(tailL);
    group.add(tailR);
    if (cfg.time === 'sunset') {
        lightL.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        lightR.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    }
    group.castShadow = true;
    group.traverse((c) => (c.castShadow = true));
    group.userData = { tailMat: tailMat };
    return group;
}

export function buildRallyMesh(color) {
    const group = new THREE.Group();
    const mainMat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.2, roughness: 0.3 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.2 });
    const body = new THREE.Mesh(rallyBodyGeo, mainMat);
    body.position.set(0, 0.4, 0);
    group.add(body);
    const cabin = new THREE.Mesh(rallyCabinGeo, glassMat);
    cabin.position.set(0, 0.85, -0.15);
    group.add(cabin);
    const roofGeo = new THREE.BoxGeometry(1.15, 0.08, 1.4);
    roofGeo.translate(0, 1.1, -0.15);
    const roof = new THREE.Mesh(roofGeo, mainMat);
    group.add(roof);
    globalGeometries.add(roofGeo);
    const wing = new THREE.Mesh(rallyWingGeo, mainMat);
    wing.position.set(0, 1.15, -1.2);
    group.add(wing);
    const strutL = new THREE.Mesh(rallyWingStrutGeo, blackMat);
    strutL.position.set(0.4, 1.0, -1.25);
    group.add(strutL);
    const strutR = new THREE.Mesh(rallyWingStrutGeo, blackMat);
    strutR.position.set(-0.4, 1.0, -1.25);
    group.add(strutR);
    const pod = new THREE.Mesh(rallyLightPodGeo, blackMat);
    pod.position.set(0, 0.6, 1.3);
    group.add(pod);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < 4; i++) {
        const xOffset = -0.375 + i * 0.25;
        const lightShell = new THREE.Mesh(rallySpotlightGeo, chromeMat);
        lightShell.position.set(xOffset, 0.62, 1.4);
        group.add(lightShell);
        const bulbGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16);
        bulbGeo.rotateX(Math.PI / 2);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(xOffset, 0.62, 1.48);
        group.add(bulb);
        globalGeometries.add(bulbGeo);
    }
    const flapFL = new THREE.Mesh(mudFlapGeo, blackMat);
    flapFL.position.set(0.8, 0.25, -0.85);
    group.add(flapFL);
    const flapFR = new THREE.Mesh(mudFlapGeo, blackMat);
    flapFR.position.set(-0.8, 0.25, -0.85);
    group.add(flapFR);
    const flapRL = new THREE.Mesh(mudFlapGeo, blackMat);
    flapRL.position.set(0.8, 0.25, -2.15);
    group.add(flapRL);
    const flapRR = new THREE.Mesh(mudFlapGeo, blackMat);
    flapRR.position.set(-0.8, 0.25, -2.15);
    group.add(flapRR);
    const tailMat = new THREE.MeshBasicMaterial({ color: 0x440000 });
    const tailGeo = new THREE.BoxGeometry(0.25, 0.12, 0.05);
    const tailL = new THREE.Mesh(tailGeo, tailMat);
    tailL.position.set(0.5, 0.5, -1.36);
    const tailR = new THREE.Mesh(tailGeo, tailMat);
    tailR.position.set(-0.5, 0.5, -1.36);
    group.add(tailL);
    group.add(tailR);
    globalGeometries.add(tailGeo);
    group.castShadow = true;
    group.traverse((c) => (c.castShadow = true));
    group.userData = { tailMat: tailMat };
    return group;
}

export function buildTyreStripe(isMini, isRearOrRally, startCompoundIdx) {
    const r = isMini ? 0.301 : isRearOrRally ? 0.601 : 0.451;
    const stripeGeo = new THREE.CylinderGeometry(r, r, 0.015, 32);
    stripeGeo.rotateZ(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
        color: TYRE_COLORS[startCompoundIdx],
        roughness: 0.9,
        metalness: 0.1,
    });
    const mesh = new THREE.Mesh(stripeGeo, mat);
    const offset = isMini ? 0.12 : isRearOrRally ? 0.4 : 0.28;
    mesh.position.set(offset, 0, 0);
    return mesh;
}
