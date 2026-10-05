import { test, expect } from '@playwright/test';
import { createDbHarness, type DbHarness } from '../db/helpers';
import { loginAs } from './helpers';

test.skip(process.env.LEARNING_V1_ENABLED !== 'true', 'requires a dedicated trusted server');
let db: DbHarness;
let actors: string[] = [];
test.beforeEach(async () => { db = await createDbHarness(); actors = []; });
test.afterEach(async () => {
  for (const actor of actors) {
    await db.execute('DELETE FROM public.attempts WHERE user_id = $1', [actor]);
    await db.execute('DELETE FROM public.session_items WHERE session_id IN (SELECT id FROM public.sessions WHERE user_id = $1)', [actor]);
    await db.execute('DELETE FROM public.reward_ledger WHERE user_id = $1', [actor]);
    await db.execute('DELETE FROM public.sessions WHERE user_id = $1', [actor]);
    await db.execute('DELETE FROM public.operation_receipts WHERE actor_id = $1', [actor]);
  }
  await db?.close();
});

async function lesson(type: 'single' | 'multi' | 'matching' = 'single', locale: 'ru' | 'kk' = 'ru') {
  const actor = await db.actor('trusted-practice');
  actors.push(actor.id);
  await db.execute("UPDATE public.profiles SET second_subject = 'physics' WHERE id = $1", [actor.id]);
  const slug = `trusted-${crypto.randomUUID()}`;
  const subject = await db.scalar<string>("INSERT INTO public.subjects (slug, name_ru, name_kk) VALUES ($1, 'Test', 'Test') RETURNING id", [slug]);
  const topic = await db.scalar<string>("INSERT INTO public.topics (subject_id, slug, name_ru, name_kk) VALUES ($1, $2, 'Test topic', 'Test topic') RETURNING id", [subject, slug]);
  const body = type === 'matching'
    ? { stem: 'TRUSTED_PUBLIC_STEM', left: [{ id: '1', content: 'first' }, { id: '2', content: 'second' }], right: ['one', 'two'] }
    : { stem: 'TRUSTED_PUBLIC_STEM', options: [{ id: 'A', content: 'four' }, { id: 'B', content: 'five' }] };
  const grading = { ...body, stem: 'PRIVATE_GRADING_MARKER', correct: type === 'single' ? 'A' : type === 'multi' ? ['A', 'B'] : { '1': 'one', '2': 'one' } };
  const question = await db.scalar<string>("INSERT INTO public.questions (topic_id, type, language, body, is_published) VALUES ($1, $2, $3, $4, true) RETURNING id", [topic, type, locale, JSON.stringify(grading)]);
  const version = await db.scalar<string>(`INSERT INTO public.question_versions
    (question_id, family_id, revision, locale, type, public_body, grading_body, explanation, content_hash)
    VALUES ($1, gen_random_uuid(), 1, $2, $3, $4, $5, $6, $7) RETURNING id`,
  [question, locale, type, JSON.stringify(body), JSON.stringify(grading), JSON.stringify({ blocks: [{ type: 'text', value: 'PRIVATE_EXPLANATION_MARKER' }] }), `hash:${slug}`]);
  await db.execute("INSERT INTO public.question_publications (question_version_id, status) VALUES ($1, 'approved')", [version]);
  return { actor, slug, version };
}

test('public-only delivery, draft reload, server review, and submitted reload', async ({ page }) => {
  const { actor, slug } = await lesson();
  await loginAs(page, actor);
  const payloads: string[] = [];
  page.on('response', async (response) => {
    if (response.url().includes(`/practice/topic/${slug}`)) {
      try { payloads.push(await response.text()); } catch { /* aborted navigation */ }
    }
  });
  await page.goto(`/ru/practice/topic/${slug}`);
  await expect(page.getByText('TRUSTED_PUBLIC_STEM')).toBeVisible();
  await page.getByRole('radio', { name: 'B five' }).click();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'B five' })).toHaveAttribute('aria-checked', 'true');
  expect(payloads.join('')).not.toContain('PRIVATE_GRADING_MARKER');
  expect(payloads.join('')).not.toContain('PRIVATE_EXPLANATION_MARKER');
  const storage = await page.evaluate(() => sessionStorage.getItem('alemprep.learning.pending.v1'));
  expect(storage).not.toContain('correct');
  expect(storage).not.toContain('explanation');
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.getByText('PRIVATE_EXPLANATION_MARKER')).toBeVisible();
  await expect(page.getByTestId('learning-score')).toHaveText('0 / 1');
  await page.reload();
  await expect(page.getByText('PRIVATE_EXPLANATION_MARKER')).toBeVisible();
  expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE user_id = $1', [actor.id])).toBe(1);
});

test('lost delivery freezes the answer and retries the identical submit', async ({ page }) => {
  const { actor, slug } = await lesson();
  await loginAs(page, actor);
  await page.goto(`/ru/practice/topic/${slug}`);
  await page.getByRole('radio', { name: 'A four' }).click();
  let firstPayload: string | null = null;
  let retries = 0;
  await page.route(`**/ru/practice/topic/${slug}`, async (route) => {
    const body = route.request().postData();
    if (route.request().method() === 'POST' && body?.includes('timeSpentMs')) {
      if (!firstPayload) { firstPayload = body; await route.abort(); return; }
      expect(body).toBe(firstPayload);
      retries++;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Проверить', exact: true }).dblclick();
  await expect(page.getByText('Подтверждение не получено. Ответ сохранён для повторной отправки.')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'B five' })).toBeDisabled();
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByText('PRIVATE_EXPLANATION_MARKER')).toBeVisible();
  expect(retries).toBe(1);
  expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE user_id = $1', [actor.id])).toBe(1);
});

test('a confirmed submit reports review-read failure separately from delivery loss', async ({ page }) => {
  const { actor, slug } = await lesson();
  await loginAs(page, actor);
  await page.goto(`/ru/practice/topic/${slug}`);
  await page.getByRole('radio', { name: 'A four' }).click();
  let submitted = false;
  let reviewAborted = false;
  await page.route(`**/ru/practice/topic/${slug}`, async (route) => {
    const body = route.request().postData() ?? '';
    if (route.request().method() === 'POST' && body.includes('timeSpentMs')) submitted = true;
    if (route.request().method() === 'POST' && submitted && !body.includes('timeSpentMs') && !reviewAborted) {
      reviewAborted = true;
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.getByText('Не удалось связаться с сервером. Повторите попытку.')).toBeVisible();
  await expect(page.getByText('Подтверждение не получено. Ответ сохранён для повторной отправки.')).toHaveCount(0);
  expect(reviewAborted).toBe(true);
  expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE user_id = $1', [actor.id])).toBe(1);
});

test('account switch clears the old draft before rendering and logout removes it', async ({ page }) => {
  const { actor, slug } = await lesson();
  const other = await db.actor('trusted-other');
  actors.push(other.id);
  await db.execute("UPDATE public.profiles SET second_subject = 'physics' WHERE id = $1", [other.id]);
  await loginAs(page, actor);
  await page.goto(`/ru/practice/topic/${slug}`);
  await page.getByRole('radio', { name: 'B five' }).click();
  await loginAs(page, other);
  await page.reload();
  await expect(page.getByRole('radio', { name: 'B five' })).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('alemprep.learning.pending.v1')!).owner)).toBe(other.id);
  await page.getByRole('button', { name: 'Выйти' }).first().click();
  await expect(page).not.toHaveURL(/practice/);
  expect(await page.evaluate(() => sessionStorage.getItem('alemprep.learning.pending.v1'))).toBeNull();
});

test('expired sessions clear the draft and do not expose review', async ({ page }) => {
  const { actor, slug } = await lesson();
  await loginAs(page, actor);
  await page.goto(`/ru/practice/topic/${slug}`);
  await expect(page.getByText('TRUSTED_PUBLIC_STEM')).toBeVisible();
  // The stem renders before the initial state read settles. Mutate the fixture
  // only after restore is active, otherwise it can clear storage before reload.
  await expect(page.getByRole('button', { name: 'Пропустить', exact: true })).toBeEnabled();
  await db.execute("UPDATE public.sessions SET expires_at = now() - interval '1 minute' WHERE user_id = $1", [actor.id]);
  await page.reload();
  await expect(page.getByText('Время задания истекло. Начните новое задание.')).toBeVisible();
  await expect(page.getByText('PRIVATE_EXPLANATION_MARKER')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('alemprep.learning.pending.v1'))).toBeNull();
});

test('a local draft with a different issued item is discarded', async ({ page }) => {
  const { actor, slug } = await lesson();
  await loginAs(page, actor);
  await page.goto(`/ru/practice/topic/${slug}`);
  await expect(page.getByText('TRUSTED_PUBLIC_STEM')).toBeVisible();
  // A still-running initial restore would persist over our corrupted draft.
  await expect(page.getByRole('button', { name: 'Пропустить', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const key = 'alemprep.learning.pending.v1';
    const saved = JSON.parse(sessionStorage.getItem(key)!);
    saved.itemId = crypto.randomUUID();
    sessionStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.getByText('Не удалось восстановить задание. Начните новое.')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('alemprep.learning.pending.v1'))).toBeNull();
});

test('a committed answer with a lost response restores review without a second submit', async ({ page }) => {
  const { actor, slug } = await lesson();
  await loginAs(page, actor);
  await page.goto(`/ru/practice/topic/${slug}`);
  await page.getByRole('radio', { name: 'A four' }).click();
  let submits = 0;
  await page.route(`**/ru/practice/topic/${slug}`, async (route) => {
    if (route.request().method() === 'POST' && route.request().postData()?.includes('timeSpentMs')) {
      submits++;
      await route.fetch();
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.getByText('Подтверждение не получено. Ответ сохранён для повторной отправки.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('PRIVATE_EXPLANATION_MARKER')).toBeVisible();
  await expect(page.getByTestId('learning-score')).toHaveText('1 / 1');
  expect(submits).toBe(1);
  expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE user_id = $1', [actor.id])).toBe(1);
});

test('foreign session injected into a local draft cannot load a question or review', async ({ page }) => {
  const { actor, slug } = await lesson();
  const other = await db.actor('foreign-session'); actors.push(other.id);
  await db.execute("UPDATE public.profiles SET second_subject = 'physics' WHERE id = $1", [other.id]);
  await loginAs(page, actor);
  await page.goto(`/ru/practice/topic/${slug}`);
  await expect(page.getByText('TRUSTED_PUBLIC_STEM')).toBeVisible();
  const stored = await page.evaluate(() => sessionStorage.getItem('alemprep.learning.pending.v1'));
  await loginAs(page, other);
  await page.evaluate(({ stored, owner }) => {
    const draft = JSON.parse(stored!); draft.owner = owner;
    sessionStorage.setItem('alemprep.learning.pending.v1', JSON.stringify(draft));
  }, { stored, owner: other.id });
  await page.reload();
  await expect(page.getByText('Задание недоступно для этого аккаунта.')).toBeVisible();
  await expect(page.getByText('TRUSTED_PUBLIC_STEM')).toHaveCount(0);
  await expect(page.getByText('PRIVATE_EXPLANATION_MARKER')).toHaveCount(0);
});

test('skip is explicit and the next task starts a new server session', async ({ page }) => {
  const { actor, slug } = await lesson();
  await loginAs(page, actor);
  await page.goto(`/ru/practice/topic/${slug}`);
  await expect(page.getByRole('button', { name: 'Проверить', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Пропустить', exact: true }).click();
  await expect(page.getByTestId('learning-score')).toHaveText('0 / 1');
  expect(await db.scalar('SELECT given_answer FROM public.attempts WHERE user_id = $1', [actor.id])).toBeNull();
  await page.getByRole('button', { name: 'Следующая задача', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'A four' })).toBeEnabled();
  expect(await db.scalar<number>('SELECT count(*)::int FROM public.sessions WHERE user_id = $1', [actor.id])).toBe(2);
});

test('Kazakh multi-answer practice renders and reviews a public DTO', async ({ page }) => {
  const { actor, slug } = await lesson('multi', 'kk');
  await loginAs(page, actor);
  await page.goto(`/kk/practice/topic/${slug}`);
  await page.getByRole('checkbox', { name: 'A four' }).click();
  await page.getByRole('checkbox', { name: 'B five' }).click();
  await page.getByRole('button', { name: 'Тексеру', exact: true }).click();
  await expect(page.getByText('PRIVATE_EXPLANATION_MARKER')).toBeVisible();
  await expect(page.getByTestId('learning-score')).toHaveText('2 / 2');
});

test('matching accepts repeated right-hand values and requires a complete answer', async ({ page }) => {
  const { actor, slug } = await lesson('matching');
  await loginAs(page, actor);
  await page.goto(`/ru/practice/topic/${slug}`);
  await page.getByRole('combobox', { name: 'Ответ для 1' }).selectOption('one');
  await expect(page.getByRole('button', { name: 'Проверить', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Ответ для 2' }).selectOption('one');
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.getByTestId('learning-score')).toHaveText('2 / 2');
});

test('unapproved content never falls back to a published legacy question', async ({ page }) => {
  const { actor, slug, version } = await lesson();
  await db.execute("UPDATE public.question_publications SET status = 'quarantined' WHERE question_version_id = $1", [version]);
  await loginAs(page, actor);
  await page.goto(`/ru/practice/topic/${slug}`);
  await expect(page.getByText('По этой теме пока нет проверенных заданий на выбранном языке.')).toBeVisible();
  await expect(page.getByText('PRIVATE_GRADING_MARKER')).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(0);
});
