'use server';

import { createClient } from './server';
import { revalidatePath } from 'next/cache';

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
  const supabase = await requireAdmin();
  const { error } = await supabase
    .from('questions')
    .update({ is_published: true })
    .eq('is_published', false);
  if (error) throw new Error(error.message);
  revalidateReview();
}
