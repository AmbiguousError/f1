let selectedTime = 'day';
let selectedLaps = 3;
let gameMode = 'single';
let seasonRaces = 3;
let selectedDifficulty = 'hard';
let selectedZoom = 1;
let selectedCars = 12;
let selectedWeather = 'dry';
let useQualifying = false;
let isMuted = false;
let selectedClass = 'f1';
let selectedControlStyle = 'auto';
let selectedStartTyre = 1;
let selectedNoWear = false;
let selectedTeamColor = 0xff8700;
let selectedStyle = 'f1';
let selectedSurface = 'tarmac';
let selectedStewardPenalties = false;
let selectedTrackLimits = false;
let selectedDamageEnabled = false;

window.setMode = function (mode, el) {
    gameMode = mode;
    document.getElementById('mode-single').classList.toggle('selected', mode === 'single');
    document.getElementById('mode-season').classList.toggle('selected', mode === 'season');
    document.getElementById('row-seed').style.display = mode === 'single' ? 'flex' : 'none';
    document.getElementById('row-races').style.display = mode === 'season' ? 'flex' : 'none';
    if (el) updateSelection(el);
};
window.setClass = function (mode, el) {
    selectedClass = mode;
    updateSelection(el);
};
window.setRaces = function (num, el) {
    seasonRaces = num;
    updateSelection(el);
};
window.setCars = function (num, el) {
    selectedCars = num;
    updateSelection(el);
};
window.setTime = function (mode, el) {
    selectedTime = mode;
    updateSelection(el);
};
window.setWeather = function (mode, el) {
    selectedWeather = mode;
    updateSelection(el);
};
window.setQualifying = function (val, el) {
    useQualifying = val;
    updateSelection(el);
};
window.setStewardPenalties = function (val, el) {
    selectedStewardPenalties = val;
    updateSelection(el);
};
window.setTrackLimits = function (val, el) {
    selectedTrackLimits = val;
    updateSelection(el);
};
window.setDamageEnabled = function (val, el) {
    selectedDamageEnabled = val;
    updateSelection(el);
};
window.setLaps = function (num, el) {
    selectedLaps = num;
    updateSelection(el);
};
window.setDifficulty = function (diff, el) {
    selectedDifficulty = diff;
    updateSelection(el);
};
window.setZoom = function (z, el) {
    selectedZoom = z;
    updateSelection(el);
};
window.setControlStyle = function (style, el) {
    selectedControlStyle = style;
    updateSelection(el);
};
window.setStartTyre = function (idx) {
    if (idx === -1) {
        selectedNoWear = true;
        selectedStartTyre = 1;
    } else {
        selectedNoWear = false;
        selectedStartTyre = idx;
    }
    updateStartTyreButtons();
    updateStartTyreCard();
};

// Mirrors main.js's selectPitCompound() styling so the start-screen tyre picker looks
// and behaves like the in-pits one: same colored squares, same selected-glow treatment.
function updateStartTyreButtons() {
    const colors = ['#eb2f06', '#f1c40f', '#f5f6fa', '#2ecc71'];
    const textColors = ['#fff', '#000', '#000', '#fff'];
    const ids = ['s', 'm', 'h', 'r'];
    for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`start-tyre-${ids[i]}`);
        if (!btn) continue;
        if (!selectedNoWear && i === selectedStartTyre) {
            btn.style.background = colors[i];
            btn.style.color = textColors[i];
            btn.style.boxShadow = `0 0 10px ${colors[i]}`;
        } else {
            btn.style.background = '#222';
            btn.style.color = colors[i];
            btn.style.boxShadow = 'none';
        }
    }
    const noWearBtn = document.getElementById('start-tyre-nowear');
    if (noWearBtn) {
        if (selectedNoWear) {
            noWearBtn.style.background = '#3498db';
            noWearBtn.style.color = '#fff';
            noWearBtn.style.boxShadow = '0 0 10px #3498db';
        } else {
            noWearBtn.style.background = '#222';
            noWearBtn.style.color = '#3498db';
            noWearBtn.style.boxShadow = 'none';
        }
    }
}
window.setStyle = function (style, el) {
    selectedStyle = style;
    document.getElementById('row-surface').style.display = style === 'rally' ? 'flex' : 'none';
    updateSelection(el);
};
window.setSurface = function (surface, el) {
    selectedSurface = surface;
    updateSelection(el);
};
window.setTeam = function (colorHex, el, name) {
    selectedTeamColor = colorHex;
    if (el) {
        el.parentNode.querySelectorAll('.team-btn').forEach((b) => b.classList.remove('selected'));
        el.classList.add('selected');
    }
    const display = document.getElementById('team-name-display');
    if (display && name) {
        display.innerText = name;
    }
};
function updateSelection(el) {
    if (!el) return;
    const btns = el.parentNode.querySelectorAll('.opt-btn');
    btns.forEach((b) => b.classList.remove('selected'));
    el.classList.add('selected');
}

window.startGame = function () {
    const seed =
        (document.getElementById('seed-input').value || '')
            .replace(/[^A-Za-z0-9 _.\-]/g, '')
            .trim()
            .substring(0, 12) || 'MONZA';
    const btn = document.getElementById('start-btn');
    btn.innerText = 'INITIALIZING...';
    btn.disabled = true;
    setTimeout(() => {
        window.dispatchEvent(
            new CustomEvent('init-game', {
                detail: {
                    mode: gameMode,
                    seed: seed,
                    time: selectedTime,
                    laps: selectedLaps,
                    seasonLen: seasonRaces,
                    difficulty: selectedDifficulty,
                    zoom: selectedZoom,
                    opponents: selectedCars,
                    weather: selectedWeather,
                    qualifying: useQualifying,
                    carClass: selectedClass,
                    controlStyle: selectedControlStyle,
                    startCompound: selectedStartTyre,
                    noTyreWear: selectedNoWear,
                    stewardPenalties: selectedStewardPenalties,
                    trackLimits: selectedTrackLimits,
                    damageEnabled: selectedDamageEnabled,
                    teamColor: selectedTeamColor,
                    driverName: (document.getElementById('driver-name-input').value || '').trim(),
                    raceStyle: selectedStyle,
                    surface: selectedSurface,
                },
            })
        );
    }, 100);
};
window.randomizeSeed = function () {
    const names = window.REAL_TRACK_NAMES;
    if (!names || !names.length) return;
    const pick = names[Math.floor(Math.random() * names.length)];
    document.getElementById('seed-input').value = pick;
};
window.showGuide = function () {
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('guide-screen').style.display = 'flex';
};
window.hideGuide = function () {
    document.getElementById('guide-screen').style.display = 'none';
    document.getElementById('start-screen').style.display = 'flex';
};
window.resetToMenu = function () {
    window.dispatchEvent(new Event('reset-game'));
};
window.togglePause = function () {
    window.dispatchEvent(new Event('toggle-pause'));
};
window.restartRace = function () {
    window.dispatchEvent(new Event('restart-race'));
};
window.quitToMenu = function () {
    window.dispatchEvent(new Event('quit-game'));
};
window.handleNext = function () {
    window.dispatchEvent(new Event('next-action'));
};
window.toggleMute = function () {
    window.dispatchEvent(new Event('toggle-mute'));
};
window.toggleCam = function () {
    window.dispatchEvent(new Event('toggle-cam'));
};

function updateStartTyreCard() {
    const card = document.getElementById('tyre-desc-card');
    if (!card) return;
    if (selectedNoWear) {
        card.innerHTML = `<span style="color: #fff; font-weight: bold;">NO TYRE WEAR ACTIVE</span><br>Tyres remain at 100% life for the entire race.`;
        return;
    }
    const comps = [
        { name: 'SOFT', grip: '★★★★★ (105% Speed)', life: '★★☆☆☆ (High Wear)', desc: 'Fastest pace, but degrades quickly.' },
        { name: 'MEDIUM', grip: '★★★★☆ (100% Speed)', life: '★★★☆☆ (Balanced)', desc: 'Optimal balance of speed and durability.' },
        { name: 'HARD', grip: '★★★☆☆ (95% Speed)', life: '★★★★★ (Long Stint)', desc: 'Slower pace, but highly durable.' },
        { name: 'RALLY', grip: '★★★☆☆ (Specialized)', life: '★★★★☆ (All-Terrain)', desc: 'Maximum traction on dirt, mud, and snow.' }
    ];
    const info = comps[selectedStartTyre];
    card.innerHTML = `<span style="color: #e74c3c; font-weight: bold; letter-spacing: 1px;">${info.name} COMPOUND SELECTED</span><br>Grip: <span style="color: #f1c40f;">${info.grip}</span> &middot; Life: <span style="color: #2ecc71;">${info.life}</span><br><span style="color: #888; font-size: 10px; font-style: italic;">${info.desc}</span>`;
}

// Initialize on page load
setTimeout(() => {
    updateStartTyreButtons();
    updateStartTyreCard();
}, 100);

