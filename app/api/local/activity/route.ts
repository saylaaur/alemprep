import { NextResponse } from 'next/server';
import { isLocalMode } from '@/lib/data-mode';
import { activeDates, recordActivity, streakOf, type ActivityDelta } from '@/lib/local/activity';
import { updateLocalState } from '@/lib/local/store';
import { LocalStateTooLargeError } from '@/lib/local/state';
import { localDateStr } from '@/lib/streak';

/**
 * Запись активности дня в локальном режиме (без базы): задача решена, урок просмотрен.
 * Нужна, чтобы кольца и серия на «Сегодня» видели то, что происходит на странице урока.
 * Это route handler, а не server action: action с cookie заставил бы страницу урока
 * перерисоваться после каждой задачи.
 */
const DELTAS: Record<string, ActivityDelta> = {
  problem: { problems: 1 },
  lesson: { lessons: 1 },
};

export async function POST(request: Request) {
  if (!isLocalMode()) return NextResponse.json({ ok: false }, { status: 404 });
  // JSON нельзя отправить с чужого сайта без предварительного запроса — это и есть защита от подделки запроса.
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ ok: false }, { status: 415 });
  }
  const body = (await request.json().catch(() => null)) as { kind?: unknown } | null;
  const delta = typeof body?.kind === 'string' && Object.hasOwn(DELTAS, body.kind) ? DELTAS[body.kind] : null;
  if (!delta) return NextResponse.json({ ok: false }, { status: 400 });

  const today = localDateStr();
  try {
    const state = await updateLocalState((s) => recordActivity(s, today, delta));
    return NextResponse.json({ ok: true, streak: streakOf(activeDates(state), today) });
  } catch (e) {
    if (e instanceof LocalStateTooLargeError) return NextResponse.json({ ok: false }, { status: 507 });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
