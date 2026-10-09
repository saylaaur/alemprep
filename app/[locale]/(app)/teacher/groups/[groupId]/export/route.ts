import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getTranslations } from 'next-intl/server';
import { getTeacherRoster } from '@/lib/supabase/queries/teacher';
import { buildTeacherCsv, teacherExportLabelKeys, type TeacherExportLabels } from '@/lib/teacher/export';

export const dynamic = 'force-dynamic';
const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };

export async function GET(_request: Request, context: { params: Promise<{ locale: string; groupId: string }> }) {
  const { locale, groupId } = await context.params;
  if (!['ru', 'kk'].includes(locale) || !z.uuid().safeParse(groupId).success) return new Response(null, { status: 404, headers: privateHeaders });
  // Fresh authenticated RPC on every download, including revoked/foreign URLs.
  const result = await getTeacherRoster(groupId);
  if ('error' in result) return Response.json({ error: result.error }, {
    status: result.error === 'unauthenticated' ? 401 : result.error === 'not-found' ? 404 : 503,
    headers: privateHeaders,
  });
  const t = await getTranslations({ locale, namespace: 'teacher' });
  const labels = Object.fromEntries(teacherExportLabelKeys.map(key => [key, t(`exportLabels.${key}`)])) as TeacherExportLabels;
  const reportId = randomUUID();
  return new Response(buildTeacherCsv(result.data, reportId, labels), { headers: {
    ...privateHeaders, 'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="alemprep-report-${groupId}-${reportId}.csv"`,
  } });
}
