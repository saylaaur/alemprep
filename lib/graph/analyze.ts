/**
 * Numeric analysis for the native graph: sampling with break detection,
 * roots, extrema, vertical asymptotes, intersections, inequality intervals
 * and an automatic viewport. Pure functions, unit-tested in analyze.test.ts.
 */

export type RealFn = (x: number) => number;
export type Viewport = { xmin: number; xmax: number; ymin: number; ymax: number };
export type KeyPointKind = 'root' | 'y-intercept' | 'max' | 'min' | 'intersection' | 'asymptote';
export type KeyPoint = { kind: KeyPointKind; x: number; y: number; curves: number[] };
export type Interval = { from: number; to: number; fromClosed: boolean; toClosed: boolean };
export type Relation = '=' | '<' | '>' | '<=' | '>=' | '!=';

const finite = (value: number) => Number.isFinite(value);

/** Samples [a, b] into polyline segments, breaking at gaps and jumps. */
export function sampleSegments(fn: RealFn, a: number, b: number, count: number, yLimit: number): { x: number; y: number }[][] {
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  let previous: { x: number; y: number } | null = null;
  const step = (b - a) / count;
  const close = () => { if (current.length > 1) segments.push(current); current = []; };
  const clampY = (y: number) => Math.max(-yLimit * 4, Math.min(yLimit * 4, y));
  // Where the domain starts or ends (√x at 0, a circle's left and right edge), find the
  // last defined point so the line reaches the edge instead of stopping a pixel short.
  const edge = (defined: number, undefinedX: number) => {
    let inside = defined; let outside = undefinedX;
    for (let iteration = 0; iteration < 40; iteration++) {
      const middle = (inside + outside) / 2;
      if (finite(fn(middle))) inside = middle; else outside = middle;
    }
    const y = fn(inside);
    return finite(y) && Math.abs(y) <= yLimit * 4 ? { x: inside, y } : null;
  };
  let lastUndefined: number | null = null;
  for (let index = 0; index <= count; index++) {
    const x = a + index * step;
    const y = fn(x);
    if (!finite(y)) {
      if (previous) { const end = edge(previous.x, x); if (end) current.push({ x: end.x, y: clampY(end.y) }); }
      close(); previous = null; lastUndefined = x; continue;
    }
    if (!previous && lastUndefined !== null) {
      const start = edge(x, lastUndefined);
      if (start) current.push({ x: start.x, y: clampY(start.y) });
    }
    if (previous) {
      const jump = Math.abs(y - previous.y);
      if (jump > yLimit * 0.5) {
        // A real curve passes through the midpoint value; an asymptote or a
        // jump does not (the middle is outside the end values or undefined).
        const middle = fn((x + previous.x) / 2);
        const low = Math.min(y, previous.y); const high = Math.max(y, previous.y);
        if (!finite(middle) || middle < low - 1e-9 * jump || middle > high + 1e-9 * jump || Math.sign(y) !== Math.sign(previous.y) && jump > yLimit * 2) close();
      }
    }
    current.push({ x, y: clampY(y) });
    previous = { x, y };
  }
  close();
  return segments;
}

function bisect(fn: RealFn, left: number, right: number, leftValue: number): number {
  let a = left; let b = right; let fa = leftValue;
  for (let iteration = 0; iteration < 80; iteration++) {
    const middle = (a + b) / 2;
    const fm = fn(middle);
    // Landed exactly on a pole (x = −1 in 1/(x+1)): the caller classifies it.
    if (!finite(fm)) return middle;
    if (fm === 0) return middle;
    if (Math.sign(fm) === Math.sign(fa)) { a = middle; fa = fm; } else b = middle;
  }
  return (a + b) / 2;
}

/** Golden-section search for a local minimum of `fn` on [a, b]. */
function goldenMin(fn: RealFn, a: number, b: number): number {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let left = a; let right = b;
  let c = right - ratio * (right - left); let d = left + ratio * (right - left);
  let fc = fn(c); let fd = fn(d);
  for (let iteration = 0; iteration < 80; iteration++) {
    if (fc < fd) { right = d; d = c; fd = fc; c = right - ratio * (right - left); fc = fn(c); }
    else { left = c; c = d; fc = fd; d = left + ratio * (right - left); fd = fn(d); }
  }
  return (left + right) / 2;
}

/** Rounds values that are within floating noise of a "nice" number. */
export function snap(value: number): number {
  if (!finite(value)) return value;
  if (Math.abs(value) < 1e-9) return 0;
  for (const denominator of [1, 2, 3, 4, 5, 6, 8, 10, 12, 100]) {
    const scaled = value * denominator;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-7 * Math.max(1, Math.abs(scaled))) return Math.round(scaled) / denominator || 0;
  }
  const overPi = value / Math.PI;
  for (const denominator of [1, 2, 3, 4, 6, 12]) {
    const scaled = overPi * denominator;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-7) return (Math.round(scaled) / denominator) * Math.PI;
  }
  return value;
}

function dedupe(values: number[], tolerance: number): number[] {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  const result: number[] = [];
  for (const value of sorted) if (!result.length || value - result[result.length - 1] > tolerance) result.push(value);
  return result;
}

export type Analysis = { roots: number[]; asymptotes: number[]; maxima: number[]; minima: number[] };

/**
 * Finds zeros (sign changes and touching zeros), vertical asymptotes (sign
 * changes or domain edges where |f| blows up) and local extrema on [a, b].
 */
export function analyze(fn: RealFn, a: number, b: number, count = 2000): Analysis {
  const step = (b - a) / count;
  const xs: number[] = []; const ys: number[] = [];
  for (let index = 0; index <= count; index++) { const x = a + index * step; xs.push(x); ys.push(fn(x)); }
  const finiteValues = ys.filter(finite).map(Math.abs).sort((left, right) => left - right);
  const scale = Math.max(1, finiteValues[Math.floor(finiteValues.length * 0.9)] ?? 1);
  const roots: number[] = []; const asymptotes: number[] = []; const maxima: number[] = []; const minima: number[] = [];
  const blowUp = (x: number, direction: 1 | -1) => {
    // Approach x from one side: |f| must keep growing past the visible scale.
    // Poles grow faster and faster; logarithms by a steady amount; a finite
    // edge value (√x at 0) converges, so its increments collapse.
    const values = [1e-3, 1e-5, 1e-7].map((distance) => Math.abs(fn(x + direction * distance * Math.max(1, Math.abs(x)))));
    if (!values.every(finite)) return false;
    const first = values[1] - values[0]; const second = values[2] - values[1];
    return first > 0 && second >= first * 0.5 && values[2] > scale * 2;
  };
  for (let index = 1; index <= count; index++) {
    const y0 = ys[index - 1]; const y1 = ys[index];
    if (finite(y0) && finite(y1)) {
      if (y0 === 0) { roots.push(xs[index - 1]); continue; }
      if (Math.sign(y0) !== Math.sign(y1) && y1 !== 0) {
        const x = bisect(fn, xs[index - 1], xs[index], y0);
        if (!finite(x)) continue;
        const value = Math.abs(fn(x));
        if (finite(value) && value < 1e-6 * Math.max(Math.abs(y0), Math.abs(y1))) roots.push(x);
        else if (blowUp(x, -1) || blowUp(x, 1)) asymptotes.push(x);
      }
    } else if (finite(y0) !== finite(y1)) {
      // Domain edge: refine where the function stops being defined.
      let inside = finite(y0) ? xs[index - 1] : xs[index];
      let outside = finite(y0) ? xs[index] : xs[index - 1];
      for (let iteration = 0; iteration < 60; iteration++) {
        const middle = (inside + outside) / 2;
        if (finite(fn(middle))) inside = middle; else outside = middle;
      }
      const direction = inside < outside ? -1 : 1;
      // √x reaches 0 at its edge; x·ln x only tends to 0, and x = 0 is not in its domain.
      const edge = snap(inside); const edgeValue = fn(edge);
      const edgeScale = Math.max(...[y0, y1].filter(finite).map(Math.abs));
      if (finite(edgeValue) && (edgeValue === 0 || Math.abs(edgeValue) < 1e-6 * edgeScale)) roots.push(edge);
      else if (blowUp(outside, direction as 1 | -1)) asymptotes.push(outside);
    }
  }
  for (let index = 1; index < count; index++) {
    const [y0, y1, y2] = [ys[index - 1], ys[index], ys[index + 1]];
    if (!finite(y0) || !finite(y1) || !finite(y2)) continue;
    const isMax = y1 >= y0 && y1 >= y2 && (y1 > y0 || y1 > y2);
    const isMin = y1 <= y0 && y1 <= y2 && (y1 < y0 || y1 < y2);
    if (!isMax && !isMin) continue;
    const left = xs[index - 1]; const right = xs[index + 1];
    const x = isMin ? goldenMin(fn, left, right) : goldenMin((value) => -fn(value), left, right);
    const y = fn(x);
    if (!finite(y) || Math.abs(y) > scale * 20) continue;
    // Skip corners produced by an asymptote or a domain edge in the window.
    if (asymptotes.some((asymptote) => Math.abs(asymptote - x) < step * 3)) continue;
    if (!finite(fn(x - step)) || !finite(fn(x + step))) continue;
    (isMax ? maxima : minima).push(x);
    // Touching zero (x² at 0): the extremum value is the root.
    // Distant large values must not turn a positive local minimum into a zero.
    // Local scaling also preserves this check when the whole function is tiny.
    const rootScale = Math.max(Math.abs(y0), Math.abs(y1), Math.abs(y2));
    if (y === 0 || Math.abs(y) < 1e-9 * rootScale) roots.push(x);
  }
  const tolerance = step * 2;
  return {
    roots: dedupe(roots, tolerance).map(snap),
    asymptotes: dedupe(asymptotes, tolerance).map(snap),
    maxima: dedupe(maxima, tolerance).map(snap),
    minima: dedupe(minima, tolerance).map(snap),
  };
}

/** Plateaus (constant pieces such as |x-1|+|x+1| on [-1;1]) are not extrema. */
function isStrictExtremum(fn: RealFn, x: number, span: number): boolean {
  const delta = span / 400;
  const y = fn(x);
  return Math.abs(fn(x - delta) - y) > 1e-9 * Math.max(1, Math.abs(y)) && Math.abs(fn(x + delta) - y) > 1e-9 * Math.max(1, Math.abs(y));
}

/** Key points of one or more curves inside a window. */
export function keyPoints(fns: RealFn[], window: { xmin: number; xmax: number }): KeyPoint[] {
  const points: KeyPoint[] = [];
  const span = window.xmax - window.xmin;
  fns.forEach((fn, curve) => {
    const result = analyze(fn, window.xmin, window.xmax);
    const constant = isConstant(fn, window);
    if (!constant) result.roots.forEach((x) => points.push({ kind: 'root', x, y: 0, curves: [curve] }));
    const y0 = fn(0);
    if (finite(y0) && window.xmin <= 0 && window.xmax >= 0 && !constant) points.push({ kind: 'y-intercept', x: 0, y: snap(y0), curves: [curve] });
    result.maxima.filter((x) => isStrictExtremum(fn, x, span)).forEach((x) => points.push({ kind: 'max', x, y: snap(fn(x)), curves: [curve] }));
    result.minima.filter((x) => isStrictExtremum(fn, x, span)).forEach((x) => points.push({ kind: 'min', x, y: snap(fn(x)), curves: [curve] }));
    result.asymptotes.forEach((x) => points.push({ kind: 'asymptote', x, y: NaN, curves: [curve] }));
  });
  for (let first = 0; first < fns.length; first++) {
    for (let second = first + 1; second < fns.length; second++) {
      const difference = (x: number) => fns[first](x) - fns[second](x);
      if (isConstant(difference, window)) continue;
      for (const x of analyze(difference, window.xmin, window.xmax).roots) {
        points.push({ kind: 'intersection', x, y: snap(fns[first](x)), curves: [first, second] });
      }
    }
  }
  // One marker per location: an intersection on the x-axis is also a root.
  const unique: KeyPoint[] = [];
  for (const point of points) {
    const twin = unique.find((other) => other.kind !== 'asymptote' && point.kind !== 'asymptote' && Math.abs(other.x - point.x) < span * 1e-4 && Math.abs(other.y - point.y) < 1e-6 * Math.max(1, Math.abs(point.y)));
    if (twin) { twin.curves = [...new Set([...twin.curves, ...point.curves])]; continue; }
    if (point.kind === 'asymptote' && unique.some((other) => other.kind === 'asymptote' && Math.abs(other.x - point.x) < span * 1e-4)) continue;
    unique.push(point);
  }
  return unique.sort((left, right) => left.x - right.x);
}

function isConstant(fn: RealFn, window: { xmin: number; xmax: number }): boolean {
  const values: number[] = [];
  for (let index = 0; index <= 16; index++) values.push(fn(window.xmin + (index / 16) * (window.xmax - window.xmin) + 1e-3));
  const defined = values.filter(finite);
  return defined.length > 2 && defined.every((value) => Math.abs(value - defined[0]) < 1e-9 * Math.max(1, Math.abs(defined[0])));
}

/**
 * Whether `fn` keeps one sign (or stays undefined) beyond ±limit, probed out to
 * ±1e6, with refinement of possible touching zeros between probes. This is
 * a numerical guard, not a proof of completeness for arbitrary functions.
 */
export function settlesBeyond(fn: RealFn, limit: number, far = 1e6): boolean {
  const state = (x: number) => {
    const value = fn(x);
    // Overflow (2^x → ∞) keeps its sign; only NaN is outside the domain.
    if (Number.isNaN(value)) return 'u';
    // Only an exact zero counts: (x + 4)/((x − 1)(x + 2)) is 1e-6 at 1e6 and still positive.
    if (value === 0) return '0';
    return value > 0 ? '+' : '-';
  };
  const start = limit * 0.99;
  const steps = 400;
  const ratio = Math.pow(far / start, 1 / steps);
  for (const side of [1, -1]) {
    const first = state(side * start);
    let x = start;
    const samples: { x: number; y: number }[] = [{ x, y: Math.abs(fn(side * x)) }];
    for (let index = 0; index < steps; index++) {
      x *= ratio;
      if (state(side * x) !== first) return false;
      samples.push({ x, y: Math.abs(fn(side * x)) });
      if (samples.length > 3) samples.shift();
      if (samples.length === 3) {
        const [left, middle, right] = samples;
        if ([left.y, middle.y, right.y].every(finite)
          && middle.y <= left.y && middle.y <= right.y
          && (middle.y < left.y || middle.y < right.y)) {
          // A double root never changes sign, so sign probes alone miss it.
          const absolute = (value: number) => Math.abs(fn(side * value));
          const candidate = goldenMin(absolute, left.x, right.x);
          const residual = absolute(candidate);
          const localScale = Math.max(left.y, middle.y, right.y);
          if (finite(residual) && (residual === 0 || residual < 1e-9 * localScale)) return false;
        }
      }
    }
  }
  return true;
}

/** Where `left(x) relation right(x)` holds inside the window, as intervals. */
export function solveRelation(left: RealFn, relation: Relation, right: RealFn, window: { xmin: number; xmax: number }): Interval[] {
  const difference = (x: number) => left(x) - right(x);
  // Expanding a task window must not coarsen the original +/-60 sampling
  // resolution and merge nearby roots. Bound work for arbitrary user input.
  const samples = Math.min(100_000, Math.max(2000, Math.ceil((window.xmax - window.xmin) / 0.06)));
  const { roots, asymptotes } = analyze(difference, window.xmin, window.xmax, samples);
  if (relation === '=') return roots.map((x) => ({ from: x, to: x, fromClosed: true, toClosed: true }));
  const holds = (raw: number) => {
    if (!finite(raw)) return false;
    const value = Math.abs(raw) < 1e-9 ? 0 : raw;
    switch (relation) {
      case '<': return value < 0; case '<=': return value <= 0; case '>': return value > 0;
      case '>=': return value >= 0; default: return value !== 0;
    }
  };
  const inclusive = relation === '<=' || relation === '>=';
  // Domain edges also split intervals (ln x > 0 starts at x = 1, sqrt starts at its edge).
  const edges: number[] = [];
  const count = 1000;
  let previousDefined = finite(difference(window.xmin));
  for (let index = 1; index <= count; index++) {
    const x = window.xmin + (index / count) * (window.xmax - window.xmin);
    const defined = finite(difference(x));
    if (defined !== previousDefined) {
      let a = x - (window.xmax - window.xmin) / count; let b = x;
      for (let iteration = 0; iteration < 60; iteration++) {
        const middle = (a + b) / 2;
        if (finite(difference(middle)) === previousDefined) a = middle; else b = middle;
      }
      edges.push(snap(previousDefined ? a : b));
    }
    previousDefined = defined;
  }
  const breaks = dedupe([window.xmin, ...roots, ...asymptotes, ...edges, window.xmax], 1e-9);
  const intervals: Interval[] = [];
  for (let index = 1; index < breaks.length; index++) {
    const from = breaks[index - 1]; const to = breaks[index];
    if (!holds(difference((from + to) / 2))) continue;
    const closedAt = (x: number) => holds(difference(x)) && x !== window.xmin && x !== window.xmax;
    const last = intervals[intervals.length - 1];
    if (last && last.to === from && holds(difference(from))) { last.to = to; last.toClosed = closedAt(to); continue; }
    intervals.push({ from, to, fromClosed: closedAt(from), toClosed: closedAt(to) });
  }
  if (inclusive) {
    // Isolated points such as (x-1)² <= 0 → x = 1.
    for (const root of roots) {
      if (!intervals.some((interval) => interval.from <= root && root <= interval.to)) intervals.push({ from: root, to: root, fromClosed: true, toClosed: true });
    }
    intervals.sort((first, second) => first.from - second.from);
  }
  return intervals;
}

/** Simpson's rule; NaN when the integrand is undefined somewhere on [a, b]. */
export function integrate(fn: RealFn, a: number, b: number, count = 2000): number {
  const n = count % 2 ? count + 1 : count;
  const h = (b - a) / n;
  let sum = fn(a) + fn(b);
  for (let index = 1; index < n; index++) sum += fn(a + index * h) * (index % 2 ? 4 : 2);
  const value = (sum * h) / 3;
  return finite(value) ? value : NaN;
}

/** Picks a window that shows every interesting point with some margin. */
export function autoViewport(fns: RealFn[], options: { trig?: boolean; equalAspect?: boolean; focus?: number[]; aspect?: number } = {}): Viewport {
  const aspect = options.aspect ?? 0.8;
  let xmin: number; let xmax: number;
  // Focus points and intersections must stay inside the y-range too.
  const marked = [...(options.focus ?? [])];
  if (options.trig) { xmin = -2 * Math.PI; xmax = 2 * Math.PI; }
  else {
    const xs: number[] = [...(options.focus ?? [])];
    for (const fn of fns) {
      const result = analyze(fn, -20, 20, 1600);
      xs.push(...result.roots, ...result.asymptotes, ...result.maxima, ...result.minima);
      // Where does the function exist at all? (√x, ln x live on one side.)
      const defined = [-6, -3, -1, 1, 3, 6].filter((x) => finite(fn(x)));
      if (defined.length && defined.length < 6) xs.push(...defined);
    }
    for (let first = 0; first < fns.length; first++) {
      for (let second = first + 1; second < fns.length; second++) {
        // Solutions of a system or an equation can lie further out (x/8 + y/4 = 5 and x/15 − y/5 = 1 meet at x = 30).
        // Two branches of one circle "meet" where the circle ends; points at a domain edge are not crossings.
        const inside = (x: number) => [fns[first], fns[second]].every((fn) => [-1, 1].every((side) => finite(fn(x + side * 1e-6 * Math.max(1, Math.abs(x))))));
        const crossings = analyze((x) => fns[first](x) - fns[second](x), -60, 60, 4800).roots.filter(inside);
        xs.push(...crossings); marked.push(...crossings);
      }
    }
    // Points the task names (segment ends, integral limits) are always shown.
    const near = [...xs.slice(options.focus?.length ?? 0).filter((x) => Math.abs(x) <= 20), ...(options.focus ?? []).filter(finite), ...marked.filter((x) => finite(x) && Math.abs(x) <= 60)];
    if (!near.length) { xmin = -5; xmax = 5; }
    else {
      const low = Math.min(0, ...near); const high = Math.max(0, ...near);
      const span = Math.max(6, high - low);
      const pad = span * 0.25;
      xmin = Math.floor(low - pad); xmax = Math.ceil(high + pad);
      if (xmax - xmin < 8) { const middle = (xmin + xmax) / 2; xmin = Math.floor(middle - 4); xmax = Math.ceil(middle + 4); }
    }
  }
  const values: number[] = [0];
  for (const fn of fns) {
    for (let index = 0; index <= 400; index++) {
      const value = fn(xmin + (index / 400) * (xmax - xmin));
      if (finite(value)) values.push(value);
    }
  }
  values.sort((a, b) => a - b);
  // Robust range: ignore the extreme 4% so asymptotes do not flatten the picture.
  let ymin = Math.min(0, values[Math.floor(values.length * 0.04)]);
  let ymax = Math.max(0, values[Math.ceil(values.length * 0.96) - 1]);
  for (const fn of fns) {
    for (const x of marked) { const value = fn(x); if (finite(value) && Math.abs(value) < 1e6) { ymin = Math.min(ymin, value); ymax = Math.max(ymax, value); } }
    const { maxima, minima } = analyze(fn, xmin, xmax, 800);
    for (const x of [...maxima, ...minima]) { const value = fn(x); if (finite(value) && Math.abs(value) < 1e6) { ymin = Math.min(ymin, value); ymax = Math.max(ymax, value); } }
  }
  // Keep the interesting points large: clip tall branches to a few times their spread.
  const core: number[] = [0];
  for (const fn of fns) {
    for (const x of marked) { const value = fn(x); if (finite(value) && Math.abs(value) < 1e6) core.push(value); }
    const result = analyze(fn, xmin, xmax, 800);
    for (const x of [...result.maxima, ...result.minima]) { const value = fn(x); if (finite(value) && Math.abs(value) < 1e6) core.push(value); }
  }
  // Oy intercepts count unless one is far off the rest (13^(4−x) at 0 is 28 560 while the system's points are near 8).
  const restSpan = Math.max(2, Math.max(...core) - Math.min(...core));
  const hasOtherFeatures = core.some((value) => value !== 0);
  for (const fn of fns) {
    const value = fn(0);
    if (finite(value) && (!hasOtherFeatures || Math.abs(value) <= Math.max(...core.map(Math.abs)) + restSpan * 10)) core.push(value);
  }
  const coreLow = Math.min(...core); const coreHigh = Math.max(...core);
  const coreSpan = Math.max(2, coreHigh - coreLow);
  ymin = Math.max(ymin, coreLow - coreSpan * 1.5);
  ymax = Math.min(ymax, coreHigh + coreSpan * 1.5);
  // Extrema and intercepts never sit on the edge of the picture.
  ymin = Math.min(ymin, coreLow - coreSpan * 0.2);
  ymax = Math.max(ymax, coreHigh + coreSpan * 0.2);
  if (ymax - ymin < 2) { ymax += 1; ymin -= 1; }
  const pad = (ymax - ymin) * 0.15;
  ymin -= pad; ymax += pad;
  if (options.equalAspect) {
    const ySpan = (xmax - xmin) * aspect;
    if (ySpan >= ymax - ymin) { const middle = (ymin + ymax) / 2; ymin = middle - ySpan / 2; ymax = middle + ySpan / 2; }
    else { const xSpan = (ymax - ymin) / aspect; const middle = (xmin + xmax) / 2; xmin = middle - xSpan / 2; xmax = middle + xSpan / 2; }
  }
  return { xmin, xmax, ymin, ymax };
}

/** Grid step with 1-2-5 spacing so that labels stay at least `minPixels` apart. */
export function niceStep(span: number, pixels: number, minPixels = 48): number {
  const raw = (span * minPixels) / Math.max(1, pixels);
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const factor of [1, 2, 5, 10]) if (factor * power >= raw) return factor * power;
  return 10 * power;
}

/** π-based step (π/6 … 4π) for trigonometric graphs. */
export function piStep(span: number, pixels: number, minPixels = 48): number | null {
  const raw = (span * minPixels) / Math.max(1, pixels);
  for (const factor of [1 / 6, 1 / 4, 1 / 2, 1, 2, 4]) if (factor * Math.PI >= raw) return factor * Math.PI;
  return null;
}

/**
 * School formatting: decimal comma, up to two decimals, multiples of π as
 * fractions ("π/2", "−3π/4"), and "−" for minus.
 */
export function formatNumber(value: number, options: { pi?: boolean } = {}): string {
  if (!finite(value)) return '—';
  const snapped = snap(value);
  if (options.pi !== false) {
    const overPi = snapped / Math.PI;
    for (const denominator of [1, 2, 3, 4, 6]) {
      const numerator = overPi * denominator;
      if (Math.abs(numerator - Math.round(numerator)) < 1e-8 && Math.round(numerator) !== 0) {
        const n = Math.round(numerator);
        const sign = n < 0 ? '−' : '';
        const magnitude = Math.abs(n) === 1 ? '' : String(Math.abs(n));
        return `${sign}${magnitude}π${denominator === 1 ? '' : `/${denominator}`}`;
      }
    }
  }
  for (const denominator of [3, 6, 7, 9]) {
    const numerator = snapped * denominator;
    if (Math.abs(numerator - Math.round(numerator)) < 1e-9 && Math.abs(Math.round(numerator) / denominator * 100 % 1) > 1e-6) {
      const n = Math.round(numerator);
      return `${n < 0 ? '−' : ''}${Math.abs(n)}/${denominator}`;
    }
  }
  const rounded = Math.round(snapped * 100) / 100;
  const text = (Object.is(rounded, -0) ? 0 : rounded).toString();
  return text.replace('-', '−').replace('.', ',');
}

export function formatPoint(x: number, y: number): string {
  return `(${formatNumber(x)}; ${formatNumber(y)})`;
}

/** "(−∞; 1) ∪ [3; +∞)" in school notation. */
export function formatIntervals(intervals: Interval[], window: { xmin: number; xmax: number }): string {
  if (!intervals.length) return '∅';
  const parts: string[] = [];
  let points: string[] = [];
  // Neighbouring single points are one set: {−2; 2}, not {−2} ∪ {2}.
  const flush = () => { if (points.length) parts.push(`{${points.join('; ')}}`); points = []; };
  for (const interval of intervals) {
    if (interval.from === interval.to) { points.push(formatNumber(interval.from)); continue; }
    flush();
    const left = interval.from <= window.xmin ? '(−∞' : `${interval.fromClosed ? '[' : '('}${formatNumber(interval.from)}`;
    const right = interval.to >= window.xmax ? '+∞)' : `${formatNumber(interval.to)}${interval.toClosed ? ']' : ')'}`;
    parts.push(`${left}; ${right}`);
  }
  flush();
  return parts.join(' ∪ ');
}
