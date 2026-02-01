import * as THREE from 'three';

const bodyGeo = new THREE.BoxGeometry(1.2, 0.5, 3.5);
{ const pos = bodyGeo.attributes.position; for(let i=0; i<pos.count; i++) { if(pos.getZ(i) < -0.5) { pos.setX(i, pos.getX(i) * 0.6); pos.setY(i, pos.getY(i) * 0.7); } } bodyGeo.computeVertexNormals(); }
const noseGeo = new THREE.BoxGeometry(0.6, 0.25, 1.5);
const fwGeo = new THREE.BoxGeometry(2.8, 0.1, 0.6);
const podGeo = new THREE.BoxGeometry(0.6, 0.5, 1.5);
const rwGeo = new THREE.BoxGeometry(2.4, 0.6, 0.1);
const rwTopGeo = new THREE.BoxGeometry(2.4, 0.05, 0.8);
const haloGeo = new THREE.TorusGeometry(0.5, 0.05, 8, 20, Math.PI);
const helmGeo = new THREE.SphereGeometry(0.18);

const miniBodyGeo = new THREE.BoxGeometry(1.4, 0.6, 2.4);
const miniRoofGeo = new THREE.BoxGeometry(1.3, 0.35, 1.4);
const miniCabinGeo = new THREE.BoxGeometry(1.35, 0.3, 1.8);
const miniLightGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.1, 16); miniLightGeo.rotateX(Math.PI/2);

export function buildCarMesh(color) {
    const group = new THREE.Group();
    const mainMat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.1, roughness: 0.2 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const body = new THREE.Mesh(bodyGeo, mainMat); body.position.set(0, 0.4, 0.2); group.add(body);
    const nose = new THREE.Mesh(noseGeo, mainMat); nose.position.set(0, 0.3, 2.4); group.add(nose);
    const fw = new THREE.Mesh(fwGeo, blackMat); fw.position.set(0, 0.15, 3.0); group.add(fw);
    const podL = new THREE.Mesh(podGeo, mainMat); podL.position.set(0.8, 0.4, -0.2); group.add(podL);
    const podR = new THREE.Mesh(podGeo, mainMat); podR.position.set(-0.8, 0.4, -0.2); group.add(podR);
    const rw = new THREE.Mesh(rwGeo, blackMat); rw.position.set(0, 0.8, -2.0); group.add(rw);
    const rwTop = new THREE.Mesh(rwTopGeo, mainMat); rwTop.position.set(0, 1.1, -2.0); group.add(rwTop);
    const halo = new THREE.Mesh(haloGeo, blackMat); halo.rotation.x = -Math.PI/2; halo.position.set(0, 0.75, 0.5); group.add(halo);
    const helm = new THREE.Mesh(helmGeo, new THREE.MeshStandardMaterial({color: 0xffff00})); helm.position.set(0, 0.7, 0.3); group.add(helm);
    group.castShadow = true; group.traverse(c => c.castShadow = true);
    return group;
}

export function buildMiniMesh(color) {
    const group = new THREE.Group();
    const mainMat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.3, roughness: 0.4 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.8, roughness: 0.2 });

    const body = new THREE.Mesh(miniBodyGeo, mainMat); body.position.set(0, 0.3, 0); group.add(body);
    const roof = new THREE.Mesh(miniRoofGeo, roofMat); roof.position.set(0, 0.75, -0.1); group.add(roof);
    const cabin = new THREE.Mesh(miniCabinGeo, glassMat); cabin.position.set(0, 0.6, -0.1); group.add(cabin);
    const lightL = new THREE.Mesh(miniLightGeo, chromeMat); lightL.position.set(0.5, 0.4, 1.2); group.add(lightL);
    const lightR = new THREE.Mesh(miniLightGeo, chromeMat); lightR.position.set(-0.5, 0.4, 1.2); group.add(lightR);

    group.castShadow = true; group.traverse(c => c.castShadow = true);
    return group;
}
