/**
 * Canvas painter for GraphCanvas: grid, axes, shading, curves, points and
 * the coordinate callout. No React here: GraphCanvas calls `drawScene` from
 * requestAnimationFrame, so panning and zooming never wait for a re-render.
 */
import { formatNumber, sampleSegments, type Interval, type RealFn, type Viewport } from '@/lib/graph/analyze';
import { gridSteps, spanX, spanY, ticksIn, digitsFor, type GridSteps, type Size } from '@/lib/graph/view';

export type Palette = {
  background: string; foreground: string; muted: string; card: string; warning: string;
  /** Turns a theme colour into the same colour with transparency. */
  alpha: (color: string, opacity: number) => string;
  font: string;
};

export type DrawCurve = {
  branches: RealFn[]; color: string; dashed?: boolean; fill?: 'above' | 'below';
  strips?: Interval[]; verticals?: number[]; verticalFill?: 'left' | 'right'; emphasis?: boolean;
};
export type DrawMarker = { x: number; y: number; color: string; solid?: boolean; selected?: boolean };
export type DrawPoint = { x: number; y: number; color: string; title?: string; text: string; guides?: boolean };

export type DrawScene = {
  view: Viewport; size: Size; trig: boolean;
  curves: DrawCurve[];
  markers: DrawMarker[];
  shade?: { intervals: Interval[]; color: string };
  area?: { fn: RealFn; from: number; to: number; color: string };
  segment?: { from: number; to: number };
  asymptotes?: number[];
  /** The picked point with its callout. */
  pick?: DrawPoint | null;
  /** Where a click would land (mouse hover). */
  hover?: { x: number; y: number; color: string; onCurve: boolean } | null;
  /** Coordinates in the hover callout (mouse over a curve). */
  hoverText?: string | null;
};

export function axisSteps(view: Viewport, size: Size, trig: boolean): { x: GridSteps; y: GridSteps } {
  return {
    x: gridSteps(spanX(view), size.width, { pi: trig, minPixels: 56 }),
    y: gridSteps(spanY(view), size.height, { minPixels: 44 }),
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: DrawScene, palette: Palette) {
  const { view, size } = scene;
  const { width, height } = size;
  const sx = (x: number) => ((x - view.xmin) / spanX(view)) * width;
  const sy = (y: number) => height - ((y - view.ymin) / spanY(view)) * height;
  // Keep huge values drawable: canvas misbehaves with coordinates far outside the screen.
  const cy = (y: number) => Math.max(-height * 4, Math.min(height * 5, sy(y)));
  const cx = (x: number) => Math.max(-width * 4, Math.min(width * 5, sx(x)));
  const crisp = (value: number) => Math.round(value) + 0.5;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  const steps = axisSteps(view, size, scene.trig);
  // Minor grid, then major grid (as in Desmos).
  const grid = (stepX: number, stepY: number, color: string) => {
    ctx.beginPath();
    for (const value of ticksIn(view.xmin, view.xmax, stepX)) { const x = crisp(sx(value)); ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (const value of ticksIn(view.ymin, view.ymax, stepY)) { const y = crisp(sy(value)); ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
  };
  grid(steps.x.minor, steps.y.minor, palette.alpha(palette.muted, 0.1));
  grid(steps.x.major, steps.y.major, palette.alpha(palette.muted, 0.26));

  // Shading from the task (inequality solutions), the segment and the integral area.
  if (scene.segment) {
    const left = cx(scene.segment.from); const right = cx(scene.segment.to);
    ctx.fillStyle = palette.alpha(palette.warning, 0.09);
    ctx.fillRect(left, 0, Math.max(0, right - left), height);
  }
  if (scene.shade) {
    ctx.fillStyle = palette.alpha(scene.shade.color, 0.13);
    for (const interval of scene.shade.intervals) {
      if (interval.from === interval.to) continue;
      const left = cx(Math.max(interval.from, view.xmin - spanX(view))); const right = cx(Math.min(interval.to, view.xmax + spanX(view)));
      ctx.fillRect(left, 0, Math.max(0, right - left), height);
    }
  }
  if (scene.area) {
    const { fn, color } = scene.area;
    const from = Math.max(scene.area.from, view.xmin); const to = Math.min(scene.area.to, view.xmax);
    if (from < to) {
      ctx.beginPath();
      ctx.moveTo(sx(from), cy(0));
      for (let index = 0; index <= 240; index++) {
        const x = from + (index / 240) * (to - from);
        const y = fn(x);
        ctx.lineTo(sx(x), cy(Number.isFinite(y) ? y : 0));
      }
      ctx.lineTo(sx(to), cy(0));
      ctx.closePath();
      ctx.fillStyle = palette.alpha(color, 0.22);
      ctx.fill();
    }
  }

  // Sampled curves, reused for regions and lines.
  const count = Math.min(1600, Math.round(width * 2));
  const sampled = scene.curves.map((curve) => curve.branches.map((branch) => sampleSegments(branch, view.xmin, view.xmax, count, spanY(view))));

  // Regions of typed inequalities: y > f(x), x² − 4 < 0, x > 2.
  scene.curves.forEach((curve, index) => {
    const fill = palette.alpha(curve.color, 0.16);
    if (curve.fill) {
      for (const segments of sampled[index]) {
        for (const segment of segments) {
          ctx.beginPath();
          const edge = curve.fill === 'above' ? -2 : height + 2;
          ctx.moveTo(sx(segment[0].x), edge);
          for (const point of segment) ctx.lineTo(sx(point.x), cy(point.y));
          ctx.lineTo(sx(segment[segment.length - 1].x), edge);
          ctx.closePath();
          ctx.fillStyle = fill; ctx.fill();
        }
      }
    }
    for (const interval of curve.strips ?? []) {
      if (interval.from === interval.to) continue;
      const left = cx(Math.max(interval.from, view.xmin - spanX(view))); const right = cx(Math.min(interval.to, view.xmax + spanX(view)));
      ctx.fillStyle = fill; ctx.fillRect(left, 0, Math.max(0, right - left), height);
    }
    if (curve.verticalFill && curve.verticals?.length) {
      const x = cx(curve.verticals[0]);
      ctx.fillStyle = fill;
      if (curve.verticalFill === 'left') ctx.fillRect(0, 0, Math.max(0, x), height); else ctx.fillRect(x, 0, Math.max(0, width - x), height);
    }
  });

  // Axes with arrows at the positive ends, as in school.
  const axisY = sy(0); const axisX = sx(0);
  ctx.strokeStyle = palette.alpha(palette.foreground, 0.62); ctx.fillStyle = palette.alpha(palette.foreground, 0.62); ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (axisY >= 0 && axisY <= height) { ctx.moveTo(0, crisp(axisY)); ctx.lineTo(width, crisp(axisY)); }
  if (axisX >= 0 && axisX <= width) { ctx.moveTo(crisp(axisX), 0); ctx.lineTo(crisp(axisX), height); }
  ctx.stroke();
  if (axisY >= 0 && axisY <= height) {
    ctx.beginPath(); ctx.moveTo(width, crisp(axisY)); ctx.lineTo(width - 9, crisp(axisY) - 4.5); ctx.lineTo(width - 9, crisp(axisY) + 4.5); ctx.closePath(); ctx.fill();
  }
  if (axisX >= 0 && axisX <= width) {
    ctx.beginPath(); ctx.moveTo(crisp(axisX), 0); ctx.lineTo(crisp(axisX) - 4.5, 9); ctx.lineTo(crisp(axisX) + 4.5, 9); ctx.closePath(); ctx.fill();
  }

  // Vertical asymptotes.
  ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.strokeStyle = palette.alpha(palette.muted, 0.9);
  for (const x of scene.asymptotes ?? []) {
    if (x < view.xmin || x > view.xmax) continue;
    ctx.beginPath(); ctx.moveTo(crisp(sx(x)), 0); ctx.lineTo(crisp(sx(x)), height); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Solution set of the task on the x-axis: thick line pieces and dots.
  const axisLineY = Math.max(0, Math.min(height, axisY));
  if (scene.segment) {
    ctx.strokeStyle = palette.warning; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx(scene.segment.from), axisLineY); ctx.lineTo(cx(scene.segment.to), axisLineY); ctx.stroke();
  }
  if (scene.shade) {
    ctx.strokeStyle = palette.alpha(scene.shade.color, 0.85); ctx.fillStyle = scene.shade.color; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const interval of scene.shade.intervals) {
      if (interval.from === interval.to) { ctx.beginPath(); ctx.arc(sx(interval.from), axisLineY, 5, 0, Math.PI * 2); ctx.fill(); continue; }
      ctx.beginPath();
      ctx.moveTo(cx(Math.max(interval.from, view.xmin - 1)), axisLineY); ctx.lineTo(cx(Math.min(interval.to, view.xmax + 1)), axisLineY);
      ctx.stroke();
    }
  }

  // Curves.
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  scene.curves.forEach((curve, index) => {
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = curve.emphasis ? 3.6 : 2.6;
    ctx.setLineDash(curve.dashed ? [9, 7] : []);
    for (const segments of sampled[index]) {
      ctx.beginPath();
      for (const segment of segments) segment.forEach((point, at) => (at ? ctx.lineTo(sx(point.x), cy(point.y)) : ctx.moveTo(sx(point.x), cy(point.y))));
      ctx.stroke();
    }
    for (const x of curve.verticals ?? []) {
      ctx.beginPath(); ctx.moveTo(sx(x), 0); ctx.lineTo(sx(x), height); ctx.stroke();
    }
    // Boundaries of shaded x-intervals: solid when included, dashed when not.
    for (const interval of curve.strips ?? []) {
      for (const [x, closed] of [[interval.from, interval.fromClosed], [interval.to, interval.toClosed]] as const) {
        if (x <= view.xmin || x >= view.xmax || interval.from === interval.to) continue;
        ctx.setLineDash(closed ? [] : [9, 7]);
        ctx.beginPath(); ctx.moveTo(sx(x), 0); ctx.lineTo(sx(x), height); ctx.stroke();
      }
      if (interval.from === interval.to && interval.from > view.xmin && interval.from < view.xmax) {
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(sx(interval.from), 0); ctx.lineTo(sx(interval.from), height); ctx.stroke();
      }
    }
  });
  ctx.setLineDash([]);

  // Tick labels with a halo so they stay readable over lines.
  const labelFont = `500 11px ${palette.font}`;
  ctx.font = labelFont; ctx.lineWidth = 3.5; ctx.lineJoin = 'round';
  ctx.strokeStyle = palette.background; ctx.fillStyle = palette.alpha(palette.foreground, 0.72);
  const label = (text: string, x: number, y: number, align: CanvasTextAlign) => {
    ctx.textAlign = align; ctx.strokeText(text, x, y); ctx.fillText(text, x, y);
  };
  const xDigits = Math.max(0, digitsFor(steps.x.major)); const yDigits = Math.max(0, digitsFor(steps.y.major));
  const xLabelY = Math.min(height - 6, Math.max(14, axisY + 15));
  ctx.textBaseline = 'alphabetic';
  for (const value of ticksIn(view.xmin, view.xmax, steps.x.major)) {
    const x = sx(value);
    if (value === 0 || x < 12 || x > width - 16) continue;
    label(formatNumber(value, { pi: steps.x.pi, digits: xDigits }), x, xLabelY, 'center');
  }
  const leftSide = axisX < 34;
  const yLabelX = leftSide ? Math.max(4, axisX + 6) : Math.min(width - 4, axisX - 6);
  for (const value of ticksIn(view.ymin, view.ymax, steps.y.major)) {
    const y = sy(value);
    if (value === 0 || y < 18 || y > height - 8) continue;
    label(formatNumber(value, { pi: false, digits: yDigits }), yLabelX, y + 4, leftSide ? 'left' : 'right');
  }
  if (axisX > 10 && axisX < width - 10 && axisY > 10 && axisY < height - 10) label('0', axisX - 5, axisY + 15, 'right');
  ctx.font = `italic 600 13px ${palette.font}`;
  if (axisY >= 0 && axisY <= height) label('x', width - 8, axisY > height - 24 ? axisY - 8 : axisY + 18, 'right');
  if (axisX >= 0 && axisX <= width) label('y', axisX + (axisX > width - 24 ? -10 : 10), 15, axisX > width - 24 ? 'right' : 'left');

  // Key points and typed points.
  for (const marker of scene.markers) {
    if (!Number.isFinite(marker.y) || marker.x < view.xmin || marker.x > view.xmax || marker.y < view.ymin || marker.y > view.ymax) continue;
    const x = sx(marker.x); const y = sy(marker.y);
    ctx.beginPath(); ctx.arc(x, y, marker.selected ? 6.5 : marker.solid ? 5 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = marker.solid || marker.selected ? marker.color : palette.background;
    ctx.fill();
    ctx.lineWidth = marker.selected ? 3 : 2.2; ctx.strokeStyle = marker.solid || marker.selected ? palette.background : marker.color;
    ctx.stroke();
    if (marker.solid && !marker.selected) { ctx.beginPath(); ctx.arc(x, y, 6.2, 0, Math.PI * 2); ctx.lineWidth = 1.2; ctx.strokeStyle = marker.color; ctx.stroke(); }
  }

  // Hover: where a click would land.
  if (scene.hover && !(scene.pick && scene.pick.x === scene.hover.x && scene.pick.y === scene.hover.y)) {
    const x = sx(scene.hover.x); const y = sy(scene.hover.y);
    ctx.beginPath(); ctx.arc(x, y, scene.hover.onCurve ? 5.5 : 4, 0, Math.PI * 2);
    ctx.lineWidth = 2; ctx.strokeStyle = palette.alpha(scene.hover.color, scene.hover.onCurve ? 0.9 : 0.55);
    ctx.fillStyle = palette.alpha(palette.background, 0.85);
    ctx.fill(); ctx.stroke();
    if (scene.hoverText) callout(ctx, palette, x, y, null, scene.hoverText, scene.hover.color, size, 0.86);
  }

  // The picked point: guides to the axes, the dot and its callout.
  if (scene.pick) {
    const { pick } = scene;
    const x = sx(pick.x); const y = sy(pick.y);
    if (pick.guides !== false) {
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1.3; ctx.strokeStyle = palette.alpha(pick.color, 0.7);
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x, Math.max(0, Math.min(height, axisY)));
      ctx.moveTo(x, y); ctx.lineTo(Math.max(0, Math.min(width, axisX)), y);
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.fillStyle = palette.alpha(pick.color, 0.18); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 5.2, 0, Math.PI * 2); ctx.fillStyle = pick.color; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = palette.background; ctx.stroke();
    callout(ctx, palette, x, y, pick.title ?? null, pick.text, pick.color, size, 1);
  }
}

/** Area of the zoom buttons over the canvas (GraphCanvas), kept clear of callouts. */
const BUTTONS = { width: 152, height: 48 };

/** A rounded card above the point (below it near the top edge). */
function callout(ctx: CanvasRenderingContext2D, palette: Palette, x: number, y: number, title: string | null, text: string, color: string, size: Size, opacity: number) {
  ctx.save();
  ctx.globalAlpha = opacity;
  const valueFont = `600 13px ${palette.font}`; const titleFont = `500 11px ${palette.font}`;
  ctx.font = valueFont; const valueWidth = ctx.measureText(text).width;
  ctx.font = titleFont; const titleWidth = title ? ctx.measureText(title).width : 0;
  const width = Math.max(valueWidth, titleWidth) + 20;
  const height = title ? 40 : 26;
  const gap = 12;
  const left = Math.max(4, Math.min(size.width - width - 4, x - width / 2));
  // The zoom buttons sit in the top-right corner: the card goes below the point there.
  const underButtons = left + width > size.width - BUTTONS.width;
  const above = y - gap - height >= (underButtons ? BUTTONS.height : 4);
  const top = above ? y - gap - height : Math.min(size.height - height - 4, y + gap);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.16)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
  roundRect(ctx, left, top, width, height, 9);
  ctx.fillStyle = palette.card; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.lineWidth = 1.5; ctx.strokeStyle = palette.alpha(color, 0.9); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if (title) {
    ctx.font = titleFont; ctx.fillStyle = palette.alpha(palette.foreground, 0.62);
    ctx.fillText(title, left + width / 2, top + 15);
  }
  ctx.font = valueFont; ctx.fillStyle = palette.foreground;
  ctx.fillText(text, left + width / 2, top + (title ? 32 : 17.5));
  ctx.restore();
}
