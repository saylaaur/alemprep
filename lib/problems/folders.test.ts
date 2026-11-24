import { describe, expect, it } from 'vitest';
import { buildProblemFolders } from './folders';
import type { LibrarySubject } from '@/lib/supabase/queries/books';

const book = (slug: string) => ({ id: slug, slug, name: slug, sortOrder: 0, hasContent: true, received: false, stage: 0, dueOn: null, state: 'available' as const });

const library: LibrarySubject[] = [
  {
    slug: 'physics',
    name: 'Физика',
    topics: [
      { slug: 'kin', name: 'Кинематика', sectionNo: 1, topicNo: 1, books: [book('accel'), book('uniform')] },
      { slug: 'dyn', name: 'Динамика', sectionNo: 1, topicNo: 2, books: [book('newton')] },
      { slug: 'opt', name: 'Оптика', sectionNo: 2, topicNo: 3, books: [book('lens')] },
    ],
  },
  { slug: 'math', name: 'Математика', topics: [{ slug: 'log', name: 'Логарифмы', sectionNo: 1, topicNo: 1, books: [book('log')] }] },
];

describe('buildProblemFolders', () => {
  it('кладёт задачи урока в тему его книги и считает итоги', () => {
    const f = buildProblemFolders(library, [
      { id: 'a', title: 'A', bookSlug: 'accel', count: 22 },
      { id: 'n', title: 'N', bookSlug: 'newton', count: 20 },
    ]);
    expect(f.map((s) => s.count)).toEqual([42, 0]);
    expect(f[0].topics.map((t) => t.count)).toEqual([22, 20, 0]);
    expect(f[0].topics[0].lessons.map((l) => l.id)).toEqual(['a']);
  });

  it('добавляет задачи банка в счёт темы', () => {
    const f = buildProblemFolders(library, [{ id: 'a', title: 'A', bookSlug: 'accel', count: 22 }], new Map([['kin', 150], ['log', 50]]));
    expect(f[0].topics[0]).toMatchObject({ count: 172, bank: 150 });
    expect(f.map((s) => s.count)).toEqual([172, 50]);
  });

  it('показывает все темы, даже пустые', () => {
    const f = buildProblemFolders(library, []);
    expect(f[0].topics).toHaveLength(3);
    expect(f[1].topics[0].count).toBe(0);
  });
});
