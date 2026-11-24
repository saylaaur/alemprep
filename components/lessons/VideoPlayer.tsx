'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LessonLabels } from './labels';

const RATES = [1, 1.25, 1.5, 2, 0.75];

function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Плеер урока: стеклянная панель, пробел/K — пауза, ←/→ — перемотка на 5 секунд,
 * M — звук, F — на весь экран. Когда просмотрено 90%, сообщает onWatched.
 */
export function VideoPlayer({
  src,
  poster,
  labels,
  onWatched,
}: {
  src: string;
  poster: string;
  labels: LessonLabels['video'];
  onWatched: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rateIdx, setRateIdx] = useState(0);
  const [muted, setMuted] = useState(false);
  const [fs, setFs] = useState(false);
  const [shown, setShown] = useState(true);

  const wake = useCallback(() => {
    setShown(true);
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => setShown(false), 2600);
  }, []);

  useEffect(() => () => void (idle.current && clearTimeout(idle.current)), []);

  useEffect(() => {
    const on = () => setFs(document.fullscreenElement === wrap.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
  }, []);

  const seekBy = (d: number) => {
    const v = video.current;
    if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d));
  };

  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrap.current?.requestFullscreen();
    } catch {
      /* во встроенных окнах полноэкранный режим может быть запрещён */
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') toggle();
    else if (e.key === 'ArrowRight') seekBy(5);
    else if (e.key === 'ArrowLeft') seekBy(-5);
    else if (k === 'm') setMuted((m) => !m);
    else if (k === 'f') void toggleFs();
    else return;
    e.preventDefault();
    wake();
  };

  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const visible = shown || !playing;

  return (
    <div
      ref={wrap}
      data-player
      tabIndex={0}
      onKeyDown={onKey}
      onPointerMove={wake}
      onPointerLeave={() => playing && setShown(false)}
      className={cn(
        'group relative aspect-video w-full overflow-hidden rounded-[22px] bg-black shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-ring/30',
        fs && 'rounded-none',
        playing && !visible && 'cursor-none'
      )}
    >
      <video
        ref={video}
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        muted={muted}
        className="h-full w-full object-contain"
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setTime(v.currentTime);
          if (!fired.current && v.duration > 0 && v.currentTime / v.duration >= 0.9) {
            fired.current = true;
            onWatched();
          }
        }}
        onEnded={() => {
          setPlaying(false);
          if (!fired.current) {
            fired.current = true;
            onWatched();
          }
        }}
      />

      {!playing && (
        <button
          type="button"
          onClick={toggle}
          aria-label={labels.play}
          className="glass glass-dark absolute left-1/2 top-1/2 flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform duration-200 ease-apple hover:scale-105 active:scale-95"
        >
          <Play className="ml-1 h-8 w-8 fill-current" />
        </button>
      )}

      <div
        className={cn(
          'glass glass-dark absolute inset-x-3 bottom-3 rounded-2xl px-3 pb-2 pt-2.5 transition-[opacity,transform] duration-300 ease-apple',
          visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
        )}
      >
        <div className="relative h-5">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/20 transition-[height] duration-150 group-hover:h-1.5">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(time, duration || 0)}
            aria-label={labels.seek}
            data-sound="off"
            onChange={(e) => {
              const v = video.current;
              if (v) v.currentTime = Number(e.target.value);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <div
            className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
            style={{ left: `${pct}%` }}
          />
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-sm">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? labels.pause : labels.play}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15 active:scale-95"
          >
            {playing ? <Pause className="h-[18px] w-[18px] fill-current" /> : <Play className="h-[18px] w-[18px] fill-current" />}
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? labels.unmute : labels.mute}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15 active:scale-95"
          >
            {muted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
          </button>
          <span className="ml-1 tabular-nums text-white/85">
            {clock(time)} / {clock(duration)}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            aria-label={labels.speed}
            onClick={() => {
              const next = (rateIdx + 1) % RATES.length;
              setRateIdx(next);
              if (video.current) video.current.playbackRate = RATES[next];
            }}
            className="h-9 min-w-[48px] rounded-full px-2.5 font-medium tabular-nums transition-colors hover:bg-white/15 active:scale-95"
          >
            {RATES[rateIdx]}×
          </button>
          <button
            type="button"
            onClick={() => void toggleFs()}
            aria-label={labels.fullscreen}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/15 active:scale-95"
          >
            {fs ? <Minimize className="h-[18px] w-[18px]" /> : <Maximize className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>
    </div>
  );
}
