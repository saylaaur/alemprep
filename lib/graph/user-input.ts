/**
 * Turns one line typed into the graph tool into drawable branches:
 * "x^2-4x+3", "y = 2sin x", "f(x) = |x|", or "x^2 + y^2 = 9" (solved for y).
 * Letters other than x and y become slider parameters, as in Desmos.
 */
import { compile, parseExpression, toLatex, usesTrig, type Node, type Scope } from './parse';
import { solveForY } from './extract';
import type { RealFn } from './analyze';

export type UserCurve =
  | { ok: true; branches: RealFn[]; params: string[]; implicit: boolean; latex: string; trig: boolean }
  | { ok: false; error: 'empty' | 'syntax' | 'unknown-symbol' | 'too-long' | 'unsupported'; at?: string };

const FUNCTION_NAME = /^\s*(?:y|[fgh]\s*\(\s*x\s*\))\s*$/;

function substituteLatex(node: Node, scope: Scope): Node {
  switch (node.k) {
    case 'var': return node.name in scope && node.name !== 'x' && node.name !== 'y' ? { k: 'num', v: scope[node.name] } : node;
    case 'neg': return { k: 'neg', a: substituteLatex(node.a, scope) };
    case 'bin': return { ...node, a: substituteLatex(node.a, scope), b: substituteLatex(node.b, scope) };
    case 'call': return { ...node, args: node.args.map((arg) => substituteLatex(arg, scope)) };
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

export function buildUserCurve(text: string, scope: Scope): UserCurve {
  const parts = text.split('=');
  if (parts.length > 2 || /[<>≤≥]/.test(text)) return { ok: false, error: 'unsupported' };
  if (parts.length === 1 || FUNCTION_NAME.test(parts[0])) {
    const parsed = parseExpression(parts[parts.length - 1]);
    if (!parsed.ok) return parsed;
    if (parsed.vars.includes('y')) return { ok: false, error: 'unsupported' };
    const fn = compile(parsed.node);
    return {
      ok: true, implicit: false, trig: usesTrig(parsed.node),
      params: parsed.vars.filter((name) => name !== 'x'),
      branches: [(x) => fn(x, undefined, scope)],
      latex: `y = ${toLatex(parsed.node)}`,
    };
  }
  const left = parseExpression(parts[0]); const right = parseExpression(parts[1]);
  if (!left.ok) return left;
  if (!right.ok) return right;
  const vars = [...new Set([...left.vars, ...right.vars])];
  if (!vars.includes('y')) return { ok: false, error: 'unsupported' };
  const l = compile(left.node); const r = compile(right.node);
  const solved = solveForY((x, y) => l(x, y, scope) - r(x, y, scope));
  if (!solved) return { ok: false, error: 'unsupported' };
  return {
    ok: true, implicit: true, trig: usesTrig(left.node) || usesTrig(right.node),
    params: vars.filter((name) => name !== 'x' && name !== 'y'),
    branches: solved.branches,
    latex: `${toLatex(left.node)} = ${toLatex(right.node)}`,
  };
}
