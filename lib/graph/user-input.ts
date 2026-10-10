/**
 * Turns one line typed into the graph tool into something drawable, as in Desmos:
 * "x^2-4x+3", "y = 2sin x", "f(x) = |x|", "x^2 + y^2 = 9" (solved for y),
 * "x = 3" and "x^2 = 4" (vertical lines), "(2; 3)" (a point),
 * "y > x^2" (a shaded region), "x^2 - 4 < 0" (shaded x-intervals),
 * "x^2 {0 < x < 3}" (a piece of a graph), "f'(x)" (a derivative of f defined on another line).
 * Letters other than x and y become slider parameters.
 */
import { compile, parseExpression, toLatex, usesTrig, type Node, type Scope, type UserFunctions } from './parse';
import { solveForY } from './extract';
import { analyze, solveRelation, type Interval, type RealFn, type Relation } from './analyze';

export type UserCurve =
  | {
    ok: true;
    branches: RealFn[];
    params: string[];
    implicit: boolean;
    latex: string;
    trig: boolean;
    /** y > f(x) shades above the line, y < f(x) below; strict ones get a dashed line. */
    fill?: 'above' | 'below';
    dashed?: boolean;
    /** x = 3, x² = 4: vertical lines. */
    verticals?: number[];
    /** x-intervals where an inequality in x holds. */
    strips?: Interval[];
    /** (2; 3): a point. */
    point?: { x: number; y: number };
    /** f(x) = …: the name other lines can use. */
    defines?: string;
  }
  | { ok: false; error: 'empty' | 'syntax' | 'unknown-symbol' | 'too-long' | 'unsupported' | 'cycle' | 'identity'; at?: string };

export type BuildOptions = {
  /** Functions defined on lines (f, g, h). */
  functions?: UserFunctions;
  /** Names whose definitions refer to themselves (directly or through another function). */
  cyclic?: string[];
  /** Where x-only equations and inequalities are solved; intervals reaching its edges go on to infinity. */
  window?: { xmin: number; xmax: number };
};

const FUNCTION_NAME = /^\s*(?:y|[fgh]\s*\(\s*x\s*\))\s*$/;
const DEFINITION = /^\s*([fgh])\s*\(\s*x\s*\)\s*=([^=<>≤≥]*)$/;
const DEFAULT_WINDOW = { xmin: -1000, xmax: 1000 };
const MAX_DEPTH = 12;
/** Calls of defined functions allowed in one evaluation (f''(g''(x)) stays fast). */
const CALL_BUDGET = 4000;

function substituteLatex(node: Node, scope: Scope): Node {
  switch (node.k) {
    case 'var': return node.name in scope && node.name !== 'x' && node.name !== 'y' ? { k: 'num', v: scope[node.name] } : node;
    case 'neg': return { k: 'neg', a: substituteLatex(node.a, scope) };
    case 'bin': return { ...node, a: substituteLatex(node.a, scope), b: substituteLatex(node.b, scope) };
    case 'call': return { ...node, args: node.args.map((arg) => substituteLatex(arg, scope)) };
    case 'ufn': return { ...node, arg: substituteLatex(node.arg, scope) };
    default: return node;
  }
}

/** LaTeX with the current slider values put in (for the optional Desmos panel). */
export function latexWithValues(text: string, scope: Scope): string | null {
  const parts = text.split('=');
  const expression = parts.length === 2 && FUNCTION_NAME.test(parts[0]) ? parts[1] : text;
  const parsed = parseExpression(expression);
  return parsed.ok ? toLatex(substituteLatex(parsed.node, scope)) : null;
}

/** Names of defined functions a tree calls (f, g, h). */
function calledNames(node: Node, into = new Set<string>()): Set<string> {
  switch (node.k) {
    case 'ufn': into.add(node.name); calledNames(node.arg, into); break;
    case 'neg': calledNames(node.a, into); break;
    case 'bin': calledNames(node.a, into); calledNames(node.b, into); break;
    case 'call': node.args.forEach((arg) => calledNames(arg, into)); break;
    default: break;
  }
  return into;
}

/**
 * Functions defined on the lines ("f(x) = x^2 - 3x", "f(x) = x^2 {0 < x < 3}"), usable
 * from other lines as f(x), f(x − 2), f'(x), f''(x). A restriction stays with the function.
 * Definitions that call themselves, directly or through another function, are left out
 * and reported in `cyclic` before anything is evaluated.
 */
export function buildDefinitions(lines: string[]): { functions: UserFunctions; names: string[]; cyclic: string[] } {
  const sources = new Map<string, { source: string; condition: string | null }>();
  for (const line of lines) {
    const { text, condition } = stripRestriction(line);
    const match = DEFINITION.exec(text);
    if (match && !sources.has(match[1])) sources.set(match[1], { source: match[2], condition });
  }
  const names = [...sources.keys()];
  const calls = new Map<string, Set<string>>();
  const parsed = new Map<string, Node>();
  const conditions = new Map<string, NonNullable<ReturnType<typeof compileCondition>>>();
  const functions: UserFunctions = {};
  for (const [name, { source, condition }] of sources) {
    const result = parseExpression(source, { functions: names });
    if (!result.ok || result.vars.includes('y')) continue;
    const called = calledNames(result.node);
    if (condition) {
      const compiled = compileCondition(condition, names, functions);
      if (!compiled) continue;
      compiled.called.forEach((other) => called.add(other));
      conditions.set(name, compiled);
    }
    parsed.set(name, result.node);
    calls.set(name, called);
  }
  // A name is cyclic when following its calls leads back to it.
  const reaches = (from: string, target: string, seen = new Set<string>()): boolean => {
    for (const next of calls.get(from) ?? []) {
      if (next === target) return true;
      if (!seen.has(next)) { seen.add(next); if (reaches(next, target, seen)) return true; }
    }
    return false;
  };
  const cyclic = names.filter((name) => reaches(name, name));
  let depth = 0;
  let budget = 0;
  for (const [name, node] of parsed) {
    if (cyclic.includes(name)) continue;
    const fn = compile(node, functions);
    const restriction = conditions.get(name);
    functions[name] = (x, scope) => {
      if (depth === 0) budget = CALL_BUDGET;
      if (depth > MAX_DEPTH || budget <= 0) return NaN;
      budget--; depth++;
      try {
        if (restriction && !restriction.test(x, scope)) return NaN;
        return fn(x, undefined, scope);
      } finally { depth--; }
    };
  }
  return { functions, names, cyclic };
}

/** Does the text call one of these functions (f(…), f'(…))? */
function callsAny(text: string, names: string[]): boolean {
  if (!names.length) return false;
  return new RegExp(`(?<![a-z])(?:${names.join('|')})'*\\s*\\(`, 'i').test(text);
}

/** "x^2 {0 < x < 3}" → the expression and its condition on x (Desmos notation). */
function stripRestriction(text: string): { text: string; condition: string | null } {
  const match = /\{([^{}]*[<>≤≥][^{}]*)\}\s*$/.exec(text);
  return match ? { text: text.slice(0, match.index).trim(), condition: match[1] } : { text, condition: null };
}

const RELATION_SPLIT = /(<=|>=|≤|≥|<|>)/;
const normalizeRelation = (symbol: string): Relation => (symbol === '≤' || symbol === '<=' ? '<=' : symbol === '≥' || symbol === '>=' ? '>=' : symbol as Relation);

type Condition = {
  /** Only comparisons between bare x and x-independent values give exact solver cuts. */
  simpleBounds: boolean;
  /** Does x satisfy the condition with these slider values? */
  test: (x: number, scope?: Scope) => boolean;
  /** Letters used (other than x): they become sliders too. */
  vars: string[];
  /** Defined functions it calls. */
  called: Set<string>;
  /** The values x is compared with ({0 < x < a} → 0 and a), where pieces of the graph start and end. */
  bounds: (scope?: Scope) => number[];
};

/** Compiles "0 < x <= 3" into a test of x; null when it is not a chain of comparisons with x. */
function compileCondition(condition: string, names: string[], functions: UserFunctions): Condition | null {
  const pieces = condition.split(RELATION_SPLIT).map((piece) => piece.trim());
  if (pieces.length < 3 || pieces.length % 2 === 0) return null;
  const sides: ((x: number, scope?: Scope) => number)[] = [];
  const constants: ((scope?: Scope) => number)[] = [];
  const vars = new Set<string>();
  let simpleBounds = true;
  const called = new Set<string>();
  for (let index = 0; index < pieces.length; index += 2) {
    const parsed = parseExpression(pieces[index], { functions: names });
    if (!parsed.ok || parsed.vars.includes('y')) return null;
    if (parsed.vars.includes('x') && !(parsed.node.k === 'var' && parsed.node.name === 'x')) simpleBounds = false;
    parsed.vars.forEach((name) => vars.add(name));
    calledNames(parsed.node, called);
    const fn = compile(parsed.node, functions);
    sides.push((x, scope) => fn(x, undefined, scope));
    if (!parsed.vars.includes('x')) constants.push((scope) => fn(0, undefined, scope));
  }
  const relations = pieces.filter((_, index) => index % 2 === 1).map(normalizeRelation);
  return {
    simpleBounds,
    vars: paramsOf([...vars]),
    called,
    bounds: (scope) => constants.map((constant) => constant(scope)).filter(Number.isFinite),
    test: (x, scope) => relations.every((relation, index) => {
      const left = sides[index](x, scope); const right = sides[index + 1](x, scope);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      switch (relation) {
        case '<': return left < right; case '<=': return left <= right + 1e-12;
        case '>': return left > right; case '>=': return left >= right - 1e-12;
        default: return false;
      }
    }),
  };
}

/** Splits "(a; b)" or "(a, b)" at its top-level separator. */
function pointParts(text: string): [string, string] | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) return null;
  const inner = trimmed.slice(1, -1);
  for (const separator of [';', ',']) {
    let depth = 0;
    const cuts: number[] = [];
    for (let index = 0; index < inner.length; index++) {
      const char = inner[index];
      if (char === '(' || char === '[' || char === '{') depth++;
      else if (char === ')' || char === ']' || char === '}') depth--;
      else if (char === separator && depth === 0) cuts.push(index);
    }
    if (depth !== 0) return null;
    if (cuts.length === 1) return [inner.slice(0, cuts[0]), inner.slice(cuts[0] + 1)];
  }
  return null;
}

const paramsOf = (vars: string[]) => vars.filter((name) => name !== 'x' && name !== 'y');
const isLetter = (node: Node, name: string) => node.k === 'var' && node.name === name;

/** A slightly wider window around where a restriction lets x be, so that narrow pieces are sampled finely. */
function restrictionWindow(restrict: Condition | null, scope: Scope, window: { xmin: number; xmax: number }) {
  if (!restrict) return window;
  const bounds = restrict.bounds(scope);
  if (bounds.length < 2) return window;
  const low = Math.min(...bounds); const high = Math.max(...bounds);
  const pad = Math.max(1e-6, (high - low) * 0.01);
  if (restrict.test(low - pad, scope) || restrict.test(high + pad, scope)) return window;
  return { xmin: Math.max(window.xmin, low - pad), xmax: Math.min(window.xmax, high + pad) };
}

/** True when both sides agree wherever they are defined (x = x, 2x = x + x). */
function isIdentity(difference: RealFn, window: { xmin: number; xmax: number }): boolean {
  let defined = 0;
  for (let index = 0; index < 23; index++) {
    // Irregular sample points, so that periodic or polynomial roots are not hit by chance.
    const x = window.xmin + (window.xmax - window.xmin) * ((index * 0.6180339887 + 0.137) % 1);
    const value = difference(x);
    if (!Number.isFinite(value)) continue;
    if (Math.abs(value) > 1e-9 * Math.max(1, Math.abs(x))) return false;
    defined++;
  }
  return defined >= 3;
}

export function buildUserCurve(input: string, scope: Scope, options: BuildOptions = {}): UserCurve {
  const functions = options.functions ?? {};
  const names = Object.keys(functions);
  const window = options.window ?? DEFAULT_WINDOW;
  const { text, condition } = stripRestriction(input);
  if (!text.trim()) return { ok: false, error: 'empty' };
  if (callsAny(input, options.cyclic ?? [])) return { ok: false, error: 'cycle' };
  const known = [...new Set([...names, ...(options.cyclic ?? [])])];
  const parse = (source: string) => parseExpression(source, { functions: known });

  // A point: (2; 3), (a, b).
  const point = pointParts(text);
  if (point && !/[=<>≤≥]/.test(text)) {
    const [left, right] = point.map(parse);
    if (!left.ok) return left;
    if (!right.ok) return right;
    const vars = [...new Set([...left.vars, ...right.vars])];
    if (vars.includes('x') || vars.includes('y')) return { ok: false, error: 'unsupported' };
    const x = compile(left.node, functions)(0, undefined, scope); const y = compile(right.node, functions)(0, undefined, scope);
    return {
      ok: true, branches: [], params: paramsOf(vars), implicit: false, trig: false,
      latex: `\\left(${toLatex(left.node)};\\ ${toLatex(right.node)}\\right)`,
      point: { x, y },
    };
  }

  const restrict = condition ? compileCondition(condition, known, functions) : null;
  if (condition && !restrict) return { ok: false, error: 'syntax' };
  const allows = (x: number) => !restrict || restrict.test(x, scope);
  const restricted = (fn: RealFn): RealFn => (restrict ? (x) => (allows(x) ? fn(x) : NaN) : fn);
  const restrictionLatex = condition ? `\\quad \\left\\{${condition.replace(/<=|≤/g, '\\le ').replace(/>=|≥/g, '\\ge ')}\\right\\}` : '';
  const withRestriction = (vars: string[]) => [...new Set([...paramsOf(vars), ...(restrict?.vars ?? [])])];
  const bounds = restrict ? restrict.bounds(scope) : [];
  const solveIn = restrictionWindow(restrict, scope, window);
  // Pieces that reach the edge of the solving window go on without end (x > 2 → (2; +∞)).
  const unbounded = (interval: Interval): Interval => ({
    ...interval,
    from: interval.from <= window.xmin ? -Infinity : interval.from,
    to: interval.to >= window.xmax ? Infinity : interval.to,
  });

  // Inequalities.
  const relationParts = text.split(RELATION_SPLIT);
  if (relationParts.length > 1) {
    if (relationParts.length !== 3 || text.includes('=') && !/<=|>=/.test(text)) return { ok: false, error: 'unsupported' };
    const relation = normalizeRelation(relationParts[1]);
    const left = parse(relationParts[0]); const right = parse(relationParts[2]);
    if (!left.ok) return left;
    if (!right.ok) return right;
    const vars = [...new Set([...left.vars, ...right.vars])];
    const strict = relation === '<' || relation === '>';
    const latex = `${toLatex(left.node)} ${{ '<': '<', '>': '>', '<=': '\\le', '>=': '\\ge' }[relation as '<']} ${toLatex(right.node)}${restrictionLatex}`;
    const trig = usesTrig(left.node) || usesTrig(right.node);
    // y > f(x) or f(x) < y: shade above or below the line.
    const yLeft = isLetter(left.node, 'y') && !right.vars.includes('y');
    const yRight = isLetter(right.node, 'y') && !left.vars.includes('y');
    if (yLeft || yRight) {
      const other = compile((yLeft ? right : left).node, functions);
      const greater = relation === '>' || relation === '>=';
      return {
        ok: true, branches: [restricted((x) => other(x, undefined, scope))], params: withRestriction(vars), implicit: false, latex, trig,
        fill: greater === yLeft ? 'above' : 'below', dashed: strict,
      };
    }
    if (vars.includes('y')) return { ok: false, error: 'unsupported' };
    // The sampled x-only solver cannot infer arbitrary named-function domains.
    if (calledNames(left.node).size || calledNames(right.node).size || restrict?.simpleBounds === false) return { ok: false, error: 'unsupported' };
    const l = compile(left.node, functions); const r = compile(right.node, functions);
    const strips = solveRelation(restricted((x) => l(x, undefined, scope)), relation, (x) => r(x, undefined, scope), solveIn, bounds).map(unbounded);
    return { ok: true, branches: [], params: withRestriction(vars), implicit: false, latex, trig, strips };
  }

  const parts = text.split('=');
  if (parts.length > 2) return { ok: false, error: 'unsupported' };
  // y = f(x), f(x) = …, or just f(x).
  if (parts.length === 1 || FUNCTION_NAME.test(parts[0])) {
    const parsed = parse(parts[parts.length - 1]);
    if (!parsed.ok) return parsed;
    if (parsed.vars.includes('y')) return { ok: false, error: 'unsupported' };
    const fn = compile(parsed.node, functions);
    const defined = parts.length === 2 ? /^\s*([fgh])/.exec(parts[0])?.[1] : undefined;
    const head = defined ? `${defined}\\left(x\\right)` : 'y';
    return {
      ok: true, implicit: false, trig: usesTrig(parsed.node),
      params: withRestriction(parsed.vars),
      branches: [restricted((x) => fn(x, undefined, scope))],
      latex: `${head} = ${toLatex(parsed.node)}${restrictionLatex}`,
      defines: defined,
    };
  }
  const left = parse(parts[0]); const right = parse(parts[1]);
  if (!left.ok) return left;
  if (!right.ok) return right;
  const vars = [...new Set([...left.vars, ...right.vars])];
  const latex = `${toLatex(left.node)} = ${toLatex(right.node)}${restrictionLatex}`;
  const trig = usesTrig(left.node) || usesTrig(right.node);
  const l = compile(left.node, functions); const r = compile(right.node, functions);
  if (!vars.includes('y')) {
    // x = 3 or an equation in x only (x² = 4): vertical lines through its solutions.
    if (isLetter(left.node, 'x') && !right.vars.includes('x')) {
      const value = r(0, undefined, scope);
      return { ok: true, branches: [], params: withRestriction(vars), implicit: false, latex, trig, verticals: Number.isFinite(value) && allows(value) ? [value] : [] };
    }
    if (calledNames(left.node).size || calledNames(right.node).size || restrict?.simpleBounds === false) return { ok: false, error: 'unsupported' };
    const difference = restricted((x) => l(x, undefined, scope) - r(x, undefined, scope));
    if (isIdentity(difference, solveIn)) return { ok: false, error: 'identity' };
    const roots = analyze(difference, solveIn.xmin, solveIn.xmax, 8000).roots.filter(allows);
    return { ok: true, branches: [], params: withRestriction(vars), implicit: false, latex, trig, verticals: roots.slice(0, 50) };
  }
  const solved = solveForY((x, y) => l(x, y, scope) - r(x, y, scope));
  if (!solved) return { ok: false, error: 'unsupported' };
  return {
    ok: true, implicit: true, trig,
    params: withRestriction(vars),
    branches: solved.branches.map(restricted),
    latex,
  };
}
