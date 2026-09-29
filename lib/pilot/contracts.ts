import { z } from 'zod';
import type { LearningError, Result } from '@/lib/learning/contracts';

export type JoinGroupInput = {
  operationId: string;
  token: string;
};

export type JoinGroupResult = { groupId: string };
export type PilotResult<T> = Result<T>;
export type PilotError = LearningError;

const joinGroupSchema = z.object({
  operationId: z.uuid(),
  token: z.string().regex(/^[A-Za-z0-9_-]{22,128}$/),
}).strict();

/** Parse only the browser-owned fields; actor and school scope come from Auth/DB. */
export function parseJoinInput(raw: unknown): JoinGroupInput | null {
  const parsed = joinGroupSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
