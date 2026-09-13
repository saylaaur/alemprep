import { test, expect } from '@playwright/test';
import { createDbHarness, type DbHarness } from '../db/helpers';
import { loginAs } from './helpers';

let db: DbHarness | undefined;

test.afterEach(async () => {
  await db?.close();
  db = undefined;
});

test('keeps Russian and Kazakh guests in their own login locale', async ({ page }) => {
  await page.goto('/ru/dashboard');
  await expect(page).toHaveURL(/\/ru\/login$/);
  await expect(page.getByRole('button', { name: 'Войти через Google' })).toBeVisible();

  await page.goto('/kk/dashboard');
  await expect(page).toHaveURL(/\/kk\/login$/);
  await expect(page.getByRole('button', { name: 'Google арқылы кіру' })).toBeVisible();
});

test('uses a local Supabase session to enter the protected dashboard', async ({ page }) => {
  db = await createDbHarness();
  const actor = await db.actor('dashboard-access');
  await db.scalar<string>(
    "UPDATE public.profiles SET second_subject = 'physics' WHERE id = $1 RETURNING id",
    [actor.id],
  );

  await loginAs(page, actor);
  await page.goto('/ru/dashboard');

  await expect(page).toHaveURL(/\/ru\/dashboard$/);
  await expect(page.getByText(actor.email).first()).toBeVisible();
});

test('clears account A before account B uses the shared browser', async ({ page }) => {
  db = await createDbHarness();
  const a = await db.actor('shared-browser-a');
  const b = await db.actor('shared-browser-b');
  await db.scalar<string>(
    "UPDATE public.profiles SET second_subject = 'physics' WHERE id IN ($1, $2) RETURNING id",
    [a.id, b.id],
  );

  await loginAs(page, a);
  await page.goto('/ru/dashboard');
  await expect(page.getByText(a.email).first()).toBeVisible();
  await page.getByRole('button', { name: 'Выйти' }).first().click();
  await expect(page).not.toHaveURL(/\/dashboard$/);

  await loginAs(page, b);
  await page.goto('/ru/dashboard');
  await expect(page.getByText(b.email).first()).toBeVisible();
  await expect(page.getByText(a.email)).toHaveCount(0);
});

test('keeps an auth callback redirect on this application origin', async ({ page }) => {
  await page.goto('/auth/callback?next=https%3A%2F%2Fevil.example');

  await expect(page).toHaveURL(/\/ru\/login\?error=auth$/);
});
