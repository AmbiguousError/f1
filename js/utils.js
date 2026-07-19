export function createRNG(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    let a = h;
    return function () {
        var t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function pitEase(x) {
    x = Math.max(0, Math.min(1, x));
    return x * x * (3 - 2 * x);
}

export function formatTime(ms) {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const msVal = Math.floor((ms % 1000) / 10);
    return `${mins}:${secs < 10 ? '0' + secs : secs}.${msVal < 10 ? '0' + msVal : msVal}`;
}
