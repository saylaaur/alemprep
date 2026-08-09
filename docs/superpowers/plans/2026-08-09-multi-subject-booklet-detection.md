# Multi-Subject Booklet Photo Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `--multi` transcription determine the ЕНТ subject (math / physics / informatics / math-literacy) per extracted question instead of relying on one `--subject` flag for a whole photo batch, so a mixed folder of book-spread photos can be transcribed in one run and routed to the right subject at insert time.

**Architecture:** The model already returns one JSON array item per question in `--multi` mode (`scripts/lib/multi-transcribe.ts` → `ReferenceQuestionSchema`). We add an optional `subject` field to that schema (and to `GeneratedQuestionSchema`, so it survives a hand-run `gen:variants` → `gen:verify` → `gen:insert` chain that a human re-attaches later), plus two new pure/testable modules: `scripts/lib/subject-filter.ts` (post-hoc accept/reject decision per transcribed item — mirrors the existing `referencesMissingVisual` deterministic-filter pattern in `scripts/lib/checks.ts`) and `scripts/lib/topic-resolve.ts` (which subject's topic table to search for a given item at insert time). `transcribe-questions.ts`'s `--multi` system prompt is rewritten to always ask the model to self-report `subject` per item (whether or not `--subject` was passed), and `insert-to-db.ts` gains multi-subject topic-map resolution. `gen-all.ts` allows omitting `--subject` (requires `--multi` in that case), runs transcription only, prints a per-subject summary, and stops — the remaining steps (`gen:variants` / `gen:verify` / `gen:insert`) are run by hand, once per subject, exactly as they work today. **`generate-variants.ts` and `verify-questions.ts` are NOT touched** — they keep requiring one `--subject` for their whole input file, unchanged.

**Tech Stack:** TypeScript (strict), Zod, Vitest, existing `scripts/lib/*` conventions.

## Global Constraints

- Branch: `feature/booklet-photos` (already has `main` merged in — see below). **Do not merge to main, do not push.**
- TypeScript strict, no `any`/`@ts-ignore` without cause (per `CLAUDE.md`).
- `npm run typecheck`, `npm run lint`, `npm test` must be clean before calling any task done (per `CLAUDE.md`'s Claude Code working agreement — run via `/verify` at the end).
- Follow existing code conventions in `scripts/lib/*.ts` and their co-located `*.test.ts` files (Vitest, `describe`/`it`/`expect`, pure functions extracted for testability, I/O-heavy `main()` functions left untested — matches `scripts/lib/checks.ts` / `scripts/lib/reclassify.ts`).
- Do not touch `generate-variants.ts` or `verify-questions.ts` — confirmed out of scope with the user.
- Every new/changed `scripts/lib/schema.ts` field must stay backward compatible: existing reference/generated JSON files without a `subject` field must keep parsing and behaving exactly as before.

## Context already established (do not re-derive)

- `feature/booklet-photos` was rebased-by-merge onto `main` in this session (`git merge main --no-edit`), pulling in the official-НЦТ-topics restructuring (`scripts/data/official-topics.json`, `SUBJECT_TOPIC_SLUGS` now includes `'math-literacy'`). Typecheck/lint/tests were green post-merge.
- Topic slug catalog sizes (for prompt-size sanity): math 18 slugs/362 chars, physics 25/396, informatics 13/252, math-literacy 10/196 — small, no prompt-bloat concern.
- User decisions already made (do not re-ask):
  1. Merge `main` into the feature branch (done).
  2. `gen-all.ts` without `--subject`: **transcription + summary only, then stop** — do NOT auto-loop `generate-variants`/`verify`/`insert` per detected subject. The user runs those by hand afterward.

---

### Task 1: `subject` field on the reference/generated schemas

**Files:**
- Modify: `scripts/lib/schema.ts`
- Test: `scripts/lib/schema.test.ts` (new)

**Interfaces:**
- Produces: `SUBJECT_VALUES: readonly ['math','physics','informatics','math-literacy']`, `SubjectSchema: ZodEnum`, `type Subject = 'math'|'physics'|'informatics'|'math-literacy'`, `AUTO_SUBJECT_PREFIX: 'mixed'` (all exported from `./schema`). `ReferenceQuestionSchema` and `GeneratedQuestionSchema` each gain `subject?: Subject | null`.

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ReferenceQuestionSchema, GeneratedQuestionSchema, SubjectSchema } from './schema';

const baseBody = {
  stem: 'Найдите $2+2$.',
  options: [
    { id: 'a', content: '3' },
    { id: 'b', content: '4' },
  ],
  correct: 'b',
};

const baseExplanation = { blocks: [{ type: 'text', value: 'Очевидно.' }] };

describe('SubjectSchema', () => {
  it('accepts all four official subjects', () => {
    for (const s of ['math', 'physics', 'informatics', 'math-literacy']) {
      expect(SubjectSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects an unknown subject string', () => {
    expect(SubjectSchema.safeParse('chemistry').success).toBe(false);
  });
});

describe('ReferenceQuestionSchema subject field', () => {
  const base = {
    topic_slug: 'algebra',
    type: 'single' as const,
    difficulty: 3,
    body: baseBody,
    explanation: baseExplanation,
    source_file: 'p1.jpg',
  };

  it('parses without a subject field (legacy single-item transcription)', () => {
    expect(ReferenceQuestionSchema.safeParse(base).success).toBe(true);
  });

  it('parses with subject: null (undetermined)', () => {
    const result = ReferenceQuestionSchema.safeParse({ ...base, subject: null });
    expect(result.success).toBe(true);
    expect(result.success && result.data.subject).toBeNull();
  });

  it('parses with a valid subject value', () => {
    const result = ReferenceQuestionSchema.safeParse({ ...base, subject: 'math-literacy' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.subject).toBe('math-literacy');
  });

  it('rejects an invalid subject value', () => {
    expect(ReferenceQuestionSchema.safeParse({ ...base, subject: 'chemistry' }).success).toBe(false);
  });
});

describe('GeneratedQuestionSchema subject field', () => {
  const base = {
    topic_slug: 'algebra',
    type: 'single' as const,
    difficulty: 3,
    body: baseBody,
    explanation: baseExplanation,
    variant_of: 'p1.jpg',
  };

  it('parses without a subject field (legacy generated variant)', () => {
    expect(GeneratedQuestionSchema.safeParse(base).success).toBe(true);
  });

  it('parses with a subject field carried over from the reference', () => {
    const result = GeneratedQuestionSchema.safeParse({ ...base, subject: 'physics' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.subject).toBe('physics');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/schema.test.ts`
Expected: FAIL — `SubjectSchema` is not exported yet, and `subject` is not a recognized field (extra-key strip means the `.data.subject` assertions fail / TS won't even compile the `SubjectSchema` import).

- [ ] **Step 3: Implement**

In `scripts/lib/schema.ts`, right after the `getTopicSlugs` function (after this existing block):

```ts
export function getTopicSlugs(subject: string): readonly string[] {
  return SUBJECT_TOPIC_SLUGS[subject] ?? MATH_TOPIC_SLUGS;
}
```

insert:

```ts
export const SUBJECT_VALUES = ['math', 'physics', 'informatics', 'math-literacy'] as const;
export const SubjectSchema = z.enum(SUBJECT_VALUES);
export type Subject = z.infer<typeof SubjectSchema>;

/** Префикс имени файла, когда транскрипция идёт без --subject (см. gen-all.ts). */
export const AUTO_SUBJECT_PREFIX = 'mixed';
```

Then in `ReferenceQuestionSchema`, add the field (right after `topic_slug`):

```ts
export const ReferenceQuestionSchema = z.object({
  topic_slug: z.string().min(1), // валидируется против списка предмета в пайплайне + при insert
  subject: SubjectSchema.nullable().optional(), // --multi: предмет, определённый моделью по странице
  type: z.enum(['single', 'multi', 'matching']),
  difficulty: z.number().int().min(1).max(5),
  body: QuestionBodySchema,
  explanation: ExplanationSchema,
  source_file: z.string(),
  has_image: z.boolean().optional(), // true for questions with visual diagrams (Epic C)
});
```

And in `GeneratedQuestionSchema`:

```ts
export const GeneratedQuestionSchema = z.object({
  topic_slug: z.string().min(1), // валидируется против списка предмета в пайплайне + при insert
  subject: SubjectSchema.nullable().optional(), // унаследован от reference, если был определён
  type: z.enum(['single', 'multi', 'matching']),
  difficulty: z.number().int().min(1).max(5),
  body: QuestionBodySchema,
  explanation: ExplanationSchema,
  variant_of: z.string(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/schema.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/schema.ts scripts/lib/schema.test.ts
git commit -m "feat(gen): subject field on reference/generated question schemas"
```

---

### Task 2: `scripts/lib/subject-filter.ts` — accept/reject a transcribed item by subject

**Files:**
- Create: `scripts/lib/subject-filter.ts`
- Test: `scripts/lib/subject-filter.test.ts`

**Interfaces:**
- Consumes: `ReferenceQuestion`, `SubjectSchema`/`Subject`/`SUBJECT_VALUES`, `TranscriptionItem` from `./schema` (Task 1).
- Produces: `UNDETERMINED_SUBJECT_REASON: string`, `applySubjectFilter(item: ReferenceQuestion, targetSubject: string | undefined): { keep: true } | { keep: false; reason: string }`, `summarizeBySubject(items: TranscriptionItem[]): { bySubject: Record<Subject, number>; undetermined: number }` — consumed by `transcribe-questions.ts` (Task 4) and `gen-all.ts` (Task 6).

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/subject-filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applySubjectFilter, summarizeBySubject, UNDETERMINED_SUBJECT_REASON } from './subject-filter';
import type { ReferenceQuestion, TranscriptionItem } from './schema';

function ref(overrides: Partial<ReferenceQuestion> = {}): ReferenceQuestion {
  return {
    topic_slug: 'algebra',
    type: 'single',
    difficulty: 3,
    body: {
      stem: 'x',
      options: [
        { id: 'a', content: '1' },
        { id: 'b', content: '2' },
      ],
      correct: 'a',
    },
    explanation: { blocks: [{ type: 'text', value: 'y' }] },
    source_file: 'p1.jpg',
    ...overrides,
  };
}

describe('applySubjectFilter', () => {
  it('discards an item with subject: null regardless of target', () => {
    const result = applySubjectFilter(ref({ subject: null }), undefined);
    expect(result).toEqual({ keep: false, reason: UNDETERMINED_SUBJECT_REASON });
  });

  it('discards an item with no subject field at all', () => {
    const result = applySubjectFilter(ref(), 'math');
    expect(result.keep).toBe(false);
  });

  it('keeps a determined subject when no target subject is given (auto-detect run)', () => {
    expect(applySubjectFilter(ref({ subject: 'physics' }), undefined)).toEqual({ keep: true });
  });

  it('keeps an item whose subject matches the --subject flag', () => {
    expect(applySubjectFilter(ref({ subject: 'math' }), 'math')).toEqual({ keep: true });
  });

  it('filters out an item whose subject does not match the --subject flag', () => {
    const result = applySubjectFilter(ref({ subject: 'informatics' }), 'math');
    expect(result.keep).toBe(false);
    expect(result.keep === false && result.reason).toMatch(/informatics/);
  });
});

describe('summarizeBySubject', () => {
  it('tallies kept items by subject and counts undetermined skips', () => {
    const items: TranscriptionItem[] = [
      ref({ subject: 'math' }),
      ref({ subject: 'math' }),
      ref({ subject: 'physics' }),
      { skip: 'unsupported', reason: UNDETERMINED_SUBJECT_REASON, source_file: 'p2.jpg' },
      { skip: 'graph', reason: 'circuit diagram', source_file: 'p3.jpg' },
    ];
    const summary = summarizeBySubject(items);
    expect(summary.bySubject.math).toBe(2);
    expect(summary.bySubject.physics).toBe(1);
    expect(summary.bySubject.informatics).toBe(0);
    expect(summary.bySubject['math-literacy']).toBe(0);
    expect(summary.undetermined).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/subject-filter.test.ts`
Expected: FAIL — module `./subject-filter` does not exist.

- [ ] **Step 3: Implement**

Create `scripts/lib/subject-filter.ts`:

```ts
import { SUBJECT_VALUES, type ReferenceQuestion, type Subject, type TranscriptionItem } from './schema';

export const UNDETERMINED_SUBJECT_REASON = 'Не удалось определить предмет';

export type SubjectFilterResult = { keep: true } | { keep: false; reason: string };

/**
 * Пост-обработка --multi: подтверждает subject, определённый моделью для
 * каждого задания (тот же приём, что referencesMissingVisual в checks.ts —
 * детерминантный фильтр поверх ответа модели). targetSubject === undefined —
 * авто-режим без --subject: отбрасываем только null. targetSubject задан —
 * прежнее поведение (фильтр по флагу), плюс теперь ловит задания с явно
 * другим предметом, а не молча приписывает их к targetSubject.
 */
export function applySubjectFilter(
  item: ReferenceQuestion,
  targetSubject: string | undefined,
): SubjectFilterResult {
  if (item.subject == null) {
    return { keep: false, reason: UNDETERMINED_SUBJECT_REASON };
  }
  if (targetSubject !== undefined && item.subject !== targetSubject) {
    return { keep: false, reason: `Другой предмет: ${item.subject} (ожидался ${targetSubject})` };
  }
  return { keep: true };
}

export interface SubjectSummary {
  bySubject: Record<Subject, number>;
  undetermined: number;
}

/** Считает распределение по предметам поверх итогового списка TranscriptionItem. */
export function summarizeBySubject(items: TranscriptionItem[]): SubjectSummary {
  const bySubject = Object.fromEntries(SUBJECT_VALUES.map((s) => [s, 0])) as Record<Subject, number>;
  let undetermined = 0;

  for (const item of items) {
    if ('skip' in item) {
      if (item.reason === UNDETERMINED_SUBJECT_REASON) undetermined++;
      continue;
    }
    if (item.subject) bySubject[item.subject]++;
  }

  return { bySubject, undetermined };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/subject-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/subject-filter.ts scripts/lib/subject-filter.test.ts
git commit -m "feat(gen): subject-filter — accept/reject transcribed items by detected subject"
```

---

### Task 3: `scripts/lib/topic-resolve.ts` — pick the right subject's topic table at insert time

**Files:**
- Create: `scripts/lib/topic-resolve.ts`
- Test: `scripts/lib/topic-resolve.test.ts`

**Interfaces:**
- Consumes: `Subject` from `./schema` (Task 1).
- Produces: `resolveTopic(item: { topic_slug: string; subject?: Subject | null }, flagSubject: string, topicMapsBySubject: ReadonlyMap<string, ReadonlyMap<string, string> | null>): TopicResolution` where `TopicResolution = { kind: 'resolved'; subject: string; topicId: string } | { kind: 'unknown_subject'; subject: string } | { kind: 'unknown_topic'; subject: string; topicSlug: string }` — consumed by `insert-to-db.ts` (Task 5).

- [ ] **Step 1: Write the failing test**

Create `scripts/lib/topic-resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveTopic } from './topic-resolve';

describe('resolveTopic', () => {
  const mathTopics = new Map([['algebra', 'topic-math-algebra']]);
  const physicsTopics = new Map([['mechanics', 'topic-physics-mechanics']]);
  const maps = new Map<string, ReadonlyMap<string, string> | null>([
    ['math', mathTopics],
    ['physics', physicsTopics],
    ['informatics', null],
  ]);

  it('resolves using the item own subject, ignoring the flag subject', () => {
    const result = resolveTopic({ topic_slug: 'mechanics', subject: 'physics' }, 'math', maps);
    expect(result).toEqual({ kind: 'resolved', subject: 'physics', topicId: 'topic-physics-mechanics' });
  });

  it('falls back to the flag subject when the item has no subject field', () => {
    const result = resolveTopic({ topic_slug: 'algebra' }, 'math', maps);
    expect(result).toEqual({ kind: 'resolved', subject: 'math', topicId: 'topic-math-algebra' });
  });

  it('falls back to the flag subject when the item subject is null', () => {
    const result = resolveTopic({ topic_slug: 'algebra', subject: null }, 'math', maps);
    expect(result).toEqual({ kind: 'resolved', subject: 'math', topicId: 'topic-math-algebra' });
  });

  it('reports unknown_subject when the resolved subject has no topic map (missing in DB)', () => {
    const result = resolveTopic({ topic_slug: 'networks', subject: 'informatics' }, 'math', maps);
    expect(result).toEqual({ kind: 'unknown_subject', subject: 'informatics' });
  });

  it('reports unknown_topic when the slug is missing from its subject map', () => {
    const result = resolveTopic({ topic_slug: 'nonexistent-slug', subject: 'math' }, 'math', maps);
    expect(result).toEqual({ kind: 'unknown_topic', subject: 'math', topicSlug: 'nonexistent-slug' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/topic-resolve.test.ts`
Expected: FAIL — module `./topic-resolve` does not exist.

- [ ] **Step 3: Implement**

Create `scripts/lib/topic-resolve.ts`:

```ts
import type { Subject } from './schema';

export interface TopicResolutionInput {
  topic_slug: string;
  subject?: Subject | null;
}

export type TopicResolution =
  | { kind: 'resolved'; subject: string; topicId: string }
  | { kind: 'unknown_subject'; subject: string }
  | { kind: 'unknown_topic'; subject: string; topicSlug: string };

/**
 * Предмет для поиска темы — свой subject у задания, если он есть (пайплайн
 * --multi без --subject даёт его каждой задаче отдельно), иначе предмет из
 * флага --subject (обратная совместимость со старыми generated-файлами без
 * поля subject). topicMapsBySubject собирается снаружи (insert-to-db.ts) —
 * эта функция никогда не ходит в сеть, только принимает решение.
 */
export function resolveTopic(
  item: TopicResolutionInput,
  flagSubject: string,
  topicMapsBySubject: ReadonlyMap<string, ReadonlyMap<string, string> | null>,
): TopicResolution {
  const subject = item.subject ?? flagSubject;
  const topicMap = topicMapsBySubject.get(subject);
  if (!topicMap) return { kind: 'unknown_subject', subject };
  const topicId = topicMap.get(item.topic_slug);
  if (!topicId) return { kind: 'unknown_topic', subject, topicSlug: item.topic_slug };
  return { kind: 'resolved', subject, topicId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/topic-resolve.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/topic-resolve.ts scripts/lib/topic-resolve.test.ts
git commit -m "feat(gen): topic-resolve — per-item subject routing for insert-to-db.ts"
```

---

### Task 4: `transcribe-questions.ts` — always detect subject in `--multi`, `--subject` optional

**Files:**
- Modify: `scripts/transcribe-questions.ts`

**Interfaces:**
- Consumes: `applySubjectFilter`, `summarizeBySubject` from `./lib/subject-filter` (Task 2); `SUBJECT_VALUES`, `AUTO_SUBJECT_PREFIX`, `getTopicSlugs` from `./lib/schema` (Task 1, existing).
- Produces: no change to exported surface (this is the CLI entrypoint). `parseArgs()`'s `subject` becomes `string | undefined`.

This file has no dedicated unit test today (it's an I/O-heavy CLI entrypoint — `main()`, `transcribeImage*`, batch submission — matching the existing convention where only the extracted pure logic in `scripts/lib/*` is tested). The pure logic this task adds (`applySubjectFilter`, `summarizeBySubject`) is already tested in Tasks 2. Verify this task via `npm run typecheck` + `npm run lint` + a read-through, not a new test file.

- [ ] **Step 1: Update imports**

In `scripts/transcribe-questions.ts`, replace:

```ts
import {
  ReferenceQuestionSchema,
  SkipItemSchema,
  getTopicSlugs,
  SUBJECT_LABEL,
  DIFFICULTY_LEVEL_PROMPT,
  type TranscriptionItem,
} from './lib/schema';
import { resolveModel } from './lib/models';
import { parseMultiItems } from './lib/multi-transcribe';
import { referencesMissingVisual } from './lib/checks';
```

with:

```ts
import {
  ReferenceQuestionSchema,
  SkipItemSchema,
  getTopicSlugs,
  SUBJECT_LABEL,
  SUBJECT_VALUES,
  AUTO_SUBJECT_PREFIX,
  DIFFICULTY_LEVEL_PROMPT,
  type TranscriptionItem,
} from './lib/schema';
import { resolveModel } from './lib/models';
import { parseMultiItems } from './lib/multi-transcribe';
import { referencesMissingVisual } from './lib/checks';
import { applySubjectFilter, summarizeBySubject, UNDETERMINED_SUBJECT_REASON } from './lib/subject-filter';
```

- [ ] **Step 2: `--subject` becomes optional in `parseArgs`**

Replace:

```ts
function parseArgs(): {
  dir: string;
  limit: number;
  subject: string;
  sync: boolean;
  multi: boolean;
} {
  const args = process.argv.slice(2);
  let dir = '';
  let limit = Infinity;
  let subject = 'math';
  let sync = false;
  let multi = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) dir = expandPath(args[++i]);
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
    if (args[i] === '--sync') sync = true;
    if (args[i] === '--multi') multi = true;
  }
  if (!dir) {
    console.error(
      'Usage: npm run gen:transcribe -- --dir <path> [--subject math] [--limit N] [--sync] [--multi]',
    );
    process.exit(1);
  }
  return { dir, limit, subject, sync, multi };
}
```

with:

```ts
function parseArgs(): {
  dir: string;
  limit: number;
  subject: string | undefined;
  sync: boolean;
  multi: boolean;
} {
  const args = process.argv.slice(2);
  let dir = '';
  let limit = Infinity;
  let subject: string | undefined;
  let sync = false;
  let multi = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) dir = expandPath(args[++i]);
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
    if (args[i] === '--sync') sync = true;
    if (args[i] === '--multi') multi = true;
  }
  if (!dir) {
    console.error(
      'Usage: npm run gen:transcribe -- --dir <path> [--subject math] [--limit N] [--sync] [--multi]',
    );
    process.exit(1);
  }
  return { dir, limit, subject, sync, multi };
}
```

- [ ] **Step 3: Rewrite `buildMultiSystemInstruction` to always ask for subject**

Replace the whole existing `buildMultiSystemInstruction` function (from its doc comment through its closing `}`) with:

```ts
function subjectTopicCatalog(): string {
  return SUBJECT_VALUES.map((s) => `  ${s} — ${getTopicSlugs(s).join('|')}`).join('\n');
}

/**
 * --multi: изображение — разворот печатной книжки, несколько заданий на кадре.
 * Всегда просим модель определить subject у каждого задания отдельно (даже
 * если --subject передан флагом) — фильтрация по флагу происходит потом, в
 * коде (applySubjectFilter), а не здесь в промпте. Это ловит случайно
 * подмешанные страницы другого предмета вместо того, чтобы молча пихать их в
 * тему целевого предмета.
 */
function buildMultiSystemInstruction(): string {
  return `You are an experienced Kazakhstani ЕНТ (Unified National Testing) teacher — covering mathematics, physics, computer science (informatics), and mathematical literacy — transcribing test problems from a photographed page of a printed practice booklet.

The image contains SEVERAL test problems (a two-column book spread). Extract ALL problems that are FULLY visible — condition and all answer options.

Output ONLY a valid JSON array — no markdown, no code fences, just raw JSON. One entry per problem, in reading order.

⚠️  DETERMINE THE SUBJECT OF EACH PROBLEM. The page header usually prints the subject name in Russian: МАТЕМАТИКА → "math", ФИЗИКА → "physics", ИНФОРМАТИКА → "informatics", МАТЕМАТИЧЕСКАЯ ГРАМОТНОСТЬ → "math-literacy". If the header is visible, use it. If there is no header (a continuation page bleeding in from the previous spread), determine the subject from the problem's own content: Python/SQL code, networks, encodings, binary/logic circuits → informatics; forces, current, gas laws, optics, and other physical quantities with units → physics; equations, functions, geometry, progressions, abstract algebra → math; everyday word problems about percentages, charts, diagrams, averages, real-world data → math-literacy. Report it in a "subject" field on EVERY extracted problem separately — a single spread can mix problems from different subjects, so never assume the whole image is one subject. If you cannot determine the subject with confidence, set "subject": null.

⚠️  DO NOT EXTRACT PROBLEMS THAT DEPEND ON A PICTURE — not even partially, not even if you can guess the rest. We have NO support for images in questions; a problem whose condition needs a picture, diagram, chart, or graph to understand (electrical circuits, geometric drawings, function graphs, image-based tables) is UNUSABLE no matter how well you transcribe its text. Watch for these exact phrases in the Russian text — any of them means the problem POINTS AT a picture that exists outside the text and MUST be skipped: "как показано на рисунке", "на схеме", "на графике", "изображён на" / "изображена на", "указаны на рисунке", "приведён на рисунке", "см. рис.". Do not confuse this with a problem that asks the student to build a graph themselves ("постройте график функции") — that one has no missing picture and stays. For each skipped problem, still emit an entry:
{"skip": "graph", "reason": "<brief reason>", "source_file": "<PLACEHOLDER>"}

⚠️  THIS APPLIES TO EVERY SUB-PART, NOT JUST THE WHOLE PROBLEM. A picture-dependent setup (e.g. a circuit diagram) is often followed by SEVERAL short sub-questions that each ask for one quantity ("Общее сопротивление цепи", "Значение силы тока $I_1$", "Мощность резистора R"). Each of those sub-questions is JUST AS UNUSABLE as the main problem — do not extract any of them as separate stand-alone problems, and NEVER invent or guess a numeric answer for one just because it looks like a normal multiple-choice question. Skip the whole group with one "skip":"graph" entry.

⚠️  IGNORE HANDWRITTEN MARKS. Circled letters, checkmarks, crossed-out text, and margin calculations are a STUDENT'S OWN ANSWERS and MAY BE WRONG. Determine the correct answer yourself by solving the problem — never read it off the handwritten marks.

⚠️  IGNORE fragments of a neighboring page or column bleeding in at the edge of the photo — only take problems visible IN FULL (condition + all options). Do not take a problem that shows a number but not its full text.

⚠️  SELF-CONTAINED STEMS. Some problems share a preceding context block (a passage, a described figure with given measurements, a shared condition) that applies to several numbered problems at once. Each problem you extract MUST stand alone: copy the relevant shared context (the given numbers, the described figure, the passage) INTO that problem's own stem. Never rely on a previous array entry to supply missing information — a problem shown by itself, without its neighbors, must still be fully solvable.

⚠️  TWO-PART PROBLEMS. If one problem number presents two independently-answered parts, each with its OWN lettered options (e.g. "Найдите f(g(x)): A) B) C) D)" followed by "Найдите g(f(x)): E) F) G) H)"), extract them as TWO SEPARATE single-choice problems — one per lettered option set, each with the shared condition copied into its stem. Do NOT also emit a combined "multi" entry whose options are the sub-questions themselves — that produces a nonsensical question.

If a problem is unclear or not a recognizable ЕНТ question, skip it the same way:
{"skip": "unsupported", "reason": "<brief reason>", "source_file": "<PLACEHOLDER>"}

Otherwise, for each transcribed problem:
{
  "subject": "<math|physics|informatics|math-literacy|null>",
  "topic_slug": "<pick from the list for the subject above>",
  "type": "<single|multi|matching>",
  "difficulty": <1–5: 1=trivial, 2=easy, 3=typical ЕНТ, 4=hard, 5=olympiad>,
  "body": { ... see formats below ... },
  "explanation": { "blocks": [{"type": "text"|"latex", "value": "..."}] },
  "source_file": "<PLACEHOLDER>"
}

Topic slugs by subject:
${subjectTopicCatalog()}

Body formats:
• single  — {"stem":"...","options":[{"id":"a","content":"..."},{"id":"b","content":"..."},{"id":"c","content":"..."},{"id":"d","content":"..."}],"correct":"b"}
• multi   — {"stem":"...","options":[...],"correct":["a","c"]}
• matching — {"stem":"...","left":[{"id":"1","content":"..."},...],"right":["А текст","Б текст",...],"correct":{"1":"А","2":"Б",...}}

Rules:
- All text in Russian
- Use $...$ for inline LaTeX: $x^2 + 1$, $\\log_2 8$, $\\sin\\frac{\\pi}{6}$
- Pick topic_slug only from the list of the subject you determined
- For informatics: code fragments go inside the stem as plain text
- For physics: always keep correct units (м/с, кг, Н, Дж и т.п.)
- difficulty: honest assessment — typical ЕНТ = 3`;
}
```

(`buildSystemInstruction` — the single-image, non-`--multi` prompt builder — is untouched.)

- [ ] **Step 4: Update the call site that builds the system prompt**

In `main()`, replace:

```ts
  const anthropic = new Anthropic({ apiKey });
  const system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'] = [
    {
      type: 'text',
      text: multi ? buildMultiSystemInstruction(subject) : buildSystemInstruction(subject),
      cache_control: { type: 'ephemeral' },
    },
  ];
```

with:

```ts
  const anthropic = new Anthropic({ apiKey });
  const system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'] = [
    {
      type: 'text',
      text: multi ? buildMultiSystemInstruction() : buildSystemInstruction(subject ?? 'math'),
      cache_control: { type: 'ephemeral' },
    },
  ];
```

- [ ] **Step 5: Normalize `subject` for non-`--multi` runs and fix the output filename**

Near the top of `main()`, replace:

```ts
async function main() {
  loadEnv();

  const { dir, limit, subject, sync, multi } = parseArgs();
```

with:

```ts
async function main() {
  loadEnv();

  let { dir, limit, subject, sync, multi } = parseArgs();
  if (subject === undefined && !multi) {
    subject = 'math'; // историческое поведение одиночного режима: без --subject — математика
  }
```

Then later in `main()`, replace:

```ts
  const outDir = path.join(process.cwd(), 'scripts', 'references');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const outFile = path.join(outDir, `${subject}-${ts}.json`);
```

with:

```ts
  const outDir = path.join(process.cwd(), 'scripts', 'references');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const filePrefix = subject ?? AUTO_SUBJECT_PREFIX;
  const outFile = path.join(outDir, `${filePrefix}-${ts}.json`);
```

- [ ] **Step 6: Wire `applySubjectFilter` into `recordMulti`**

Replace the `recordMulti` function body:

```ts
  function recordMulti(
    items: TranscriptionItem[],
    discardedReasons: string[],
    inputTok: number,
    outputTok: number,
    cacheRead: number,
    cacheWrite: number,
  ): void {
    totalInput += inputTok;
    totalOutput += outputTok;
    totalCacheRead += cacheRead;
    totalCacheWrite += cacheWrite;

    for (const item of items) {
      if (!('skip' in item) && referencesMissingVisual(item)) {
        const filtered: TranscriptionItem = {
          skip: 'graph',
          reason: `Ссылается на отсутствующий визуальный материал (детерминантный фильтр): "${item.body.stem.slice(0, 60)}"`,
          source_file: item.source_file,
        };
        results.push(filtered);
        skipped++;
        filteredGraphs++;
        console.log(`  🚫  filtered(graph): ${filtered.reason}`);
        continue;
      }

      results.push(item);
      if ('skip' in item) {
        skipped++;
        if (item.skip === 'graph') graphs++;
        console.log(`  ⏭  skip(${item.skip}): ${item.reason}`);
      } else {
        extracted++;
        console.log(`  ✓  ${item.topic_slug} / ${item.type} / diff=${item.difficulty}`);
      }
    }

    for (const reason of discardedReasons) {
      discardedBySchema++;
      console.log(`  ❌  discarded (schema): ${reason}`);
    }
  }
```

with:

```ts
  function recordMulti(
    items: TranscriptionItem[],
    discardedReasons: string[],
    inputTok: number,
    outputTok: number,
    cacheRead: number,
    cacheWrite: number,
  ): void {
    totalInput += inputTok;
    totalOutput += outputTok;
    totalCacheRead += cacheRead;
    totalCacheWrite += cacheWrite;

    for (const item of items) {
      if (!('skip' in item) && referencesMissingVisual(item)) {
        const filtered: TranscriptionItem = {
          skip: 'graph',
          reason: `Ссылается на отсутствующий визуальный материал (детерминантный фильтр): "${item.body.stem.slice(0, 60)}"`,
          source_file: item.source_file,
        };
        results.push(filtered);
        skipped++;
        filteredGraphs++;
        console.log(`  🚫  filtered(graph): ${filtered.reason}`);
        continue;
      }

      if (!('skip' in item)) {
        const subjectResult = applySubjectFilter(item, subject);
        if (!subjectResult.keep) {
          const filtered: TranscriptionItem = {
            skip: 'unsupported',
            reason: subjectResult.reason,
            source_file: item.source_file,
          };
          results.push(filtered);
          skipped++;
          if (subjectResult.reason === UNDETERMINED_SUBJECT_REASON) {
            undeterminedSubject++;
          } else {
            filteredForeignSubject++;
          }
          console.log(`  🚫  filtered(subject): ${filtered.reason}`);
          continue;
        }
      }

      results.push(item);
      if ('skip' in item) {
        skipped++;
        if (item.skip === 'graph') graphs++;
        console.log(`  ⏭  skip(${item.skip}): ${item.reason}`);
      } else {
        extracted++;
        console.log(`  ✓  [${item.subject}] ${item.topic_slug} / ${item.type} / diff=${item.difficulty}`);
      }
    }

    for (const reason of discardedReasons) {
      discardedBySchema++;
      console.log(`  ❌  discarded (schema): ${reason}`);
    }
  }
```

- [ ] **Step 7: Add the two new counters**

Replace:

```ts
  let skipped = 0;
  let graphs = 0;
  let extracted = 0;
  let discardedBySchema = 0;
  let filteredGraphs = 0;
```

with:

```ts
  let skipped = 0;
  let graphs = 0;
  let extracted = 0;
  let discardedBySchema = 0;
  let filteredGraphs = 0;
  let filteredForeignSubject = 0;
  let undeterminedSubject = 0;
```

- [ ] **Step 8: Extend the `--multi` summary block with the per-subject breakdown**

Replace:

```ts
  if (multi) {
    console.log(`\n📊  Сводка:`);
    console.log(`   обработано изображений:        ${files.length}`);
    console.log(`   извлечено заданий:             ${extracted}`);
    console.log(
      `   пропущено из-за графики:       ${graphs + filteredGraphs} (модель: ${graphs}, фильтр: ${filteredGraphs})`,
    );
    console.log(`   пропущено (прочее):            ${skipped - graphs - filteredGraphs}`);
    console.log(`   отброшено схемой (невалидные): ${discardedBySchema}`);
  } else {
```

with:

```ts
  if (multi) {
    const subjectSummary = summarizeBySubject(results);
    console.log(`\n📊  Сводка:`);
    console.log(`   обработано изображений:        ${files.length}`);
    console.log(`   извлечено заданий:             ${extracted}`);
    console.log(
      `   пропущено из-за графики:       ${graphs + filteredGraphs} (модель: ${graphs}, фильтр: ${filteredGraphs})`,
    );
    console.log(`   пропущено (чужой предмет):     ${filteredForeignSubject}`);
    console.log(`   предмет не определён:          ${undeterminedSubject}`);
    console.log(
      `   пропущено (прочее):            ${skipped - graphs - filteredGraphs - filteredForeignSubject - undeterminedSubject}`,
    );
    console.log(`   отброшено схемой (невалидные): ${discardedBySchema}`);
    console.log(`   📚  по предметам:`);
    for (const s of SUBJECT_VALUES) {
      console.log(`      ${s}: ${subjectSummary.bySubject[s]}`);
    }
  } else {
```

- [ ] **Step 9: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors, 0 new warnings. (If `buildSystemInstruction(subject ?? 'math')` or any other spot still complains about `string | undefined`, double-check Step 5's normalization ran before every use of bare `subject` as a `string`.)

- [ ] **Step 10: Commit**

```bash
git add scripts/transcribe-questions.ts
git commit -m "feat(gen): --multi — определять subject по каждому заданию, --subject опционален"
```

---

### Task 5: `insert-to-db.ts` — route topics by each item's own subject

**Files:**
- Modify: `scripts/insert-to-db.ts`

**Interfaces:**
- Consumes: `ReferenceQuestionSchema`, `type ReferenceQuestion` from `./lib/schema` (Task 1, existing export); `resolveTopic` from `./lib/topic-resolve` (Task 3).

No new test file — `insert-to-db.ts` talks to Supabase and has no existing unit tests (matches convention); `resolveTopic`'s decision logic is already covered in Task 3. Verify via typecheck + lint + read-through.

- [ ] **Step 1: Update imports**

Replace:

```ts
import {
  GeneratedQuestionSchema,
  TranslatedQuestionSchema,
  type GeneratedQuestion,
  type TranslatedQuestion,
} from './lib/schema';
```

with:

```ts
import {
  GeneratedQuestionSchema,
  ReferenceQuestionSchema,
  TranslatedQuestionSchema,
  type GeneratedQuestion,
  type ReferenceQuestion,
  type TranslatedQuestion,
} from './lib/schema';
import { resolveTopic } from './lib/topic-resolve';
```

- [ ] **Step 2: Add a subject-scoped topic-map fetcher above `insertRuQuestions`**

Insert right before `async function insertRuQuestions(`:

```ts
/** Тянет subjects+topics для одного предмета; null (с warn) если предмет не найден в БД. */
async function fetchTopicMap(
  supabase: SupabaseServiceClient,
  subjectSlug: string,
): Promise<ReadonlyMap<string, string> | null> {
  const { data: subjectRow, error: subjectErr } = await supabase
    .from('subjects')
    .select('id')
    .eq('slug', subjectSlug)
    .single<SubjectRow>();

  if (subjectErr || !subjectRow) {
    console.warn(`  ⚠️  Предмет "${subjectSlug}" не найден в БД: ${subjectErr?.message ?? 'no data'}`);
    return null;
  }

  const { data: topicRows, error: topicsErr } = await supabase
    .from('topics')
    .select('id, slug')
    .eq('subject_id', subjectRow.id);

  if (topicsErr || !topicRows) {
    console.warn(`  ⚠️  Не удалось получить темы для "${subjectSlug}": ${topicsErr?.message ?? 'no data'}`);
    return null;
  }

  return new Map((topicRows as TopicRow[]).map((t) => [t.slug, t.id]));
}
```

- [ ] **Step 3: Rewrite `insertRuQuestions` to parse both schemas and resolve topics per item**

Replace the whole `insertRuQuestions` function:

```ts
async function insertRuQuestions(
  supabase: SupabaseServiceClient,
  rawBatch: unknown[],
  subject: string,
  publish: boolean,
): Promise<void> {
  const questions: GeneratedQuestion[] = [];
  for (const item of rawBatch) {
    const r = GeneratedQuestionSchema.safeParse(item);
    if (r.success) {
      questions.push(r.data);
    } else {
      const src = (item as Record<string, unknown>).variant_of ?? '?';
      console.warn(
        `⚠️  Skipping invalid question (${String(src)}): ${r.error.issues[0]?.message ?? 'unknown'}`,
      );
    }
  }

  if (questions.length === 0) {
    console.error('\n❌  No valid questions in input file.\n');
    process.exit(1);
  }

  console.log(
    `📋  Inserting ${questions.length} questions (subject: ${subject}, language: ru, is_published: ${publish})\n`,
  );

  const { data: subjectRow, error: subjectErr } = await supabase
    .from('subjects')
    .select('id')
    .eq('slug', subject)
    .single<SubjectRow>();

  if (subjectErr || !subjectRow) {
    console.error(
      `\n❌  Subject "${subject}" not found in DB: ${subjectErr?.message ?? 'no data'}\n`,
    );
    process.exit(1);
  }

  const { data: topicRows, error: topicsErr } = await supabase
    .from('topics')
    .select('id, slug')
    .eq('subject_id', subjectRow.id);

  if (topicsErr || !topicRows) {
    console.error(`\n❌  Failed to fetch topics: ${topicsErr?.message ?? 'no data'}\n`);
    process.exit(1);
  }

  const topicMap = new Map<string, string>(
    (topicRows as TopicRow[]).map((t) => [t.slug, t.id]),
  );

  let inserted = 0;
  let failed = 0;

  for (const [i, q] of questions.entries()) {
    const topicId = topicMap.get(q.topic_slug);
    if (!topicId) {
      console.warn(`  ⚠️  No DB topic for slug "${q.topic_slug}" — skipped`);
      failed++;
      continue;
    }

    const { error } = await supabase.from('questions').insert({
      topic_id: topicId,
      context_id: null,
      source_question_id: null,
      language: 'ru',
      type: q.type,
      difficulty: q.difficulty,
      body: q.body,
      explanation: q.explanation,
      source: 'ai_haiku',
      is_published: publish,
      sort_order: 1000 + i + 1,
    });

    if (error) {
      console.warn(`  ❌  Insert failed (${q.topic_slug}): ${error.message}`);
      failed++;
    } else {
      inserted++;
      process.stdout.write('.');
    }
  }

  console.log(`\n\n✅  Inserted: ${inserted}  Failed: ${failed}  Total: ${questions.length}`);
  console.log(
    publish
      ? `   Subject: ${subject}  |  is_published: true  |  Задачи уже ЖИВЫЕ на сайте ✅\n`
      : `   Subject: ${subject}  |  is_published: false  |  Ready for review at /admin/review\n`,
  );
}
```

with:

```ts
async function insertRuQuestions(
  supabase: SupabaseServiceClient,
  rawBatch: unknown[],
  subject: string,
  publish: boolean,
): Promise<void> {
  type InsertCandidate = GeneratedQuestion | ReferenceQuestion;
  const questions: InsertCandidate[] = [];
  for (const item of rawBatch) {
    const genResult = GeneratedQuestionSchema.safeParse(item);
    if (genResult.success) {
      questions.push(genResult.data);
      continue;
    }
    const refResult = ReferenceQuestionSchema.safeParse(item);
    if (refResult.success) {
      questions.push(refResult.data);
      continue;
    }
    const record = item as Record<string, unknown>;
    const src = record.variant_of ?? record.source_file ?? '?';
    console.warn(
      `⚠️  Skipping invalid question (${String(src)}): ${genResult.error.issues[0]?.message ?? 'unknown'}`,
    );
  }

  if (questions.length === 0) {
    console.error('\n❌  No valid questions in input file.\n');
    process.exit(1);
  }

  console.log(
    `📋  Inserting ${questions.length} questions (default subject: ${subject}, language: ru, is_published: ${publish})\n`,
  );

  const neededSubjects = new Set<string>([subject]);
  for (const q of questions) {
    if (q.subject) neededSubjects.add(q.subject);
  }

  const topicMapsBySubject = new Map<string, ReadonlyMap<string, string> | null>();
  for (const s of neededSubjects) {
    topicMapsBySubject.set(s, await fetchTopicMap(supabase, s));
  }

  let inserted = 0;
  let failed = 0;

  for (const [i, q] of questions.entries()) {
    const resolution = resolveTopic(q, subject, topicMapsBySubject);
    if (resolution.kind === 'unknown_subject') {
      console.warn(`  ⚠️  Предмет "${resolution.subject}" недоступен в БД — задача пропущена`);
      failed++;
      continue;
    }
    if (resolution.kind === 'unknown_topic') {
      console.warn(
        `  ⚠️  No DB topic for slug "${resolution.topicSlug}" (${resolution.subject}) — skipped`,
      );
      failed++;
      continue;
    }

    const { error } = await supabase.from('questions').insert({
      topic_id: resolution.topicId,
      context_id: null,
      source_question_id: null,
      language: 'ru',
      type: q.type,
      difficulty: q.difficulty,
      body: q.body,
      explanation: q.explanation,
      source: 'ai_haiku',
      is_published: publish,
      sort_order: 1000 + i + 1,
    });

    if (error) {
      console.warn(`  ❌  Insert failed (${q.topic_slug}): ${error.message}`);
      failed++;
    } else {
      inserted++;
      process.stdout.write('.');
    }
  }

  console.log(`\n\n✅  Inserted: ${inserted}  Failed: ${failed}  Total: ${questions.length}`);
  console.log(
    publish
      ? `   Subjects: ${[...neededSubjects].join(', ')}  |  is_published: true  |  Задачи уже ЖИВЫЕ на сайте ✅\n`
      : `   Subjects: ${[...neededSubjects].join(', ')}  |  is_published: false  |  Ready for review at /admin/review\n`,
  );
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors, 0 new warnings.

- [ ] **Step 5: Commit**

```bash
git add scripts/insert-to-db.ts
git commit -m "feat(gen): insert-to-db.ts — резолвить тему по subject задания, а не только по флагу"
```

---

### Task 6: `gen-all.ts` — `--subject` optional, transcription-only auto-detect run + summary

**Files:**
- Modify: `scripts/gen-all.ts`

**Interfaces:**
- Consumes: `SUBJECT_VALUES`, `AUTO_SUBJECT_PREFIX`, `type TranscriptionItem` from `./lib/schema` (Task 1); `summarizeBySubject` from `./lib/subject-filter` (Task 2).

No new test file — `gen-all.ts` is a pure orchestrator (`execSync` subprocess calls), matches existing convention of zero direct tests. Verify via typecheck + lint + read-through (and, if the user wants, a real dry run against the photo batch — out of scope for this plan, mention it in the final report).

- [ ] **Step 1: Add imports**

Replace:

```ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
```

with:

```ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { SUBJECT_VALUES, AUTO_SUBJECT_PREFIX, type TranscriptionItem } from './lib/schema';
import { summarizeBySubject } from './lib/subject-filter';
```

- [ ] **Step 2: `--subject` becomes optional, required together with `--multi`**

Replace:

```ts
function parseArgs(): {
  dir: string;
  subject: string;
  variants: number;
  limit: number | undefined;
  noVerify: boolean;
  publish: boolean;
  sync: boolean;
  multi: boolean;
} {
  const args = process.argv.slice(2);
  let dir = '';
  let subject = 'math';
  let variants = 3;
  let limit: number | undefined;
  let noVerify = false;
  let publish = false;
  let sync = false;
  let multi = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) dir = expandPath(args[++i]);
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
    if (args[i] === '--variants' && args[i + 1]) variants = parseInt(args[++i], 10);
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    if (args[i] === '--no-verify') noVerify = true;
    if (args[i] === '--publish') publish = true;
    if (args[i] === '--sync') sync = true;
    if (args[i] === '--multi') multi = true;
  }
  if (!dir) {
    console.error(
      'Usage: npm run gen:all -- --dir <path> --subject <slug> [--variants N] [--limit N] [--no-verify] [--publish] [--sync] [--multi]',
    );
    process.exit(1);
  }
  return { dir, subject, variants, limit, noVerify, publish, sync, multi };
}
```

with:

```ts
function parseArgs(): {
  dir: string;
  subject: string | undefined;
  variants: number;
  limit: number | undefined;
  noVerify: boolean;
  publish: boolean;
  sync: boolean;
  multi: boolean;
} {
  const args = process.argv.slice(2);
  let dir = '';
  let subject: string | undefined;
  let variants = 3;
  let limit: number | undefined;
  let noVerify = false;
  let publish = false;
  let sync = false;
  let multi = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) dir = expandPath(args[++i]);
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
    if (args[i] === '--variants' && args[i + 1]) variants = parseInt(args[++i], 10);
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    if (args[i] === '--no-verify') noVerify = true;
    if (args[i] === '--publish') publish = true;
    if (args[i] === '--sync') sync = true;
    if (args[i] === '--multi') multi = true;
  }
  if (!dir) {
    console.error(
      'Usage: npm run gen:all -- --dir <path> [--subject <slug>] [--variants N] [--limit N] [--no-verify] [--publish] [--sync] [--multi]',
    );
    process.exit(1);
  }
  if (subject === undefined && !multi) {
    console.error(
      '\n❌  --subject обязателен без --multi (автоопределение предмета работает только в --multi режиме)\n',
    );
    process.exit(1);
  }
  return { dir, subject, variants, limit, noVerify, publish, sync, multi };
}
```

- [ ] **Step 3: Use `subject ?? AUTO_SUBJECT_PREFIX` for the reference lookup, add the auto-detect early-return**

Replace:

```ts
  console.log(`\n🚀  gen:all`);
  console.log(`   subject:  ${subject}`);
  console.log(`   dir:      ${dir}`);
  console.log(`   variants: ${variants}`);
  if (limit) console.log(`   limit:    ${limit}`);
  console.log(`   verify:   ${noVerify ? 'OFF (--no-verify)' : 'ON (Sonnet)'}`);
  console.log(`   mode:     ${mode}`);
  if (multi) console.log(`   multi:    ON (несколько заданий на фото)`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── Step 1: Transcribe ──────────────────────────────────────────
  console.log(`STEP 1/${steps}  Transcription (PNG → reference JSON, ${mode})`);
  const limitArg = limit !== undefined ? ` --limit ${limit}` : '';
  run(
    `${tsx} scripts/transcribe-questions.ts --dir "${dir}" --subject ${subject}${limitArg}${syncArg}${multiArg}`,
  );

  const refDir = path.join(process.cwd(), 'scripts', 'references');
  const refFile = newestJson(refDir, subject);
  if (!refFile) {
    console.error('\n❌  No reference file found after transcription.\n');
    process.exit(1);
  }
  console.log(`\n   → Reference: ${refFile}`);
```

with:

```ts
  console.log(`\n🚀  gen:all`);
  console.log(`   subject:  ${subject ?? 'auto (определяется по странице)'}`);
  console.log(`   dir:      ${dir}`);
  console.log(`   variants: ${variants}`);
  if (limit) console.log(`   limit:    ${limit}`);
  console.log(`   verify:   ${noVerify ? 'OFF (--no-verify)' : 'ON (Sonnet)'}`);
  console.log(`   mode:     ${mode}`);
  if (multi) console.log(`   multi:    ON (несколько заданий на фото)`);
  if (subject === undefined) {
    console.log(`   ⚠️  Без --subject выполняется только шаг 1 (транскрипция); дальше — вручную по предметам.`);
  }
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── Step 1: Transcribe ──────────────────────────────────────────
  console.log(`STEP 1/${steps}  Transcription (PNG → reference JSON, ${mode})`);
  const limitArg = limit !== undefined ? ` --limit ${limit}` : '';
  const subjectArg = subject ? ` --subject ${subject}` : '';
  run(
    `${tsx} scripts/transcribe-questions.ts --dir "${dir}"${subjectArg}${limitArg}${syncArg}${multiArg}`,
  );

  const refDir = path.join(process.cwd(), 'scripts', 'references');
  const refFile = newestJson(refDir, subject ?? AUTO_SUBJECT_PREFIX);
  if (!refFile) {
    console.error('\n❌  No reference file found after transcription.\n');
    process.exit(1);
  }
  console.log(`\n   → Reference: ${refFile}`);

  if (subject === undefined) {
    const items = JSON.parse(fs.readFileSync(refFile, 'utf8')) as TranscriptionItem[];
    const summary = summarizeBySubject(items);
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊  Сводка по предметам:');
    for (const s of SUBJECT_VALUES) {
      console.log(`   ${s}: ${summary.bySubject[s]}`);
    }
    console.log(`   предмет не определён: ${summary.undetermined}`);
    console.log(
      `\n   Reference-файл готов: ${refFile}\n   Запусти gen:variants / gen:verify / gen:insert вручную для каждого предмета (--subject <slug> --input "${refFile}").\n`,
    );
    return;
  }
```

(Everything after this point — steps 2–4 — is unchanged: `subject` is narrowed to `string` for the rest of `main()` because every path that reaches this point already returned inside the `if (subject === undefined)` block above.)

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors, 0 new warnings. Confirm `subject` is inferred as `string` (not `string | undefined`) at the `generate-variants.ts`/`verify-questions.ts`/`insert-to-db.ts` `run(...)` call sites below the early return — if TS complains, it means the narrowing didn't take (unlikely, since the guard uses direct `subject === undefined` on the destructured const), and the fix is to restructure the guard as a single `if (subject === undefined) { ...; return; }` exactly as written above (not wrapped in an extra indirection).

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-all.ts
git commit -m "feat(gen): gen-all.ts — --subject опционален с --multi, сводка по предметам"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full quality gate**

Run: `/verify` (or manually: `npm run typecheck && npm run lint && npm test && npm run build`)
Expected: typecheck 0 errors, lint 0 new warnings, all Vitest suites green (including the 3 new test files from Tasks 1–3), build succeeds.

- [ ] **Step 2: Report to the user**

Summarize: files touched, new test files and what they cover (mapped back to the 5 checklist bullets from the original request), and the two decisions made mid-task (merged `main` in; `gen-all.ts` auto-detect stops after transcription — rest is manual). Remind: **not merged to main, not pushed**, per the original instruction.
