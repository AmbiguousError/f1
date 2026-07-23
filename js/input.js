import { state, inputs } from './state.js';
import { selectNextCompound } from './race.js';

export function setupInputs(togglePause) {
    if (state.inputsInitialized) return;
    state.inputsInitialized = true;
    const handle = (k, v, e) => {
        if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
            if (e) e.preventDefault();
        }
        if (k === 'w' || k === 'arrowup') {
            inputs.up = v;
            setBtn('btn-g', v);
        }
        if (k === 'a' || k === 'arrowleft') {
            inputs.left = v;
            setBtn('btn-l', v);
        }
        if (k === 'd' || k === 'arrowright') {
            inputs.right = v;
            setBtn('btn-r', v);
        }
        if (k === ' ') {
            inputs.brake = v;
            setBtn('btn-b', v);
        }
        if (k === 's' || k === 'arrowdown') {
            inputs.down = v;
            setBtn('btn-rev', v);
        }
        if (k === 'escape' && v) togglePause();
        if (state.isRunning && v) {
            if (k === '1') selectNextCompound(0);
            if (k === '2') selectNextCompound(1);
            if (k === '3') selectNextCompound(2);
            if (k === 'r') {
                if (window.triggerReset) window.triggerReset();
            }
        }
    };
    const setBtn = (id, active) => {
        const b = document.getElementById(id);
        if (active) b.classList.add('active');
        else b.classList.remove('active');
    };
    window.addEventListener('keydown', (e) => handle(e.key.toLowerCase(), true, e));
    window.addEventListener('keyup', (e) => handle(e.key.toLowerCase(), false, e));
    const bind = (id, k) => {
        const el = document.getElementById(id);
        el.addEventListener('touchstart', (e) => {
            e.preventDefault();
            handle(k, true);
        });
        el.addEventListener('touchend', (e) => {
            e.preventDefault();
            handle(k, false);
        });
    };
    bind('btn-l', 'a');
    bind('btn-r', 'd');
    bind('btn-g', 'w');
    bind('btn-b', ' ');
    bind('btn-rev', 's');

    // Mobile steer zones (#touch-zone-l/#touch-zone-r, css/style.css): left half of the
    // screen steers left, right half steers right, and holding both at once is the
    // brake/reverse gesture - mirrors squeezing a real brake rather than needing a
    // separate button. Tracked independently of the keyboard/button `handle()` above
    // since it's a two-input combo, not a single key.
    let zoneLeftDown = false;
    let zoneRightDown = false;
    const zoneLeftEl = document.getElementById('touch-zone-l');
    const zoneRightEl = document.getElementById('touch-zone-r');
    const updateZoneStance = () => {
        const both = zoneLeftDown && zoneRightDown;
        inputs.left = zoneLeftDown && !both;
        inputs.right = zoneRightDown && !both;
        inputs.brake = both;
        zoneLeftEl.classList.toggle('active', zoneLeftDown);
        zoneRightEl.classList.toggle('active', zoneRightDown);
    };
    const bindZone = (el, setter) => {
        el.addEventListener('touchstart', (e) => {
            e.preventDefault();
            setter(true);
            updateZoneStance();
        });
        const release = (e) => {
            e.preventDefault();
            setter(false);
            updateZoneStance();
        };
        el.addEventListener('touchend', release);
        el.addEventListener('touchcancel', release);
    };
    bindZone(zoneLeftEl, (v) => (zoneLeftDown = v));
    bindZone(zoneRightEl, (v) => (zoneRightDown = v));
}
