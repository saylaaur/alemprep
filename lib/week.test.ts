import { describe, expect, it } from 'vitest';
import { weekDates } from './week';

describe('weekDates', () => {
  it('starts on Monday and ends on Sunday', () => {
    expect(weekDates('2026-11-18')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']); // среда
    expect(weekDates('2026-11-16')[0]).toBe('2026-11-16'); // понедельник
    expect(weekDates('2026-11-22')[0]).toBe('2026-11-16'); // воскресенье
    expect(weekDates('2026-12-01')[0]).toBe('2026-11-30'); // через границу месяца
  });
});
