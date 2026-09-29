import type { DbHarness, TestActor } from '../db/helpers';

export type PilotSchoolPair = {
  schoolA: string;
  schoolB: string;
  teacherA: TestActor;
  teacherB: TestActor;
  studentA: TestActor;
  studentB: TestActor;
  groupA: string;
  groupB: string;
  membershipA: string;
  membershipB: string;
};

export async function seedPilotSchoolPair(db: DbHarness): Promise<PilotSchoolPair> {
  const suffix = crypto.randomUUID();
  const [teacherA, teacherB, studentA, studentB] = await Promise.all([
    db.actor('pilot-teacher-a'),
    db.actor('pilot-teacher-b'),
    db.actor('pilot-student-a'),
    db.actor('pilot-student-b'),
  ]);
  const schoolA = await db.scalar<string>(
    `INSERT INTO public.schools (name, status, timezone)
     VALUES ($1, 'active', 'Asia/Almaty') RETURNING id`,
    [`Synthetic school A ${suffix}`],
  );
  const schoolB = await db.scalar<string>(
    `INSERT INTO public.schools (name, status, timezone)
     VALUES ($1, 'active', 'Asia/Almaty') RETURNING id`,
    [`Synthetic school B ${suffix}`],
  );
  const teacherMembershipA = await db.scalar<string>(
    `INSERT INTO public.school_memberships (school_id, user_id, role)
     VALUES ($1, $2, 'teacher') RETURNING id`, [schoolA, teacherA.id],
  );
  const teacherMembershipB = await db.scalar<string>(
    `INSERT INTO public.school_memberships (school_id, user_id, role)
     VALUES ($1, $2, 'teacher') RETURNING id`, [schoolB, teacherB.id],
  );
  const membershipA = await db.scalar<string>(
    `INSERT INTO public.school_memberships (school_id, user_id, role)
     VALUES ($1, $2, 'student') RETURNING id`, [schoolA, studentA.id],
  );
  const membershipB = await db.scalar<string>(
    `INSERT INTO public.school_memberships (school_id, user_id, role)
     VALUES ($1, $2, 'student') RETURNING id`, [schoolB, studentB.id],
  );
  const groupA = await db.scalar<string>(
    `INSERT INTO public.school_groups (school_id, name, locale, status)
     VALUES ($1, 'Synthetic RU A', 'ru', 'active') RETURNING id`, [schoolA],
  );
  const groupB = await db.scalar<string>(
    `INSERT INTO public.school_groups (school_id, name, locale, status)
     VALUES ($1, 'Synthetic RU B', 'ru', 'active') RETURNING id`, [schoolB],
  );
  await db.execute(
    `INSERT INTO public.group_memberships (school_id, group_id, school_membership_id)
     VALUES ($1, $2, $3), ($4, $5, $6)`,
    [schoolA, groupA, membershipA, schoolB, groupB, membershipB],
  );
  await db.execute(
    `INSERT INTO public.group_teachers (school_id, group_id, school_membership_id)
     VALUES ($1, $2, $3), ($4, $5, $6)`,
    [schoolA, groupA, teacherMembershipA, schoolB, groupB, teacherMembershipB],
  );
  return { schoolA, schoolB, teacherA, teacherB, studentA, studentB, groupA, groupB, membershipA, membershipB };
}
