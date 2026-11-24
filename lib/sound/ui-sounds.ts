/**
 * Звуки интерфейса. Без аудиофайлов: короткие тона рисует Web Audio прямо в браузере,
 * поэтому они ничего не весят и не нужны лицензии. Громкость тихая, длина 30–400 мс.
 */
export type SoundName = 'tap' | 'select' | 'correct' | 'wrong' | 'complete' | 'unlock' | 'on' | 'off' | 'flip';

export const SOUND_STORAGE_KEY = 'alemprep:sound';

type Note = { f: number; to?: number; at: number; dur: number; gain: number; type?: OscillatorType };

/** Рецепты звуков: частоты в герцах, время в секундах. */
export const RECIPES: Record<Exclude<SoundName, 'flip'>, Note[]> = {
  tap: [{ f: 1500, to: 1000, at: 0, dur: 0.04, gain: 0.07, type: 'sine' }],
  select: [{ f: 880, to: 1180, at: 0, dur: 0.07, gain: 0.08, type: 'triangle' }],
  correct: [
    { f: 659.25, at: 0, dur: 0.16, gain: 0.11, type: 'sine' },
    { f: 987.77, at: 0.075, dur: 0.26, gain: 0.11, type: 'sine' },
    { f: 1975.5, at: 0.075, dur: 0.18, gain: 0.025, type: 'sine' },
  ],
  wrong: [
    { f: 207.65, to: 164.81, at: 0, dur: 0.2, gain: 0.13, type: 'triangle' },
    { f: 103.8, to: 82.4, at: 0, dur: 0.2, gain: 0.08, type: 'sine' },
  ],
  complete: [
    { f: 523.25, at: 0, dur: 0.22, gain: 0.1, type: 'sine' },
    { f: 659.25, at: 0.09, dur: 0.22, gain: 0.1, type: 'sine' },
    { f: 783.99, at: 0.18, dur: 0.22, gain: 0.1, type: 'sine' },
    { f: 1046.5, at: 0.27, dur: 0.5, gain: 0.11, type: 'sine' },
  ],
  unlock: [
    { f: 783.99, at: 0, dur: 0.14, gain: 0.08, type: 'sine' },
    { f: 1174.66, at: 0.07, dur: 0.16, gain: 0.08, type: 'sine' },
    { f: 1567.98, at: 0.14, dur: 0.4, gain: 0.08, type: 'sine' },
    { f: 3135.96, at: 0.14, dur: 0.3, gain: 0.02, type: 'sine' },
  ],
  on: [
    { f: 620, at: 0, dur: 0.07, gain: 0.08, type: 'sine' },
    { f: 930, at: 0.06, dur: 0.1, gain: 0.08, type: 'sine' },
  ],
  off: [
    { f: 760, at: 0, dur: 0.07, gain: 0.08, type: 'sine' },
    { f: 500, at: 0.06, dur: 0.1, gain: 0.08, type: 'sine' },
  ],
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.9;
      const soften = ctx.createBiquadFilter();
      soften.type = 'lowpass';
      soften.frequency.value = 5200;
      master.connect(soften).connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

// --- настройка «звук включён» -------------------------------------------------

const listeners = new Set<() => void>();
let cached: boolean | null = null;

export function isSoundEnabled(): boolean {
  if (cached !== null) return cached;
  let on = true;
  try {
    on = window.localStorage.getItem(SOUND_STORAGE_KEY) !== 'off';
  } catch {
    /* нет хранилища — звук включён по умолчанию */
  }
  cached = on;
  return on;
}

export function setSoundEnabled(on: boolean): void {
  cached = on;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* ок */
  }
  listeners.forEach((l) => l());
  if (on) playSound('on', true);
}

export function subscribeSound(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// --- воспроизведение ----------------------------------------------------------

function playNote(c: AudioContext, n: Note, t0: number) {
  const osc = c.createOscillator();
  const g = c.createGain();
  const start = t0 + n.at;
  osc.type = n.type ?? 'sine';
  osc.frequency.setValueAtTime(n.f, start);
  if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, start + n.dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(n.gain, start + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
  osc.connect(g).connect(master!);
  osc.start(start);
  osc.stop(start + n.dur + 0.02);
}

/** Шорох перелистывания: короткий шум через полосовой фильтр. */
function playFlip(c: AudioContext, t0: number) {
  const len = Math.floor(c.sampleRate * 0.09);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(2400, t0);
  bp.frequency.exponentialRampToValueAtTime(900, t0 + 0.09);
  bp.Q.value = 0.9;
  const g = c.createGain();
  g.gain.value = 0.16;
  src.connect(bp).connect(g).connect(master!);
  src.start(t0);
}

/** force=true — играть, даже если звук только что включили (для звука «включено»). */
export function playSound(name: SoundName, force = false): void {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
  if (!force && !isSoundEnabled()) return;
  const c = context();
  if (!c || !master) return;
  const t0 = c.currentTime + 0.005;
  if (name === 'flip') return playFlip(c, t0);
  for (const n of RECIPES[name]) playNote(c, n, t0);
}
