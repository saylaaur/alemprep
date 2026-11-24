import { NextResponse } from 'next/server';
import { isLocalMode } from '@/lib/data-mode';
import { recordActivity } from '@/lib/local/activity';
import { updateLocalState } from '@/lib/local/store';
import { LocalStateTooLargeError, TEST_KINDS, type TestKind } from '@/lib/local/state';
import { recordTest } from '@/lib/local/tests';
import { localDateStr } from '@/lib/streak';

/**
 * Запись результата теста без базы (диагностика, недельный тест, пробник).
 * Route handler, а не server action — тест не должен перерисовываться после сохранения.
 * Решённые вопросы идут в «Задачи» дня, чтобы кольца и серия их видели.
 */
export async function POST(request: Request) {
  if (!isLocalMode()) return NextResponse.json({ ok: false }, { status: 404 });
  // JSON нельзя отправить с чужого сайта без предварительного запроса — защита от подделки запроса.
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ ok: false }, { status: 415 });
  }
  const body = (await request.json().catch(() => null)) as { kind?: unknown; correct?: unknown; total?: unknown } | null;
  const kind = TEST_KINDS.find((k) => k === body?.kind) as TestKind | undefined;
  const { correct, total } = body ?? {};
  if (!kind || !Number.isInteger(correct) || !Number.isInteger(total) || (total as number) < 1 || (total as number) > 200 || (correct as number) < 0 || (correct as number) > (total as number)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const today = localDateStr();
  try {
    await updateLocalState((s) =>
      recordTest(recordActivity(s, today, { problems: total as number }), { date: today, kind, correct: correct as number, total: total as number })
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LocalStateTooLargeError) return NextResponse.json({ ok: false }, { status: 507 });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
