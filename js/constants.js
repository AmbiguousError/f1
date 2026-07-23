export const TYRE_COMPOUNDS = [
    { name: 'Soft', grip: 1.2, wear: 1.5, color: 0xeb2f06, label: 'S' },
    { name: 'Medium', grip: 1.0, wear: 1.0, color: 0xf1c40f, label: 'M' },
    { name: 'Hard', grip: 0.8, wear: 0.6, color: 0xf5f6fa, label: 'H' },
    { name: 'Rally', grip: 0.85, wear: 0.8, color: 0x2ecc71, label: 'R' },
];

export const TYRE_COLORS = [0xeb2f06, 0xf1c40f, 0xf5f6fa, 0x2ecc71];

// AI roster in 2026 drivers' championship order (after the British GP, round 9/22,
// July 2026). `performance` scales AI top speed/cornering in cars.js — keep values
// inside the historical 0.96–1.04 spread or the field spreads out absurdly.
export const AI_DRIVERS = [
    { name: 'Antonelli', color: 0x00d2be, performance: 1.04 }, // Mercedes, leader
    { name: 'Russell', color: 0x00d2be, performance: 1.03 }, // Mercedes
    { name: 'Hamilton', color: 0xdc0000, performance: 1.03 }, // Ferrari
    { name: 'Leclerc', color: 0xdc0000, performance: 1.02 }, // Ferrari
    { name: 'Norris', color: 0xff8700, performance: 1.01 }, // McLaren
    { name: 'Piastri', color: 0xff8700, performance: 1.0 }, // McLaren
    { name: 'Verstappen', color: 0x000080, performance: 1.0 }, // Red Bull
    { name: 'Hadjar', color: 0x000080, performance: 0.99 }, // Red Bull
    { name: 'Gasly', color: 0x0090ff, performance: 0.98 }, // Alpine
    { name: 'Lawson', color: 0x6692ff, performance: 0.97 }, // Racing Bulls
    { name: 'Bearman', color: 0xb6babd, performance: 0.96 }, // Haas
];

export const ZOOM_LEVELS = [
    { y: 60, dist: 40 },
    { y: 120, dist: 80 },
    { y: 200, dist: 140 },
];

export const POINTS_SYSTEM = [25, 18, 15, 12, 10, 8];

export const MAX_SKIDMARKS = 800;

// Rally mode surfaces: whole-track grip/engine multipliers plus the visual palette.
// Grip multiplies wheel frictionSlip (and AI cornering speed); force scales engine power.
export const RALLY_SURFACES = {
    tarmac: { grip: 1.0, force: 1.0, track: 0x555555, ground: 0x2e8b57, trap: 0xd2b48c, dust: null },
    snow: { grip: 0.38, force: 0.85, track: 0xdde4e8, ground: 0xe8eef2, trap: 0xcfd8dc, dust: 0xffffff },
    mud: { grip: 0.52, force: 0.9, track: 0x6b4a2b, ground: 0x5d5233, trap: 0x4e3b24, dust: 0x8a6a3f },
};

// Player-selectable teams: display name + car body color. Swatches in index.html's
// TEAM menu row must stay in sync with these colors.
export const TEAMS = [
    { name: 'Ferrari', color: 0xdc0000 },
    { name: 'Red Bull', color: 0x000080 },
    { name: 'Mercedes', color: 0x00d2be },
    { name: 'McLaren', color: 0xff8700 },
    { name: 'Aston Martin', color: 0x006f62 },
    { name: 'Alpine', color: 0x0090ff },
    { name: 'Williams', color: 0x005aff },
];

// cannon-es collision filter groups. World bodies (track/ground/pit floor) keep the
// engine defaults group=1/mask=-1; car chassis bodies are GROUP_CAR. A car in the pit
// lane is "ghosted" by masking out GROUP_CAR so it only collides with the world.
export const GROUP_WORLD = 1;
export const GROUP_CAR = 2;

// Track-limits escalation (js/incidents.js): tiers by a driver's cumulative
// off-track excursion count this race. Warnings only log/flash; time5/time10
// add seconds to the driver's finish time; drive-through caps their top speed
// live for DRIVE_THROUGH_DURATION_MS. Every +3 past the last tier keeps
// re-applying drive-through as a continued deterrent.
export const TRACK_LIMIT_ESCALATION = [
    { atCount: 1, kind: 'warning' },
    { atCount: 2, kind: 'warning' },
    { atCount: 3, kind: 'warning' },
    { atCount: 4, kind: 'time5' },
    { atCount: 7, kind: 'time10' },
    { atCount: 10, kind: 'drive-through' },
];

// Damage zones (js/incidents.js, main.js, race.js): broad performance-affecting
// areas a car can take damage to, each repairable individually during a pit
// stop for its own extra hold time. minHealth keeps a zone from ever fully
// disabling the car - arcade-fun-first, matching this game's design philosophy.
export const DAMAGE_ZONES = [
    { key: 'frontWing', label: 'FRONT WING', repairSeconds: 3, minHealth: 40 },
    { key: 'floor', label: 'FLOOR', repairSeconds: 5, minHealth: 40 },
    { key: 'gearbox', label: 'GEARBOX', repairSeconds: 4, minHealth: 40 },
];

export const BASE_PIT_HOLD_T = 2.0;
export const MIN_IMPACT_THRESHOLD = 2.5; // m/s, filters incidental racing contact from real hits
export const DRIVE_THROUGH_CAP_KPH = 100;
export const DRIVE_THROUGH_DURATION_MS = 15000;
