import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bookContentOf } from '@/lib/local/book-content';
import { loadBooksCatalog } from './catalog';
import { parseBookContent } from './content';

const dir = join(__dirname, '../../scripts/data/books');
const written = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
const catalog = new Set(loadBooksCatalog().map((b) => b.slug));

describe('written books', () => {
  it.each(written)('%s: есть в каталоге, подключена и проходит схему на обоих языках', (slug) => {
    expect(catalog.has(slug)).toBe(true);
    const raw = bookContentOf(slug);
    expect(raw).toBeDefined();
    const ru = parseBookContent(raw?.ru);
    const kk = parseBookContent(raw?.kk);
    expect(ru).not.toBeNull();
    expect(kk).not.toBeNull();
    expect(kk?.pages.length).toBe(ru?.pages.length);
  });
});
