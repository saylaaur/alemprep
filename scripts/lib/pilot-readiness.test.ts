import { describe, expect, it } from 'vitest';
import { summarizePilotInventory, pilotInventorySchema } from './pilot-readiness';

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const version = (locale: 'ru' | 'kk', n: number, family = id(n)) => ({
  type: 'single' as const, id: id(n + 100), question_id: id(n + 200), family_id: family, locale,
  public_body: { stem: '2+2?', options: [{ id: 'A', content: '4' }] },
  question_publications: { status: 'approved' }, questions: { topics: { slug: 'progressions' } },
});
const inventory = () => ({ versions: [version('ru', 1), version('kk', 2, id(1))], bindings: { schools: 0, groups: 0, teachers: 0, coordinators: 0 } });

describe('pilot inventory readiness', () => {
  it('uses approved families, not published legacy counts, and separates missing bindings', () => {
    const result = summarizePilotInventory(inventory());
    expect(result.contentReady).toBe(true);
    expect(result.bindingPresence).toBe(false);
    expect(result.approvedFamilies).toEqual({ ru: 1, kk: 1 });
    expect(result.topics).toEqual([{ slug: 'progressions', ru: 1, kk: 1 }]);
    expect(result.warnings).toContain('school-bindings-missing');
    expect(JSON.stringify(result)).not.toContain('2+2');
  });
  it('fails closed on an empty bank and malformed joins', () => {
    expect(summarizePilotInventory({ ...inventory(), versions: [] }).contentReady).toBe(false);
    expect(pilotInventorySchema.safeParse({ ...inventory(), versions: [{ ...version('ru', 1), questions: null }] }).success).toBe(false);
  });
  it('counts a duplicate family once and flags it for review', () => {
    const data = inventory(); data.versions.push(version('ru', 3, id(1)));
    const result = summarizePilotInventory(data);
    expect(result.approvedFamilies.ru).toBe(1);
    expect(result.contentReady).toBe(false);
    expect(result.issues).toContain('duplicate-approved-family');
  });
  it('flags missing language pairs even when both languages have some content', () => {
    const data = inventory(); data.versions[1] = version('kk', 2, id(2));
    expect(summarizePilotInventory(data).warnings).toContain('unpaired-families');
  });
  it('warns for a topic missing either locale even when families are paired globally', () => {
    const data = inventory(); data.versions[1]!.questions.topics.slug = 'equations';
    expect(summarizePilotInventory(data).warnings).toContain('topic-language-gap');
  });
  it('fails if an approved public body leaks a grading key', () => {
    const data = inventory(); Object.assign(data.versions[0]!.public_body, { correct: 'A' });
    expect(summarizePilotInventory(data).issues).toContain('public-answer-key');
    expect(summarizePilotInventory(data).contentReady).toBe(false);
  });
  it('fails if an approved task has an unreadable body', () => {
    const data = inventory();
    expect(summarizePilotInventory({ ...data, versions: [{ ...data.versions[0], public_body: null }, data.versions[1]] }).issues).toContain('unreadable-public-body');
  });
  it.each(['single', 'multi'] as const)('rejects duplicate option IDs for %s', type => {
    const data = inventory();
    const malformed = { ...data.versions[0], type, public_body: { stem: 'bad options', options: [{ id: 'A', content: '1' }, { id: 'A', content: '2' }] } };
    const result = summarizePilotInventory({ ...data, versions: [malformed, data.versions[1]] });
    expect(result.contentReady).toBe(false);
    expect(result.issues).toContain('unreadable-public-body');
  });
  it.each(['left', 'right'] as const)('rejects duplicate matching %s identifiers', side => {
    const data = inventory();
    const body = { stem: 'match', left: [{ id: 'A', content: '1' }], right: ['x'] };
    if (side === 'left') body.left.push({ id: 'A', content: '2' });
    else body.right.push('x');
    const result = summarizePilotInventory({ ...data, versions: [{ ...data.versions[0], type: 'matching', public_body: body }, data.versions[1]] });
    expect(result.contentReady).toBe(false);
    expect(result.issues).toContain('unreadable-public-body');
  });
  it('flags a known excluded source still approved without printing bodies', () => {
    const data = inventory(); data.versions[0]!.question_id = '32683e42-83b0-437d-92b3-b51f40d7509a';
    expect(summarizePilotInventory(data).issues).toContain('excluded-source-approved');
  });
});
