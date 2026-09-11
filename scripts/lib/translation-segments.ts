import type { ContentBlock, ExplanationType, MatchingBody, QuestionBody } from './schema';
import type { TranslationOriginal } from './checks';

export type ProtectedToken = { token: string; value: string };
export type TranslationSegment = { path: string; sourceText: string; protectedTokens: ProtectedToken[]; fixedTranslation?: string };
export type TranslationIssue = { code: 'russian-in-latex' | 'image-text-unknown' | 'ambiguous-unit' | 'glossary-inflection-review'; path: string };
export type TranslationContext = { title: string | null; content: { blocks: ContentBlock[] } };
export type TranslationGlossary = Readonly<Record<string, string>>;

const protectedPattern = /\$\$[\s\S]*?\$\$|\$[^$]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|`[^`]*`|https?:\/\/[^\s]+|(?<![\p{L}_])[-+]?\d+(?:[.,]\d+)?(?![\p{L}_])/gu;
const formulaPattern = /\$\$[\s\S]*?\$\$|\$[^$]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g;
const hasLetters = (value: string) => /\p{L}/u.test(value);

function maskProtected(value: string): { value: string; protectedTokens: ProtectedToken[] } {
  const protectedTokens: ProtectedToken[] = [];
  const masked = value.replace(protectedPattern, (match) => {
    const token = `[[AP_${protectedTokens.length}]]`;
    protectedTokens.push({ token, value: match });
    return token;
  });
  return { value: masked, protectedTokens };
}

function exactGlossaryTranslation(value: string, glossary: TranslationGlossary | undefined): string | undefined {
  if (!glossary) return undefined;
  const whitespace = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!whitespace) return undefined;
  const translated = glossary[whitespace[2]];
  return translated === undefined ? undefined : `${whitespace[1]}${translated}${whitespace[3]}`;
}

function addSegment(segments: TranslationSegment[], path: string, value: string, glossary?: TranslationGlossary): void {
  const { value: sourceText, protectedTokens } = maskProtected(value);
  // Never pay for a text field that has only an invariant number/formula/URL.
  if (hasLetters(sourceText.replace(/\[\[AP_\d+\]\]/g, ''))) {
    segments.push({ path, sourceText, protectedTokens, fixedTranslation: exactGlossaryTranslation(value, glossary) });
  }
}

function addBlocks(segments: TranslationSegment[], path: string, blocks: ContentBlock[], glossary?: TranslationGlossary): void {
  blocks.forEach((block, index) => {
    const blockPath = `${path}[${index}]`;
    if (block.type === 'latex' || block.type === 'image') return;
    if (block.type === 'table') {
      block.columns.forEach((cell, cellIndex) => addSegment(segments, `${blockPath}.columns[${cellIndex}]`, cell, glossary));
      block.rows.forEach((row, rowIndex) => row.forEach((cell, cellIndex) => addSegment(segments, `${blockPath}.rows[${rowIndex}][${cellIndex}]`, cell, glossary)));
      return;
    }
    addSegment(segments, `${blockPath}.value`, block.value, glossary);
  });
}

/** Extract only language-bearing leaves; IDs, answer keys and structural arrays never reach the provider. */
export function extractQuestionSegments(original: TranslationOriginal, glossary?: TranslationGlossary): { segments: TranslationSegment[] } {
  const segments: TranslationSegment[] = [];
  const body = original.body;
  addSegment(segments, 'body.stem', body.stem, glossary);
  if (body.stem_blocks) addBlocks(segments, 'body.stem_blocks', body.stem_blocks, glossary);
  if ('options' in body) body.options.forEach((option, index) => addSegment(segments, `body.options[${index}].content`, option.content, glossary));
  if ('left' in body) {
    body.left.forEach((item, index) => addSegment(segments, `body.left[${index}].content`, item.content, glossary));
    body.right.forEach((item, index) => addSegment(segments, `body.right[${index}]`, item, glossary));
  }
  addBlocks(segments, 'explanation.blocks', original.explanation.blocks, glossary);
  return { segments };
}

/** Context IDs remain database references; only a distinct KK context created in C00c may replace them. */
export function extractContextSegments(context: TranslationContext, glossary?: TranslationGlossary): { segments: TranslationSegment[] } {
  const segments: TranslationSegment[] = [];
  if (context.title) addSegment(segments, 'context.title', context.title, glossary);
  addBlocks(segments, 'context.content.blocks', context.content.blocks, glossary);
  return { segments };
}

function restoreSegment(segment: TranslationSegment, translated: string): { ok: true; text: string } | { ok: false; reason: string } {
  let restored = translated;
  for (const item of segment.protectedTokens) {
    const occurrences = restored.split(item.token).length - 1;
    if (occurrences !== 1) return { ok: false, reason: `${segment.path}: placeholder ${item.token} occurrence count is ${occurrences}` };
    restored = restored.replace(item.token, item.value);
  }
  if (/\[\[AP_\d+\]\]/.test(restored)) return { ok: false, reason: `${segment.path}: unknown placeholder` };
  return { ok: true, text: restored };
}

function assignPath(root: Record<string, unknown>, path: string, value: string): void {
  const parts = [...path.matchAll(/([a-z_]+)|(\d+)/g)].map(match => match[1] ?? Number(match[2]));
  let cursor: Record<string, unknown> | unknown[] = root;
  for (let index = 0; index < parts.length - 1; index++) cursor = (cursor as Record<string, unknown>)[parts[index] as string] as Record<string, unknown> | unknown[];
  (cursor as Record<string, unknown>)[parts[parts.length - 1] as string] = value;
}

function updateMatchingCorrect(body: QuestionBody, original: QuestionBody): { ok: true } | { ok: false; reason: string } {
  if (!('left' in body) || !('left' in original)) return { ok: true };
  const originalMatching = original as MatchingBody;
  const translatedMatching = body as MatchingBody;
  const correct = { ...translatedMatching.correct };
  for (const [leftId, sourceRight] of Object.entries(originalMatching.correct)) {
    const index = originalMatching.right.indexOf(sourceRight);
    if (index < 0 || originalMatching.right.indexOf(sourceRight, index + 1) !== -1) return { ok: false, reason: `matching answer ${leftId} cannot be mapped uniquely` };
    correct[leftId] = translatedMatching.right[index];
  }
  translatedMatching.correct = correct;
  return { ok: true };
}

/** Restores the exact original object shape, then lets existing schema validation reject structural damage. */
export function applySegmentTranslations(
  original: TranslationOriginal,
  segments: readonly TranslationSegment[],
  translations: readonly string[],
): { ok: true; body: QuestionBody; explanation: ExplanationType } | { ok: false; reason: string } {
  if (segments.length !== translations.length) return { ok: false, reason: `translation count mismatch: ${segments.length} expected, ${translations.length} received` };
  const payload = structuredClone({ body: original.body, explanation: original.explanation }) as { body: QuestionBody; explanation: ExplanationType };
  for (let index = 0; index < segments.length; index++) {
    const restored = restoreSegment(segments[index], translations[index]);
    if (!restored.ok) return restored;
    assignPath(payload as unknown as Record<string, unknown>, segments[index].path, restored.text);
  }
  const matching = updateMatchingCorrect(payload.body, original.body);
  if (!matching.ok) return matching;
  return { ok: true, ...payload };
}

export function applyContextTranslations(
  original: TranslationContext,
  segments: readonly TranslationSegment[],
  translations: readonly string[],
): { ok: true; context: TranslationContext } | { ok: false; reason: string } {
  if (segments.length !== translations.length) return { ok: false, reason: `translation count mismatch: ${segments.length} expected, ${translations.length} received` };
  const payload = { context: structuredClone(original) } as { context: TranslationContext };
  for (let index = 0; index < segments.length; index++) {
    const restored = restoreSegment(segments[index], translations[index]);
    if (!restored.ok) return restored;
    assignPath(payload as unknown as Record<string, unknown>, segments[index].path, restored.text);
  }
  return { ok: true, context: payload.context };
}

function hasGlossaryTermInSentence(text: string, glossary: TranslationGlossary | undefined): boolean {
  if (!glossary) return false;
  const trimmed = text.trim();
  return Object.keys(glossary).some((source) => {
    if (trimmed === source) return false;
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'iu').test(text);
  });
}

function inspectBlocks(
  path: string,
  blocks: ContentBlock[],
  inspectText: (path: string, text: string) => void,
  issues: TranslationIssue[],
): void {
  blocks.forEach((block, index) => {
    const blockPath = `${path}[${index}]`;
    if (block.type === 'image') issues.push({ code: 'image-text-unknown', path: blockPath });
    else if (block.type === 'latex') {
      if (/[А-Яа-яЁё]/.test(block.value)) issues.push({ code: 'russian-in-latex', path: `${blockPath}.value` });
    } else if (block.type === 'table') {
      block.columns.forEach((cell, cellIndex) => inspectText(`${blockPath}.columns[${cellIndex}]`, cell));
      block.rows.forEach((row, rowIndex) => row.forEach((cell, cellIndex) => inspectText(`${blockPath}.rows[${rowIndex}][${cellIndex}]`, cell)));
    } else inspectText(`${blockPath}.value`, block.value);
  });
}

export function inspectManualReviewIssues(original: TranslationOriginal, glossary?: TranslationGlossary): TranslationIssue[] {
  const issues: TranslationIssue[] = [];
  const inspectText = (path: string, text: string) => {
    if (formulaPattern.test(text) && /[А-Яа-яЁё]/.test(text.match(formulaPattern)?.join('') ?? '')) issues.push({ code: 'russian-in-latex', path });
    formulaPattern.lastIndex = 0;
    if (/(?:\d\s*(?:кг|см|мм|м|км|с|мин|ч|°C|%))/iu.test(text)) issues.push({ code: 'ambiguous-unit', path });
    if (hasGlossaryTermInSentence(text, glossary)) issues.push({ code: 'glossary-inflection-review', path });
  };
  inspectText('body.stem', original.body.stem);
  inspectBlocks('body.stem_blocks', original.body.stem_blocks ?? [], inspectText, issues);
  if ('options' in original.body) original.body.options.forEach((option, index) => inspectText(`body.options[${index}].content`, option.content));
  if ('left' in original.body) {
    original.body.left.forEach((item, index) => inspectText(`body.left[${index}].content`, item.content));
    original.body.right.forEach((item, index) => inspectText(`body.right[${index}]`, item));
  }
  inspectBlocks('explanation.blocks', original.explanation.blocks, inspectText, issues);
  return issues;
}

export function inspectContextManualReviewIssues(context: TranslationContext, glossary?: TranslationGlossary): TranslationIssue[] {
  const issues: TranslationIssue[] = [];
  const inspect = (path: string, text: string) => {
    if (/[А-Яа-яЁё]/.test(text.match(formulaPattern)?.join('') ?? '')) issues.push({ code: 'russian-in-latex', path });
    formulaPattern.lastIndex = 0;
    if (/(?:\d\s*(?:кг|см|мм|м|км|с|мин|ч|°C|%))/iu.test(text)) issues.push({ code: 'ambiguous-unit', path });
    if (hasGlossaryTermInSentence(text, glossary)) issues.push({ code: 'glossary-inflection-review', path });
  };
  if (context.title) inspect('context.title', context.title);
  inspectBlocks('context.content.blocks', context.content.blocks, inspect, issues);
  return issues;
}
