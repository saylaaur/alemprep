'use server';

import { createClient } from './server';
import { revalidatePath } from 'next/cache';
import { isEligibleForPublication } from '@/scripts/lib/content-audit';
import type { Explanation, QuestionBody, QuestionType } from '@/types/db';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('unauthenticated');

  const { data } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!(data as { is_admin: boolean } | null)?.is_admin) {
    throw new Error('forbidden');
  }

  return supabase;
}

function revalidateReview() {
  revalidatePath('/ru/admin/review');
  revalidatePath('/kk/admin/review');
}

export async function publishQuestion(formData: FormData) {
  const id = formData.get('id') as string;
  if (!id) throw new Error('missing id');
  const supabase = await requireAdmin();
  const { data: question, error: questionError } = await supabase
    .from('questions')
    .select('type, body, explanation')
    .eq('id', id)
    .maybeSingle();
  if (questionError || !question) throw new Error(questionError?.message ?? 'question not found');
  if (!question.explanation) throw new Error('question has no explanation and cannot be published');

  const eligibility = isEligibleForPublication({
    type: question.type as QuestionType,
    body: question.body as QuestionBody,
    explanation: question.explanation as Explanation,
  });
  if (!eligibility.eligible) {
    throw new Error(`question is not eligible for publication: ${eligibility.reason}`);
  }

  const { error } = await supabase
    .from('questions')
    .update({ is_published: true })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidateReview();
}

export async function deleteQuestion(formData: FormData) {
  const id = formData.get('id') as string;
  if (!id) throw new Error('missing id');
  const supabase = await requireAdmin();
  const { error } = await supabase.from('questions').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidateReview();
}

export async function publishAll() {
  await requireAdmin();
  throw new Error('bulk publishing is disabled; review every question individually');
}
