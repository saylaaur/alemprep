import { describe, it, expect } from 'vitest';
import { evaluate, formatValue } from './calculator';

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

describe('formatValue: без экспоненциальной записи (иначе "e" ломает повторный ввод)', () => {
  it('обычные числа — как есть', () => {
    expect(formatValue(0)).toBe('0');
    expect(formatValue(42)).toBe('42');
    expect(formatValue(-3.5)).toBe('-3.5');
    expect(formatValue(2.5)).toBe('2.5');
  });
  it('очень большое число (≥1e21) разворачивается в целую строку', () => {
    expect(formatValue(1e21)).toBe('1' + '0'.repeat(21));
    expect(formatValue(-1e21)).toBe('-1' + '0'.repeat(21));
  });
  it('очень маленькое число (константы физики) разворачивается без "e"', () => {
    // заряд электрона, Кл
    expect(formatValue(1.6e-19)).toBe('0.00000000000000000016');
    expect(formatValue(-3.33e-8)).toBe('-0.0000000333');
  });
  it('результат formatValue снова парсится evaluate — не «кирпич»', () => {
    for (const v of [1e21, 1.6e-19, -3.33e-8, 42, -3.5]) {
      const s = formatValue(v);
      expect(/e/i.test(s)).toBe(false);
      const r = evaluate(s + '+0');
      expect(r.ok).toBe(true);
    }
  });
  it('целые экспоненциальные значения без дробной части', () => {
    expect(formatValue(5e3)).toBe('5000');
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
