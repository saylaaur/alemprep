import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { pilotInventorySchema, summarizePilotInventory } from '../lib/pilot-readiness';
import { loadEnv } from '../lib/db';

function arg(name: string): string | undefined {
  return process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}
async function main() {
  const file = arg('env-file');
  if (file) for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
  }
  else loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('required-env-missing');
  const target = new URL(url);
  const project = arg('project-ref');
  if (target.protocol !== 'https:' || !project || target.hostname !== `${project}.supabase.co` || target.username || target.password || target.pathname !== '/' || target.search || target.hash) throw new Error('explicit-hosted-project-required');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const versions: unknown[] = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const { data, error } = await db.from('question_versions')
      .select('id,question_id,family_id,locale,type,public_body,question_publications!inner(status),questions!inner(topics!inner(slug))')
      .eq('question_publications.status', 'approved').order('id').range(offset, offset + 999);
    if (error || !data) throw new Error('approved-inventory-unavailable');
    versions.push(...data);
    if (data.length < 1000) break;
    if (offset === 9000) throw new Error('inventory-bound-exceeded');
  }
  const counts = await Promise.all([
    db.from('schools').select('id', { head: true, count: 'exact' }).eq('status', 'active'),
    db.from('school_groups').select('id', { head: true, count: 'exact' }).eq('status', 'active'),
    db.from('group_teachers').select('id', { head: true, count: 'exact' }).is('ended_at', null),
    db.from('school_memberships').select('id', { head: true, count: 'exact' }).eq('role', 'coordinator').is('ended_at', null),
  ]);
  if (counts.some(value => value.error || value.count === null)) throw new Error('binding-inventory-unavailable');
  const input = pilotInventorySchema.parse({ versions, bindings: { schools: counts[0]!.count, groups: counts[1]!.count, teachers: counts[2]!.count, coordinators: counts[3]!.count } });
  const result = summarizePilotInventory(input);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), project, ...result, realSchoolRehearsal: 'not-certified-by-this-command' }, null, 2));
  if (!result.contentReady || (process.argv.includes('--require-bindings') && !result.bindingPresence)) process.exitCode = 2;
}
main().catch(() => { console.error('Pilot readiness failed; check explicit project/env and read permissions (details redacted).'); process.exitCode = 1; });
