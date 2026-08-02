import { describe, it, expect } from 'vitest';
import { groupTopicsBySection, type SectionedTopic } from './topics';

function topic(overrides: Partial<SectionedTopic> & { slug: string }): SectionedTopic & { slug: string } {
  return {
    section_no: null,
    section_name_ru: null,
    section_name_kk: null,
    topic_no: null,
    ...overrides,
  };
}

describe('groupTopicsBySection', () => {
  it('groups topics by section_no and keeps the section name from the group', () => {
    const groups = groupTopicsBySection([
      topic({ slug: 'a', section_no: 1, section_name_ru: 'Числа', topic_no: 1 }),
      topic({ slug: 'b', section_no: 1, section_name_ru: 'Числа', topic_no: 2 }),
      topic({ slug: 'c', section_no: 2, section_name_ru: 'Уравнения', topic_no: 3 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ sectionNo: 1, sectionNameRu: 'Числа' });
    expect(groups[0].topics.map((t) => t.slug)).toEqual(['a', 'b']);
    expect(groups[1]).toMatchObject({ sectionNo: 2, sectionNameRu: 'Уравнения' });
    expect(groups[1].topics.map((t) => t.slug)).toEqual(['c']);
  });

  it('orders sections by section_no ascending regardless of input order', () => {
    const groups = groupTopicsBySection([
      topic({ slug: 'c', section_no: 3, topic_no: 1 }),
      topic({ slug: 'a', section_no: 1, topic_no: 1 }),
      topic({ slug: 'b', section_no: 2, topic_no: 1 }),
    ]);
    expect(groups.map((g) => g.sectionNo)).toEqual([1, 2, 3]);
  });

  it('orders topics within a section by topic_no ascending regardless of input order', () => {
    const groups = groupTopicsBySection([
      topic({ slug: 'c', section_no: 1, topic_no: 3 }),
      topic({ slug: 'a', section_no: 1, topic_no: 1 }),
      topic({ slug: 'b', section_no: 1, topic_no: 2 }),
    ]);
    expect(groups[0].topics.map((t) => t.slug)).toEqual(['a', 'b', 'c']);
  });

  it('puts topics without a section (section_no null) in their own group, last', () => {
    const groups = groupTopicsBySection([
      topic({ slug: 'legacy', section_no: null, topic_no: null }),
      topic({ slug: 'a', section_no: 1, section_name_ru: 'Числа', topic_no: 1 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].sectionNo).toBe(1);
    expect(groups[1]).toMatchObject({ sectionNo: null, sectionNameRu: null, sectionNameKk: null });
    expect(groups[1].topics.map((t) => t.slug)).toEqual(['legacy']);
  });

  it('pushes a topic with no topic_no to the end within its section', () => {
    const groups = groupTopicsBySection([
      topic({ slug: 'no-number', section_no: 1, topic_no: null }),
      topic({ slug: 'first', section_no: 1, topic_no: 1 }),
    ]);
    expect(groups[0].topics.map((t) => t.slug)).toEqual(['first', 'no-number']);
  });

  it('returns an empty array for no topics', () => {
    expect(groupTopicsBySection([])).toEqual([]);
  });

  it('treats undefined section_no/topic_no the same as null (pre-migration DB rows lack the columns entirely)', () => {
    const legacy = { slug: 'legacy' } as unknown as SectionedTopic & { slug: string };
    const groups = groupTopicsBySection([
      legacy,
      topic({ slug: 'a', section_no: 1, section_name_ru: 'Числа', topic_no: 1 }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1]).toMatchObject({ sectionNo: null });
    expect(groups[1].topics.map((t) => t.slug)).toEqual(['legacy']);
  });
});
