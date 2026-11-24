import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookRepository } from './service';

/** Хранилище книг на service_role клиенте: пишет user_books/book_reviews, которые браузеру закрыты. */
export function createSupabaseBookRepository(admin: SupabaseClient): BookRepository {
  return {
    async findBook(slug) {
      const { data, error } = await admin.from('books').select('id, has_content').eq('slug', slug).maybeSingle();
      if (error) throw error;
      return data ? { id: data.id as string, hasContent: data.has_content === true } : null;
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

    async recordReview({ userId, bookId, previous, schedule, reviewedOn, reviewedAt, recalled, lapse }) {
      const { data, error } = await admin.rpc('record_book_review_v1', {
        p_user_id: userId,
        p_book_id: bookId,
        p_previous_stage: previous.stage,
        p_previous_due_on: previous.dueOn,
        p_stage: schedule.stage,
        p_due_on: schedule.dueOn,
        p_reviewed_on: reviewedOn,
        p_reviewed_at: reviewedAt,
        p_recalled: recalled,
        p_lapse: lapse,
      });
      if (error) throw error;
      return data === true;
    },
  };
}
