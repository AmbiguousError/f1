import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMiniMesh } from './car.js';

describe('buildMiniMesh', () => {
    it('should return a THREE.Group', () => {
        const mesh = buildMiniMesh(0xff0000);
        assert.ok(mesh instanceof THREE.Group, 'Result should be an instance of THREE.Group');
    });

    it('should assemble the correct number of child components', () => {
        const mesh = buildMiniMesh(0xff0000);
        // The group should contain: body, roof, cabin, lightL, lightR
        assert.equal(mesh.children.length, 5, 'Group should have exactly 5 child meshes');
        mesh.children.forEach(child => {
            assert.ok(child instanceof THREE.Mesh, 'Each child should be a THREE.Mesh');
        });
    });

    it('should apply the specified color to the main body material', () => {
        const testColor = 0x123456;
        const mesh = buildMiniMesh(testColor);

        // The first child added is the main body
        const body = mesh.children[0];
        assert.equal(body.material.color.getHex(), testColor, 'Body material color should match the requested color');
    });

    it('should configure castShadow on the group and all descendants', () => {
        const mesh = buildMiniMesh(0xff0000);

        assert.equal(mesh.castShadow, true, 'Group castShadow should be true');

        mesh.traverse(child => {
            assert.equal(child.castShadow, true, `Child castShadow should be true`);
        });
    });
});
