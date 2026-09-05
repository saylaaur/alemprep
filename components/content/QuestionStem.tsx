'use client';

import { ContentBlocks } from '@/components/content/ContentBlocks';
import { MathText } from '@/components/math/MathText';
import type { QuestionBody } from '@/types/db';

export function QuestionStem({ body }: { body: QuestionBody }) {
  return body.stem_blocks?.length ? <ContentBlocks blocks={body.stem_blocks} /> : <MathText text={body.stem} />;
}
