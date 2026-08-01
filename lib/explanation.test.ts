import { describe, it, expect } from 'vitest';
import { normalizeExplanationBlocks } from './explanation';

describe('normalizeExplanationBlocks: валидные данные', () => {
  it('type: "text" остаётся текстом', () => {
    expect(normalizeExplanationBlocks({ blocks: [{ type: 'text', value: 'Ответ: 4.' }] })).toEqual([
      { type: 'text', value: 'Ответ: 4.' },
    ]);
  });

  it('type: "latex" остаётся формулой', () => {
    expect(normalizeExplanationBlocks({ blocks: [{ type: 'latex', value: '\\ln e = 1' }] })).toEqual([
      { type: 'latex', value: '\\ln e = 1' },
    ]);
  });

  it('отсутствующий type по умолчанию считается текстом', () => {
    expect(normalizeExplanationBlocks({ blocks: [{ value: 'Просто текст' }] })).toEqual([
      { type: 'text', value: 'Просто текст' },
    ]);
  });

  it('несколько блоков сохраняют порядок', () => {
    expect(
      normalizeExplanationBlocks({
        blocks: [
          { type: 'text', value: 'Шаг 1.' },
          { type: 'latex', value: 'x^2' },
          { type: 'text', value: 'Шаг 2.' },
        ],
      })
    ).toEqual([
      { type: 'text', value: 'Шаг 1.' },
      { type: 'latex', value: 'x^2' },
      { type: 'text', value: 'Шаг 2.' },
    ]);
  });
});

describe('normalizeExplanationBlocks: type: "image"', () => {
  it('блоки-картинки аккуратно пропускаются (не поддерживаются)', () => {
    expect(
      normalizeExplanationBlocks({
        blocks: [
          { type: 'text', value: 'До картинки.' },
          { type: 'image', value: 'https://example.com/pic.png' },
          { type: 'text', value: 'После картинки.' },
        ],
      })
    ).toEqual([
      { type: 'text', value: 'До картинки.' },
      { type: 'text', value: 'После картинки.' },
    ]);
  });
});

describe('normalizeExplanationBlocks: защита от битых данных', () => {
  it('null explanation — пустой массив', () => {
    expect(normalizeExplanationBlocks(null)).toEqual([]);
  });

  it('undefined explanation — пустой массив', () => {
    expect(normalizeExplanationBlocks(undefined)).toEqual([]);
  });

  it('explanation без поля blocks — пустой массив', () => {
    expect(normalizeExplanationBlocks({})).toEqual([]);
  });

  it('blocks: [] — пустой массив', () => {
    expect(normalizeExplanationBlocks({ blocks: [] })).toEqual([]);
  });

  it('blocks не массив — пустой массив, не падает', () => {
    expect(normalizeExplanationBlocks({ blocks: 'oops' })).toEqual([]);
  });

  it('explanation — примитив (строка/число) — пустой массив, не падает', () => {
    expect(normalizeExplanationBlocks('oops')).toEqual([]);
    expect(normalizeExplanationBlocks(42)).toEqual([]);
  });

  it('блок без value — пропускается', () => {
    expect(normalizeExplanationBlocks({ blocks: [{ type: 'text' }] })).toEqual([]);
  });

  it('value не строка — блок пропускается, не выводит "undefined"', () => {
    expect(normalizeExplanationBlocks({ blocks: [{ type: 'text', value: null }] })).toEqual([]);
    expect(normalizeExplanationBlocks({ blocks: [{ type: 'text', value: 42 }] })).toEqual([]);
    expect(normalizeExplanationBlocks({ blocks: [{ type: 'text', value: { nested: true } }] })).toEqual([]);
  });

  it('value — пустая строка или только пробелы — блок пропускается', () => {
    expect(normalizeExplanationBlocks({ blocks: [{ type: 'text', value: '' }] })).toEqual([]);
    expect(normalizeExplanationBlocks({ blocks: [{ type: 'text', value: '   \n  ' }] })).toEqual([]);
  });

  it('блок не объект (null/строка/массив в blocks) — пропускается', () => {
    expect(
      normalizeExplanationBlocks({
        blocks: [null, 'oops', ['nested'], { type: 'text', value: 'ok' }],
      })
    ).toEqual([{ type: 'text', value: 'ok' }]);
  });

  it('невалидный type — трактуется как text, а не отбрасывается', () => {
    expect(normalizeExplanationBlocks({ blocks: [{ type: 'weird', value: 'x' }] })).toEqual([
      { type: 'text', value: 'x' },
    ]);
  });
});
