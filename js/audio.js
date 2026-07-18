import { state, cfg, inputs } from './state.js';

export function setupAudio() {
    try {
        const AC = window.AudioContext || window.webkitAudioContext; state.audioCtx = new AC();
        state.engineOsc = state.audioCtx.createOscillator(); state.engineOsc.type = 'sawtooth'; state.engineOsc.frequency.value = 60; state.engineGain = state.audioCtx.createGain(); state.engineGain.gain.value = 0.1;
        state.turboOsc = state.audioCtx.createOscillator(); state.turboOsc.type = 'square'; state.turboOsc.frequency.value = 80; state.turboGain = state.audioCtx.createGain(); state.turboGain.gain.value = 0.05;
        state.skidOsc = state.audioCtx.createOscillator(); state.skidOsc.type = 'sawtooth'; state.skidOsc.frequency.value = 800; state.skidGain = state.audioCtx.createGain(); state.skidGain.gain.value = 0;
        const filter = state.audioCtx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 4000;
        state.engineOsc.connect(state.engineGain); state.turboOsc.connect(state.turboGain); state.engineGain.connect(filter); state.turboGain.connect(filter);
        const skidFilter = state.audioCtx.createBiquadFilter(); skidFilter.type = "bandpass"; skidFilter.frequency.value = 1000;
        state.skidOsc.connect(state.skidGain); state.skidGain.connect(skidFilter); skidFilter.connect(state.audioCtx.destination); filter.connect(state.audioCtx.destination);
        state.engineOsc.start(); state.turboOsc.start(); state.skidOsc.start();
    } catch (e) { console.warn("Audio fail"); }
}

export function updateAudio(speed) {
    if (!state.audioCtx) return; const kph = speed * 3.6; let skidVol = 0;
    if (kph > 30) { if (Math.abs(state.currentSteer) > 0.3 && kph > 80) skidVol = (Math.abs(state.currentSteer) - 0.3) * 0.5; if (inputs.brake && kph > 100) skidVol = Math.max(skidVol, 0.3); if (state.inSand) skidVol = 0.6; }
    if (skidVol > 0.5) skidVol = 0.5;
    const skidPitch = 800 + (Math.random() * 200); state.skidOsc.frequency.setTargetAtTime(skidPitch, state.audioCtx.currentTime, 0.1); state.skidGain.gain.setTargetAtTime(skidVol, state.audioCtx.currentTime, 0.1);
    const isMini = cfg.carClass === 'mini'; let gear, rpm, frequency;
    if (isMini) { gear = Math.min(4, Math.max(1, Math.ceil(kph / 35))); const gearMin = (gear - 1) * 35; const gearMax = gear * 35; rpm = (kph - gearMin) / (gearMax - gearMin); frequency = 30 + (rpm * 120) + (gear * 10); }
    else { gear = Math.min(8, Math.max(1, Math.ceil(kph / 45))); const gearMin = (gear - 1) * 45; const gearMax = gear * 45; rpm = (kph - gearMin) / (gearMax - gearMin); frequency = 50 + (rpm * 200) + (gear * 15); }
    if (rpm < 0.2) rpm = 0.2; if (rpm > 1.0) rpm = 1.0;
    state.engineOsc.frequency.setTargetAtTime(frequency, state.audioCtx.currentTime, 0.1); const harmonic = isMini ? 0.5 : 1.33; state.turboOsc.frequency.setTargetAtTime(frequency * harmonic, state.audioCtx.currentTime, 0.1);
    let vol = (inputs.up) ? 0.25 : 0.1; if (rpm < 0.3 && gear > 1) vol *= 0.5; if (state.raceState === 'finished') vol = 0.05; state.engineGain.gain.setTargetAtTime(vol, state.audioCtx.currentTime, 0.1);
    state.turboGain.gain.setTargetAtTime(state.raceState === 'finished' ? 0.015 : 0.05, state.audioCtx.currentTime, 0.1);
}
