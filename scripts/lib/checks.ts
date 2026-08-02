import {
  TranslationResponseSchema,
  type GeneratedQuestion,
  type QuestionBody,
  type ExplanationType,
  type SingleBody,
  type MultiBody,
  type MatchingBody,
} from './schema';

/**
 * Ссылки на визуальный материал, которого у нас нет (никогда не на само слово
 * «график»/«таблица» — иначе ловим и «постройте график функции», где ученик
 * строит график сам, а не смотрит на готовый).
 */
const VISUAL_REFERENCE_PATTERNS: RegExp[] = [
  /на\s+рисун/,
  /см\.?\s*рис/,
  /как\s+показан/,
  /на\s+схем/,
  /на\s+график/,
  /на\s+чертеж/,
  /на\s+диаграмм/,
  // причастие «изображён/-а/-о/-ы», но не существительное «изображение/-ия/-ию»
  /изображен(?!и)/,
  /указан[а-я]*\s+на\s/,
  /привед[а-я]*\s+на\s/,
  /в\s+таблиц/,
];

function normalizeForVisualCheck(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е');
}

function bodyTexts(body: QuestionBody): string[] {
  const texts: string[] = [(body as { stem: string }).stem];
  const b = body as Record<string, unknown>;

  if (Array.isArray(b.options)) {
    for (const opt of b.options as Array<{ content?: string }>) {
      if (typeof opt.content === 'string') texts.push(opt.content);
    }
  }
  if (Array.isArray(b.left)) {
    for (const item of b.left as Array<{ content?: string }>) {
      if (typeof item.content === 'string') texts.push(item.content);
    }
  }
  if (Array.isArray(b.right)) {
    for (const r of b.right as string[]) {
      if (typeof r === 'string') texts.push(r);
    }
  }

  return texts;
}

/**
 * true, если stem, варианты ответа (для matching — также left/right) ИЛИ
 * пояснение ссылаются на рисунок/схему/график/чертёж/диаграмму/таблицу,
 * приведённые в оригинале. У нас нет поддержки изображений в заданиях —
 * такой вопрос нерешаем и должен быть отброшен, даже если прошёл Zod-валидацию.
 *
 * Пояснение проверяем не просто для полноты: на живом прогоне модель иногда
 * зачищает ссылку на картинку из stem/options (условие выглядит валидно —
 * «Работа газа при переходе из состояния A в состояние B равна» без данных),
 * но пояснение всё равно выдаёт источник — «На графике показаны состояния
 * A(V, 2P) и B(3V, 2P)». Без данных из графика condition нерешаем, и это
 * видно только в explanation.
 */
export function referencesMissingVisual(question: {
  body: QuestionBody;
  explanation: ExplanationType;
}): boolean {
  const texts = [
    ...bodyTexts(question.body),
    ...question.explanation.blocks.map((b) => b.value),
  ].map(normalizeForVisualCheck);
  return texts.some((text) => VISUAL_REFERENCE_PATTERNS.some((re) => re.test(text)));
}

function stemOf(q: GeneratedQuestion): string {
  return ((q.body as { stem?: string }).stem ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function hasBadLatex(text: string): boolean {
  // Dollar signs must appear in pairs
  const count = (text.match(/\$/g) ?? []).length;
  if (count % 2 !== 0) return true;
  // Empty math block `$$` in inline context
  if (/\$\s*\$/.test(text)) return true;
  return false;
}

function latexError(q: GeneratedQuestion): string | null {
  const texts: string[] = [];
  const body = q.body as Record<string, unknown>;

  if (typeof body.stem === 'string') texts.push(body.stem);

  if (Array.isArray(body.options)) {
    for (const opt of body.options as Array<{ content?: string }>) {
      if (typeof opt.content === 'string') texts.push(opt.content);
    }
  }
  if (Array.isArray(body.left)) {
    for (const item of body.left as Array<{ content?: string }>) {
      if (typeof item.content === 'string') texts.push(item.content);
    }
  }
  if (Array.isArray(body.right)) {
    for (const r of body.right as string[]) texts.push(r);
  }

  for (const block of q.explanation.blocks) {
    texts.push(block.value);
  }

  for (const text of texts) {
    if (hasBadLatex(text)) return `unbalanced $ in: "${text.slice(0, 60)}"`;
  }
  return null;
}

export interface RejectedQuestion {
  question: GeneratedQuestion;
  reason: string;
}

export interface CheckResult {
  valid: GeneratedQuestion[];
  rejected: RejectedQuestion[];
}

export function validateAndFilter(questions: GeneratedQuestion[]): CheckResult {
  const valid: GeneratedQuestion[] = [];
  const rejected: RejectedQuestion[] = [];
  const seenStems = new Set<string>();

  for (const q of questions) {
    if (referencesMissingVisual(q)) {
      rejected.push({ question: q, reason: 'References missing visual material' });
      continue;
    }

    const latexErr = latexError(q);
    if (latexErr) {
      rejected.push({ question: q, reason: `LaTeX error: ${latexErr}` });
      continue;
    }

    const key = stemOf(q);
    if (key && seenStems.has(key)) {
      rejected.push({ question: q, reason: 'Duplicate stem' });
      continue;
    }
    if (key) seenStems.add(key);

    valid.push(q);
  }

  return { valid, rejected };
}

// =====================================================
// Translation validation (scripts/translate-questions.ts)
// =====================================================

const KAZAKH_ONLY_CHARS = /[әғқңөұүһі]/i;

/** Все подстроки $...$ в порядке появления, включая сами $. */
export function extractLatexSegments(text: string): string[] {
  return text.match(/\$[^$]*\$/g) ?? [];
}

/** true, если набор и порядок LaTeX-сегментов не изменился между оригиналом и переводом. */
function latexPreserved(original: string, translated: string): boolean {
  const a = extractLatexSegments(original);
  const b = extractLatexSegments(translated);
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg === b[i]);
}

export interface TranslationOriginal {
  type: 'single' | 'multi' | 'matching';
  body: QuestionBody;
  explanation: ExplanationType;
}

export type TranslationCheckResult =
  | { ok: true; body: QuestionBody; explanation: ExplanationType }
  | { ok: false; reason: string };

/**
 * Валидирует сырой JSON-ответ переводчика против оригинала. НЕ доверяет модели:
 * id вариантов/left и правильные ответы (single/multi) переопределяются
 * оригиналом ниже по конвейеру (см. translate-questions.ts) — здесь только
 * проверяем, что модель их не тронула, и отбраковываем, если тронула.
 */
export function validateTranslation(
  original: TranslationOriginal,
  translatedRaw: unknown,
): TranslationCheckResult {
  const parsed = TranslationResponseSchema.safeParse(translatedRaw);
  if (!parsed.success) {
    return { ok: false, reason: `Zod: ${parsed.error.issues[0]?.message ?? 'invalid shape'}` };
  }
  const { body: tBody, explanation: tExplanation } = parsed.data;

  if (original.type === 'single' || original.type === 'multi') {
    if (!('options' in tBody) || !('correct' in tBody)) {
      return { ok: false, reason: 'translated body missing options/correct' };
    }
    const oBody = original.body as SingleBody | MultiBody;
    const nBody = tBody as SingleBody | MultiBody;

    if (nBody.options.length !== oBody.options.length) {
      return {
        ok: false,
        reason: `option count mismatch: ${oBody.options.length} → ${nBody.options.length}`,
      };
    }
    const oIds = [...oBody.options.map((o) => o.id)].sort();
    const nIds = [...nBody.options.map((o) => o.id)].sort();
    if (JSON.stringify(oIds) !== JSON.stringify(nIds)) {
      return { ok: false, reason: `option id set changed: ${oIds.join(',')} → ${nIds.join(',')}` };
    }
    if (JSON.stringify(oBody.correct) !== JSON.stringify(nBody.correct)) {
      return {
        ok: false,
        reason: `correct changed: ${JSON.stringify(oBody.correct)} → ${JSON.stringify(nBody.correct)}`,
      };
    }
    if (!latexPreserved(oBody.stem, nBody.stem)) {
      return { ok: false, reason: `LaTeX altered in stem: "${oBody.stem.slice(0, 60)}"` };
    }
    for (const oOpt of oBody.options) {
      const nOpt = nBody.options.find((o) => o.id === oOpt.id);
      if (!nOpt || !latexPreserved(oOpt.content, nOpt.content)) {
        return { ok: false, reason: `LaTeX altered in option "${oOpt.id}"` };
      }
    }
  } else {
    if (!('left' in tBody) || !('right' in tBody) || !('correct' in tBody)) {
      return { ok: false, reason: 'translated body missing left/right/correct' };
    }
    const oBody = original.body as MatchingBody;
    const nBody = tBody as MatchingBody;

    if (nBody.left.length !== oBody.left.length) {
      return { ok: false, reason: `left count mismatch: ${oBody.left.length} → ${nBody.left.length}` };
    }
    if (nBody.right.length !== oBody.right.length) {
      return { ok: false, reason: `right count mismatch: ${oBody.right.length} → ${nBody.right.length}` };
    }
    const oLeftIds = [...oBody.left.map((l) => l.id)].sort();
    const nLeftIds = [...nBody.left.map((l) => l.id)].sort();
    if (JSON.stringify(oLeftIds) !== JSON.stringify(nLeftIds)) {
      return {
        ok: false,
        reason: `left id set changed: ${oLeftIds.join(',')} → ${nLeftIds.join(',')}`,
      };
    }
    const oKeys = Object.keys(oBody.correct).sort();
    const nKeys = Object.keys(nBody.correct).sort();
    if (JSON.stringify(oKeys) !== JSON.stringify(nKeys)) {
      return { ok: false, reason: `correct keys changed: ${oKeys.join(',')} → ${nKeys.join(',')}` };
    }
    const rightSet = new Set(nBody.right);
    for (const k of nKeys) {
      if (!rightSet.has(nBody.correct[k])) {
        return {
          ok: false,
          reason: `correct["${k}"]="${nBody.correct[k]}" not found in translated right list`,
        };
      }
    }
    if (!latexPreserved(oBody.stem, nBody.stem)) {
      return { ok: false, reason: `LaTeX altered in stem: "${oBody.stem.slice(0, 60)}"` };
    }
    for (const oItem of oBody.left) {
      const nItem = nBody.left.find((l) => l.id === oItem.id);
      if (!nItem || !latexPreserved(oItem.content, nItem.content)) {
        return { ok: false, reason: `LaTeX altered in left item "${oItem.id}"` };
      }
    }
    for (let i = 0; i < oBody.right.length; i++) {
      if (!latexPreserved(oBody.right[i], nBody.right[i])) {
        return { ok: false, reason: `LaTeX altered in right[${i}]` };
      }
    }
  }

  if (tExplanation.blocks.length !== original.explanation.blocks.length) {
    return {
      ok: false,
      reason: `explanation block count mismatch: ${original.explanation.blocks.length} → ${tExplanation.blocks.length}`,
    };
  }
  for (let i = 0; i < original.explanation.blocks.length; i++) {
    const ob = original.explanation.blocks[i];
    const nb = tExplanation.blocks[i];
    const oType = ob.type ?? 'text';
    const nType = nb.type ?? 'text';
    if (oType !== nType) {
      return { ok: false, reason: `explanation block ${i} type changed: ${oType} → ${nType}` };
    }
    if (oType === 'latex') {
      if (ob.value !== nb.value) {
        return { ok: false, reason: `LaTeX explanation block ${i} altered` };
      }
    } else if (!latexPreserved(ob.value, nb.value)) {
      return { ok: false, reason: `LaTeX altered in explanation block ${i}` };
    }
  }

  const originalText = collectTranslatableText(original.type, original.body, original.explanation);
  const translatedText = collectTranslatableText(original.type, tBody, tExplanation);
  if (!KAZAKH_ONLY_CHARS.test(translatedText)) {
    return { ok: false, reason: 'no Kazakh-specific characters found — likely not translated' };
  }
  if (normalizeWhitespace(originalText) === normalizeWhitespace(translatedText)) {
    return { ok: false, reason: 'translated text identical to original — likely returned as-is' };
  }

  return { ok: true, body: tBody, explanation: tExplanation };
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function collectTranslatableText(
  type: 'single' | 'multi' | 'matching',
  body: QuestionBody,
  explanation: ExplanationType,
): string {
  const parts: string[] = [(body as { stem: string }).stem];
  if (type === 'single' || type === 'multi') {
    const b = body as SingleBody | MultiBody;
    parts.push(...b.options.map((o) => o.content));
  } else {
    const b = body as MatchingBody;
    parts.push(...b.left.map((l) => l.content), ...b.right);
  }
  parts.push(...explanation.blocks.filter((b) => (b.type ?? 'text') !== 'latex').map((b) => b.value));
  return parts.join(' ');
}
