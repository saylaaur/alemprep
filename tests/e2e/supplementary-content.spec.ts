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
    const videoPractice = page.getByRole('region', { name: 'Закрепи тему' });
    await videoPractice.getByRole('group').getByRole('button').first().click();
    await expect(videoPractice.getByRole('status')).toHaveCount(0);
    await videoPractice.getByRole('button', { name: 'Проверить', exact: true }).click();
    await expect(videoPractice.getByRole('status')).toBeFocused();
    await page.reload();
    await expect(videoPractice.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
  } finally {
    await db.close();
  }
});

test('a pupil can filter the problem bank and open a topic or lesson', async ({ page }) => {
  test.skip(
    process.env.NEXT_PUBLIC_CONTENT_V1_ENABLED !== 'true' || process.env.PILOT_TOPICS_ONLY === 'true',
    'requires the supplementary content flag outside the school pilot',
  );
  const db = await createDbHarness();
  try {
    const pupil = await db.actor('problem-catalog-e2e');
    await db.execute("UPDATE public.profiles SET second_subject = 'physics' WHERE id = $1", [pupil.id]);
    await loginAs(page, pupil);
    await page.setViewportSize({ width: 320, height: 740 });

    await page.goto('/ru/problems');
    const search = page.getByRole('searchbox', { name: 'Поиск по темам' });
    const lesson = page.locator('main a[href="/ru/videos/newton-laws"]');
    await search.fill('  НЬЮТОН  ');
    await expect(lesson).toBeVisible();
    const math = page.getByRole('button', { name: 'Математика', exact: true });
    await math.click();
    await expect(math).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('status').filter({ hasText: 'Темы не найдены' })).toBeVisible();
    await expect(lesson).toHaveCount(0);
    await page.getByRole('button', { name: 'Физика', exact: true }).click();
    await lesson.click();
    await expect(page).toHaveURL(/\/ru\/videos\/newton-laws$/);

    await page.goto('/kk/problems');
    const kazakhSearch = page.getByRole('searchbox', { name: 'Тақырып іздеу' });
    await kazakhSearch.fill('  РАДИКАЛ  ');
    await page.getByRole('button', { name: 'Математика', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Физика', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const topic = page.locator('main a[href="/kk/problems/radicals-and-expressions"]');
    await topic.focus();
    await topic.press('Enter');
    await expect(page).toHaveURL(/\/kk\/problems\/radicals-and-expressions$/);
  } finally {
    await db.close();
  }
});

test('problem sets check an answer on Enter and resume after reload', async ({ page }) => {
  test.skip(
    process.env.NEXT_PUBLIC_CONTENT_V1_ENABLED !== 'true' || process.env.PILOT_TOPICS_ONLY === 'true',
    'requires the supplementary content flag outside the school pilot',
  );
  const db = await createDbHarness();
  try {
    const pupil = await db.actor('problem-set-flow-e2e');
    await db.execute("UPDATE public.profiles SET second_subject = 'physics' WHERE id = $1", [pupil.id]);
    await loginAs(page, pupil);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/kk/problems/radicals-and-expressions');
    const practice = page.getByRole('region', { name: /жиынтықтың/ });
    const options = practice.getByRole('group').getByRole('button');
    const feedback = practice.getByRole('status');

    await expect(options.first()).toBeEnabled();
    await page.keyboard.press('1');
    await expect(options.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(feedback).toHaveCount(0);
    await page.keyboard.press('2');
    await expect(options.first()).toHaveAttribute('aria-pressed', 'false');
    await expect(options.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Enter');
    await expect(feedback).toBeFocused();

    await page.reload();
    const questions = practice.getByRole('tab');
    await expect(questions.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(feedback).toHaveCount(0);

    const questionCount = await questions.count();
    for (let index = 1; index < questionCount; index++) {
      await expect(questions.nth(index)).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('1');
      await page.keyboard.press('Enter');
      await expect(feedback).toBeFocused();
      if (index < questionCount - 1) await page.keyboard.press('Enter');
    }
    const completion = practice.getByRole('heading', { name: 'Жиынтық шешілді' });
    await expect(completion).toBeVisible();
    const continueSet = practice.getByRole('link', { name: 'Келесі жиынтық', exact: true });
    await expect(continueSet).toBeVisible();
    await continueSet.focus();
    await continueSet.press('Enter');
    await expect(page).toHaveURL(/\/kk\/problems\/radicals-and-expressions\?set=1$/);
    await expect(practice.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.goto('/ru/problems/calculus-and-modeling');
    const mathSet = page.getByRole('region', { name: /Набор 1 из/ });
    const mathQuestions = mathSet.getByRole('tab');
    await mathQuestions.nth(5).click();
    await page.keyboard.press('ArrowRight');
    await expect(mathQuestions.nth(6)).toBeFocused();
    await expect(mathQuestions.nth(6)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Tab');
    await expect(mathSet.getByRole('tabpanel')).toBeFocused();
    const multiOptions = mathSet.getByRole('group').getByRole('button');
    await page.keyboard.press('1');
    await page.keyboard.press('2');
    await expect(multiOptions.first()).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('1');
    await expect(multiOptions.first()).toHaveAttribute('aria-pressed', 'false');
    await expect(multiOptions.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Enter');
    await expect(mathSet.getByRole('status')).toBeFocused();
  } finally {
    await db.close();
  }
});
