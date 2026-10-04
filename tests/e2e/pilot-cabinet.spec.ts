import { test, expect } from '@playwright/test';
import { createDbHarness, type DbHarness } from '../db/helpers';
import { seedPilotSchoolPair } from '../fixtures/pilot-school';
import { loginAs } from './helpers';

let db: DbHarness;
test.beforeEach(async () => { db = await createDbHarness(); });
test.afterEach(async () => { await db?.close(); });

test('new app routes redirect signed-out visitors to login', async ({ page }) => {
  for (const route of ['/ru/teacher', '/ru/join-class', '/kk/visualization']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/(ru|kk)\/login/);
  }
});

test('teacher creates invite, pupil joins, roster refreshes and foreign class stays hidden', async ({ page }) => {
  const school = await seedPilotSchoolPair(db);
  await loginAs(page, school.teacherA);
  await page.goto('/ru/teacher');
  await expect(page.getByRole('heading', { name: 'Кабинет учителя' })).toBeVisible();
  await page.getByRole('link', { name: /Synthetic RU A/ }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic RU A' })).toBeVisible();
  await page.getByRole('button', { name: 'Создать новый код' }).click();
  const code = page.getByLabel('Код приглашения');
  await expect(code).not.toHaveValue('');
  const token = await code.inputValue();
  await page.goto(`/ru/teacher/groups/${school.groupB}`);
  await expect(page.getByRole('heading', { name: 'Synthetic RU B' })).toHaveCount(0);

  const pupil = await db.actor('cabinet-joiner');
  await db.execute("UPDATE public.profiles SET second_subject='physics' WHERE id=$1", [pupil.id]);
  await loginAs(page, pupil);
  await page.goto('/ru/join-class');
  await page.getByLabel('Код приглашения').fill(token);
  await page.getByRole('button', { name: 'Вступить', exact: true }).click();
  await expect(page.getByText('Вы вступили в класс. Можно начинать подготовку.')).toBeVisible();
  await page.reload();
  await loginAs(page, school.teacherA);
  await page.goto(`/ru/teacher/groups/${school.groupA}`);
  await expect(page.locator('tbody tr')).toHaveCount(2);
});

test('accepted self-study answer survives reload and appears once in the teacher report', async ({ page }) => {
  test.skip(process.env.LEARNING_V1_ENABLED !== 'true', 'requires a dedicated trusted server');
  const school = await seedPilotSchoolPair(db);
  await db.execute("UPDATE public.profiles SET second_subject='physics', full_name='E2E pupil' WHERE id=$1", [school.studentA.id]);
  const slug = `cabinet-report-${crypto.randomUUID()}`;
  const versionId = await db.scalar<string>(`WITH subject AS (
    INSERT INTO public.subjects(slug,name_ru,name_kk,is_active) VALUES($1,'Test','Test',true) RETURNING id
  ), topic AS (
    INSERT INTO public.topics(subject_id,slug,name_ru,name_kk) SELECT id,$1,'Test','Test' FROM subject RETURNING id
  ), question AS (
    INSERT INTO public.questions(topic_id,language,type,body,is_published)
    SELECT id,'ru','single','{"stem":"TEACHER_REPORT_PUBLIC","options":[{"id":"A","content":"4"},{"id":"B","content":"5"}],"correct":"A"}',true FROM topic RETURNING id,body
  ) INSERT INTO public.question_versions(question_id,family_id,revision,locale,type,public_body,grading_body,content_hash)
  SELECT id,gen_random_uuid(),1,'ru','single',body-'correct',body,$1 FROM question RETURNING id`, [slug]);
  await db.execute("INSERT INTO public.question_publications(question_version_id,status) VALUES($1,'approved')", [versionId]);

  await loginAs(page, school.studentA);
  await page.goto(`/ru/practice/topic/${slug}`);
  await expect(page.getByText('TEACHER_REPORT_PUBLIC')).toBeVisible();
  await page.getByRole('radio', { name: 'A 4', exact: true }).click();
  await page.getByRole('button', { name: 'Проверить', exact: true }).click();
  await expect(page.getByTestId('learning-score')).toHaveText('1 / 1');
  await page.reload();
  await expect(page.getByTestId('learning-score')).toHaveText('1 / 1');

  await loginAs(page, school.teacherA);
  await page.goto(`/ru/teacher/groups/${school.groupA}`);
  const row = page.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: 'E2E pupil', exact: true }) });
  for (let reload = 0; reload < 2; reload++) {
    await expect(row.getByRole('cell').nth(0)).toHaveText('1');
    await expect(row.getByRole('cell').nth(1)).toHaveText('1');
    await expect(row.getByRole('cell').nth(2)).toHaveText('1 / 1');
    if (reload === 0) await page.reload();
  }
  expect(await db.scalar<number>('SELECT count(*)::int FROM public.attempts WHERE user_id=$1 AND integrity_version=1', [school.studentA.id])).toBe(1);
});

test('Kazakh graph sliders update the table offline and reset on a small screen', async ({ page }) => {
  const pupil = await db.actor('graph-pupil');
  await db.execute("UPDATE public.profiles SET second_subject='physics' WHERE id=$1", [pupil.id]);
  await loginAs(page, pupil);
  await page.setViewportSize({ width: 390, height: 844 });
  const desmosRequests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('desmos.com')) desmosRequests.push(request.url()); });
  await page.goto('/kk/visualization');
  await expect(page.getByRole('heading', { name: 'Графиктерді зерттейік' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Таңдалған функцияның графигі/ })).toBeVisible();
  await expect(page.locator('tbody tr').first()).toHaveText('-25');
  await page.getByRole('slider', { name: 'a коэффициенті' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('tbody tr').first()).toHaveText('-23');
  await page.getByRole('button', { name: 'Параметрлерді қалпына келтіру' }).click();
  await expect(page.locator('tbody tr').first()).toHaveText('-25');
  await page.getByRole('button', { name: 'Сызықтық функция', exact: true }).click();
  await expect(page.locator('tbody tr').first()).toHaveText('-2-4');
  expect(desmosRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/private/tmp/alemprep-graph-mobile.png', fullPage: true, animations: 'disabled' });
});

test('optional Desmos failure leaves local controls usable; retry and close clean up', async ({ page }) => {
  test.skip(process.env.DESMOS_ENABLED !== 'true', 'requires local test SDK configuration');
  const pupil = await db.actor('graph-sdk-pupil');
  await db.execute("UPDATE public.profiles SET second_subject='physics' WHERE id=$1", [pupil.id]);
  await loginAs(page, pupil);
  let calls = 0;
  await page.route('https://www.desmos.com/api/v1.12/calculator.js?*', async (route) => {
    calls++;
    if (calls === 1) { await route.abort(); return; }
    await route.fulfill({ contentType: 'application/javascript', body: `window.Desmos={GraphingCalculator:(el)=>({setExpression:({latex})=>{el.textContent=latex},setMathBounds:()=>{},resize:()=>{},destroy:()=>{document.body.dataset.desmosDestroyed='yes'}})};` });
  });
  await page.goto('/ru/visualization');
  expect(calls).toBe(0);
  await page.getByRole('button', { name: 'Открыть Desmos' }).click();
  await expect(page.getByText('Desmos не загрузился. Продолжайте пользоваться графиком и таблицей выше.')).toBeVisible();
  await page.getByRole('slider', { name: 'Коэффициент a' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('tbody tr').first()).toHaveText('-23');
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Desmos' })).toHaveText('y=(1)x^{2}+(-1)');
  await page.getByRole('button', { name: 'Закрыть Desmos' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-desmos-destroyed', 'yes');
});
