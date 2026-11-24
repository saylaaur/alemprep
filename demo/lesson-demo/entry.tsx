declare const __DEMO_LESSON__: string;
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Moon, Sun } from 'lucide-react';
import ru from '@/messages/ru.json';
import kk from '@/messages/kk.json';
import book from '@/scripts/data/books/newton-laws.json';
import { LessonWatch } from '@/components/lessons/LessonWatch';
import { UiSoundListener } from '@/components/sound/SoundProvider';
import { parseBookContent } from '@/lib/books/content';
import { LESSONS, resolveLesson } from '@/lib/lessons/catalog';
import { buildLessonLabels } from '@/lib/lessons/labels';
import { cn } from '@/lib/utils';

type Loc = 'ru' | 'kk';
const MESSAGES = { ru: ru.lessons, kk: kk.lessons } as const;
const BOOK_TITLE: Record<Loc, string> = { ru: 'Законы Ньютона', kk: 'Ньютон заңдары' };

function pick(obj: unknown, path: string): string {
  const v = path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
  return typeof v === 'string' ? v : path;
}

function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = window.localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/** Тема окна, в котором открыта страница: явный выбор зрителя или системная. */
function hostTheme(): 'light' | 'dark' {
  const set = document.documentElement.dataset.theme;
  if (set === 'dark' || set === 'light') return set;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function App() {
  const [locale, setLocale] = useState<Loc>(() => readPref('alemprep:demo:locale', ['ru', 'kk'] as const, 'ru'));
  const [dark, setDark] = useState(() => readPref('alemprep:demo:theme', ['light', 'dark'] as const, hostTheme()) === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      window.localStorage.setItem('alemprep:demo:theme', dark ? 'dark' : 'light');
    } catch {
      /* ок */
    }
  }, [dark]);

  useEffect(() => {
    try {
      window.localStorage.setItem('alemprep:demo:locale', locale);
    } catch {
      /* ок */
    }
    document.documentElement.lang = locale;
  }, [locale]);

  const messages = MESSAGES[locale];
  const t = (key: string) => pick(messages, key);
  const lesson = { ...resolveLesson(LESSONS.find((l) => l.id === __DEMO_LESSON__) ?? LESSONS[0], locale), video: 'lesson.mp4', poster: 'poster.jpg' };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1500px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">A</span>
            AlemPrep
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-full bg-muted p-0.5 text-[13px] font-semibold" role="group">
              {(['ru', 'kk'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocale(l)}
                  aria-pressed={locale === l}
                  className={cn('rounded-full px-3 py-1 uppercase transition-[background-color,color] duration-150', locale === l ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              aria-label={dark ? 'Light' : 'Dark'}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
            >
              {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </div>
      </header>
      <LessonWatch
        demo
        lesson={lesson}
        subtitle={t('subject.physics')}
        book={parseBookContent(book[locale])}
        bookTitle={BOOK_TITLE[locale]}
        labels={buildLessonLabels(t)}
      />
      <UiSoundListener />
    </div>
  );
}


createRoot(document.getElementById('root')!).render(<App />);
