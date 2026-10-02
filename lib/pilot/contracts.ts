import { z } from 'zod';
import type { LearningError, Result, StartedLearning } from '@/lib/learning/contracts';

export type JoinGroupInput = {
  operationId: string;
  token: string;
};

export type JoinGroupResult = { groupId: string };
export type PilotResult<T> = Result<T>;
export type PilotError = LearningError;

export type PublishAssignmentInput = {
  operationId: string;
  groupId: string;
  programId: string;
  opensAt: string;
  dueAt: string;
  closesAt: string;
};

export type PublishAssignmentResult = { assignmentId: string; participants: number };

export type AssignedStartInput = {
  operationId: string;
  assignmentId: string;
};

export type AssignedStart =
  | { status: 'active'; learning: StartedLearning; totalSteps: number; completedSteps: number }
  | { status: 'completed'; totalSteps: number; completedSteps: number };

const joinGroupSchema = z.object({
  operationId: z.uuid(),
  token: z.string().regex(/^[A-Za-z0-9_-]{22,128}$/),
}).strict();

/** Parse only the browser-owned fields; actor and school scope come from Auth/DB. */
export function parseJoinInput(raw: unknown): JoinGroupInput | null {
  const parsed = joinGroupSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const assignedStartSchema = z.object({
  operationId: z.uuid(),
  assignmentId: z.uuid(),
}).strict();

/** Assignment ownership, language and item selection are server-owned. */
export function parseAssignedStartInput(raw: unknown): AssignedStartInput | null {
  const parsed = assignedStartSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const timestamp = z.string().min(1).max(40).regex(/(?:Z|[+-]\d{2}:\d{2})$/).refine((value) => !Number.isNaN(Date.parse(value)));
const publishAssignmentSchema = z.object({
  operationId: z.uuid(),
  groupId: z.uuid(),
  programId: z.uuid(),
  opensAt: timestamp,
  dueAt: timestamp,
  closesAt: timestamp,
}).strict();

/** Enforce the pilot's bounded practice window before making a DB request. */
export function parsePublishAssignmentInput(raw: unknown): PublishAssignmentInput | null {
  const parsed = publishAssignmentSchema.safeParse(raw);
  if (!parsed.success) return null;
  const opens = Date.parse(parsed.data.opensAt);
  const due = Date.parse(parsed.data.dueAt);
  const closes = Date.parse(parsed.data.closesAt);
  if (!(opens <= due && due <= closes && closes - opens <= 90 * 24 * 60 * 60 * 1000)) return null;
  return parsed.data;
}
