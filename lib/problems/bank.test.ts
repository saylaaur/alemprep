import { describe, expect, it } from 'vitest';
import official from '../../scripts/data/official-topics.json';
import { MATCH_BASE } from '@/lib/lessons/shuffle';
import { BANK, bankCounts, resolveBankItem, SET_SIZE, setCount, topicSet, type BankItem } from './bank';

const subjects = ['math', 'physics', 'informatics'] as const;
const topics = new Map(subjects.map((s) => [s, new Set(official[s].sections.flatMap((sec) => sec.topics.map((t) => t.slug)))]));
const CYR = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/;

describe('банк задач', () => {
  it('у каждой задачи тема из официальной спецификации своего предмета', () => {
    for (const it of BANK) expect(topics.get(it.subject)?.has(it.topic), it.id).toBe(true);
  });

  it('id не повторяются, варианты разные, вопросы в шаблоне не повторяются', () => {
    expect(new Set(BANK.map((b) => b.id)).size).toBe(BANK.length);
    const q = new Set<string>();
    for (const it of BANK) {
      for (const side of [it.ru, it.kk].filter(Boolean) as BankItem['ru'][]) {
        expect(new Set(side.options).size, it.id).toBe(side.options.length);
      }
      const key = `${it.template}|${it.ru.context ?? ''}|${it.ru.question}`;
      expect(q.has(key), it.id).toBe(false);
      q.add(key);
    }
  });

  it('в формулах нет кириллицы вне \\text{}', () => {
    for (const it of BANK) {
      for (const side of [it.ru, it.kk].filter(Boolean) as BankItem['ru'][]) {
        for (const s of [side.context ?? '', side.question, side.solution, ...side.options]) {
          for (const m of s.match(/\$[^$]*\$/g) ?? []) expect(CYR.test(m.replace(/\\text\{[^}]*\}/g, '')), `${it.id}: ${m}`).toBe(false);
        }
      }
    }
  });

  it.each([...bankCounts().keys()])('наборы темы %s не пересекаются и идут от лёгких к сложным', (topic) => {
    const n = setCount(topic);
    const seen = new Set<string>();
    for (let s = 0; s < n; s++) {
      const set = topicSet(topic, s);
      expect(set.length).toBeLessThanOrEqual(SET_SIZE);
      const order = set.map((x) => ['easy', 'medium', 'hard'].indexOf(x.level));
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      for (const x of set) {
        expect(seen.has(x.id)).toBe(false);
        seen.add(x.id);
      }
    }
    expect(seen.size).toBe(bankCounts().get(topic));
  });

  it('в наборе смешаны разные шаблоны', () => {
    const set = topicSet('kinematics', 0);
    expect(new Set(set.map((x) => x.template)).size).toBeGreaterThan(1);
  });

  it('после перемешивания верные ответы остаются теми же', () => {
    const pick = (opts: string[], mask: number) => opts.filter((_, i) => mask & (1 << i)).sort();
    for (const it of BANK) {
      const r = resolveBankItem(it, 'ru');
      if (it.kind === 'multi') {
        expect(r.multi).toBe(true);
        expect(pick(r.options, r.correct), it.id).toEqual(pick(it.ru.options, it.ru.correct));
      } else if (it.kind === 'match') {
        const was = [it.ru.correct % MATCH_BASE, Math.floor(it.ru.correct / MATCH_BASE)].map((i) => it.ru.options[i]);
        const now = [r.correct % MATCH_BASE, Math.floor(r.correct / MATCH_BASE)].map((i) => r.options[i]);
        expect(now, it.id).toEqual(was);
        expect(r.rows, it.id).toEqual(it.ru.rows);
      } else {
        expect(r.options[r.correct], it.id).toBe(it.ru.options[0]);
      }
    }
  });

  it('в банке есть все форматы ЕНТ: один ответ, несколько ответов, соответствие, контекстные блоки', () => {
    expect(BANK.some((b) => b.kind === 'multi')).toBe(true);
    expect(BANK.some((b) => b.kind === 'match')).toBe(true);
    for (const b of BANK) expect(b.ru.options.length, b.id).toBe(b.kind === 'multi' ? 6 : 4);
    expect(BANK.some((b) => b.group)).toBe(true);
    for (const b of BANK.filter((x) => x.kind === 'multi')) {
      const n = b.ru.correct.toString(2).split('').filter((c) => c === '1').length;
      expect(n, b.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('контекстный блок целиком попадает в один набор и идёт подряд, условие у всех вопросов общее', () => {
    const groups = new Map<string, BankItem[]>();
    for (const b of BANK) if (b.group) groups.set(b.group, [...(groups.get(b.group) ?? []), b]);
    for (const [gid, members] of groups) {
      expect(new Set(members.map((m) => m.ru.context)).size, gid).toBe(1);
      const topic = members[0].topic;
      let found = 0;
      for (let s = 0; s < setCount(topic); s++) {
        const ids = topicSet(topic, s).map((x) => x.id);
        const at = members.map((m) => ids.indexOf(m.id));
        if (at.every((i) => i === -1)) continue;
        found++;
        expect(at.every((i) => i >= 0), gid).toBe(true);
        expect(at.map((i, k) => i - k).every((d) => d === at[0]), gid).toBe(true);
      }
      expect(found, gid).toBe(1);
    }
  });
});
