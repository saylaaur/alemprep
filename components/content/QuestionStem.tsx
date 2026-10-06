'use client';

import { ContentBlocks } from '@/components/content/ContentBlocks';
import { MathText } from '@/components/math/MathText';
import type { PublicQuestionBody } from '@/lib/content/versions';

export function QuestionStem({ body }: { body: PublicQuestionBody }) {
  return body.stem_blocks?.length ? <ContentBlocks blocks={body.stem_blocks} /> : <MathText text={body.stem} />;
}
