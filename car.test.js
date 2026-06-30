import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildCarMesh } from './car.js';

describe('buildCarMesh', () => {
    it('should return a THREE.Group', () => {
        const color = 0xff0000;
        const mesh = buildCarMesh(color);
        expect(mesh).toBeInstanceOf(THREE.Group);
    });

    it('should contain the expected number of parts', () => {
        const color = 0xff0000;
        const mesh = buildCarMesh(color);
        // The parts are: body, nose, fw, podL, podR, rw, rwTop, halo, helm (9 parts)
        expect(mesh.children.length).toBe(9);
    });

    it('should apply the correct color to the main material', () => {
        const color = 0x123456;
        const mesh = buildCarMesh(color);

        // Find a part that uses mainMat, e.g., the body (first child)
        const body = mesh.children[0];
        expect(body).toBeInstanceOf(THREE.Mesh);
        expect(body.material).toBeInstanceOf(THREE.MeshStandardMaterial);
        expect(body.material.color.getHex()).toBe(color);
    });

    it('should set shadow casting properties correctly', () => {
        const color = 0xff0000;
        const mesh = buildCarMesh(color);

        expect(mesh.castShadow).toBe(true);
        mesh.children.forEach(child => {
            expect(child.castShadow).toBe(true);
        });
    });
});
