import { describe, expect, it } from 'vitest';
import { splitCode } from './MathText';

describe('splitCode', () => {
  it('оставляет обычный текст как есть', () => {
    expect(splitCode('Найдите $x$')).toEqual([{ kind: 'text', value: 'Найдите $x$' }]);
  });

  it('выделяет блок кода', () => {
    const parts = splitCode('Что выведет?\n\n```python\ns = 0\nprint(s)\n```');
    expect(parts).toEqual([
      { kind: 'text', value: 'Что выведет?\n\n' },
      { kind: 'block', value: 's = 0\nprint(s)' },
    ]);
  });

  it('выделяет строчный код', () => {
    expect(splitCode('Код `print(1)` выведет')).toEqual([
      { kind: 'text', value: 'Код ' },
      { kind: 'inline', value: 'print(1)' },
      { kind: 'text', value: ' выведет' },
    ]);
  });
});
