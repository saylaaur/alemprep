# 03 — Content and language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Допускать в школьные уроки только проверенную программу RU/KK с корректными объяснениями и медиа.
**Architecture:** C00a–C00c готовят KK из существующих RU-вопросов до L01: offline Google NMT, структурные инварианты, человеческая приёмка и текущий draft/review flow. Затем версии L01 + отдельные publication records; approved программа фиксирует конкретные question version IDs. Проверка содержания человеком обязательна.
**Tech Stack:** TypeScript, existing ContentBlocks/MathText, SQL, Vitest/Playwright, next-intl.
**Spec:** [архитектура](../specs/2026-09-09-production-pilot-architecture.md), §§2,5,9.

## Global Constraints

- RU/KK: ключи сообщений в паритете, контент пилота принят человеком по математике и казахскому языку.
- Существующие design tokens, темы и согласованный дизайн визуализации сохраняются.
- Новые миграции; применённые SQL-файлы, `.env.local` и материалы презентации не изменяются.
- Казахский — первый язык приёмки сельского пилота. Машинный перевод разрешён как черновик; он не считается человеческой языковой проверкой.
- Переводим существующие задачи, не генерируем новые. В ученическом запросе нет Translation API; результат сохраняется заранее. Ни LLM-verifier, ни повторная генерация не обязательны для каждой строки.

## P0 — исходные данные и экономный способ

Read-only `scripts/audit-production-inventory.ts` 09.09.2026 16:27 UTC: 4 705 вопросов всего, 4 646 опубликованных RU (4 197 single, 157 multi, 292 matching), **0 опубликованных KK**, 59 черновиков суммарно. Это подсчёт, не математическая приёмка русского банка. Комментарий старого `translate-questions.ts` про 693 вопроса устарел.

`getQuestionsForTopic` в `lib/supabase/queries.ts` фильтрует `language=locale` и `is_published=true`; сейчас ошибку Supabase не отличает от пустого массива. Снимок пустой `/kk/practice/topic/radicals-and-expressions` согласуется с отсутствием опубликованного KK, но маскировку ошибок тоже требуется исправить.

Уже есть `scripts/translate-questions.ts`, `verify-translation.ts`, `translate-all.ts`, `insert-to-db.ts`, `scripts/lib/checks.ts`, `scripts/lib/kk-glossary.json` и `questions.source_question_id`. Переиспользовать проверенные части. Старый `gen:translate-all` платно вызывает Haiku и Sonnet; **не запускать его как будто это Google Translate**. Не использовать недокументированный бесплатный endpoint или перевод браузером для наполнения БД.

Предпочтительный кандидат: официальный Google Cloud Translation NMT (Basic v2, plain text, source=ru, target=kk). [Поддержка KK](https://docs.cloud.google.com/translate/docs/languages). По [тарифу Google](https://cloud.google.com/products/translate/pricing), проверенному 09.09.2026, первые 500 000 символов в месяц покрываются кредитом $10, далее $20/млн в стандартном диапазоне. Доступный кредит зависит от другого использования аккаунта; подключение billing/API и бюджет подтверждаются до платного запуска. Не обещать, что NMT дешевле всех LLM: сравнивать стоимость принятой задачи с учётом вычитки на пробной партии.

Считать символы отправленного текста, включая placeholders, подписи и объяснения, после дедупликации; не считать UTF-8 байты. Пример, **не измерение банка**: 200 задач × 1 500 отправляемых символов = 300 000 → $6 без кредита; 1 млн → $20 без кредита или около $10 при полностью доступном кредите. 4 646 × 1 500 = 6,969 млн → $139,38 без кредита; поэтому не переводить весь банк до сметы и выбора уроков. Налоги, человеческая проверка и повторные запросы отдельно. Инженерный ориентир C00a/C00b — 1–3 рабочих дня, C00c зависит от числа задач и доступности проверяющего; пересчитать после 30 примеров.

## C00a — P0: покрытие по темам и честная доступность

**Статус 10.09.2026:** техническая часть реализована; см. [отчёт](../../qa/kazakh-coverage.md) и [журнал](../../production/EXECUTION_LOG.md). Следующий кодовый блок C00b. Изменений контента/БД и платных вызовов не было. Пункты ниже остаются исходными критериями; человеческая приёмка и программа первого урока не объявлены выполненными.

Получена детерминированная приватная выборка 30 RU math с source hashes: `/private/tmp/alemprep-kk-source-sample-20260910.json`. В ней есть radicals, три формата, контекст, формулы, текстовые варианты и отрицание; структурированной таблицы в доступном опубликованном math-банке не найдено. Табличные поля проверяются synthetic regression fixture; C00b обязан сохранить этот кейс в end-to-end проверке перевода. Классы/темы и реальный набор первых уроков подтверждаются школой отдельно. Для повторного получения manifest запустить `npm run audit:kk`.

- [ ] Внешняя приёмка нового KK UI носителем языка перед первым школьным уроком.
- [ ] Методист утверждает программу 30–50 пар для первого сопровождаемого этапа; текущие 30 — техническая проба перевода, не учебная программа.

**Files:** modify `scripts/audit-production-inventory.ts`, `scripts/lib/production-inventory.ts` и его tests, `lib/supabase/queries.ts`, `components/practice/PracticeView.tsx`, `app/[locale]/(app)/subjects/[subject]/page.tsx`, `messages/{ru,kk}.json`; create `docs/qa/kk-coverage.md` (агрегаты), `scripts/lib/translation-budget.ts` и `.test.ts`.
**Consumes:** существующие questions/contexts/topics, без записи в production и без платных API.
**Produces:** покрытие по subject+topic+language (published/draft/missing/stale pair); смета и список первой партии с хешами исходников, доступные пользователю действия при отсутствии контента.

- [ ] Написать synthetic regression tests: RU published/KK zero; KK draft не доступен ученику; сбой запроса даёт error, а не empty; stale RU→KK pair не считается готовой. Для сметы проверить Unicode code points, dedup и существующий checkpoint. Запустить целевые tests до исправления и получить ожидаемые ошибки.
- [ ] Расширить read-only inventory пагинацией, ошибками запросов и разрезом тем; подсчитать отсутствующие пары через source_question_id, а не по похожему stem. Не перезаписывать существующие KK drafts: направлять на review. Опубликованный RU не считать автоматически правильным.
- [ ] Составить предварительный набор первых уроков без ожидания полного D03: 30 пробных задач разных форматов, включая radicals-and-expressions, контекст, таблицу, формулы, текстовый вариант ответа и отрицание. При неизвестных классах маркировать выбор предварительным. После ответа школ выбрать примерно 100–200 нужных задач, не весь банк.
- [ ] Исправить потерю ошибок `getQuestionsForTopic`; согласовать return contract и всех callers/tests. Пустая тема предлагает доступные KK-темы и возврат к предмету; недоступные темы не обещают занятие. Ошибка загрузки предлагает retry. Полный пробник/диагностика проверяют реальный объём банка соответствующего языка. Никакой молчаливой подстановки RU. Новые UI-строки RU/KK в паритете, KK формулировки принимает знающий язык человек.
- [ ] Посчитать объём natural-language полей выбранной партии и всего банка: stem, options, matching labels, explanation, context title/content, table headers/cells, image alt/captions. Печатать counts/оценку, без текста вопросов, ответов, PII и ключей. До C00b смета предварительная; окончательная считается после точной сериализации запросов.
- [ ] Проверить typecheck/lint, целевые unit и build для UI/query изменений. Commit `fix(content): expose Kazakh coverage and loading errors`. Для DB read evidence отдельно указать время и среду; C00a не утверждает, что перевод уже появился.

## C00b — P0: структурный перевод и пробная партия

**Статус 11.09.2026:** код, provider fixtures и read-only dry-run готовы; [operator runbook](../../production/GOOGLE_TRANSLATION_RUNBOOK.md), [журнал](../../production/EXECUTION_LOG.md). Реальный Google API не вызывался, нет KK drafts в БД и нет human review. Повторный dry-run реальной 30-sample после полного обхода полей и glossary rule оставил 11 сущностей на manual review и подготовил 20; это не разрешение запускать `--execute` без отдельного budget decision.

**Files:** create `scripts/lib/translation-segments.ts`, `scripts/lib/google-translation.ts`, `scripts/lib/translation-checkpoint.ts` и соответствующие `.test.ts`, `scripts/translate-google.ts`; modify `scripts/lib/checks.ts`/`.test.ts`, `package.json`. Переиспользовать schema и импорт существующего пайплайна; Google-only путь не вызывает Anthropic SDK.
**Consumes:** C00a source manifest, утверждённый словарь терминов и бюджет API.
**Produces:** явный output artifact с machine-draft переводами и source hashes; импорт не выполняется автоматически.

```ts
type TranslationSegment = { path: string; sourceText: string };
type TranslationProvider = {
  translate(segments: readonly TranslationSegment[]): Promise<readonly string[]>;
};
type TranslationCheckpoint = {
  sourceId: string; sourceHash: string; locale: 'kk'; provider: 'google-nmt';
  glossaryVersion: string; validatorVersion: string;
  state: 'prepared' | 'sent' | 'received' | 'validated' | 'rejected';
};
```

- [ ] Сначала failing tests для потери/дублирования placeholders, изменения correct IDs/чисел/формул/порядка matching, таблицы и общего context; mock provider timeout/429/5xx/недостающий ответ. После реализации те же tests должны проходить, реальный платный API в CI не вызывается.
- [ ] Извлекать только естественный язык из структуры. Защитить LaTeX, числа, код, URLs, идентификаторы вариантов, answer keys и размеры таблицы. Переводить текст ячеек/подписей, сохраняя структуру; формулы не отправлять целиком как текст. Для русских слов внутри LaTeX, текста в рисунке и неоднозначных единиц создавать manual-review issue; не оставлять их незаметно на русском.
- [ ] Проверять точное восстановление каждого placeholder и неизменность структурных полей; повреждённый перевод reject. Словарь применять только к текстовым сегментам с проверкой границ слов; не обещать, что Basic v2 сам применяет managed glossary. Если корректное склонение/термин не обеспечены, issue для редактора вместо слепой замены.
- [ ] Добавить CLI `content:translate-google`: `--manifest <path> --output <path> --dry-run` по умолчанию; реальные вызовы только с `--execute --max-chars <N> --max-usd <N>`. Флагов autopublish нет. Ключ — операторское окружение, без NEXT_PUBLIC; не менять `.env.local` автоматически. Использовать официальный API, документированные ограничения перепроверить перед реализацией.
- [ ] Checkpoint по source hash+locale+provider+glossary/validator version. Записать `sent` до отправки, результат — атомарно. При неизменённом исходнике использовать сохранённый ответ без нового API-вызова. Таймаут после отправки считать потенциально оплаченной попыткой; включить её в бюджет повторов, не обещать exactly-once billing. Ограничить concurrency=2, retries≤3 с backoff/jitter; abort по бюджету и quota errors. Невосстановленный `sent` требует явного resume решения, а не неограниченного повторения.
- [ ] Перед импортом сверить source hash повторно; изменившийся RU делает перевод stale. Общий контекст перевести один раз, импортировать отдельный KK-context и правильно перепривязать вопросы; нельзя оставить RU context_id. Не вводить новую миграцию ранним этапом без обнаруженной необходимости; C00b работает с артефактами.
- [ ] Перевести 30 примеров только после доступа и бюджета; human review сравнивает смысл, отрицания/неравенства, терминологию и правильный ответ. В отчёт: отправленные символы, retries, стоимость API, время вычитки, accepted/rejected. Если качество неудовлетворительно, исправить extractor/словарь или сравнить другой переводчик на тех же примерах; массовую партию не запускать автоматически.
- [ ] Typecheck/lint и script unit tests, существующие translation/checks tests; commit `feat(content): add budgeted Google translation drafts`. Исходники и переводы банка хранить в закрытом операторском каталоге, в Git только код/synthetic fixtures/агрегаты. Без API-доступа код и dry-run могут быть готовы, реальная проба остаётся непроверенной.

## C00c — P0: принять и выпустить первую KK-партию

**Files:** modify `scripts/insert-to-db.ts`, `scripts/translate-all.ts` (согласовать отказ autopublish и явные пути артефактов), `scripts/lib/checks.ts`; create `docs/pilot/CONTENT_REVIEW.md`, `tests/db/translation-import.test.ts`, `tests/e2e/kazakh-content.spec.ts`. Использовать существующий admin review до L01; человеческий реестр с личными сведениями хранить отдельно от Git.
**Consumes:** C00b validated drafts; E02 isolated DB/browser harness; math+KK reviewer.
**Produces:** принятые RU/KK пары и contexts в действующей схеме, публикация конкретного проверенного списка, отчёт покрытия и будущий input C01.

- [ ] На E02 DB написать реальные тесты: повторный импорт не создаёт вторую пару/context, RU не меняется, source hash mismatch блокирует импорт, missing context/таблица блокирует публикацию, KK draft не виден ученику, права обычного ученика не позволяют publish. Не использовать production как тестовую БД.
- [ ] Импортировать только конкретный validated artifact как `is_published=false`, не «самый новый файл в папке». Повторный импорт не перезаписывает ручную редактуру или опубликованные вопросы. Сбой многошаговой записи оставляет только невидимые черновики и manifest для безопасного resume.
- [ ] Знающий казахский предметный проверяющий принимает **каждую** задачу и объяснение первой программы: корректность исходника, смысл перевода, ответ, таблицу/рисунок, термины. Сохранить references проверки, source/draft hashes и дату; модель не подписывает review за человека. Optional LLM разбирает только спорные примеры в отдельном бюджете.
- [ ] Пройти RU/KK synthetic browser flow: выбор предмета/темы, получение задачи, формулы/таблица, отправка ответа, объяснение, перезагрузка, смена языка; также slow network, телефон 360px и переключение locale. Убедиться, что Google API никогда не вызывается браузером или server action ученика.
- [ ] После приёмки опубликовать только перечисленные IDs через существующие проверенные admin операции. Сохранить release manifest; откат снимает публикацию только новой партии, не удаляет пользовательскую историю. В повторной инвентаризации все выбранные KK-темы имеют согласованный объём опубликованных вопросов и объяснений.
- [ ] Typecheck/lint/unit/DB/build/browser; commit `feat(content): release reviewed Kazakh pilot content` для кода/агрегатов, внешнюю публикацию отметить отдельно. C00c не означает готовый школьный запуск: после L01 C01 закрепляет версии, программу и reviews, G0–G7 остаются обязательными. Следующий code task E03/L01 по готовности; C01 обязательно читает артефакты C00c.

## C01 — Отбор, версии и программа пилота

**Files:** create `supabase/migrations/0027_pilot_programs.sql`, `lib/content/pilot-catalog.ts`, `scripts/pilot/{validate-program,publish-program}.ts`, `scripts/lib/pilot-program.test.ts`, `docs/pilot/CONTENT_REVIEW.md`, `tests/fixtures/pilot-program.ts`; modify `scripts/lib/content-audit.ts`, `types/db.ts`, `package.json`.
**Consumes:** L01 question_versions/publications; C00c принятые пары/source hashes/review references; D03 subjects/topics/language. Переносить существующий перевод и подтверждения проверки; не переводить повторно автоматически. Если исходник/перевод изменён, прежняя приёмка становится stale.
**Produces:** pilot_programs/items из spec; `getApprovedProgram(id: string, locale: Locale): Promise<ApprovedProgram | null>`; `validateProgram(program): ProgramIssue[]`.

ApprovedProgram = `{id:string; version:number; locale:Locale; items:{position:number; purpose:'practice'|'baseline'|'endline'; questionVersionId:string}[]}`. ProgramIssue = `{code:'missing-locale'|'missing-review'|'missing-source-rights'|'invalid-body'|'invalid-explanation'|'missing-media'|'invalid-pair'; versionId:string; detail:string}`. Один program содержит пары версий RU/KK; выдача фильтрует язык без fallback, сохраняя эквивалентный family и purpose. Позиция уникальна **в пределах locale+purpose**, schema/items хранит locale/purpose явно, FK version проверяет их соответствие.

- [ ] Составить synthetic программу: по одной single/multi/matching, контекст с таблицей и рисунком, RU/KK пары. Написать тесты rejected missing table/image/answer/explanation/translation, mismatched difficulty/answer между языками, устаревший review после новой revision.
- [ ] Миграция 0027 создаёт schema программы, immutable approved items; редактирование approved = новая version/program ID. SQL запрещает approved, если нужная publication не approved. Проверки source_rights_ref и review_ref не заменяют проверку прав на оригинальные материалы.
- [ ] `validate-program` по умолчанию read-only, печатает только counts/issue IDs; `publish-program` имеет dry-run по умолчанию, пишет через проверенную operator функцию с audit и operation ID только после review. Synthetic fixture можно в Git, реальные исходники НЦТ/фото/ограниченные вопросы не добавлять.
- [ ] Методист выбирает небольшой связный набор тем после D03, проверяет все условия, варианты, баллы, объяснения, таблицы и изображения. KK принимается знающим язык человеком; русский fallback в школьном уроке запрещён. Для каждого family — math review, language review, media/source check, дата, версия, reviewer reference в закрытом реестре. Не ставить human review от имени модели.
- [ ] Baseline/endline: сопоставимые по темам/типам/сложности разные варианты; не использовать exact practice questions, по которым только что показывался ответ. Учитель принимает сопоставимость; report показывает versions, без обещания валидированного стандартизированного теста.
- [ ] Добавить commands `pilot:validate-program`, `pilot:publish-program`, тесты SQL publication race/quarantine. Typecheck/lint/unit/DB/build. Commit C01 кода; реальная программа не ready до человеческой приёмки.

```ts
it('blocks a Kazakh lesson instead of silently using Russian', () => {
  const issues = validateProgram(programFixture({ missingLocale: 'kk' }));
  expect(issues.some(x => x.code === 'missing-locale')).toBe(true);
});
```

## C02 — Рендер, жалоба и карантин

**Files:** modify `components/content/{ContentBlocks,QuestionStem}.tsx`, `components/math/MathText.tsx`, `app/[locale]/(app)/admin/review/{page,ReviewCard}.tsx`, `lib/supabase/admin-actions.ts`, `messages/{ru,kk}.json`; create `components/content/ReportQuestionButton.tsx`, `lib/content/report.ts`, `supabase/migrations/0028_content_reports.sql`, `tests/e2e/content.spec.ts`, `tests/db/content-publication.test.ts`.
**Consumes:** C01 programs и L01 publications.
**Produces:** readable mobile content + `reportQuestion({operationId,sessionItemId,reason})` c reason `statement|answer|explanation|translation|media`; reason enum вместо свободного текста в MVP.

- [ ] Создать content_reports(id,user_id,session_item_id,reason,status new/confirmed/rejected,resolved_version_id,created_at) с RLS, server-write, rate limit и unique operation. Report допускается только на выданный item текущего пользователя; teacher отдельный scoped путь. Не принимать внешний URL изображения или полный question body от клиента.
- [ ] Browser fixtures для text/KaTeX/table/image/context во всех типах, обе темы RU/KK и 360/768/1280px. Таблица скроллится внутри карточки, не ломает viewport; рисунок имеет текстовую альтернативу/размеры, ошибка загрузки явно сообщает о недоступном материале. Не «исправлять» отсутствующий рисунок случайной AI-картинкой.
- [ ] Карантин отменяет новые выдачи, но immutable snapshot завершённого результата остаётся. Для активной сессии с подтверждённо ошибочным вопросом: блокировать новый submit с content-unavailable, предложить учителю новое назначение; старый факт не пересчитывать молча. Если score invalidated позднее — новый correction event/report revision, исходник сохраняется по policy.
- [ ] Admin review требует existing content-admin, SQL publication function не даёт назначить school role. Связать исправление → новая question_version → повторный math/KK review → новая program version. Разрешить видеть очередь с pagination≤50, без всего банка в клиентском JSON.
- [ ] Test XSS: `<script>`, dangerous href/image protocol, HTML в таблице, KaTeX trust disabled; никаких `dangerouslySetInnerHTML` для пользовательских строк. Если текущий renderer использует HTML KaTeX, источник только KaTeX с безопасными options и проверенным input.
- [ ] Commit C02 после typecheck/lint/unit/DB/build/browser. Приёмка C01/C02 включает человеческий список принятой программы, не только screenshots synthetic.
