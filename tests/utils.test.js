import { describe, it, expect } from 'vitest';
import { formatTime, createRNG } from '../js/utils.js';

describe('formatTime', () => {
    it('should format milliseconds correctly', () => {
        expect(formatTime(65123)).toBe('1:05.12');
        expect(formatTime(45000)).toBe('0:45.00');
        expect(formatTime(0)).toBe('0:00.00');
    });
});

describe('createRNG', () => {
    it('should be deterministic', () => {
        const rng1 = createRNG('MONZA');
        const rng2 = createRNG('MONZA');
        expect(rng1()).toBe(rng2());
        expect(rng1()).toBe(rng2());
    });

    it('should differ for different seeds', () => {
        const rngMonza = createRNG('MONZA');
        const rngSpa = createRNG('SPA');
        expect(rngMonza()).not.toBe(rngSpa());
    });
});
