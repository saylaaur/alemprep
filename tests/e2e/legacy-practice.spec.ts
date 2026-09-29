import { test, expect } from '@playwright/test';
import { createDbHarness } from '../db/helpers';
import { loginAs } from './helpers';

test('legacy topic remains available with rollout explicitly disabled', async ({ page }) => {
  test.skip(process.env.LEARNING_V1_ENABLED === 'true', 'legacy-only server');
  const db = await createDbHarness();
  try {
    const actor = await db.actor('legacy-practice');
    await db.execute("UPDATE public.profiles SET second_subject = 'physics' WHERE id = $1", [actor.id]);
    const slug = `legacy-${crypto.randomUUID()}`;
    const subject = await db.scalar<string>("INSERT INTO public.subjects (slug, name_ru, name_kk) VALUES ($1, 'Test', 'Test') RETURNING id", [slug]);
    const topic = await db.scalar<string>("INSERT INTO public.topics (subject_id, slug, name_ru, name_kk) VALUES ($1, $2, 'Test', 'Test') RETURNING id", [subject, slug]);
    await db.execute("INSERT INTO public.questions (topic_id, language, type, body, is_published) VALUES ($1, 'ru', 'single', $2, true)", [topic, JSON.stringify({ stem: 'LEGACY_SMOKE_STEM', options: [{ id: 'A', content: 'one' }, { id: 'B', content: 'two' }], correct: 'A' })]);
    await loginAs(page, actor);
    await page.goto(`/ru/practice/topic/${slug}`);
    await expect(page.getByText('LEGACY_SMOKE_STEM')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('alemprep.learning.pending.v1'))).toBeNull();
  } finally { await db.close(); }
});
