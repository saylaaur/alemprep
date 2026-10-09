import { describe, expect, it } from 'vitest';
import { buildTeacherCsv, teacherExportLabelKeys } from './export';
import type { TeacherRoster } from './contracts';
const id = '10000000-0000-4000-8000-000000000001';
const labels = Object.fromEntries(teacherExportLabelKeys.map(key => [key, key])) as Record<typeof teacherExportLabelKeys[number], string>;
const roster: TeacherRoster = { group: { id, name: '10 A', schoolName: 'School', locale: 'ru' }, periodDays: 30, asOf: '2026-10-09T12:00:00Z', students: [{ id, name: 'Pupil', attempts: 1, uniqueQuestions: 1, firstPoints: 0, firstMaxPoints: 1, lastActiveAt: '2026-10-09T11:00:00Z' }] };

describe('teacher CSV snapshot', () => {
  it('includes snapshot identity, time, metric version and zero rather than no-data', () => {
    const csv = buildTeacherCsv(roster, id, labels);
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain(`"reportId","${id}"`);
    expect(csv).toContain('"snapshotTime","2026-10-09T12:00:00Z"');
    expect(csv).toContain('"timezone","Asia/Almaty"');
    expect(csv).toContain('"metricVersion","teacher-self-study-v1"');
    expect(csv).toContain('"Pupil","1","1","0","1","2026-10-09T11:00:00Z"');
  });
  it.each(['=1+1', '+cmd', '-cmd', '@SUM(A1)', '\t=1', '\n=1', ' \ufeff=1'])('neutralizes spreadsheet formula %j', name => {
    const csv = buildTeacherCsv({ ...roster, students: [{ ...roster.students[0]!, name }] }, id, labels);
    expect(csv).toContain(`"'${name}"`);
  });
  it('quotes multiline/quote/comma names and omits tokens or pupil IDs', () => {
    const csv = buildTeacherCsv({ ...roster, students: [{ ...roster.students[0]!, id: '20000000-0000-4000-8000-000000000002', name: 'A,"B"\nC' }] }, id, labels);
    expect(csv).toContain('"A,""B""\nC"');
    expect(csv).not.toContain('20000000-0000-4000-8000-000000000002');
    expect(csv).not.toContain('given_answer');
  });
  it('distinguishes an inactive pupil from an attempted zero score and supports empty rosters', () => {
    const csv = buildTeacherCsv({ ...roster, students: [{ ...roster.students[0]!, attempts: 0, uniqueQuestions: 0, firstPoints: 0, firstMaxPoints: 0, lastActiveAt: null }] }, id, labels);
    expect(csv).toContain('"Pupil","0","0","","",""');
    expect(buildTeacherCsv({ ...roster, students: [] }, id, labels)).toContain('"pupils","0"');
  });
});
