/**
 * Safe math-expression parser for the native graph (no eval, no network).
 * Accepts school notation as typed by pupils ("2x^2-3x+1", "sin 2x", "|x-1|")
 * and the LaTeX subset stored in question stems ("\frac{1}{x}", "\sqrt[3]{x}",
 * "\log_{2}(x-1)", "\operatorname{tg} x").
 */

export type FnName =
  | 'sin' | 'cos' | 'tan' | 'cot' | 'asin' | 'acos' | 'atan' | 'acot'
  | 'sqrt' | 'root' | 'abs' | 'ln' | 'log10' | 'logb' | 'exp';

export type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { k: 'call'; fn: FnName; args: Node[] }
  /** A function the pupil defined on another line (f(x) = …), with ′ for derivatives. */
  | { k: 'ufn'; name: string; primes: number; arg: Node };

export type ParseResult =
  | { ok: true; node: Node; vars: string[] }
  | { ok: false; error: 'empty' | 'syntax' | 'unknown-symbol' | 'too-long'; at?: string };

export type Scope = Record<string, number>;
export type Compiled = (x: number, y?: number, scope?: Scope) => number;
/** Functions defined on other lines, by name: f(x) = x² − 3x. */
export type UserFunctions = Record<string, (x: number, scope?: Scope) => number>;

const MAX_LENGTH = 400;

const FUNCTION_ALIASES: Record<string, FnName> = {
  arcsin: 'asin', arccos: 'acos', arctan: 'atan', arctg: 'atan', arcctg: 'acot', arccot: 'acot',
  sin: 'sin', cos: 'cos', tan: 'tan', tg: 'tan', cot: 'cot', ctg: 'cot',
  sqrt: 'sqrt', root: 'root', abs: 'abs', ln: 'ln', lg: 'log10', log: 'log10', exp: 'exp',
};
// Longest names first so "arcsin" never splits into "a·r·c·sin".
const NAMES = [...Object.keys(FUNCTION_ALIASES), 'pi'].sort((a, b) => b.length - a.length);

/** Finds the index of the brace that closes the one at `open`. */
function closingBrace(text: string, open: number, left = '{', right = '}'): number {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    if (text[index] === left) depth++;
    else if (text[index] === right && --depth === 0) return index;
  }
  return -1;
}

/** Replaces `\cmd{A}{B}`-style groups using a brace-aware scan. */
function replaceGroups(text: string, command: RegExp, arity: number, build: (args: string[], option?: string) => string): string {
  let result = text;
  for (let guard = 0; guard < 200; guard++) {
    const match = command.exec(result);
    if (!match) break;
    let cursor = match.index + match[0].length;
    let option: string | undefined;
    if (result[cursor] === '[') {
      const end = closingBrace(result, cursor, '[', ']');
      if (end < 0) break;
      option = result.slice(cursor + 1, end);
      cursor = end + 1;
    }
    const args: string[] = [];
    for (let index = 0; index < arity; index++) {
      while (result[cursor] === ' ') cursor++;
      if (result[cursor] === '{') {
        const end = closingBrace(result, cursor);
        if (end < 0) return result;
        args.push(result.slice(cursor + 1, end));
        cursor = end + 1;
      } else if (cursor < result.length) {
        // \frac12 — single-character arguments.
        args.push(result[cursor]);
        cursor += 1;
      } else return result;
    }
    result = result.slice(0, match.index) + build(args, option) + result.slice(cursor);
  }
  return result;
}

/** Converts the LaTeX/unicode subset used in stems into plain parser input. */
export function latexToPlain(input: string): string {
  let text = input
    .replace(/\\left\.|\\right\./g, '')
    .replace(/\\(left|right|big|Big|bigg|Bigg)(?=[()[\]|.]|\\[{}|])/g, '')
    .replace(/\\(displaystyle|textstyle|limits)/g, '')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\quad|\\qquad/g, ' ')
    .replace(/~/g, ' ')
    .replace(/\{,\}/g, '.')
    .replace(/(\d),(?=\d)/g, '$1.')
    .replace(/\\[lr]vert|\\vert|\\mid/g, '|')
    .replace(/\\[lr]\|/g, '|')
    .replace(/\\(cdot|times|ast)/g, '*')
    .replace(/\\div/g, '/')
    // sin 30° is sin(30°), so a number in degrees becomes one parenthesised factor.
    .replace(/(\d+(?:\.\d+)?)\s*(?:\^\s*\{?\s*\\circ\s*\}?|°)/g, '($1*pi/180)')
    .replace(/\^\s*\{?\s*\\circ\s*\}?|°/g, '*(pi/180)')
    .replace(/\\pi|π/g, 'pi')
    .replace(/[−–—]/g, '-')
    .replace(/[′’]/g, "'")
    .replace(/\\prime/g, "'")
    .replace(/[·×∙⋅]/g, '*')
    .replace(/÷|:/g, '/')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/√/g, 'sqrt')
    .replace(/\\(operatorname|mathrm|text|textrm|mathit)\s*\{\s*([a-zA-Z]+)\s*\}/g, '$2');
  text = replaceGroups(text, /\\[dt]?frac/, 2, ([top, bottom]) => `((${top})/(${bottom}))`);
  text = replaceGroups(text, /\\sqrt/, 1, ([value], option) => option ? `root((${value}),(${option}))` : `sqrt(${value})`);
  text = text.replace(/\\log_\s*/g, 'log_').replace(/\\([a-zA-Z]+)/g, (whole, name: string) => name in FUNCTION_ALIASES || name === 'exp' ? name : whole);
  return text.replace(/\{/g, '(').replace(/\}/g, ')').replace(/\[/g, '(').replace(/\]/g, ')');
}

type Token =
  | { t: 'num'; v: number }
  | { t: 'name'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' | '(' | ')' | ',' | '|' | '_' | "'" };

function tokenize(text: string): Token[] | { error: 'unknown-symbol'; at: string } {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) { index++; continue; }
    if (/[0-9.]/.test(char)) {
      const match = /^(\d+\.?\d*|\.\d+)([eE]\d+)?/.exec(text.slice(index));
      if (!match) return { error: 'unknown-symbol', at: char };
      // "2e" and "2e+1" are 2·e (+ 1), not exponents; only "1e3" is scientific notation.
      tokens.push({ t: 'num', v: Number(match[0]) });
      index += match[0].length;
      continue;
    }
    if (/[a-zA-Z]/.test(char)) {
      const word = /^[a-zA-Z]+/.exec(text.slice(index))![0];
      let rest = word;
      while (rest.length) {
        const name = NAMES.find((candidate) => rest.startsWith(candidate));
        if (name) { tokens.push({ t: 'name', v: name }); rest = rest.slice(name.length); }
        else { tokens.push({ t: 'name', v: rest[0] }); rest = rest.slice(1); }
      }
      index += word.length;
      continue;
    }
    if ("+-*/^(),|_'".includes(char)) { tokens.push({ t: 'op', v: char as '+' }); index++; continue; }
    if (char === '\\') return { error: 'unknown-symbol', at: /^\\[a-zA-Z]*/.exec(text.slice(index))![0] };
    return { error: 'unknown-symbol', at: char };
  }
  return tokens;
}

class Parser {
  private index = 0;
  private absDepth = 0;
  readonly vars = new Set<string>();
  constructor(private readonly tokens: Token[], private readonly functions: ReadonlySet<string> = new Set()) {}

  private peek(): Token | undefined { return this.tokens[this.index]; }
  private isOp(value: string, token = this.peek()): boolean { return token?.t === 'op' && token.v === value; }
  private expectOp(value: string) {
    if (!this.isOp(value)) throw new SyntaxError(value);
    this.index++;
  }

  parse(): Node {
    const node = this.expression();
    if (this.index !== this.tokens.length) throw new SyntaxError('trailing');
    return node;
  }

  private expression(): Node {
    let node = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.tokens[this.index++] as { v: '+' | '-' }).v;
      node = { k: 'bin', op, a: node, b: this.term() };
    }
    return node;
  }

  /** Can the next token begin an implicitly multiplied factor? */
  private startsFactor(): boolean {
    const token = this.peek();
    if (!token) return false;
    if (token.t === 'num' || token.t === 'name') return true;
    if (this.isOp('(')) return true;
    return this.isOp('|') && this.absDepth === 0;
  }

  private term(): Node {
    let node = this.unary();
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) {
        const op = (this.tokens[this.index++] as { v: '*' | '/' }).v;
        node = { k: 'bin', op, a: node, b: this.unary() };
      } else if (this.startsFactor()) {
        node = { k: 'bin', op: '*', a: node, b: this.power() };
      } else return node;
    }
  }

  private unary(): Node {
    if (this.isOp('-')) { this.index++; return { k: 'neg', a: this.unary() }; }
    if (this.isOp('+')) { this.index++; return this.unary(); }
    return this.power();
  }

  private power(): Node {
    const base = this.primary();
    if (this.isOp('^')) {
      this.index++;
      return { k: 'bin', op: '^', a: base, b: this.unary() };
    }
    return base;
  }

  /** `sin 2x` → sin(2·x): an unparenthesised argument is a run of numbers and variables. */
  private bareArgument(): Node {
    let node = this.simpleFactor();
    while (this.peek()?.t === 'name' && !(this.peek()!.v in FUNCTION_ALIASES) || this.peek()?.t === 'num') {
      node = { k: 'bin', op: '*', a: node, b: this.simpleFactor() };
    }
    return node;
  }

  private simpleFactor(): Node {
    const token = this.peek();
    if (token?.t === 'name' && token.v in FUNCTION_ALIASES) return this.primary();
    if (this.isOp('-')) { this.index++; return { k: 'neg', a: this.simpleFactor() }; }
    if (token?.t !== 'num' && token?.t !== 'name') return this.primary();
    const base = this.primary();
    if (this.isOp('^')) { this.index++; return { k: 'bin', op: '^', a: base, b: this.unary() }; }
    return base;
  }

  private primary(): Node {
    const token = this.peek();
    if (!token) throw new SyntaxError('end');
    if (token.t === 'num') { this.index++; return { k: 'num', v: token.v }; }
    if (this.isOp('(')) {
      this.index++;
      const node = this.expression();
      this.expectOp(')');
      return node;
    }
    if (this.isOp('|')) {
      this.index++;
      this.absDepth++;
      const node = this.expression();
      this.absDepth--;
      this.expectOp('|');
      return { k: 'call', fn: 'abs', args: [node] };
    }
    if (token.t === 'name') {
      this.index++;
      if (token.v === 'pi') return { k: 'num', v: Math.PI };
      if (token.v in FUNCTION_ALIASES) return this.call(token.v);
      if (token.v === 'e') return { k: 'num', v: Math.E };
      // f(x), f'(x), g''(2) when f, g are defined on other lines.
      if (this.functions.has(token.v) && (this.isOp('(') || this.isOp("'"))) {
        let primes = 0;
        while (this.isOp("'")) { this.index++; primes++; }
        if (primes > 2) throw new SyntaxError('primes');
        this.expectOp('(');
        const arg = this.expression();
        this.expectOp(')');
        return { k: 'ufn', name: token.v, primes, arg };
      }
      this.vars.add(token.v);
      return { k: 'var', name: token.v };
    }
    throw new SyntaxError(String(token.v));
  }

  private call(name: string): Node {
    let fn = FUNCTION_ALIASES[name];
    let base: Node | undefined;
    let exponent: Node | undefined;
    if (name === 'log' && this.isOp('_')) {
      this.index++;
      base = this.isOp('(') ? this.primary() : this.simpleBase();
      fn = 'logb';
    }
    // sin^2 x means (sin x)^2.
    if (this.isOp('^')) { this.index++; exponent = this.isOp('(') ? this.primary() : this.simpleBase(); }
    let args: Node[];
    if (this.isOp('(')) {
      this.index++;
      args = [this.expression()];
      while (this.isOp(',')) { this.index++; args.push(this.expression()); }
      this.expectOp(')');
    } else args = [this.bareArgument()];
    if (fn === 'root') {
      if (args.length !== 2) throw new SyntaxError('root');
    } else if (args.length !== 1) throw new SyntaxError('arity');
    if (fn === 'logb') args = [base!, args[0]];
    const node: Node = { k: 'call', fn, args };
    return exponent ? { k: 'bin', op: '^', a: node, b: exponent } : node;
  }

  /** log_2 x / sin^2 x: a single number or letter. */
  private simpleBase(): Node {
    const token = this.peek();
    if (token?.t === 'num') { this.index++; return { k: 'num', v: token.v }; }
    if (token?.t === 'name' && !(token.v in FUNCTION_ALIASES)) return this.primary();
    throw new SyntaxError('base');
  }
}

/**
 * Parses plain or LaTeX input. Variables are any single letters except e.
 * Names in `functions` followed by ( or ′ are calls of functions defined on other lines.
 */
export function parseExpression(input: string, options: { functions?: Iterable<string> } = {}): ParseResult {
  if (input.length > MAX_LENGTH) return { ok: false, error: 'too-long' };
  const plain = latexToPlain(input).trim();
  if (!plain) return { ok: false, error: 'empty' };
  const tokens = tokenize(plain);
  if (!Array.isArray(tokens)) return { ok: false, error: 'unknown-symbol', at: tokens.at };
  try {
    const parser = new Parser(tokens, new Set(options.functions ?? []));
    const node = parser.parse();
    return { ok: true, node, vars: [...parser.vars].sort() };
  } catch {
    return { ok: false, error: 'syntax' };
  }
}

const unaryFns: Record<Exclude<FnName, 'root' | 'logb'>, (value: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, cot: (v) => 1 / Math.tan(v),
  asin: Math.asin, acos: Math.acos, atan: Math.atan, acot: (v) => Math.PI / 2 - Math.atan(v),
  sqrt: (v) => (v < 0 ? NaN : Math.sqrt(v)),
  abs: Math.abs,
  ln: (v) => (v <= 0 ? NaN : Math.log(v)),
  log10: (v) => (v <= 0 ? NaN : Math.log10(v)),
  exp: Math.exp,
};

function isOddInteger(value: number) { return Number.isInteger(value) && Math.abs(value % 2) === 1; }

/** Real-valued power: odd roots of negatives stay real, as in school maths. */
export function realPow(base: number, exponent: number): number {
  if (base >= 0 || Number.isInteger(exponent)) return Math.pow(base, exponent);
  const inverse = 1 / exponent;
  if (Math.abs(inverse - Math.round(inverse)) < 1e-9 && isOddInteger(Math.round(inverse))) return -Math.pow(-base, exponent);
  return NaN;
}

function compileBinary(op: '+' | '-' | '*' | '/' | '^', a: Compiled, b: Compiled): Compiled {
  switch (op) {
    case '+': return (x, y, s) => a(x, y, s) + b(x, y, s);
    case '-': return (x, y, s) => a(x, y, s) - b(x, y, s);
    case '*': return (x, y, s) => a(x, y, s) * b(x, y, s);
    case '/': return (x, y, s) => { const d = b(x, y, s); return d === 0 ? NaN : a(x, y, s) / d; };
    case '^': return (x, y, s) => realPow(a(x, y, s), b(x, y, s));
  }
}

/** Central difference, then refined once: accurate to about 1e-7 for school functions. */
function derivative(fn: (x: number) => number, x: number, order: number): number {
  const h = 1e-4 * Math.max(1, Math.abs(x));
  if (order === 1) {
    const d1 = (fn(x + h) - fn(x - h)) / (2 * h);
    const d2 = (fn(x + h / 2) - fn(x - h / 2)) / h;
    // Richardson extrapolation removes the h² error term.
    const value = (4 * d2 - d1) / 3;
    return Number.isFinite(value) ? value : NaN;
  }
  const k = 1e-3 * Math.max(1, Math.abs(x));
  const value = (fn(x + k) - 2 * fn(x) + fn(x - k)) / (k * k);
  return Number.isFinite(value) ? value : NaN;
}

/** Builds a closure tree; evaluation never throws and returns NaN outside the domain. */
export function compile(node: Node, functions: UserFunctions = {}): Compiled {
  const compile_ = (child: Node) => compile(child, functions);
  switch (node.k) {
    case 'ufn': {
      const arg = compile_(node.arg); const name = node.name; const primes = node.primes;
      return (x, y, s) => {
        const fn = functions[name];
        if (!fn) return NaN;
        const at = arg(x, y, s);
        return primes === 0 ? fn(at, s) : derivative((value) => fn(value, s), at, primes);
      };
    }
    case 'num': { const value = node.v; return () => value; }
    case 'var': {
      if (node.name === 'x') return (x) => x;
      if (node.name === 'y') return (_x, y) => y ?? NaN;
      const name = node.name;
      return (_x, _y, scope) => scope?.[name] ?? NaN;
    }
    case 'neg': { const a = compile_(node.a); return (x, y, s) => -a(x, y, s); }
    case 'bin': return compileBinary(node.op, compile_(node.a), compile_(node.b));
    case 'call': {
      const args = node.args.map(compile_);
      if (node.fn === 'root') {
        const [value, degree] = args;
        return (x, y, s) => { const n = degree(x, y, s); return n === 0 ? NaN : realPow(value(x, y, s), 1 / n); };
      }
      if (node.fn === 'logb') {
        const [base, value] = args;
        return (x, y, s) => {
          const b = base(x, y, s); const v = value(x, y, s);
          return b <= 0 || b === 1 || v <= 0 ? NaN : Math.log(v) / Math.log(b);
        };
      }
      const fn = unaryFns[node.fn]; const arg = args[0];
      return (x, y, s) => fn(arg(x, y, s));
    }
  }
}

/** True when the tree uses a trigonometric function (axes then show multiples of π). */
export function usesTrig(node: Node): boolean {
  if (node.k === 'call') return ['sin', 'cos', 'tan', 'cot'].includes(node.fn) || node.args.some(usesTrig);
  if (node.k === 'bin') return usesTrig(node.a) || usesTrig(node.b);
  if (node.k === 'neg') return usesTrig(node.a);
  if (node.k === 'ufn') return usesTrig(node.arg);
  return false;
}

/** "\\sin", "\\log_{2}": the part of a function written before its bracketed argument. */
function fnHead(node: Extract<Node, { k: 'call' }>): string | null {
  if (['sqrt', 'root', 'abs', 'exp'].includes(node.fn)) return null;
  if (node.fn === 'logb') return `\\log_{${toLatex(node.args[0])}}`;
  const names: Record<string, string> = { log10: '\\lg', tan: '\\operatorname{tg}', cot: '\\operatorname{ctg}', asin: '\\arcsin', acos: '\\arccos', atan: '\\operatorname{arctg}', acot: '\\operatorname{arcctg}' };
  return names[node.fn] ?? `\\${node.fn}`;
}

const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 } as const;

/** Pretty LaTeX for legends and previews of typed input. */
export function toLatex(node: Node, parent = 0): string {
  switch (node.k) {
    case 'num': {
      if (node.v === Math.PI) return '\\pi';
      if (node.v === Math.E) return 'e';
      return String(Number(node.v.toPrecision(10))).replace('.', '{,}');
    }
    case 'var': return node.name;
    case 'ufn': return `${node.name}${"'".repeat(node.primes)}\\left(${toLatex(node.arg)}\\right)`;
    case 'neg': { const inner = `-${toLatex(node.a, 2)}`; return parent >= 2 ? `\\left(${inner}\\right)` : inner; }
    case 'bin': {
      const own = PRECEDENCE[node.op];
      let text: string;
      if (node.op === '/') return `\\frac{${toLatex(node.a)}}{${toLatex(node.b)}}`;
      if (node.op === '^') {
        const base = node.a; const head = base.k === 'call' ? fnHead(base) : null;
        // sin²x is written \sin^{2}(x); a fraction or e^{x} base needs brackets before ^.
        if (base.k === 'call' && head) return `${head}^{${toLatex(node.b)}}\\left(${toLatex(base.args[base.args.length - 1])}\\right)`;
        const bracket = base.k === 'bin' && base.op === '/' || base.k === 'call' && base.fn === 'exp';
        text = `${bracket ? `\\left(${toLatex(base)}\\right)` : toLatex(base, 4)}^{${toLatex(node.b)}}`;
      } else if (node.op === '*') {
        const left = toLatex(node.a, own); const right = toLatex(node.b, own + 0.5);
        const needsDot = /^[\d{]/.test(right) || /^\\frac/.test(right) && /\d$/.test(left);
        text = `${left}${needsDot ? ' \\cdot ' : ' '}${right}`;
      } else text = `${toLatex(node.a, own)} ${node.op} ${toLatex(node.b, own + 0.5)}`;
      return own < parent ? `\\left(${text}\\right)` : text;
    }
    case 'call': {
      const args = node.args.map((arg) => toLatex(arg));
      switch (node.fn) {
        case 'sqrt': return `\\sqrt{${args[0]}}`;
        case 'root': return `\\sqrt[${args[1]}]{${args[0]}}`;
        case 'abs': return `\\left|${args[0]}\\right|`;
        case 'exp': return `e^{${args[0]}}`;
        default: return `${fnHead(node)}\\left(${args[args.length - 1]}\\right)`;
      }
    }
  }
}
