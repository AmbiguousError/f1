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

function createMeshAndAdd(group, geo, mat, x, y, z, rotX = 0) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (rotX !== 0) mesh.rotation.x = rotX;
    group.add(mesh);
    return mesh;
}

export function buildCarMesh(color) {
    const group = new THREE.Group();
    const mainMat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.1, roughness: 0.2 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });

    createMeshAndAdd(group, bodyGeo, mainMat, 0, 0.4, 0.2);
    createMeshAndAdd(group, noseGeo, mainMat, 0, 0.3, 2.4);
    createMeshAndAdd(group, fwGeo, blackMat, 0, 0.15, 3.0);
    createMeshAndAdd(group, podGeo, mainMat, 0.8, 0.4, -0.2);
    createMeshAndAdd(group, podGeo, mainMat, -0.8, 0.4, -0.2);
    createMeshAndAdd(group, rwGeo, blackMat, 0, 0.8, -2.0);
    createMeshAndAdd(group, rwTopGeo, mainMat, 0, 1.1, -2.0);
    createMeshAndAdd(group, haloGeo, blackMat, 0, 0.75, 0.5, -Math.PI/2);
    createMeshAndAdd(group, helmGeo, new THREE.MeshStandardMaterial({color: 0xffff00}), 0, 0.7, 0.3);

    group.castShadow = true; group.traverse(c => c.castShadow = true);
    return group;
}

export function buildMiniMesh(color) {
    const group = new THREE.Group();
    const mainMat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.3, roughness: 0.4 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.8, roughness: 0.2 });

    createMeshAndAdd(group, miniBodyGeo, mainMat, 0, 0.3, 0);
    createMeshAndAdd(group, miniRoofGeo, roofMat, 0, 0.75, -0.1);
    createMeshAndAdd(group, miniCabinGeo, glassMat, 0, 0.6, -0.1);
    createMeshAndAdd(group, miniLightGeo, chromeMat, 0.5, 0.4, 1.2);
    createMeshAndAdd(group, miniLightGeo, chromeMat, -0.5, 0.4, 1.2);

    group.castShadow = true; group.traverse(c => c.castShadow = true);
    return group;
}
