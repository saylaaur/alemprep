import { describe, it, expect } from 'vitest';
import { evaluate } from './calculator';

function val(expr: string): number {
  const r = evaluate(expr);
  if (!r.ok) throw new Error(`expected ok for: ${expr}`);
  return r.value;
}

describe('calculator: базовые операции и приоритеты', () => {
  it('приоритет умножения', () => {
    expect(val('2+2*2')).toBe(6);
    expect(val('2+2×2')).toBe(6);
  });
  it('скобки', () => {
    expect(val('(2+2)*2')).toBe(8);
    expect(val('2*(3+4)-5')).toBe(9);
  });
  it('деление, включая юникод-знаки', () => {
    expect(val('10÷4')).toBe(2.5);
    expect(val('10/4')).toBe(2.5);
  });
  it('левая ассоциативность', () => {
    expect(val('8-3-2')).toBe(3);
    expect(val('16/4/2')).toBe(2);
  });
  it('унарный минус', () => {
    expect(val('-3+5')).toBe(2);
    expect(val('2*-3')).toBe(-6);
    expect(val('-(2+3)')).toBe(-5);
    expect(val('--5')).toBe(5);
  });
  it('десятичные: точка и запятая', () => {
    expect(val('3,5+1.5')).toBe(5);
    expect(val('0.1+0.2')).toBe(0.3);
  });
});

describe('calculator: % и √', () => {
  it('процент — постфиксное деление на 100', () => {
    expect(val('50%')).toBe(0.5);
    expect(val('200*50%')).toBe(100);
    expect(val('50%%')).toBe(0.005);
  });
  it('корень применяется к следующему фактору', () => {
    expect(val('√9')).toBe(3);
    expect(val('√9+7')).toBe(10);
    expect(val('√(16+9)')).toBe(5);
    expect(val('2*√16')).toBe(8);
    expect(val('√√16')).toBe(2);
  });
  it('корень из отрицательного — ошибка', () => {
    expect(evaluate('√-4')).toEqual({ ok: false });
    expect(evaluate('√(1-5)')).toEqual({ ok: false });
  });
});

describe('calculator: ошибки', () => {
  it('деление на ноль', () => {
    expect(evaluate('1/0')).toEqual({ ok: false });
    expect(evaluate('5/(3-3)')).toEqual({ ok: false });
  });
  it('несбалансированные скобки и мусор', () => {
    expect(evaluate('((')).toEqual({ ok: false });
    expect(evaluate('(2+3')).toEqual({ ok: false });
    expect(evaluate('2+3)')).toEqual({ ok: false });
    expect(evaluate('2+')).toEqual({ ok: false });
    expect(evaluate('*3')).toEqual({ ok: false });
    expect(evaluate('abc')).toEqual({ ok: false });
    expect(evaluate('')).toEqual({ ok: false });
    expect(evaluate('1..2')).toEqual({ ok: false });
  });
});
