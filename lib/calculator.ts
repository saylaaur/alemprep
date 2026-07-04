/**
 * Безопасный вычислитель выражений для встроенного калькулятора пробника
 * (без eval). Поддержка: + − × ÷ (и синонимы * /), скобки, унарный минус,
 * постфиксный % (деление на 100), префиксный √ (корень следующего фактора).
 * Десятичный разделитель — точка или запятая.
 */

export type CalcResult = { ok: true; value: number } | { ok: false };

const ERR: CalcResult = { ok: false };

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' }
  | { kind: 'neg' } // унарный минус
  | { kind: 'sqrt' }
  | { kind: 'pct' } // постфиксный процент
  | { kind: 'lparen' }
  | { kind: 'rparen' };

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const s = expr.replace(/\s+/g, '');

  while (i < s.length) {
    const ch = s[i];

    if (/[0-9.,]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.,]/.test(s[j])) j++;
      const raw = s.slice(i, j).replace(',', '.');
      // не более одной десятичной точки
      if ((raw.match(/\./g) ?? []).length > 1) return null;
      const value = Number(raw);
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: 'num', value });
      i = j;
      continue;
    }

    const prev = tokens[tokens.length - 1];
    // унарный контекст: начало, после оператора, ( , √ или унарного минуса
    const unaryCtx =
      !prev || prev.kind === 'op' || prev.kind === 'lparen' || prev.kind === 'sqrt' || prev.kind === 'neg';

    switch (ch) {
      case '+':
        if (unaryCtx) return null;
        tokens.push({ kind: 'op', op: '+' });
        break;
      case '-':
      case '−':
        tokens.push(unaryCtx ? { kind: 'neg' } : { kind: 'op', op: '-' });
        break;
      case '*':
      case '×':
        if (unaryCtx) return null;
        tokens.push({ kind: 'op', op: '*' });
        break;
      case '/':
      case '÷':
        if (unaryCtx) return null;
        tokens.push({ kind: 'op', op: '/' });
        break;
      case '√':
        tokens.push({ kind: 'sqrt' });
        break;
      case '%':
        if (unaryCtx) return null;
        tokens.push({ kind: 'pct' });
        break;
      case '(':
        tokens.push({ kind: 'lparen' });
        break;
      case ')':
        tokens.push({ kind: 'rparen' });
        break;
      default:
        return null;
    }
    i++;
  }
  return tokens;
}

/** Рекурсивный спуск: expr → term (('+'|'-') term)*; term → factor (('*'|'/') factor)*; factor → [neg|√]* primary ['%']*; primary → num | '(' expr ')' */
function parse(tokens: Token[]): number | null {
  let pos = 0;

  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (pos < tokens.length) {
      const t = tokens[pos];
      if (t.kind !== 'op' || (t.op !== '+' && t.op !== '-')) break;
      pos++;
      const right = parseTerm();
      if (right === null) return null;
      left = t.op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;
    while (pos < tokens.length) {
      const t = tokens[pos];
      if (t.kind !== 'op' || (t.op !== '*' && t.op !== '/')) break;
      pos++;
      const right = parseFactor();
      if (right === null) return null;
      if (t.op === '/') {
        if (right === 0) return null;
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  function parseFactor(): number | null {
    const t = tokens[pos];
    if (!t) return null;
    if (t.kind === 'neg') {
      pos++;
      const v = parseFactor();
      return v === null ? null : -v;
    }
    if (t.kind === 'sqrt') {
      pos++;
      const v = parseFactor();
      if (v === null || v < 0) return null;
      return Math.sqrt(v);
    }
    let value: number | null = null;
    if (t.kind === 'num') {
      pos++;
      value = t.value;
    } else if (t.kind === 'lparen') {
      pos++;
      value = parseExpr();
      if (value === null) return null;
      if (tokens[pos]?.kind !== 'rparen') return null;
      pos++;
    } else {
      return null;
    }
    while (tokens[pos]?.kind === 'pct') {
      pos++;
      value = value / 100;
    }
    return value;
  }

  const result = parseExpr();
  if (result === null || pos !== tokens.length) return null;
  return result;
}

/** Округление до 12 значащих цифр — гасит шум плавающей точки (0.1+0.2). */
function normalize(v: number): number {
  if (!Number.isFinite(v)) return NaN;
  if (v === 0) return 0;
  return Number(v.toPrecision(12));
}

export function evaluate(expr: string): CalcResult {
  if (!expr.trim()) return ERR;
  const tokens = tokenize(expr);
  if (!tokens || tokens.length === 0) return ERR;
  const value = parse(tokens);
  if (value === null) return ERR;
  const normalized = normalize(value);
  if (!Number.isFinite(normalized)) return ERR;
  return { ok: true, value: normalized };
}
