import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import official from '../../scripts/data/official-topics.json';
import { BOOK_SUBJECTS, loadBooksCatalog } from './catalog';
import { bookContentSchema } from './content';

type Official = Record<string, { sections: Array<{ topics: Array<{ slug: string }> }> }>;
const books = loadBooksCatalog();

describe('books catalog', () => {
  it('splits every official topic of math, physics and informatics into books', () => {
    for (const subject of BOOK_SUBJECTS) {
      const topics = (official as unknown as Official)[subject].sections.flatMap((s) => s.topics.map((t) => t.slug));
      const covered = new Set(books.filter((b) => b.subject === subject).map((b) => b.topic));
      expect([...covered].sort()).toEqual([...topics].sort());
    }
  });

  it('has unique, url-safe slugs and names in both languages', () => {
    expect(new Set(books.map((b) => b.slug)).size).toBe(books.length);
    for (const b of books) {
      expect(b.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(b.nameRu.trim()).not.toBe('');
      expect(b.nameKk.trim()).not.toBe('');
    }
  });

  it('every finished book file matches the content format and a catalog slug', () => {
    const dir = join(__dirname, '../../scripts/data/books');
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
    expect(files.length).toBeGreaterThan(0);
    const slugs = new Set(books.map((b) => b.slug));
    for (const f of files) {
      expect(slugs.has(f.replace(/\.json$/, ''))).toBe(true);
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      expect(bookContentSchema.safeParse(raw.ru).success).toBe(true);
      if (raw.kk !== undefined) expect(bookContentSchema.safeParse(raw.kk).success).toBe(true);
      // Кириллица внутри формул — только в \text{...}, иначе KaTeX ругается и рисует криво.
      const formulas = [...JSON.stringify(raw).matchAll(/\$([^$]+)\$|"tex":"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1] ?? m[2]);
      for (const f of formulas) {
        const outsideText = f.replace(/\\{1,2}text\{[^}]*\}/g, '');
        expect(outsideText, f).not.toMatch(/[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/);
      }
    }
  });
});
