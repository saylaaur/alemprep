import type { ContentBlock, ContextContent, Locale, QuestionType } from '@/types/db';
import type { PublicQuestionBody, QuestionVersion } from './versions';

export type PublicQuestion = {
  id: string;
  locale: Locale;
  type: QuestionType;
  body: PublicQuestionBody;
  context: ContextContent | null;
  topicLabel: string;
};

function copyBlocks(blocks: ContentBlock[] | undefined): ContentBlock[] | undefined {
  return blocks?.map((block): ContentBlock => {
    if (block.type === 'table') {
      return {
        type: 'table',
        columns: [...block.columns],
        rows: block.rows.map((row) => [...row]),
      };
    }

    return { type: block.type, value: block.value };
  });
}

function copyContext(context: ContextContent | null): ContextContent | null {
  if (!context) return null;
  return { blocks: copyBlocks(context.blocks) ?? [] };
}

function copyPublicBody(version: QuestionVersion): PublicQuestionBody {
  const body = version.publicBody;
  const base = {
    stem: body.stem,
    ...(body.stem_blocks ? { stem_blocks: copyBlocks(body.stem_blocks) } : {}),
  };

  switch (version.type) {
    case 'single':
    case 'multi':
      if (!('options' in body)) throw new Error('question version body does not match its type');
      return {
        ...base,
        options: body.options.map((option) => ({ id: option.id, content: option.content })),
      };
    case 'matching':
      if (!('left' in body) || !('right' in body)) {
        throw new Error('question version body does not match its type');
      }
      return {
        ...base,
        left: body.left.map((option) => ({ id: option.id, content: option.content })),
        right: [...body.right],
      };
  }
}

/**
 * Produces the only question shape allowed to leave the server before review.
 * Every public field is intentionally listed: private grading and explanations
 * cannot become client-visible through a future object spread.
 */
export function toPublicQuestion(version: QuestionVersion): PublicQuestion {
  return {
    id: version.id,
    locale: version.locale,
    type: version.type,
    body: copyPublicBody(version),
    context: copyContext(version.contextSnapshot),
    topicLabel: version.topicLabel,
  };
}
