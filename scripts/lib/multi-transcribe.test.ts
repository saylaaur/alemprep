import { describe, it, expect } from 'vitest';
import { extractJsonArray, parseMultiItems } from './multi-transcribe';

describe('extractJsonArray', () => {
  it('returns a bare array unchanged', () => {
    expect(extractJsonArray('[{"a":1}]')).toBe('[{"a":1}]');
  });

  it('strips ```json code fences', () => {
    expect(extractJsonArray('```json\n[{"a":1}]\n```')).toBe('[{"a":1}]');
  });

  it('strips plain ``` code fences', () => {
    expect(extractJsonArray('```\n[{"a":1}]\n```')).toBe('[{"a":1}]');
  });

  it('slices from the first [ to the last ] when there is preamble text', () => {
    expect(extractJsonArray('Вот результат:\n[{"a":1}]\nГотово.')).toBe('[{"a":1}]');
  });
});

const validQuestion = {
  topic_slug: 'logarithms',
  type: 'single' as const,
  difficulty: 3,
  body: {
    stem: 'Найдите $\\log_2 8$.',
    options: [
      { id: 'a', content: '2' },
      { id: 'b', content: '3' },
    ],
    correct: 'b',
  },
  explanation: { blocks: [{ type: 'text', value: 'Т.к. $2^3=8$.' }] },
};

describe('parseMultiItems', () => {
  it('parses a single valid question and forces source_file', () => {
    const result = parseMultiItems(JSON.stringify([{ ...validQuestion, source_file: 'wrong.jpg' }]), 'IMG_1.jpg');
    expect(result.parseError).toBeUndefined();
    expect(result.discardedReasons).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ topic_slug: 'logarithms', source_file: 'IMG_1.jpg' });
  });

  it('keeps a skip("graph") marker alongside a valid question', () => {
    const raw = JSON.stringify([
      validQuestion,
      { skip: 'graph', reason: 'circuit diagram', source_file: 'x' },
    ]);
    const result = parseMultiItems(raw, 'IMG_2.jpg');
    expect(result.items).toHaveLength(2);
    expect(result.discardedReasons).toEqual([]);
    const skip = result.items.find((i) => 'skip' in i);
    expect(skip).toMatchObject({ skip: 'graph', source_file: 'IMG_2.jpg' });
  });

  it('discards a malformed item with a reason, keeps the valid ones', () => {
    const raw = JSON.stringify([validQuestion, { topic_slug: 'algebra' /* missing body/type/etc */ }]);
    const result = parseMultiItems(raw, 'IMG_3.jpg');
    expect(result.items).toHaveLength(1);
    expect(result.discardedReasons).toHaveLength(1);
    expect(result.discardedReasons[0]).toMatch(/item\[1\]/);
  });

  it('sets parseError when the response is not a JSON array', () => {
    const result = parseMultiItems('{"not":"an array"}', 'IMG_4.jpg');
    expect(result.items).toEqual([]);
    expect(result.discardedReasons).toEqual([]);
    expect(result.parseError).toBeTruthy();
  });

  it('sets parseError when the response is not valid JSON at all', () => {
    const result = parseMultiItems('this is not json', 'IMG_5.jpg');
    expect(result.items).toEqual([]);
    expect(result.parseError).toBeTruthy();
  });
});
