'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isSoundEnabled, playSound, setSoundEnabled, subscribeSound } from '@/lib/sound/ui-sounds';

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribeSound, isSoundEnabled, () => true);
}

/**
 * Звук касания для всех кнопок, ссылок и вкладок сайта.
 * Элементы со своим звуком (ответы на задачи) помечены data-sound="off".
 */
export function UiSoundListener() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest('button, a[href], [role="tab"], [role="switch"], summary');
      if (!el || el.closest('[data-sound="off"]')) return;
      if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return;
      playSound('tap');
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
  return null;
}

export function SoundToggle({ labelOn, labelOff, className }: { labelOn: string; labelOff: string; className?: string }) {
  const on = useSoundEnabled();
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      data-sound="off"
      role="switch"
      aria-checked={on}
      aria-label={on ? labelOn : labelOff}
      title={on ? labelOn : labelOff}
      onClick={() => {
        if (on) playSound('off');
        setSoundEnabled(!on);
      }}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-[transform,background-color,color] duration-150 ease-apple hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25 active:scale-[0.94]',
        className
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

/** Строка «Звуки» для бокового меню — в том же стиле, что переключатель темы. */
export function SoundRow({ labelOn, labelOff }: { labelOn: string; labelOff: string }) {
  const on = useSoundEnabled();
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      data-sound="off"
      role="switch"
      aria-checked={on}
      onClick={() => {
        if (on) playSound('off');
        setSoundEnabled(!on);
      }}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/25"
    >
      <Icon className="h-4 w-4" />
      {on ? labelOn : labelOff}
    </button>
  );
}
