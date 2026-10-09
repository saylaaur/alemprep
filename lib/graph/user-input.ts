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
  | { ok: false; error: 'empty' | 'syntax' | 'unknown-symbol' | 'too-long' | 'unsupported'; at?: string };

export type BuildOptions = {
  /** Functions defined on lines (f, g, h). */
  functions?: UserFunctions;
  /** Where x-only equations and inequalities are solved. */
  window?: { xmin: number; xmax: number };
};

const FUNCTION_NAME = /^\s*(?:y|[fgh]\s*\(\s*x\s*\))\s*$/;
const DEFINITION = /^\s*([fgh])\s*\(\s*x\s*\)\s*=([^=<>≤≥]*)$/;
const DEFAULT_WINDOW = { xmin: -1000, xmax: 1000 };
const MAX_DEPTH = 12;

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

/**
 * Functions defined on the lines ("f(x) = x^2 - 3x"), usable from other lines
 * as f(x), f(x − 2), f'(x), f''(x). A definition that calls itself gives NaN.
 */
export function buildDefinitions(lines: string[]): { functions: UserFunctions; names: string[] } {
  const sources = new Map<string, string>();
  for (const line of lines) {
    const match = DEFINITION.exec(stripRestriction(line).text);
    if (match && !sources.has(match[1])) sources.set(match[1], match[2]);
  }
  const names = [...sources.keys()];
  const functions: UserFunctions = {};
  let depth = 0;
  for (const [name, source] of sources) {
    const parsed = parseExpression(source, { functions: names });
    if (!parsed.ok || parsed.vars.includes('y')) continue;
    const fn = compile(parsed.node, functions);
    functions[name] = (x, scope) => {
      if (depth > MAX_DEPTH) return NaN;
      depth++;
      try { return fn(x, undefined, scope); } finally { depth--; }
    };
  }
  return { functions, names };
}

/** "x^2 {0 < x < 3}" → the expression and its condition on x (Desmos notation). */
function stripRestriction(text: string): { text: string; condition: string | null } {
  const match = /\{([^{}]*[<>≤≥][^{}]*)\}\s*$/.exec(text);
  return match ? { text: text.slice(0, match.index).trim(), condition: match[1] } : { text, condition: null };
}

const RELATION_SPLIT = /(<=|>=|≤|≥|<|>)/;
const normalizeRelation = (symbol: string): Relation => (symbol === '≤' || symbol === '<=' ? '<=' : symbol === '≥' || symbol === '>=' ? '>=' : symbol as Relation);

/** Compiles "0 < x <= 3" into a test of x; null when it is not a chain of comparisons with x. */
function compileCondition(condition: string, scope: Scope, names: string[], functions: UserFunctions): ((x: number) => boolean) | null {
  const pieces = condition.split(RELATION_SPLIT).map((piece) => piece.trim());
  if (pieces.length < 3 || pieces.length % 2 === 0) return null;
  const sides: ((x: number) => number)[] = [];
  for (let index = 0; index < pieces.length; index += 2) {
    const parsed = parseExpression(pieces[index], { functions: names });
    if (!parsed.ok || parsed.vars.includes('y')) return null;
    const fn = compile(parsed.node, functions);
    sides.push((x) => fn(x, undefined, scope));
  }
  const relations = pieces.filter((_, index) => index % 2 === 1).map(normalizeRelation);
  return (x) => relations.every((relation, index) => {
    const left = sides[index](x); const right = sides[index + 1](x);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    switch (relation) {
      case '<': return left < right; case '<=': return left <= right + 1e-12;
      case '>': return left > right; case '>=': return left >= right - 1e-12;
      default: return false;
    }
  });
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

export function buildUserCurve(input: string, scope: Scope, options: BuildOptions = {}): UserCurve {
  const functions = options.functions ?? {};
  const names = Object.keys(functions);
  const window = options.window ?? DEFAULT_WINDOW;
  const { text, condition } = stripRestriction(input);
  const parse = (source: string) => parseExpression(source, { functions: names });
  if (!text.trim()) return { ok: false, error: 'empty' };

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

  const restrict = condition ? compileCondition(condition, scope, names, functions) : null;
  if (condition && !restrict) return { ok: false, error: 'syntax' };
  const restricted = (fn: RealFn): RealFn => (restrict ? (x) => (restrict(x) ? fn(x) : NaN) : fn);
  const restrictionLatex = condition ? `\\quad \\left\\{${condition.replace(/<=|≤/g, '\\le ').replace(/>=|≥/g, '\\ge ')}\\right\\}` : '';

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
        ok: true, branches: [restricted((x) => other(x, undefined, scope))], params: paramsOf(vars), implicit: false, latex, trig,
        fill: greater === yLeft ? 'above' : 'below', dashed: strict,
      };
    }
    if (vars.includes('y')) return { ok: false, error: 'unsupported' };
    const l = compile(left.node, functions); const r = compile(right.node, functions);
    const strips = solveRelation(restricted((x) => l(x, undefined, scope)), relation, (x) => r(x, undefined, scope), window);
    return { ok: true, branches: [], params: paramsOf(vars), implicit: false, latex, trig, strips };
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
      params: paramsOf(parsed.vars),
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
      return { ok: true, branches: [], params: paramsOf(vars), implicit: false, latex, trig, verticals: Number.isFinite(value) ? [value] : [] };
    }
    const difference = (x: number) => l(x, undefined, scope) - r(x, undefined, scope);
    const roots = analyze(restricted(difference), window.xmin, window.xmax, 8000).roots;
    return { ok: true, branches: [], params: paramsOf(vars), implicit: false, latex, trig, verticals: roots.slice(0, 50) };
  }
  const solved = solveForY((x, y) => l(x, y, scope) - r(x, y, scope));
  if (!solved) return { ok: false, error: 'unsupported' };
  return {
    ok: true, implicit: true, trig,
    params: paramsOf(vars),
    branches: solved.branches.map(restricted),
    latex,
  };
}
