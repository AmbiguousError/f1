import * as THREE from 'three';
import { state, cfg, inputs, globalGeometries } from './state.js';
import { MAX_SKIDMARKS } from './constants.js';

const dustGeo = new THREE.DodecahedronGeometry(0.3);
globalGeometries.add(dustGeo);
export const dustMaterials = {};
function getDustMaterial(colorHex) {
    if (!dustMaterials[colorHex]) {
        dustMaterials[colorHex] = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.5 });
    }
    return dustMaterials[colorHex];
}

export function spawnDust(pos, colorHex) {
    if (Math.random() > 0.3) return;
    const mat = getDustMaterial(colorHex);
    const mesh = new THREE.Mesh(dustGeo, mat);
    mesh.position.copy(pos);
    mesh.position.y = 0.5;
    let upVel = Math.random() * 0.2 + 0.1;
    if (cfg.weather === 'wet' && colorHex === 0xffffff) upVel = Math.random() * 0.5 + 0.3;
    const vel = new THREE.Vector3((Math.random() - 0.5) * 0.2, upVel, (Math.random() - 0.5) * 0.2);
    state.scene.add(mesh);
    state.particles.push({ mesh, vel, life: 1.0, rot: { x: Math.random() * 0.1, y: Math.random() * 0.1 } });
}

export function updateParticles() {
    const particles = state.particles;
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.mesh.position.add(p.vel);
        p.mesh.rotation.x += p.rot.x;
        p.mesh.rotation.y += p.rot.y;
        p.life -= 0.02;
        p.mesh.scale.setScalar(p.life);
        p.mesh.material.opacity = p.life * 0.5;
        if (p.life <= 0) {
            state.scene.remove(p.mesh);
            particles.splice(i, 1);
        }
    }
}

let skidmarkPool = [];
let skidmarkIndex = 0;

export function setupSkidmarkPool() {
    skidmarkPool.forEach((m) => {
        if (state.scene) state.scene.remove(m);
    });
    skidmarkPool = [];
    skidmarkIndex = 0;
    for (let i = 0; i < MAX_SKIDMARKS; i++) {
        const m = new THREE.Mesh(state.skidGeo, state.skidMat);
        m.visible = false;
        state.scene.add(m);
        skidmarkPool.push(m);
    }
}

export function updateSkidmarks() {
    const speed = state.chassisBody.velocity.length();
    // Default F1 braking skidmarks:
    if (inputs.brake && speed > 10) {
        [2, 3].forEach((idx) => {
            const w = state.visualWheels[idx];
            if (w) {
                if (!w.userData.lastSkidPos) w.userData.lastSkidPos = new THREE.Vector3();
                if (w.position.distanceToSquared(w.userData.lastSkidPos) > 0.5) {
                    addSkid(w.position);
                    w.userData.lastSkidPos.copy(w.position);
                }
            }
        });
    }
    // Rally tyre marks in soft surfaces:
    if (cfg.raceStyle === 'rally' && (cfg.surface === 'snow' || cfg.surface === 'mud') && speed > 2) {
        state.visualWheels.forEach((w) => {
            if (w) {
                if (!w.userData.lastSkidPos) w.userData.lastSkidPos = new THREE.Vector3();
                if (w.position.distanceToSquared(w.userData.lastSkidPos) > 0.8) {
                    addSkid(w.position);
                    w.userData.lastSkidPos.copy(w.position);
                }
            }
        });
    }

    // Tyre marks from competitor (AI) vehicles:
    state.aiCars.forEach((ai) => {
        const aiSpeed = ai.body.velocity.length();
        if (aiSpeed > 2 && !ai.finished) {
            // AI F1 braking skidmarks:
            if (ai.isBraking && aiSpeed > 10) {
                [2, 3].forEach((idx) => {
                    const w = ai.wheels[idx];
                    if (w) {
                        if (!w.userData.lastSkidPos) w.userData.lastSkidPos = new THREE.Vector3();
                        if (w.position.distanceToSquared(w.userData.lastSkidPos) > 0.5) {
                            addSkid(w.position);
                            w.userData.lastSkidPos.copy(w.position);
                        }
                    }
                });
            }
            // AI Rally tyre marks on soft surfaces:
            if (cfg.raceStyle === 'rally' && (cfg.surface === 'snow' || cfg.surface === 'mud')) {
                ai.wheels.forEach((w) => {
                    if (w) {
                        if (!w.userData.lastSkidPos) w.userData.lastSkidPos = new THREE.Vector3();
                        if (w.position.distanceToSquared(w.userData.lastSkidPos) > 0.8) {
                            addSkid(w.position);
                            w.userData.lastSkidPos.copy(w.position);
                        }
                    }
                });
            }
        }
    });
}

export function addSkid(pos) {
    if (skidmarkPool.length === 0) return;
    const m = skidmarkPool[skidmarkIndex];
    m.position.copy(pos);
    m.position.y = 0.05;
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI;
    m.visible = true;
    skidmarkIndex = (skidmarkIndex + 1) % MAX_SKIDMARKS;
}
