'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';

type Palette = {
  base: string;
  glow: string;
  ribbons: ReadonlyArray<readonly [number, string, string, string]>;
  composite: GlobalCompositeOperation;
};

/** Тёмная тема — глубокий зелёный; светлая — мягкая мятная версия того же рисунка. */
const PALETTES: Record<'dark' | 'light', Palette> = {
  dark: {
    base: '#070908',
    glow: 'rgba(15,59,43,.9)',
    composite: 'screen',
    ribbons: [
      [0.2, 'rgba(15,90,62,.95)', 'rgba(43,201,143,.95)', 'rgba(15,90,62,0)'],
      [0.11, 'rgba(43,201,143,0)', 'rgba(120,240,190,.9)', 'rgba(43,201,143,.6)'],
      [0.04, 'rgba(255,255,255,0)', 'rgba(255,255,255,.95)', 'rgba(255,255,255,0)'],
    ],
  },
  light: {
    base: '#f1f8f4',
    glow: 'rgba(43,201,143,.28)',
    composite: 'source-over',
    ribbons: [
      [0.2, 'rgba(43,201,143,0)', 'rgba(43,201,143,.55)', 'rgba(150,230,195,.25)'],
      [0.11, 'rgba(180,240,215,.0)', 'rgba(120,225,180,.6)', 'rgba(43,201,143,.3)'],
      [0.04, 'rgba(255,255,255,0)', 'rgba(255,255,255,.95)', 'rgba(255,255,255,0)'],
    ],
  },
};

const MIN_PAGES = 1.6; // рисунок не короче полутора экранов, чтобы ленты не повторялись на коротких страницах
const MAX_PAGES = 14; // и не длиннее 14 экранов, чтобы canvas не разрастался

/**
 * Один длинный зелёный градиент за всем приложением. Высота рисунка равна высоте страницы,
 * и он сдвигается ровно на столько же пикселей, на сколько прокручена страница, —
 * фон едет вместе с карточками, а не обгоняет их. Только на очень длинных страницах
 * (больше MAX_PAGES экранов) он движется чуть медленнее. Рисуем в маленький canvas
 * (1/6 размера) и растягиваем с размытием.
 */
export function AppBackdrop() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const theme: 'dark' | 'light' = resolvedTheme === 'light' ? 'light' : 'dark';

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !wrap || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;

    let pageH = 0; // высота рисунка в CSS-пикселях

    const docHeight = () => Math.max(document.documentElement.scrollHeight, window.innerHeight + 1);

    const resize = () => {
      const vh = window.innerHeight;
      const nextH = Math.round(Math.min(vh * MAX_PAGES, Math.max(vh * MIN_PAGES, docHeight())));
      // Перерисовываем только при заметном изменении высоты страницы: смена размера canvas стирает кадр.
      if (Math.abs(nextH - pageH) > 24 || canvas.width !== Math.max(120, Math.round(window.innerWidth / 6))) {
        pageH = nextH;
        w = canvas.width = Math.max(120, Math.round(window.innerWidth / 6));
        h = canvas.height = Math.max(240, Math.round(pageH / 6));
        canvas.style.height = `${pageH}px`;
        if (reduce) frame(0);
      }
      scroll();
    };

    /** Сдвиг 1:1 с прокруткой; если рисунок короче страницы — пропорционально. */
    const scroll = () => {
      const vh = window.innerHeight;
      const doc = docHeight();
      const span = Math.max(0, pageH - vh);
      const y = doc - vh > span ? (window.scrollY * span) / Math.max(1, doc - vh) : Math.min(window.scrollY, span);
      canvas.style.transform = `translate3d(0, ${(-y).toFixed(1)}px, 0)`;
    };

    const blob = (x: number, y: number, r: number, color: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const frame = (ms: number) => {
      if (!reduce && ms - last < 33) {
        raf = requestAnimationFrame(frame);
        return;
      }
      last = ms;
      const t = ms / 1000;
      const p = PALETTES[theme];
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = p.base;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = p.composite;

      // Мягкие пятна света вдоль всей высоты
      for (let i = 0; i < 6; i++) {
        const x = w * (i % 2 ? 0.2 + 0.05 * Math.cos(t * 0.2 + i) : 0.8 + 0.06 * Math.sin(t * 0.3 + i));
        blob(x, h * (0.08 + i * 0.17), w * 0.75, p.glow);
      }

      // Ленты, которые плавно змеятся сверху вниз
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      p.ribbons.forEach(([width, c0, c1, c2], k) => {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, c0);
        g.addColorStop(0.5, c1);
        g.addColorStop(1, c2);
        ctx.strokeStyle = g;
        ctx.lineWidth = w * width;
        const steps = 8;
        const pts: Array<[number, number]> = [];
        for (let i = 0; i <= steps; i++) {
          const x = w * (0.5 + 0.42 * Math.sin(i * 1.15 + k * 1.7 + t * 0.22));
          pts.push([x, (h * (i - 0.5)) / (steps - 1)]);
        }
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2;
          const my = (pts[i][1] + pts[i + 1][1]) / 2;
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        ctx.stroke();
      });

      if (!reduce) raf = requestAnimationFrame(frame);
    };

    resize();
    raf = requestAnimationFrame(frame);
    if (reduce) frame(0);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', scroll, { passive: true });
    const ro = new ResizeObserver(resize);
    ro.observe(document.body);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', scroll);
    };
  }, [theme]);

  return (
    <div ref={wrapRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#f1f8f4] dark:bg-[#070908]">
      <canvas
        ref={canvasRef}
        className="absolute left-[-6%] top-0 w-[112%] blur-[28px] saturate-[1.15] will-change-transform"
      />
    </div>
  );
}
