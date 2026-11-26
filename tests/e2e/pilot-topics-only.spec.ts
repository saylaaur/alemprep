import { test, expect } from '@playwright/test';
import { createDbHarness, type DbHarness } from '../db/helpers';
import { loginAs } from './helpers';
let db: DbHarness;
test.beforeEach(async () => { db = await createDbHarness(); });
test.afterEach(async () => { await db?.close(); });
test('pilot topics-only mode hides assessments on mobile and redirects every assessment route in both languages', async ({ page }) => {
  test.skip(process.env.PILOT_TOPICS_ONLY !== 'true', 'requires the pilot server flag');
  const actor = await db.actor('topics-only-pupil');
  await db.execute("UPDATE public.profiles SET second_subject='physics' WHERE id=$1", [actor.id]);
  await loginAs(page, actor);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const locale of ['ru', 'kk']) {
    await page.goto(`/${locale}/dashboard`);
    await expect(page.locator(`a[href="/${locale}/full-practice"]`)).toHaveCount(0);
    await expect(page.locator(`a[href="/${locale}/diagnostic"]`)).toHaveCount(0);
    await expect(page.locator(`a[href="/${locale}/weekly"]`)).toHaveCount(0);
    const tabs = page.locator('nav[data-hide-in-focus]');
    await expect(tabs.locator(`a[href="/${locale}/practice"]`)).toBeVisible();
    await expect(tabs.locator('a')).toHaveCount(3);

    await page.goto(`/${locale}/practice`);
    const practice = page.locator('main');
    await expect(practice.locator(`a[href="/${locale}/subjects"]`)).toBeVisible();
    await expect(practice.locator(`a[href="/${locale}/visualization"]`)).toBeVisible();
    await expect(practice.locator(`a[href="/${locale}/problems"], a[href="/${locale}/full-practice"], a[href="/${locale}/weekly"]`)).toHaveCount(0);
    await expect(tabs.locator(`a[href="/${locale}/practice"]`)).toHaveAttribute('aria-current', 'page');

    for (const route of ['materials', 'library', 'videos', 'problems', 'review']) {
      await expect(page.locator(`a[href="/${locale}/${route}"]`)).toHaveCount(0);
      await page.goto(`/${locale}/${route}`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard$`));
    }
    for (const route of ['full-practice', 'diagnostic', 'weekly']) {
      await page.goto(`/${locale}/${route}`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/subjects$`));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath('pilot-topics-mobile.png'), fullPage: true });
});

test('pilot landing describes the released math scope and AI review in both languages', async ({ page }) => {
  test.skip(process.env.PILOT_TOPICS_ONLY !== 'true', 'requires the pilot server flag');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [locale, title, note, signIn] of [
    ['ru', 'Математика в школьном пилоте', 'Задания проверены AI', 'Войти через Google'],
    ['kk', 'Мектеп пилотындағы математика', 'Есептерді AI тексерді', 'Google арқылы кіру'],
  ]) {
    await page.goto(`/${locale}`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByTestId('pilot-content-note')).toContainText(note);
    await expect(page.getByText(/физик/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: signIn })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
