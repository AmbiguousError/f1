import { generateCircuit } from '../track.js';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

describe('track.js', () => {
    let scene, world, cfg, rng;

    beforeEach(() => {
        scene = { add: jest.fn() };
        world = { addBody: jest.fn(), defaultMaterial: {} };
        cfg = { time: 'day', weather: 'dry', trackRes: 100, roadWidth: 12 };
        rng = () => 0.5; // Deterministic rng
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('generateCircuit should generate track points, checkpoints, and add objects to scene and world', () => {
        const result = generateCircuit(scene, world, cfg, rng);

        expect(result).toHaveProperty('trackPoints');
        expect(result).toHaveProperty('trackCurve');
        expect(result).toHaveProperty('checkpoints');
        expect(result).toHaveProperty('sandTraps');
        expect(result).toHaveProperty('pitBoxPosition');

        expect(result.trackPoints.length).toBeGreaterThan(0);
        expect(scene.add).toHaveBeenCalled();
        expect(world.addBody).toHaveBeenCalled();
    });

    it('should set grass color correctly based on sunset time', () => {
        cfg.time = 'sunset';
        generateCircuit(scene, world, cfg, rng);

        const addedObjects = scene.add.mock.calls.map(call => call[0]);
        const grassMesh = addedObjects.find(obj => obj.geometry instanceof THREE.PlaneGeometry && obj.geometry.parameters.width === 1200);
        expect(grassMesh).toBeDefined();
        expect(grassMesh.material.color.getHex()).toBe(0x2e3b28);
    });

    it('should set grass color correctly based on day time', () => {
        cfg.time = 'day';
        generateCircuit(scene, world, cfg, rng);

        const addedObjects = scene.add.mock.calls.map(call => call[0]);
        const grassMesh = addedObjects.find(obj => obj.geometry instanceof THREE.PlaneGeometry && obj.geometry.parameters.width === 1200);
        expect(grassMesh).toBeDefined();
        expect(grassMesh.material.color.getHex()).toBe(0x2e8b57);
    });

    it('should apply wet track material when weather is wet', () => {
        cfg.weather = 'wet';
        generateCircuit(scene, world, cfg, rng);

        const addedObjects = scene.add.mock.calls.map(call => call[0]);
        const trackMesh = addedObjects.find(obj => obj.geometry instanceof THREE.BufferGeometry && obj.material.vertexColors === true);

        expect(trackMesh).toBeDefined();
        expect(trackMesh.material.roughness).toBe(0.2);
        expect(trackMesh.material.metalness).toBe(0.4);
    });

    it('should apply dry track material when weather is dry', () => {
        cfg.weather = 'dry';
        generateCircuit(scene, world, cfg, rng);

        const addedObjects = scene.add.mock.calls.map(call => call[0]);
        const trackMesh = addedObjects.find(obj => obj.geometry instanceof THREE.BufferGeometry && obj.material.vertexColors === true);

        expect(trackMesh).toBeDefined();
        expect(trackMesh.material.roughness).toBe(0.8);
        expect(trackMesh.material.metalness).toBe(0.0);
    });

    it('should calculate valid pitBoxPosition with x, y, z, and radius', () => {
        const result = generateCircuit(scene, world, cfg, rng);
        expect(result.pitBoxPosition).toBeDefined();
        expect(result.pitBoxPosition).toHaveProperty('x');
        expect(result.pitBoxPosition).toHaveProperty('y');
        expect(result.pitBoxPosition).toHaveProperty('z');
        expect(result.pitBoxPosition).toHaveProperty('radius');
    });

    it('should create exactly 3 checkpoints', () => {
        const result = generateCircuit(scene, world, cfg, rng);
        expect(result.checkpoints).toHaveLength(3);
        expect(result.checkpoints[0]).toBeDefined();
        expect(result.checkpoints[1]).toBeDefined();
        expect(result.checkpoints[2]).toBeDefined();
    });

    it('should generate sand traps when conditions are met', () => {
        // Mock rng to return > 0.5 to trigger sand trap creation
        rng = () => 0.6;
        const result = generateCircuit(scene, world, cfg, rng);
        expect(result.sandTraps.length).toBeGreaterThan(0);
        const addedObjects = scene.add.mock.calls.map(call => call[0]);
        const sandTrapsMesh = addedObjects.find(obj => obj.type === 'Group');
        expect(sandTrapsMesh).toBeDefined();
    });

    it('should not generate sand traps when rng is low', () => {
        rng = () => 0.1;
        const result = generateCircuit(scene, world, cfg, rng);
        expect(result.sandTraps.length).toBe(0);
    });

    it('should pop last track point if distance to first is < 1.0', () => {
        jest.spyOn(THREE.CatmullRomCurve3.prototype, 'getSpacedPoints').mockImplementation(() => {
            const pts = [];
            for(let i=0; i<101; i++) {
                // Add points along a circle to avoid weird normalize issues when points are collinear or identical
                const angle = (i / 100) * Math.PI * 2;
                pts.push(new THREE.Vector3(Math.cos(angle)*100, 0, Math.sin(angle)*100));
            }
            // Add one more point extremely close to the first one
            pts.push(new THREE.Vector3(100.5, 0, 0));
            return pts;
        });

        cfg.trackRes = 101; // The function generates trackRes + 1 points originally, so we mock returning 102 points
        const result = generateCircuit(scene, world, cfg, rng);

        // It should have popped the last point, leaving 101 points
        expect(result.trackPoints.length).toBe(101);
    });
});
