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
    snow: { grip: 0.3, force: 0.8, track: 0xdde4e8, ground: 0xe8eef2, trap: 0xcfd8dc, dust: 0xffffff },
    mud: { grip: 0.45, force: 0.85, track: 0x6b4a2b, ground: 0x5d5233, trap: 0x4e3b24, dust: 0x8a6a3f },
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
