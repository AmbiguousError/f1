let selectedTime = 'day'; let selectedLaps = 3; let gameMode = 'single'; let seasonRaces = 3; let selectedDifficulty = 'medium'; let selectedZoom = 2; let selectedCars = 6; let selectedWeather = 'dry'; let useQualifying = false; let isMuted = false; let selectedClass = 'f1'; let selectedControlStyle = 'manual'; let selectedStartTyre = 1; let selectedNoWear = false; let selectedTeamColor = 0xdc0000;

window.setMode = function(mode, el) { gameMode = mode; document.getElementById('mode-single').classList.toggle('selected', mode === 'single'); document.getElementById('mode-season').classList.toggle('selected', mode === 'season'); document.getElementById('row-seed').style.display = mode === 'single' ? 'flex' : 'none'; document.getElementById('row-races').style.display = mode === 'season' ? 'flex' : 'none'; if(el) updateSelection(el); };
window.setClass = function(mode, el) { selectedClass = mode; updateSelection(el); };
window.setRaces = function(num, el) { seasonRaces = num; updateSelection(el); }; window.setCars = function(num, el) { selectedCars = num; updateSelection(el); };
window.setTime = function(mode, el) { selectedTime = mode; updateSelection(el); }; window.setWeather = function(mode, el) { selectedWeather = mode; updateSelection(el); };
window.setQualifying = function(val, el) { useQualifying = val; updateSelection(el); }; window.setLaps = function(num, el) { selectedLaps = num; updateSelection(el); };
window.setDifficulty = function(diff, el) { selectedDifficulty = diff; updateSelection(el); }; window.setZoom = function(z, el) { selectedZoom = z; updateSelection(el); };
window.setControlStyle = function(style, el) { selectedControlStyle = style; updateSelection(el); };
window.setStartTyre = function(idx, el) { if (idx === -1) { selectedNoWear = true; selectedStartTyre = 1; } else { selectedNoWear = false; selectedStartTyre = idx; } updateSelection(el); };
window.setTeam = function(colorHex, el) { selectedTeamColor = colorHex; if (el) { el.parentNode.querySelectorAll('.team-btn').forEach(b => b.classList.remove('selected')); el.classList.add('selected'); } };
function updateSelection(el) { if (!el) return; const btns = el.parentNode.querySelectorAll('.opt-btn'); btns.forEach(b => b.classList.remove('selected')); el.classList.add('selected'); }

window.startGame = function() {
    const seed = document.getElementById('seed-input').value || "MONZA"; const btn = document.getElementById('start-btn'); btn.innerText = "INITIALIZING..."; btn.disabled = true;
    setTimeout(() => { window.dispatchEvent(new CustomEvent('init-game', { detail: { mode: gameMode, seed: seed, time: selectedTime, laps: selectedLaps, seasonLen: seasonRaces, difficulty: selectedDifficulty, zoom: selectedZoom, opponents: selectedCars, weather: selectedWeather, qualifying: useQualifying, carClass: selectedClass, controlStyle: selectedControlStyle, startCompound: selectedStartTyre, noTyreWear: selectedNoWear, teamColor: selectedTeamColor, driverName: (document.getElementById('driver-name-input').value || '').trim() } })); }, 100);
};
window.randomizeSeed = function() {
    const names = window.REAL_TRACK_NAMES;
    if (!names || !names.length) return;
    const pick = names[Math.floor(Math.random() * names.length)];
    document.getElementById('seed-input').value = pick;
};
window.showGuide = function() { document.getElementById('start-screen').style.display = 'none'; document.getElementById('guide-screen').style.display = 'flex'; };
window.hideGuide = function() { document.getElementById('guide-screen').style.display = 'none'; document.getElementById('start-screen').style.display = 'flex'; };
window.resetToMenu = function() { window.dispatchEvent(new Event('reset-game')); }; window.togglePause = function() { window.dispatchEvent(new Event('toggle-pause')); };
window.quitToMenu = function() { window.dispatchEvent(new Event('quit-game')); }; window.handleNext = function() { window.dispatchEvent(new Event('next-action')); };
window.toggleMute = function() { window.dispatchEvent(new Event('toggle-mute')); }; window.toggleCam = function() { window.dispatchEvent(new Event('toggle-cam')); };
