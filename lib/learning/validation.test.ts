import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { validateStart, validateSubmit } from './validation';

const operationId = 'f98c66ce-c4ce-4c31-a4fc-c051456efa50';
const sessionId = '76773796-a2c8-45be-bf9b-514fd1e39b06';
const itemId = '2ecc2e82-c7ee-410f-a082-676c00f6f755';

describe('learning input validation', () => {
  it('rejects untrusted start extras before a server action can accept them', () => {
    expect(() => validateStart({
      operationId,
      locale: 'kk',
      mode: 'practice',
      score: 100,
      userId: 'd8548b9c-1595-4bb7-a40d-00d8315e130e',
      schoolId: '63478d8f-dd3b-4ba6-b2b2-53104bc7ca6d',
      isCorrect: true,
    })).toThrow(ZodError);
  });

  it.each([null, [], NaN, Infinity])('rejects an invalid submit root (%p)', (raw) => {
    expect(() => validateSubmit(raw)).toThrow(ZodError);
  });

  it('rejects duplicate item IDs and non-integer duration', () => {
    expect(() => validateSubmit({
      operationId,
      sessionId,
      answers: [
        { itemId, answer: 'A', timeSpentMs: 1.5 },
        { itemId, answer: 'B', timeSpentMs: 2 },
      ],
    })).toThrow(ZodError);
  });

  it('rejects matching payloads with prototype keys', () => {
    expect(() => validateSubmit({
      operationId,
      sessionId,
      answers: [{
        itemId,
        answer: JSON.parse('{"__proto__":"right"}'),
        timeSpentMs: 0,
      }],
    })).toThrow(ZodError);
  });

  it('accepts a bounded valid input', () => {
    expect(validateSubmit({
      operationId,
      sessionId,
      answers: [{ itemId, answer: ['A', 'B'], timeSpentMs: 12_000 }],
    })).toEqual({
      operationId,
      sessionId,
      answers: [{ itemId, answer: ['A', 'B'], timeSpentMs: 12_000 }],
    });
  });
});
