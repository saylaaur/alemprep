import { z } from 'zod';

export const teacherGroupSchema = z.object({
  id: z.uuid(), name: z.string().max(120), schoolName: z.string().max(160), locale: z.enum(['ru', 'kk']),
}).strict();
const count = z.number().int().nonnegative();
export const teacherRosterSchema = z.object({
  group: teacherGroupSchema,
  students: z.array(z.object({
    id: z.uuid(), name: z.string(), attempts: count, uniqueQuestions: count,
    firstPoints: count, firstMaxPoints: count, lastActiveAt: z.string().nullable(),
  }).strict()),
  asOf: z.string(), periodDays: z.literal(30),
}).strict();
export const teacherGroupsSchema = z.object({ groups: z.array(teacherGroupSchema) }).strict();
export type TeacherRoster = z.infer<typeof teacherRosterSchema>;
export type TeacherGroup = z.infer<typeof teacherGroupSchema>;

/** First attempts have an explicit denominator; an inactive pupil has no score. */
export function summarizeRoster(roster: TeacherRoster) {
  const pupils = roster.students.length;
  const active = roster.students.filter((pupil) => pupil.attempts > 0).length;
  const points = roster.students.reduce((sum, pupil) => sum + pupil.firstPoints, 0);
  const maxPoints = roster.students.reduce((sum, pupil) => sum + pupil.firstMaxPoints, 0);
  return { pupils, active, points, maxPoints, accuracy: maxPoints ? Math.round(100 * points / maxPoints) : null };
}
