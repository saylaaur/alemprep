import { z } from 'zod';
import { publicSingleSchema, publicMatchingSchema } from '../../lib/content/immutable-content-schemas';

const approvedVersionSchema = z.object({
  type: z.enum(['single', 'multi', 'matching']), id: z.uuid(), question_id: z.uuid(), family_id: z.uuid(), locale: z.enum(['ru', 'kk']),
  public_body: z.unknown(), question_publications: z.object({ status: z.literal('approved') }),
  questions: z.object({ topics: z.object({ slug: z.string().min(1).max(160) }) }),
});
const count = z.number().int().nonnegative();
export const pilotInventorySchema = z.object({
  versions: z.array(approvedVersionSchema).max(10000),
  bindings: z.object({ schools: count, groups: count, teachers: count, coordinators: count }),
});
export type PilotInventory = z.infer<typeof pilotInventorySchema>;
export type PilotReadiness = {
  contentReady: boolean; bindingPresence: boolean;
  approvedFamilies: { ru: number; kk: number };
  topics: { slug: string; ru: number; kk: number }[];
  issues: string[]; warnings: string[];
};
const excludedSources = new Set([
  '32683e42-83b0-437d-92b3-b51f40d7509a', // ambiguous sum notation, excluded from reviewed KK batch
  '0209018e-2477-4d29-b5ce-18df2fa6d893', // independently incorrect inequality key
]);
function hasKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasKey);
  if (value && typeof value === 'object') return Object.entries(value).some(([key, child]) => key === 'correct' || hasKey(child));
  return false;
}
/** Aggregates approved metadata only. Does not certify school admission or math quality. */
export function summarizePilotInventory(raw: unknown): PilotReadiness {
  const input = pilotInventorySchema.parse(raw);
  const issues = new Set<string>(); const warnings = new Set<string>();
  const families = { ru: new Set<string>(), kk: new Set<string>() };
  const topics = new Map<string, { ru: Set<string>; kk: Set<string> }>();
  for (const version of input.versions) {
    if (families[version.locale].has(version.family_id)) issues.add('duplicate-approved-family');
    families[version.locale].add(version.family_id);
    if (hasKey(version.public_body)) issues.add('public-answer-key');
    // Mirror the reader's public identifier invariants without fetching grading keys.
    let readable = false;
    if (version.type === 'matching') {
      const body = publicMatchingSchema.safeParse(version.public_body);
      readable = body.success && new Set(body.data.left.map(option => option.id)).size === body.data.left.length
        && new Set(body.data.right).size === body.data.right.length;
    } else {
      const body = publicSingleSchema.safeParse(version.public_body);
      readable = body.success && new Set(body.data.options.map(option => option.id)).size === body.data.options.length;
    }
    if (!readable) issues.add('unreadable-public-body');
    if (excludedSources.has(version.question_id)) issues.add('excluded-source-approved');
    const slug = version.questions.topics.slug;
    if (!topics.has(slug)) topics.set(slug, { ru: new Set(), kk: new Set() });
    topics.get(slug)![version.locale].add(version.family_id);
  }
  if (!families.ru.size || !families.kk.size) issues.add('approved-language-bank-empty');
  if ([...families.ru].some(id => !families.kk.has(id)) || [...families.kk].some(id => !families.ru.has(id))) warnings.add('unpaired-families');
  if ([...topics.values()].some(topic => !topic.ru.size || !topic.kk.size)) warnings.add('topic-language-gap');
  const bindingPresence = Object.values(input.bindings).every(n => n > 0);
  if (!bindingPresence) warnings.add('school-bindings-missing');
  return {
    contentReady: issues.size === 0, bindingPresence,
    approvedFamilies: { ru: families.ru.size, kk: families.kk.size },
    topics: [...topics].sort(([a], [b]) => a.localeCompare(b)).map(([slug, data]) => ({ slug, ru: data.ru.size, kk: data.kk.size })),
    issues: [...issues].sort(), warnings: [...warnings].sort(),
  };
}
