import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getServiceClient, loadEnv } from '../lib/db';

const inputSchema = z.object({
  schoolName: z.string().trim().min(1).max(160),
  operatorId: z.uuid(),
  coordinatorId: z.uuid(),
  schoolId: z.uuid(),
  dryRun: z.boolean(),
}).strict();

export type ProvisionSchoolInput = z.infer<typeof inputSchema>;

export function parseProvisionSchoolInput(raw: unknown): ProvisionSchoolInput | null {
  const parsed = inputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function localUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

export async function provisionSchool(input: ProvisionSchoolInput): Promise<{ schoolId: string; created: boolean }> {
  loadEnv();
  const isLocal = localUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!isLocal && process.env.PILOT_PROVISION_CONFIRM !== input.schoolId) {
    throw new Error('Refusing non-local provisioning without PILOT_PROVISION_CONFIRM=<school id>');
  }
  if (input.dryRun) return { schoolId: input.schoolId, created: false };

  const supabase = getServiceClient();
  const existing = await supabase.from('schools').select('id, name').eq('id', input.schoolId).maybeSingle();
  if (existing.error) throw new Error(`Could not inspect school: ${existing.error.message}`);
  if (existing.data) {
    if (existing.data.name !== input.schoolName) throw new Error('Refusing to reuse a school id with a different name');
    return { schoolId: input.schoolId, created: false };
  }

  const school = await supabase.from('schools').insert({
    id: input.schoolId,
    name: input.schoolName,
    status: 'active',
    timezone: 'Asia/Almaty',
  }).select('id').single();
  if (school.error || !school.data) throw new Error(`Could not create school: ${school.error?.message ?? 'empty result'}`);

  try {
    const membership = await supabase.from('school_memberships').insert({
      school_id: input.schoolId,
      user_id: input.coordinatorId,
      role: 'coordinator',
    });
    if (membership.error) throw new Error(`Could not assign coordinator: ${membership.error.message}`);
  } catch (error) {
    await supabase.from('schools').delete().eq('id', input.schoolId);
    throw error;
  }

  // operatorId is intentionally accepted for the audit handoff, but is not
  // inserted as a browser-visible school role. Provisioning remains service-only.
  void input.operatorId;
  return { schoolId: input.schoolId, created: true };
}

async function main(): Promise<void> {
  const schoolId = arg('school-id') ?? randomUUID();
  const input = parseProvisionSchoolInput({
    schoolName: arg('school-name'),
    operatorId: arg('operator-id'),
    coordinatorId: arg('coordinator-id'),
    schoolId,
    dryRun: !process.argv.includes('--apply'),
  });
  if (!input) {
    throw new Error('Usage: tsx scripts/pilot/provision-school.ts --school-name=<name> --operator-id=<uuid> --coordinator-id=<uuid> [--school-id=<uuid>] [--apply]');
  }
  const result = await provisionSchool(input);
  console.log(JSON.stringify(result));
}

if (process.argv[1]?.endsWith('/provision-school.ts')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Provisioning failed');
    process.exit(1);
  });
}
