import { expect, test } from '@playwright/test';
import { createDbHarness } from '../db/helpers';
import { loginAs } from './helpers';
import momentumBook from '../../scripts/data/books/momentum.json';

test('a signed-in pupil can open the content library and keep a claimed book', async ({ page }) => {
  test.skip(
    process.env.NEXT_PUBLIC_CONTENT_V1_ENABLED !== 'true' || process.env.PILOT_TOPICS_ONLY === 'true',
    'requires the supplementary content flag outside the school pilot',
  );
  await page.goto('/kk/materials');
  await expect(page).toHaveURL(/\/kk\/login\?next=%2Fkk%2Fmaterials$/);
  const db = await createDbHarness();
  try {
    const pupil = await db.actor('content-library-e2e');
    await db.execute("UPDATE public.profiles SET second_subject = 'physics' WHERE id = $1", [pupil.id]);
    await loginAs(page, pupil);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/kk/practice');
    const tabs = page.locator('nav[data-hide-in-focus]');
    await expect(tabs.locator('a')).toHaveCount(4);
    for (const href of ['subjects', 'problems', 'full-practice', 'weekly', 'visualization']) {
      await expect(page.locator(`main a[href="/kk/${href}"]`)).toBeVisible();
    }
    await tabs.locator('a[href="/kk/materials"]').click();
    await expect(page).toHaveURL(/\/kk\/materials$/);
    await expect(page.locator('main a[href="/kk/videos"]')).toBeVisible();
    await expect(page.locator('main a[href="/kk/library"]')).toBeVisible();

    await page.locator('main a[href="/kk/library"]').click();
    await expect(page).toHaveURL(/\/kk\/library$/);
    const search = page.getByRole('searchbox', { name: 'Кітап іздеу', exact: true });
    const newton = page.locator('main a[href="/kk/library/newton-laws"]');
    await expect(search).toBeVisible();
    await expect(newton).toBeVisible();
    await expect(page.locator('main a[href="/kk/library/trig-unit-circle"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Математика', exact: true }).click();
    await expect(newton).toHaveCount(0);
    await page.getByRole('button', { name: 'Физика', exact: true }).click();
    await search.fill('zzzzzz');
    await expect(page.getByText('Кітап табылмады.', { exact: true })).toBeVisible();
    await search.fill('ньютон');
    await expect(newton).toBeVisible();
    await expect(page.locator('main a[href="/kk/library/momentum"]')).toHaveCount(0);
    const ring = page.getByRole('button', { name: 'Кітап сақинасы', exact: true });
    await ring.click();
    await expect(ring).toHaveAttribute('aria-pressed', 'true');
    await expect(newton).toBeVisible();
    await ring.click();
    await expect(ring).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await newton.click();
    await expect(page).toHaveURL(/\/kk\/library\/newton-laws$/);
    await expect(tabs.locator('a[href="/kk/materials"]')).toHaveAttribute('aria-current', 'page');
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

    await db.execute("UPDATE public.user_books SET due_on = current_date - 1 WHERE user_id = $1", [pupil.id]);
    await page.goto('/ru/library');
    const due = page.getByRole('region', { name: 'Повторить сегодня' });
    await expect(due.getByRole('link')).toHaveAttribute('href', '/ru/review');
    await expect(due.getByText('1 книга', { exact: true })).toBeVisible();

    await page.goto('/ru/videos/newton-laws');
    await expect(page.locator('video')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await db.close();
  }
});
