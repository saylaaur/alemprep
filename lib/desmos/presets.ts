export type GraphKind = 'linear' | 'quadratic';
export function graphValue(kind: GraphKind, a: number, b: number, x: number) {
  return a * (kind === 'quadratic' ? x * x : x) + b;
}
export function graphPoints(kind: GraphKind, a: number, b: number) {
  return [-2, -1, 0, 1, 2].map((x) => ({ x, y: graphValue(kind, a, b, x) }));
}
export function graphExpression(kind: GraphKind, a: number, b: number) {
  return `y=(${a})x${kind === 'quadratic' ? '^{2}' : ''}+(${b})`;
}
