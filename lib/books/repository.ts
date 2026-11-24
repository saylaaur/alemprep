import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookRepository } from './service';

/** Хранилище книг на service_role клиенте: пишет user_books/book_reviews, которые браузеру закрыты. */
export function createSupabaseBookRepository(admin: SupabaseClient): BookRepository {
  return {
    async findBook(slug) {
      const { data, error } = await admin.from('books').select('id, content_ru').eq('slug', slug).maybeSingle();
      if (error) throw error;
      return data ? { id: data.id as string, hasContent: data.content_ru !== null } : null;
    },

    async getUserBook(userId, bookId) {
      const { data, error } = await admin
        .from('user_books')
        .select('stage, due_on, reviews_count, lapses')
        .eq('user_id', userId)
        .eq('book_id', bookId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        stage: data.stage as number,
        dueOn: (data.due_on as string | null) ?? null,
        reviewsCount: data.reviews_count as number,
        lapses: data.lapses as number,
      };
    },

    async insertUserBook({ userId, bookId, receivedOn, schedule }) {
      const { data, error } = await admin
        .from('user_books')
        .upsert(
          { user_id: userId, book_id: bookId, received_on: receivedOn, stage: schedule.stage, due_on: schedule.dueOn },
          { onConflict: 'user_id,book_id', ignoreDuplicates: true }
        )
        .select('book_id');
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    async updateUserBook({ userId, bookId, expected }, next) {
      let q = admin
        .from('user_books')
        .update({
          stage: next.schedule.stage,
          due_on: next.schedule.dueOn,
          reviews_count: next.reviewsCount,
          lapses: next.lapses,
          last_reviewed_at: next.reviewedAt,
        })
        .eq('user_id', userId)
        .eq('book_id', bookId)
        .eq('stage', expected.stage);
      q = expected.dueOn === null ? q.is('due_on', null) : q.eq('due_on', expected.dueOn);
      const { data, error } = await q.select('book_id');
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    async insertReview(row) {
      const { error } = await admin.from('book_reviews').insert({
        user_id: row.userId,
        book_id: row.bookId,
        reviewed_on: row.reviewedOn,
        recalled: row.recalled,
        counted: row.counted,
        stage_before: row.stageBefore,
        stage_after: row.stageAfter,
        due_on_after: row.dueOnAfter,
      });
      if (error) throw error;
    },
  };
}
