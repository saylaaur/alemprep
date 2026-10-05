import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sourceHash } from './kazakh-coverage';
import type { RuImportArtifact } from './reviewed-content-import';
import { assertReadableContent } from './reviewed-content-check';

/**
 * KT2 (minimal): structural validator for `alemprep-kk-candidates-v1`.
 * Port of the private `validate-kk-candidates.py`. It proves that a KK draft keeps
 * the RU structure, IDs, keys, numbers and math. It never proves language quality:
 * `humanReviewed`/`machineChecked` are informational only and never approve content.
 */
const contextSchema = z.object({
  sourceContextId: z.uuid(),
  title: z.string().nullable(),
  content: z.unknown(),
}).strict();
const candidateSchema = z.object({
  sourceId: z.uuid(),
  sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
  translated: z.object({ body: z.unknown(), explanation: z.unknown(), context: contextSchema.nullable() }).strict(),
  issues: z.array(z.object({ path: z.string(), reason: z.string() }).strict()).max(50),
  machineChecked: z.boolean(),
}).strict();
const candidatesSchema = z.object({
  schema: z.literal('alemprep-kk-candidates-v1'),
  method: z.string().trim().min(1).max(200),
  // Accepted for format compatibility and deliberately ignored.
  humanReviewed: z.boolean(),
  sources: z.array(candidateSchema).min(1).max(100),
}).strict();

export type KkImportEntry = {
  sourceId: string;
  sourceHash: string;
  body: unknown;
  explanation: unknown;
  context: { sourceContextId: string; title: string | null; content: unknown } | null;
};
export type KkFinding = { sourceId: string; path: string; message: string };
export type KkValidation = { entries: KkImportEntry[]; warnings: KkFinding[]; withIssues: string[] };

const CYRILLIC = /[А-Яа-яЁё]/;
const KAZAKH = /[ӘәҒғҚқҢңӨөҰұҮүҺһІі]/;
const RUSSIAN_WORDS = /(?<![А-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі])(и|в|на|при|где|если|то|что|как|для|это|получаем|найдите|решите|ответ|откуда|тогда|так|поэтому|вариант|равен|равна|из)(?![А-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі])/giu;

function counter(values: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}
function sameCounter(a: Map<string, number>, b: Map<string, number>): boolean {
  return a.size === b.size && [...a].every(([key, count]) => b.get(key) === count);
}
const maths = (text: string) => counter(text.match(/\$[^$]*\$/g) ?? []);
const numbers = (text: string) => counter(text.match(/\d+(?:[.,]\d+)?/g) ?? []);
const stripText = (text: string) => text.replace(/\\text\{[^}]*\}/g, '\\text{}');
const kind = (value: unknown) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

/** Same comparison as the Python walk(): RU `a` against KK `b`. */
function walk(a: unknown, b: unknown, path: string, blockType: string | undefined, sourceId: string, errors: KkFinding[], warnings: KkFinding[]) {
  const fail = (message: string) => errors.push({ sourceId, path, message });
  if (kind(a) !== kind(b)) return fail('type differs');
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return fail('length differs');
    a.forEach((item, index) => walk(item, b[index], `${path}/${index}`, blockType, sourceId, errors, warnings));
    return;
  }
  if (a && typeof a === 'object') {
    const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length || keys.some(key => !(key in right))) return fail('keys differ');
    const nextType = typeof left.type === 'string' ? left.type : blockType;
    for (const key of keys) walk(left[key], right[key], `${path}/${key}`, nextType, sourceId, errors, warnings);
    return;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    if (path.endsWith('/id') || path.endsWith('/type') || path.endsWith('/correct')) {
      if (a !== b) fail('id/type/key changed');
      return;
    }
    if (path.includes('/correct/')) return; // checked by key rules below
    if (blockType === 'latex' && path.endsWith('/value')) {
      if (stripText(a) !== stripText(b)) fail('latex changed');
    } else if (!sameCounter(maths(a), maths(b))) fail('math segments differ');
    if (!sameCounter(numbers(a), numbers(b))) fail('numbers differ');
    if (CYRILLIC.test(a) && a === b) warnings.push({ sourceId, path, message: 'unchanged Cyrillic' });
    const natural = b.replace(/\$[^$]*\$/g, '');
    if (RUSSIAN_WORDS.test(natural)) warnings.push({ sourceId, path, message: 'possible Russian word' });
    RUSSIAN_WORDS.lastIndex = 0;
    if (CYRILLIC.test(a.replace(/\$[^$]*\$/g, '')) && a !== b && !KAZAKH.test(b)) warnings.push({ sourceId, path, message: 'no Kazakh letters' });
    return;
  }
  if (a !== b) fail('value differs');
}

type RuEntry = RuImportArtifact['entries'][number];

function checkKeys(ru: RuEntry, body: unknown, sourceId: string, errors: KkFinding[]) {
  const fail = (path: string, message: string) => errors.push({ sourceId, path, message });
  const source = ru.sourceSnapshot.body as Record<string, unknown>;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('body', 'body is not an object');
  const target = body as Record<string, unknown>;
  if (ru.sourceSnapshot.type !== 'matching') {
    if (sourceHash(source.correct) !== sourceHash(target.correct)) fail('body/correct', 'correct changed');
    const ids = (value: unknown) => Array.isArray(value) ? value.map(option => (option as { id?: unknown })?.id) : null;
    if (sourceHash(ids(source.options)) !== sourceHash(ids(target.options))) fail('body/options', 'option IDs changed');
    return;
  }
  const ruRight = source.right as string[], ruCorrect = source.correct as Record<string, string>;
  const right = target.right, correct = target.correct;
  if (!Array.isArray(right) || !correct || typeof correct !== 'object' || Array.isArray(correct)) return fail('body', 'matching shape');
  if (new Set(right).size !== right.length) fail('body/right', 'merged right labels');
  const kkCorrect = correct as Record<string, unknown>;
  if (sourceHash(Object.keys(kkCorrect).sort()) !== sourceHash(Object.keys(ruCorrect).sort())) fail('body/correct', 'matching keys changed');
  for (const [key, value] of Object.entries(ruCorrect)) {
    const index = ruRight.indexOf(value);
    if (index < 0 || kkCorrect[key] !== right[index]) fail(`body/correct/${key}`, 'matching link changed');
  }
}

/**
 * Validates every candidate against the reviewed RU source. Throws with all
 * structural errors; returns the import payload plus language warnings.
 */
export function validateKkCandidates(raw: unknown, source: RuImportArtifact): KkValidation {
  const file = candidatesSchema.parse(raw);
  const ruById = new Map(source.entries.map(entry => [entry.sourceId, entry]));
  const errors: KkFinding[] = [], warnings: KkFinding[] = [];
  const seen = new Set<string>();
  const contexts = new Map<string, string>();
  const entries: KkImportEntry[] = [];
  for (const candidate of file.sources) {
    const id = candidate.sourceId;
    const fail = (path: string, message: string) => errors.push({ sourceId: id, path, message });
    if (seen.has(id)) { fail('sourceId', 'duplicate source'); continue; }
    seen.add(id);
    const ru = ruById.get(id);
    if (!ru) { fail('sourceId', 'not in RU source'); continue; }
    if (ru.sourceHash !== candidate.sourceHash) { fail('sourceHash', 'stale source hash'); continue; }
    const s = ru.sourceSnapshot, t = candidate.translated;
    walk(s.body, t.body, 'body', undefined, id, errors, warnings);
    walk(s.explanation, t.explanation, 'explanation', undefined, id, errors, warnings);
    checkKeys(ru, t.body, id, errors);
    if (s.context === null) {
      if (t.context !== null) fail('context', 'invented context');
    } else if (t.context === null) {
      fail('context', 'missing context');
    } else {
      if (t.context.sourceContextId !== s.context.id) fail('context/sourceContextId', 'context id changed');
      if ((s.context.title === null) !== (t.context.title === null) || (t.context.title !== null && !t.context.title.trim())) fail('context/title', 'title presence changed');
      else if (t.context.title !== null && s.context.title !== null) walk(s.context.title, t.context.title, 'context/title', undefined, id, errors, warnings);
      walk(s.context.content, t.context.content, 'context/content', undefined, id, errors, warnings);
      const translatedContext = sourceHash({ title: t.context.title, content: t.context.content });
      const prior = contexts.get(t.context.sourceContextId);
      if (prior !== undefined && prior !== translatedContext) fail('context', 'different translation of one shared context');
      contexts.set(t.context.sourceContextId, translatedContext);
    }
    if (!errors.some(error => error.sourceId === id)) {
      try {
        assertReadableContent(s.type, t.body, t.explanation, t.context && { title: t.context.title, content: t.context.content });
      } catch (error) {
        fail('translated', error instanceof Error ? error.message : 'unreadable content');
      }
    }
    entries.push({ sourceId: id, sourceHash: candidate.sourceHash, body: t.body, explanation: t.explanation, context: t.context });
  }
  if (errors.length) {
    const shown = errors.slice(0, 20).map(error => `${error.sourceId.slice(0, 8)}:${error.path}: ${error.message}`);
    throw new Error(`KK candidates rejected (${errors.length} errors)\n${shown.join('\n')}`);
  }
  return { entries, warnings, withIssues: file.sources.filter(source => source.issues.length > 0).map(source => source.sourceId) };
}

/** Deterministic batch id: rerunning the same reviewed file replays one receipt. */
export function batchIdFromHash(hash: string): string {
  const hex = createHash('sha256').update(`alemprep-kk-batch:${hash}`).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
