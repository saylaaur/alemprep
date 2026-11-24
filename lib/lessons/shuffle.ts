/** Детерминированное перемешивание: один и тот же вопрос на сервере и в браузере выглядит одинаково. */
function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function order(id: string, n: number): number[] {
  const rnd = mulberry32(seedFrom(id));
  const o = Array.from({ length: n }, (_, i) => i);
  for (let i = o.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [o[i], o[j]] = [o[j], o[i]];
  }
  return o;
}

/** Перемешивает варианты и возвращает новый индекс верного ответа. */
export function shuffleOptions(id: string, options: string[], correct: number): { options: string[]; correct: number } {
  const o = order(id, options.length);
  return { options: o.map((i) => options[i]), correct: o.indexOf(correct) };
}

/** То же для вопроса с несколькими верными ответами: mask — биты верных вариантов (бит i — вариант i). */
export function shuffleMask(id: string, options: string[], mask: number): { options: string[]; correct: number } {
  const o = order(id, options.length);
  const correct = o.reduce((m, from, to) => (mask & (1 << from) ? m | (1 << to) : m), 0);
  return { options: o.map((i) => options[i]), correct };
}
