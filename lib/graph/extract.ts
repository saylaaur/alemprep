/**
 * Finds what can be drawn in a task: function definitions (y = …, f(x) = …),
 * one-variable equations and inequalities (both sides as curves), equations in
 * x and y up to second degree in y (systems, circles, hyperbolas) and definite
 * integrals (shaded area). Anything with parameters or unknown notation is
 * skipped, so a task without a drawable function simply gets no graph.
 */
import { compile, parseExpression, usesTrig, type Node } from './parse';
import type { Relation, RealFn } from './analyze';

export type GraphCurve = {
  /** LaTeX shown in the legend, e.g. "y = x^2 - 4x + 3". */
  latex: string;
  /** One function for y = f(x); two branches for an equation solved for y. */
  branches: RealFn[];
  implicit: boolean;
};

export type TaskRelation = { relation: Relation; left: number; right: number | null };

export type TaskGraph = {
  curves: GraphCurve[];
  /** Equation or inequality in x only: solutions are marked or shaded. */
  relation: TaskRelation | null;
  /** Definite integral: area between the curve and the x-axis. */
  area: { curve: number; from: number; to: number } | null;
  /** "на отрезке [a; b]": the interval the task is about, highlighted on the axis. */
  segment: { from: number; to: number } | null;
  trig: boolean;
  equalAspect: boolean;
  focus: number[];
};

const MAX_CURVES = 4;
const RELATIONS: [RegExp, Relation][] = [
  [/^\\(?:leqslant|leq|le)(?![a-zA-Z])/, '<='],
  [/^\\(?:geqslant|geq|ge)(?![a-zA-Z])/, '>='],
  [/^\\(?:neq|ne)(?![a-zA-Z])/, '!='],
  [/^≤|^<=/, '<='], [/^≥|^>=/, '>='], [/^≠/, '!='],
  [/^</, '<'], [/^>/, '>'], [/^=/, '='],
];
const FUNCTION_NAME = /^\s*(?:y|[fgh]\s*\(\s*x\s*\)|y\s*\(\s*x\s*\))\s*$/;

/** Math segments of a stem: $…$, $$…$$, \(…\), or plain ASCII runs when no TeX is present. */
export function mathSegments(text: string): string[] {
  const segments: string[] = [];
  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
  let match: RegExpExecArray | null;
  let found = false;
  while ((match = pattern.exec(text))) {
    found = true;
    segments.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
  }
  if (found) return segments;
  // OCR'd stems sometimes have bare maths: "решите уравнение x^2 - 5x + 6 = 0".
  const plain = /[0-9a-zA-Z()+\-*/^=<>|.,√²³≤≥ ]+/g;
  while ((match = plain.exec(text))) {
    const run = match[0].trim().replace(/[.,]$/, '');
    if (/x/.test(run) && /[=<>≤≥]/.test(run) && run.length >= 3 && !/[a-wzA-WZ]{3,}/.test(run.replace(/sin|cos|tg|ctg|log|ln|lg|sqrt|abs/g, ''))) segments.push(run);
  }
  return segments;
}

/** Splits at top-level separators: `\\` rows of systems, `;` and `,` between formulas. */
function splitStatements(segment: string): string[] {
  const body = segment
    .replace(/\\begin\{(?:cases|array|aligned|gathered|system)\}(\{[^}]*\})?/g, ' ')
    .replace(/\\end\{(?:cases|array|aligned|gathered|system)\}/g, ' ')
    .replace(/\\left\\\{|\\right\.|\\left\.|\\right\\\}/g, ' ')
    .replace(/&/g, ' ')
    .replace(/\\(?:quad|qquad|text\{[^}]*\})/g, ';');
  const parts: string[] = [];
  let depth = 0; let start = 0;
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if ('({['.includes(char)) depth++;
    else if (')}]'.includes(char)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && (char === ';' || char === ',' && !/\d/.test(body[index + 1] ?? '') || char === '\\' && body[index + 1] === '\\')) {
      parts.push(body.slice(start, index));
      start = index + (char === '\\' ? 2 : 1);
    }
  }
  parts.push(body.slice(start));
  // "x - y = 1." — the sentence's full stop is not part of the formula.
  return parts.map((part) => part.trim().replace(/\s*[.,]$/, '')).filter(Boolean);
}

/** Splits "L op R" at top-level relation symbols. */
function splitRelation(statement: string): { sides: string[]; relations: Relation[] } {
  const sides: string[] = []; const relations: Relation[] = [];
  let depth = 0; let start = 0; let index = 0;
  while (index < statement.length) {
    const char = statement[index];
    if ('({['.includes(char)) depth++;
    else if (')}]'.includes(char)) depth = Math.max(0, depth - 1);
    if (depth === 0) {
      const rest = statement.slice(index);
      const hit = RELATIONS.find(([pattern]) => pattern.test(rest));
      if (hit && !(char === '\\' && /^\\(left|right)/.test(rest))) {
        const length = hit[0].exec(rest)![0].length;
        sides.push(statement.slice(start, index));
        relations.push(hit[1]);
        index += length; start = index;
        continue;
      }
    }
    index++;
  }
  sides.push(statement.slice(start));
  return { sides: sides.map((side) => side.trim()), relations };
}

type Parsed = { node: Node; vars: string[]; latex: string };

function parseSide(latex: string): Parsed | null {
  const result = parseExpression(latex);
  return result.ok ? { node: result.node, vars: result.vars, latex: latex.trim() } : null;
}

function only(vars: string[], allowed: string[]) { return vars.every((name) => allowed.includes(name)); }

function explicit(node: Node): RealFn {
  const fn = compile(node);
  return (x) => fn(x);
}

/**
 * Solves g(x, y) = 0 for y when g is at most quadratic in y; returns null otherwise.
 * Works numerically: A, B, C come from g at y = 0, 1, 2 and are checked at y = 3.
 */
export function solveForY(g: (x: number, y: number) => number): { branches: RealFn[]; quadratic: boolean } | null {
  const coefficients = (x: number) => {
    const g0 = g(x, 0); const g1 = g(x, 1); const g2 = g(x, 2);
    const a = (g2 - 2 * g1 + g0) / 2;
    return { a, b: g1 - g0 - a, c: g0 };
  };
  let quadratic = false; let dependsOnY = false; let checked = 0;
  for (const x of [-3.7, -1.3, 0.6, 1.9, 4.2, 7.1]) {
    const { a, b, c } = coefficients(x);
    if (![a, b, c].every(Number.isFinite)) continue;
    for (const y of [3, -2.5]) {
      const value = g(x, y);
      if (!Number.isFinite(value)) continue;
      if (Math.abs(a * y * y + b * y + c - value) > 1e-7 * Math.max(1, Math.abs(value))) return null;
      checked++;
    }
    if (Math.abs(a) > 1e-12) quadratic = true;
    if (Math.abs(a) > 1e-12 || Math.abs(b) > 1e-12) dependsOnY = true;
  }
  if (!checked || !dependsOnY) return null;
  if (!quadratic) {
    return { quadratic, branches: [(x) => { const { b, c } = coefficients(x); return b === 0 ? NaN : -c / b; }] };
  }
  const branch = (sign: 1 | -1): RealFn => (x) => {
    const { a, b, c } = coefficients(x);
    if (Math.abs(a) < 1e-12) return b === 0 ? NaN : -c / b;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < -1e-12) return NaN;
    return (-b + sign * Math.sqrt(Math.max(0, discriminant))) / (2 * a);
  };
  return { quadratic, branches: [branch(1), branch(-1)] };
}

// Limits may hold one level of braces: \int_0^{\frac{\pi}{2}}.
const INTEGRAL = /\\int(?:\\limits)?\s*_\s*(\{(?:[^{}]|\{[^{}]*\})*\}|-?[^\s{^]+)\s*\^\s*(\{(?:[^{}]|\{[^{}]*\})*\}|[^\s{]+)([\s\S]*?)(?:\\[,;! ]\s*)*\s*(?:\\mathrm\{d\}|d)\s*x\b/;

function unbrace(text: string) { return text.trim().replace(/^\{([\s\S]*)\}$/, '$1'); }

/** Builds the drawable picture of a stem, or null when nothing can be drawn. */
export function extractTaskGraph(stem: string, blocks?: unknown): TaskGraph | null {
  const texts: string[] = [];
  if (Array.isArray(blocks) && blocks.length) {
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue;
      const { type, value } = block as { type?: unknown; value?: unknown };
      if (typeof value !== 'string') continue;
      if (type === 'latex') texts.push(`$${value}$`);
      else if (type === undefined || type === 'text') texts.push(value);
    }
  } else texts.push(stem);

  const curves: GraphCurve[] = [];
  const keys: string[] = [];
  let relation: TaskRelation | null = null;
  let relationCount = 0;
  let area: TaskGraph['area'] = null;
  let segment: TaskGraph['segment'] = null;
  let trig = false; let equalAspect = false;
  const focus: number[] = [];

  /** Same function twice (y = x² in the stem and x² = … later) is drawn once. */
  const addCurve = (latex: string, branches: RealFn[], implicit: boolean, key: string): number => {
    const existing = keys.indexOf(key);
    if (existing >= 0) return existing;
    if (curves.length >= MAX_CURVES) return -1;
    keys.push(key);
    curves.push({ latex, branches, implicit });
    return curves.length - 1;
  };
  const keyOf = (parsed: Parsed) => JSON.stringify(parsed.node);

  /** Adds what one "L op R" statement draws; false when it cannot be drawn. */
  const drawStatement = (statement: string): boolean => {
    const { sides, relations } = splitRelation(statement);
    if (relations.length !== 1 || sides.some((side) => !side)) return false;
    const [leftText, rightText] = sides; const [op] = relations;
    if (op === '=' && FUNCTION_NAME.test(leftText)) {
      const right = parseSide(rightText);
      if (!right || !only(right.vars, ['x'])) return false;
      const index = addCurve(`${leftText.replace(/\s+/g, '')} = ${right.latex}`, [explicit(right.node)], false, keyOf(right));
      trig ||= usesTrig(right.node);
      return index >= 0;
    }
    const left = parseSide(leftText); const right = parseSide(rightText);
    if (!left || !right) return false;
    const vars = [...new Set([...left.vars, ...right.vars])];
    if (vars.length === 1 && vars[0] === 'x') {
      // "x = 2" or "x > 0" just restrict the variable; nothing to draw.
      if ([left, right].some((side) => side.node.k === 'var') && [left, right].some((side) => !side.vars.length)) return false;
      const rightIsZero = right.node.k === 'num' && right.node.v === 0;
      const leftIndex = addCurve(`y = ${left.latex}`, [explicit(left.node)], false, keyOf(left));
      const rightIndex = rightIsZero ? null : addCurve(`y = ${right.latex}`, [explicit(right.node)], false, keyOf(right));
      trig ||= usesTrig(left.node) || usesTrig(right.node);
      if (leftIndex < 0 || rightIndex === -1) return false;
      relationCount++;
      // Several relations (a system of inequalities) are drawn but not shaded.
      relation = relationCount === 1 ? { relation: op, left: leftIndex, right: rightIndex } : null;
      return true;
    }
    if (op === '=' && only(vars, ['x', 'y']) && vars.includes('y')) {
      const l = compile(left.node); const r = compile(right.node);
      const solved = solveForY((x, y) => l(x, y) - r(x, y));
      if (!solved) return false;
      const index = addCurve(`${left.latex} = ${right.latex}`, solved.branches, true, `${keyOf(left)}=${keyOf(right)}`);
      equalAspect ||= solved.quadratic;
      trig ||= usesTrig(left.node) || usesTrig(right.node);
      return index >= 0;
    }
    return false;
  };

  for (const math of texts.flatMap(mathSegments)) {
    const integral = INTEGRAL.exec(math);
    if (integral) {
      const from = parseSide(unbrace(integral[1])); const to = parseSide(unbrace(integral[2]));
      const integrand = parseSide(integral[3]);
      if (from && to && integrand && !from.vars.length && !to.vars.length && only(integrand.vars, ['x']) && integrand.vars.length) {
        const a = compile(from.node)(0); const b = compile(to.node)(0);
        const index = addCurve(`y = ${integrand.latex}`, [explicit(integrand.node)], false, keyOf(integrand));
        if (index >= 0 && Number.isFinite(a) && Number.isFinite(b) && a !== b && !area) {
          area = { curve: index, from: Math.min(a, b), to: Math.max(a, b) };
          focus.push(a, b);
          trig ||= usesTrig(integrand.node);
        }
      }
      continue;
    }
    const bounds = /^\s*\[([^;\]]+);([^;\]]+)\]\s*$/.exec(math.replace(/\\left\s*\[|\\right\s*\]/g, (bracket) => bracket.slice(-1)));
    if (bounds) {
      const from = parseSide(bounds[1]); const to = parseSide(bounds[2]);
      if (from && to && !from.vars.length && !to.vars.length && !segment) {
        const a = compile(from.node)(0); const b = compile(to.node)(0);
        if (Number.isFinite(a) && Number.isFinite(b) && a < b) { segment = { from: a, to: b }; focus.push(a, b); }
      }
      continue;
    }
    // A system is drawn whole or not at all: half a system would mislead.
    const statements = splitStatements(math);
    if (/\\begin\{(?:cases|system)\}|\\left\\\{/.test(math)) {
      const saved: { curves: number; keys: number; relation: TaskRelation | null; relationCount: number } = { curves: curves.length, keys: keys.length, relation, relationCount };
      if (!statements.every(drawStatement)) {
        curves.length = saved.curves; keys.length = saved.keys;
        relation = saved.relation; relationCount = saved.relationCount;
      }
    } else statements.forEach(drawStatement);
  }
  if (!curves.length) return null;
  if (!segment) {
    // "на отрезке [-2; 0]" typed outside the formulas.
    const number = String.raw`[-−]?\d+(?:[.,]\d+)?`;
    const plain = new RegExp(String.raw`\[\s*(${number})\s*;\s*(${number})\s*\]`).exec(texts.join(' ').replace(/\$[^$]*\$/g, ' '));
    const [a, b] = plain ? [plain[1], plain[2]].map((value) => Number(value.replace('−', '-').replace(',', '.'))) : [NaN, NaN];
    if (a < b) { segment = { from: a, to: b }; focus.push(a, b); }
  }
  return { curves, relation, area, segment, trig, equalAspect, focus };
}
