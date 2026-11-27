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

const MIN_PAGES = 1.6;
const MAX_PAGES = 14;
const FRAME_INTERVAL = 1000 / 30;

export function AppBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !resolvedTheme) return;

    const palette = PALETTES[resolvedTheme === 'light' ? 'light' : 'dark'];
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let pageHeight = 0;
    let scrollScale = 0;
    let scrollSpan = 0;
    let elapsed = 0;
    let lastFrame: number | undefined;
    let raf = 0;

    const blob = (x: number, y: number, r: number, color: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = () => {
      const { width: w, height: h } = canvas;
      const t = elapsed / 1000;
      const p = palette;
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
    };

    const scroll = () => {
      const offset = motion.matches ? 0 : Math.max(0, Math.min(window.scrollY * scrollScale, scrollSpan));
      canvas.style.transform = `translate3d(0, ${(-offset).toFixed(1)}px, 0)`;
    };

    const resize = () => {
      const viewport = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const nextHeight = Math.round(Math.min(viewport * MAX_PAGES, Math.max(viewport * MIN_PAGES, documentHeight)));
      const width = Math.max(120, Math.round(window.innerWidth / 6));

      // Setting either canvas dimension clears the frame.
      if (Math.abs(nextHeight - pageHeight) > 24 || canvas.width !== width) {
        pageHeight = nextHeight;
        canvas.width = width;
        canvas.height = Math.max(240, Math.round(pageHeight / 6));
        canvas.style.height = `${pageHeight}px`;
        draw();
      }

      scrollSpan = Math.max(0, pageHeight - viewport);
      scrollScale = Math.min(1, scrollSpan / Math.max(1, documentHeight - viewport));
      scroll();
    };

    const animate = (now: number) => {
      lastFrame ??= now;
      const step = now - lastFrame;
      if (step >= FRAME_INTERVAL) {
        elapsed += step;
        lastFrame = now;
        draw();
      }
      raf = requestAnimationFrame(animate);
    };

    const updatePlayback = () => {
      cancelAnimationFrame(raf);
      lastFrame = undefined;
      scroll();
      if (!motion.matches && !document.hidden) raf = requestAnimationFrame(animate);
    };

    resize();
    updatePlayback();
    const observer = new ResizeObserver(resize);
    observer.observe(document.body);
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', scroll, { passive: true });
    motion.addEventListener('change', updatePlayback);
    document.addEventListener('visibilitychange', updatePlayback);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', scroll);
      motion.removeEventListener('change', updatePlayback);
      document.removeEventListener('visibilitychange', updatePlayback);
    };
  }, [resolvedTheme]);

  return (
    <div aria-hidden className="app-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <canvas ref={canvasRef} className="absolute left-[-6%] top-0 w-[112%] blur-[28px] saturate-[1.15] motion-safe:will-change-transform" />
    </div>
  );
}
