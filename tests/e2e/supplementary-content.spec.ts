import { expect, test } from '@playwright/test';
import { createDbHarness } from '../db/helpers';
import { loginAs } from './helpers';
import momentumBook from '../../scripts/data/books/momentum.json';

test('a signed-in pupil can open the content library and keep a claimed book', async ({ page }) => {
  test.skip(
    process.env.NEXT_PUBLIC_CONTENT_V1_ENABLED !== 'true' || process.env.PILOT_TOPICS_ONLY === 'true',
    'requires the supplementary content flag outside the school pilot',
  );
  const db = await createDbHarness();
  try {
    const pupil = await db.actor('content-library-e2e');
    await db.execute("UPDATE public.profiles SET second_subject = 'physics' WHERE id = $1", [pupil.id]);
    await loginAs(page, pupil);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/kk/library/newton-laws');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Кітапты алу', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Карточкалар арқылы қайталау', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Карточкалар арқылы қайталау', exact: true })).toBeVisible();
    await page.goto('/kk/library/momentum');
    const next = page.getByRole('button', { name: 'Әрі қарай', exact: true });
    for (const chapter of momentumBook.kk.pages) {
      await next.click();
      await expect(page.getByRole('heading', { name: chapter.title, exact: true })).toBeVisible();
    }
    await expect(next).toBeDisabled();

    await page.goto('/ru/videos/newton-laws');
    await expect(page.locator('video')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await db.close();
  }
});
