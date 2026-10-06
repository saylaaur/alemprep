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
    // The desktop sidebar exists but is hidden at phone width; use the tab bar.
    await expect(page.locator(`a[href="/${locale}/subjects"]`).last()).toBeVisible();
    for (const route of ['full-practice', 'diagnostic', 'weekly']) {
      await page.goto(`/${locale}/${route}`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/subjects$`));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath('pilot-topics-mobile.png'), fullPage: true });
});
