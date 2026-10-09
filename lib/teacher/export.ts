import { summarizeRoster, type TeacherRoster } from './contracts';

export const teacherExportLabelKeys = [
  'reportId', 'snapshotTime', 'periodDays', 'timezone', 'metricVersion', 'school', 'class',
  'pupils', 'active', 'accuracy', 'pupil', 'attempts', 'uniqueQuestions', 'firstPoints', 'firstMaxPoints', 'lastActive',
] as const;
export type TeacherExportLabels = Record<typeof teacherExportLabelKeys[number], string>;

function cell(value: string | number): string {
  let text = String(value).replace(/\u0000/g, '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
/** A private CSV snapshot, not a public report or proof of learning impact. */
export function buildTeacherCsv(roster: TeacherRoster, reportId: string, labels: TeacherExportLabels): string {
  const summary = summarizeRoster(roster);
  const rows: (string | number)[][] = [
    [labels.reportId, reportId], [labels.snapshotTime, roster.asOf], [labels.periodDays, roster.periodDays],
    [labels.timezone, 'Asia/Almaty'], [labels.metricVersion, 'teacher-self-study-v1'],
    [labels.school, roster.group.schoolName], [labels.class, roster.group.name],
    [labels.pupils, summary.pupils], [labels.active, summary.active], [labels.accuracy, summary.accuracy ?? ''], [],
    [labels.pupil, labels.attempts, labels.uniqueQuestions, labels.firstPoints, labels.firstMaxPoints, labels.lastActive],
    ...roster.students.map(pupil => [pupil.name, pupil.attempts, pupil.uniqueQuestions,
      pupil.firstMaxPoints ? pupil.firstPoints : '', pupil.firstMaxPoints || '', pupil.lastActiveAt ?? '']),
  ];
  return `\ufeff${rows.map(row => row.map(cell).join(',')).join('\r\n')}\r\n`;
}
