/**
 * Everything the review graph shows for one stem, computed without React so it
 * can be unit-tested: curves, window, key points, solution text and shading.
 */
import { autoViewport, formatIntervals, formatNumber, integrate, keyPoints, settlesBeyond, solveRelation, type Interval, type KeyPoint, type Viewport } from './analyze';
import { extractTaskGraph, type TaskGraph } from './extract';

const MAX_MARKERS = 10;
/** Half-widths tried in turn for the written answer; beyond the last one the answer is left to the picture. */
const SOLUTION_LIMITS = [60, 1000];

export type TaskModel = {
  graph: TaskGraph;
  view: Viewport;
  visible: KeyPoint[];
  asymptotes: number[];
  shade: Interval[] | undefined;
  solution: string | null;
  integral: number;
  /** Curve index of every branch (a circle has two branches). */
  owner: number[];
};

function sameIntervals(left: Interval[], right: Interval[], inner: { xmin: number; xmax: number }) {
  const clip = (list: Interval[]) => list.filter((interval) => interval.to > inner.xmin && interval.from < inner.xmax)
    .map((interval) => `${interval.from <= inner.xmin ? '-' : interval.from.toFixed(6)}|${interval.to >= inner.xmax ? '+' : interval.to.toFixed(6)}|${interval.fromClosed}|${interval.toClosed}`).join(',');
  return clip(left) === clip(right) && left.length === right.length;
}

/** Null when the stem has nothing to draw; never throws, so a stem cannot break the review screen. */
export function buildTaskModel(stem: string, stemBlocks?: unknown): TaskModel | null {
  try {
    const graph = extractTaskGraph(stem, stemBlocks);
    if (!graph) return null;
    const fns = graph.curves.flatMap((curve) => curve.branches);
    let solution: string | null = null;
    // Every solution the text names must also be on the picture (ln²x − 3 ln x = 0 → 1 and e³ ≈ 20,09).
    const solutionPoints: number[] = [];
    const relation = graph.relation;
    const left = relation ? graph.curves[relation.left].branches[0] : null;
    const right = relation ? (relation.right === null ? () => 0 : graph.curves[relation.right].branches[0]) : null;
    if (relation && left && right && !graph.trig) {
      // Periodic answers (trigonometry) never settle. Otherwise solve in the smallest window
      // beyond which nothing changes any more (√x = 9 → 81, (x − 70)(x + 5) < 0 → 70).
      const difference = (x: number) => left(x) - right(x);
      const limit = SOLUTION_LIMITS.find((value) => settlesBeyond(difference, value));
      if (limit !== undefined) {
        const window = { xmin: -limit, xmax: limit };
        if (relation.relation !== '=') {
          const solved = solveRelation(left, relation.relation, right, window);
          if (sameIntervals(solved, solveRelation(left, relation.relation, right, { xmin: -2 * limit, xmax: 2 * limit }), window)) {
            solution = formatIntervals(solved, window);
            solutionPoints.push(...solved.flatMap((interval) => [interval.from, interval.to]).filter((x) => x > window.xmin && x < window.xmax));
          }
        } else {
          const roots = solveRelation(left, '=', right, window).map((interval) => interval.from);
          if (roots.length <= 6) { solution = roots.length ? roots.map((x) => formatNumber(x)).join('; ') : '∅'; solutionPoints.push(...roots); }
        }
      }
    }
    const view = autoViewport(fns, { trig: graph.trig, equalAspect: graph.equalAspect, focus: [...graph.focus, ...solutionPoints] });
    // Nothing to draw ($y = 1/0$, $\log_0 x$): no empty graph block.
    const drawable = fns.some((fn) => Array.from({ length: 65 }, (_, index) => fn(view.xmin + (index / 64) * (view.xmax - view.xmin))).some(Number.isFinite));
    if (!drawable) return null;
    const owner = graph.curves.flatMap((curve, index) => curve.branches.map(() => index));
    let points: KeyPoint[] = keyPoints(fns, view)
      // Two branches of one circle meet at its edge; that is not an intersection.
      .filter((point) => point.kind !== 'intersection' || new Set(point.curves.map((curve) => owner[curve])).size > 1);
    // With several curves (a system, both sides of an equation) the answer is where they meet.
    if (graph.curves.length > 1) points = points.filter((point) => point.kind === 'intersection' || point.kind === 'asymptote');
    const shade: Interval[] | undefined = relation && left && right && relation.relation !== '=' ? solveRelation(left, relation.relation, right, view) : undefined;
    const asymptotes = points.filter((point) => point.kind === 'asymptote').map((point) => point.x);
    const visible = points.filter((point) => point.kind !== 'asymptote' && point.x >= view.xmin && point.x <= view.xmax && point.y >= view.ymin && point.y <= view.ymax)
      .sort((a, b) => Math.abs(a.x) - Math.abs(b.x)).slice(0, MAX_MARKERS).sort((a, b) => a.x - b.x);
    const integral = graph.area ? integrate(graph.curves[graph.area.curve].branches[0], graph.area.from, graph.area.to) : NaN;
    return { graph, view, visible, asymptotes, shade, solution, integral, owner };
  } catch {
    return null;
  }
}
