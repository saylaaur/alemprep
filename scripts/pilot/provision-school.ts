import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getServiceClient, loadEnv } from '../lib/db';

const inputSchema = z.object({
  schoolName: z.string().trim().min(1).max(160),
  operatorId: z.uuid(),
  coordinatorId: z.uuid(),
  schoolId: z.uuid(),
  operationId: z.uuid(),
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
  const response = await supabase.rpc('pilot_provision_school_v1', {
    operation_id: input.operationId,
    requested_school_id: input.schoolId,
    school_name: input.schoolName,
    coordinator_id: input.coordinatorId,
    operator_id: input.operatorId,
  });
  if (response.error || !response.data || typeof response.data !== 'object' || Array.isArray(response.data)) {
    throw new Error(`Could not provision school: ${response.error?.message ?? 'empty result'}`);
  }
  const result = response.data as { schoolId?: unknown; created?: unknown; error?: unknown };
  if (result.error || result.schoolId !== input.schoolId || typeof result.created !== 'boolean') {
    throw new Error(`Could not provision school: ${typeof result.error === 'string' ? result.error : 'invalid result'}`);
  }
  return { schoolId: input.schoolId, created: result.created };
}

async function main(): Promise<void> {
  const schoolId = arg('school-id') ?? randomUUID();
  const input = parseProvisionSchoolInput({
    schoolName: arg('school-name'),
    operatorId: arg('operator-id'),
    coordinatorId: arg('coordinator-id'),
    schoolId,
    operationId: arg('operation-id') ?? randomUUID(),
    dryRun: !process.argv.includes('--apply'),
  });
  if (!input) {
    throw new Error('Usage: tsx scripts/pilot/provision-school.ts --school-name=<name> --operator-id=<uuid> --coordinator-id=<uuid> [--school-id=<uuid>] [--operation-id=<uuid>] [--apply]');
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
