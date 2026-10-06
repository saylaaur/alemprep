import 'server-only';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { teacherGroupsSchema, teacherRosterSchema, type TeacherGroup, type TeacherRoster } from '@/lib/teacher/contracts';

type TeacherError = 'unauthenticated' | 'temporarily-unavailable' | 'not-found';
type DashboardRead = { data: unknown } | { error: TeacherError };

async function readDashboard(groupId: string | null): Promise<DashboardRead> {
  try {
    const client = await createClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return { error: 'unauthenticated' };
    // Authenticated RPC, never an admin table query or a cross-user shared cache.
    const { data, error } = await client.rpc('pilot_teacher_dashboard_v1', { target_group_id: groupId });
    if (error) return { error: 'temporarily-unavailable' };
    if (data?.error === 'not-found') return { error: 'not-found' };
    return { data };
  } catch { return { error: 'temporarily-unavailable' }; }
}
export async function getTeacherGroups(): Promise<{ data: { groups: TeacherGroup[] } } | { error: TeacherError }> {
  const result = await readDashboard(null);
  if ('error' in result) return result;
  const parsed = teacherGroupsSchema.safeParse(result.data);
  return parsed.success ? { data: parsed.data } : { error: 'temporarily-unavailable' as const };
}
export async function getTeacherRoster(groupId: string): Promise<{ data: TeacherRoster } | { error: TeacherError }> {
  if (!z.uuid().safeParse(groupId).success) return { error: 'not-found' as const };
  const result = await readDashboard(groupId);
  if ('error' in result) return result;
  const parsed = teacherRosterSchema.safeParse(result.data);
  return parsed.success ? { data: parsed.data } : { error: 'temporarily-unavailable' as const };
}
