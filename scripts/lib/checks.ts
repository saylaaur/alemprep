import type { GeneratedQuestion } from './schema';

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
