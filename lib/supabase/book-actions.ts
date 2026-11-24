'use server';

import { revalidatePath } from 'next/cache';
import { getActor } from '@/lib/server/actor';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSupabaseBookRepository } from '@/lib/books/repository';
import { createBookService, type BookError } from '@/lib/books/service';
import { isContentEnabled, isLocalMode } from '@/lib/data-mode';
import { LOCAL_USER_ID } from '@/lib/local/state';
import { createLocalBooks } from '@/lib/local/books';
import { localDateStr } from '@/lib/streak';

async function service() {
  const local = isLocalMode();
  return createBookService({
    actorId: async () => local ? LOCAL_USER_ID : (await getActor())?.id ?? null,
    repo: local ? await createLocalBooks() : createSupabaseBookRepository(createAdminClient()),
    today: () => localDateStr(),
  });
}

function refresh() {
  revalidatePath('/[locale]/(app)/dashboard', 'page');
  revalidatePath('/[locale]/(app)/library', 'page');
  revalidatePath('/[locale]/(app)/review', 'page');
  revalidatePath('/[locale]/(app)/library/[book]', 'page');
}

type ActionResult = { ok: true; dueOn: string | null; stage: number } | { ok: false; error: BookError | 'temporarily-unavailable' };

/** Получить книгу (после урока). */
export async function receiveBookAction(slug: string): Promise<ActionResult> {
  if (!isContentEnabled()) return { ok: false, error: 'temporarily-unavailable' };
  try {
    const r = await (await service()).receiveBook(slug);
    if (!r.ok) return r;
    refresh();
    return { ok: true, dueOn: r.value.dueOn, stage: r.value.stage };
  } catch {
    return { ok: false, error: 'temporarily-unavailable' };
  }
}

/** Отметить повторение книги: recalled — доля вспомненного 0..1. */
export async function reviewBookAction(slug: string, recalled: number): Promise<ActionResult> {
  if (!isContentEnabled()) return { ok: false, error: 'temporarily-unavailable' };
  try {
    const r = await (await service()).reviewBook(slug, recalled);
    if (!r.ok) return r;
    refresh();
    return { ok: true, dueOn: r.value.dueOn, stage: r.value.stage };
  } catch {
    return { ok: false, error: 'temporarily-unavailable' };
  }
}
