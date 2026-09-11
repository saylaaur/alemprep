import React, { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ru from '@/messages/ru.json';
import kk from '@/messages/kk.json';

const state = vi.hoisted(() => ({ locale: 'kk' as 'ru' | 'kk' }));
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async (namespace: string) => createTranslator({ locale: state.locale, messages: (state.locale === 'kk' ? kk : ru) as AbstractIntlMessages, namespace }),
}));
vi.mock('@/i18n/routing', () => ({ Link: ({ href, children, ...props }: { href: string | { pathname: string; params: { topic: string } }; children: ReactNode }) => createElement('a', { ...props, href: '/' + state.locale + (typeof href === 'string' ? href : href.pathname.replace('[topic]', href.params.topic)) }, children) }));
vi.mock('@/lib/supabase/queries', () => ({
  getSubjectBySlug: async () => ({ id: 'S1', slug: 'math' }),
  subjectName: () => 'Математика',
  topicName: (topic: { slug: string }) => topic.slug,
  getTopicsForSubject: async () => [
    { id: 'T1', slug: 'empty-topic', question_count: 0, section_no: null },
    { id: 'T2', slug: 'available-topic', question_count: 3, section_no: null },
  ],
}));

import { ContentUnavailable } from '@/components/content/ContentUnavailable';
import SubjectTopicsPage from '@/app/[locale]/(app)/subjects/[subject]/page';

beforeEach(() => { vi.stubGlobal('React', React); });

describe.each(['ru', 'kk'] as const)('%s content availability UI', locale => {
  it('provides a same-language exit and available topic suggestions', async () => {
    state.locale = locale;
    const html = renderToStaticMarkup(await ContentUnavailable({ suggestions: [{ slug: 'available-topic', name: 'Тақырып', count: 3 }] }));
    expect(html).toContain(`href="/${locale}/subjects"`);
    expect(html).toContain(`href="/${locale}/practice/topic/available-topic"`);
    expect(html).toContain((locale === 'kk' ? kk : ru).contentAvailability.topicTitle);
    expect(html).not.toContain(`href="/${locale === 'kk' ? 'ru' : 'kk'}/`);
    const reviewDirectory = process.env.ALEMPREP_UI_REVIEW_DIR;
    if (reviewDirectory) {
      mkdirSync(reviewDirectory, { recursive: true });
      writeFileSync(join(reviewDirectory, `empty-${locale}.html`), `<!doctype html><html lang="${locale}" class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="font-family:Inter,Arial,sans-serif">${html}</body></html>`);
    }
  });
  it('does not render an empty topic as a practice link', async () => {
    state.locale = locale;
    const html = renderToStaticMarkup(await SubjectTopicsPage({ params: Promise.resolve({ locale, subject: 'math' }) }));
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain(`href="/${locale}/practice/topic/empty-topic"`);
    expect(html).toContain(`href="/${locale}/practice/topic/available-topic"`);
  });
});
