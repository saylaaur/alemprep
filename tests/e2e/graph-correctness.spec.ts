import { test, expect } from '@playwright/test';
import { createDbHarness, type DbHarness } from '../db/helpers';
import { loginAs } from './helpers';
import { autoViewport } from '../../lib/graph/analyze';
import { toScreen } from '../../lib/graph/view';
import ru from '../../messages/ru.json';
import kk from '../../messages/kk.json';
let db: DbHarness;
test.beforeEach(async ({ page }) => {
  db = await createDbHarness();
  const pupil = await db.actor('viz-review');
  await db.execute("UPDATE public.profiles SET second_subject='physics' WHERE id=$1", [pupil.id]);
  await loginAs(page, pupil);
  await page.setViewportSize({ width: 390, height: 844 });
});
test.afterEach(async () => { await db?.close(); });

for (const locale of ['ru', 'kk'] as const) {
const g = locale === 'ru' ? ru.graph : kk.graph;
const label = (text: string) => text.replace('{index}', '1');
test(`${locale}: mobile line snap, table and fullscreen are usable`, async ({page}) => {
  await page.goto(`/${locale}/visualization`);
  const input=page.getByRole('textbox',{name:label(g.lineLabel),exact:true});
  await input.fill('x');
  const graph=page.getByTestId('graph-canvas');
  await expect(graph).toHaveAttribute('aria-label', /y = x/);
  await page.waitForTimeout(500); // Complete the documented380ms view refit before a coordinate tap.
  const bounds=await graph.boundingBox();
  expect(bounds).not.toBeNull();
  // The toolbar covers the top-right of this small graph. Zoom out before testing (3,3).
  await graph.focus();
  await page.keyboard.press('-');
  await page.waitForTimeout(300);
  const fitted=autoViewport([(x:number)=>x]);
  const zoomed={xmin:fitted.xmin/0.6,xmax:fitted.xmax/0.6,ymin:fitted.ymin/0.6,ymax:fitted.ymax/0.6};
  const target=toScreen(zoomed,{width:bounds!.width,height:bounds!.height},3,3);
  await graph.click({position:{x:target.x+3,y:target.y+3}});
  await expect(page.locator('p[aria-live="polite"]').filter({hasText:'(3; 3)'})).toHaveCount(1);
  await page.getByRole('button',{name:label(g.tableToggle),exact:true}).click();
  await expect(page.getByRole('table',{name:label(g.tableCaption),exact:true})).toBeVisible();
  await page.getByRole('button',{name:g.fullscreen,exact:true}).click();
  await expect(page.getByRole('dialog',{name:new RegExp('^' + g.aria.split('{')[0])})).toBeVisible();
  await page.getByRole('dialog',{name:new RegExp('^' + g.aria.split('{')[0])}).getByTestId('graph-canvas').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:new RegExp('^' + g.aria.split('{')[0])})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`${locale}-graph-mobile.png`),fullPage:true});
});

test(`${locale}: selected minimum follows slider coordinates`,async({page})=>{
  await page.goto(`/${locale}/visualization`);
  await page.getByRole('button',{name:`${g.points.min} (1; −4)`,exact:true}).click();
  await expect(page.locator('p[aria-live="polite"]').filter({hasText:`${g.points.min} (1; −4)`})).toHaveCount(1);
  await page.getByRole('spinbutton',{name:g.parameterValue.replace('{name}', 'a'),exact:true}).fill('2');
  await expect(page.getByRole('button',{name:`${g.points.min} (0,5; −3,5)`,exact:true})).toBeVisible();
  await expect(page.locator('p[aria-live="polite"]').filter({hasText:`${g.points.min} (0,5; −3,5)`})).toHaveCount(1);
  await page.screenshot({path:test.info().outputPath(`${locale}-updated-minimum.png`),fullPage:true});
  await expect(page.locator('p[aria-live="polite"]').filter({hasText:`${g.points.min} (1; −4)`})).toHaveCount(0);
});

test(`${locale}: cyclic functions and identities show localized errors, other lines still work`, async ({page}) => {
  await page.goto(`/${locale}/visualization`);
  const input=page.getByRole('textbox',{name:label(g.lineLabel),exact:true});
  await input.fill("f(x)=f'(x)");
  await expect(page.getByText(g.errors.cycle,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:g.addLine,exact:true}).click();
  await page.getByRole('textbox',{name:g.lineLabel.replace('{index}','2'),exact:true}).fill('x^2');
  await expect(page.getByTestId('graph-canvas')).toHaveAttribute('aria-label',/x\^\{?2/);
  await input.fill('x=x');
  await expect(page.getByText(g.errors.identity,{exact:true})).toBeVisible();
  await input.fill('x^2 {a<x<b}');
  await expect(page.getByRole('slider',{name:g.parameter.replace('{name}','a'),exact:true})).toBeVisible();
  await expect(page.getByRole('slider',{name:g.parameter.replace('{name}','b'),exact:true})).toBeVisible();
});
}
