import { describe, it, expect } from 'vitest';
import { validateExamDate, clampTargetScore, validateOnboarding } from './onboarding';

describe('validateExamDate', () => {
  it('принимает сегодняшнюю дату', () => {
    expect(validateExamDate('2026-07-13', '2026-07-13')).toBe('2026-07-13');
  });
  it('принимает будущую дату', () => {
    expect(validateExamDate('2027-01-01', '2026-07-13')).toBe('2027-01-01');
  });
  it('отклоняет прошедшую дату', () => {
    expect(validateExamDate('2026-01-01', '2026-07-13')).toBeNull();
  });
  it('отклоняет невалидный формат', () => {
    expect(validateExamDate('13.07.2026', '2026-07-13')).toBeNull();
    expect(validateExamDate('not-a-date', '2026-07-13')).toBeNull();
    expect(validateExamDate('', '2026-07-13')).toBeNull();
  });
});

describe('clampTargetScore', () => {
  it('оставляет значение в диапазоне без изменений', () => {
    expect(clampTargetScore(70)).toBe(70);
  });
  it('клэмпит ниже минимума до 1', () => {
    expect(clampTargetScore(0)).toBe(1);
    expect(clampTargetScore(-10)).toBe(1);
  });
  it('клэмпит выше максимума до 110', () => {
    expect(clampTargetScore(140)).toBe(110);
    expect(clampTargetScore(1000)).toBe(110);
  });
  it('округляет дробные значения', () => {
    expect(clampTargetScore(70.6)).toBe(71);
  });
});

describe('validateOnboarding', () => {
  const valid = { secondSubject: 'physics', examDate: '2027-01-01', targetScore: 80 };

  it('валидный ввод — ok с нормализованными значениями', () => {
    const res = validateOnboarding(valid);
    expect(res).toEqual({
      ok: true,
      value: { secondSubject: 'physics', examDate: '2027-01-01', targetScore: 80 },
    });
  });
  it('неизвестный второй предмет — ошибка', () => {
    expect(validateOnboarding({ ...valid, secondSubject: 'chemistry' })).toEqual({
      ok: false,
      error: 'invalid_subject',
    });
  });
  it('дата в прошлом — ошибка', () => {
    expect(validateOnboarding({ ...valid, examDate: '2020-01-01' })).toEqual({
      ok: false,
      error: 'invalid_exam_date',
    });
  });
  it('балл вне диапазона — клэмпится, а не отклоняется', () => {
    const res = validateOnboarding({ ...valid, targetScore: 500 });
    expect(res).toEqual({ ok: true, value: { ...valid, targetScore: 110 } });
  });
  it('нечисловой балл — ошибка', () => {
    expect(validateOnboarding({ ...valid, targetScore: NaN })).toEqual({
      ok: false,
      error: 'invalid_target_score',
    });
  });
});
