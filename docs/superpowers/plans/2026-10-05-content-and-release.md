# RU/KK content and self-study pilot release — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> task-by-task. This packet supports native execution; independent review before
> merging. Steps use checkbox syntax for tracking.

**Goal:** Выпустить ограниченный самостоятельный пилот с принятым RU/KK
контентом, доверенными результатами и наблюдением учителя.

**Architecture:** Существующие locale routes и trusted learning остаются.
Оператор импортирует точный reviewed artifact в immutable versions и publications;
перевод выполняется офлайн один раз. Paid drafting, human review, draft import
и публикация разделены. Никакого runtime Translate или отдельного KK сайта.

**Tech Stack:** Next.js 16.3.6, TypeScript strict, Supabase/Postgres RLS,
Vitest/Playwright, существующий Google NMT draft pipeline.

**Spec:** docs/pilot/translation-handoff/README.md,
docs/pilot/translation-handoff/OPERATOR_GUIDE.md,
docs/pilot/SELF_STUDY_CABINET.md.

## Global Constraints

- Применённая 0034 неизменна; recovery порядок 0035 → 0036 → 0037.
- Не менять .env.local, согласованные design tokens, старые applied миграции.
- Казахский — полноценные принятые пары; не browser translate/RU fallback.
- Format/source IDs, math, keys, matching relationships and table shape сохраняются.
- RU/KK переводы одного задания используют одно family_id, чтобы не удвоить reward.
- Не смешивать старый questions.is_published и новый approved publication.
- Новые SQL объекты только новой миграцией; следующий свободный номер проверить
  в ветке перед созданием (сейчас 0038). Сначала RLS/grants, потом код.
- Человеческий review не выдумывать; unresolved/machine-only не auto-approved.
- Платные вызовы только после cap/billing; этот план не означает разрешение
  потратить неограниченную сумму или публиковать непроверенный контент.
- Каждый таск — один коммит, typecheck/lint PASS; routes — standard build PASS.

## Review Focus

1. Источник/контекст изменён после review: импорт отклонён как stale.
2. Повтор партии/две команды одновременно: одна запись, тот же family, без overwrite.
3. Matching правильный ответ хранится text label: перевод меняет строку,
   но сохраняет исходное соответствие и не сливает разные labels.
4. Mixed-language/shared context: отдельный KK context обязателен до publication.
5. Пустой immutable bank при rollout: flag не включается, legacy success
   не принимается как trusted результат в учительском отчёте.

## Сверка состояния 05.10

- Кабинет/код класса/локальные графики реализованы в trusted-practice.
- Ошибка повторной 0035 воспроизведена и исправлена; 0037 закрывает active
  reload, ложное completion, historical replay и lock order.
- Полный локальный gate: unit 655/655, DB 131/131, migration paths 6/6,
  typecheck/lint/обычный build PASS; trusted browser 21 passed/1 intentional skip,
  legacy browser 9 passed/13 intentional skips. Исправлен fresh-start expired
  при малом clock skew без расширения строгого DB TTL. Единичный local JWT
  validation failure не воспроизведён повторно и отмечен как ограничение;
  реальный preview Auth smoke обязателен. Подробнее — quality review 05.10.
- Production read-only: RU legacy published=4646, KK=0;
  RU/KK immutable versions=0 и approved=0.
- Google sample dry-run fresh: 4993 initial / 14979 maximum chars; без API оплаты.
- Другу подготовлены 30 source records; accepted KK партия ещё не получена.
- Hosted SQL применение 0035–0037, точный production deploy и real-school
  rehearsal не подтверждены этим локальным audit.

## Обновление после продолжения 05.10

**Hosted продолжение:** новая 0038 подтверждена; importer создал RU4 drafts,
approved=0, никакой массовой публикации. Verify/Security/Vercel зелёные на `96bdf3b`;
исправлено CI сохранение screenshot в macOS-only /private/tmp. Preview login
доступен с текущей Vercel-сессией; Google Auth smoke требует разрешения владельца
на конкретный аккаунт, автоматическая проверка заблокировала действие.
Школ/классов/привязок по hosted inventory пока 0. KT4 дополнен узким атомарным
[data bootstrap](../../pilot/bootstrap-first-class.sql) и [порядком запуска](../../pilot/START_FIRST_CLASS.md).
Это SQL оператора без DDL/публичного API; текущие миграции не меняются.
Настоящая human acceptance и school/teacher параметры остаются внешними gates.

Владелец сообщил: 0035–0037 применены, ZIP передан другу. KT3 **RU часть**
реализована локально: приватный export/dry-run/import, атомарные drafts,
idempotent receipts, отдельная exact-hash приёмка и provenance. Новая 0038
ещё требует hosted применения. Общие схемы importer/trusted reader исключают
структурно нечитаемые версии. Приёмка реального RU банка пока не выполнена.

KT4 approved availability реализована: счётчики тем, предметов и наличие
blueprint используют approved семьи выбранного языка, без legacy fallback.
Browser test теперь создаёт draft через importer, принимает synthetic fixture,
выбирает тему в каталоге и проверяет ответ ученика в отчёте учителя.
Реальный школьный rehearsal/preview и deployment всё ещё отдельные gates.
KT2 и KK часть KT3 ждут переведённого/проверенного файла; KT1 после первого subset.
Точные команды: [OPERATOR_GUIDE](../../pilot/translation-handoff/OPERATOR_GUIDE.md).

**Дальше без повторного планирования:** hosted 0038 → RU drafts из фиксированного
private файла → реальные review refs → exact acceptance → inventory/counts →
CI/preview на конкретном SHA → школа/учитель/ученик rehearsal → ограниченный rollout.
Не объявлять четыре технические задачи готовым банком самостоятельной подготовки.

## Порядок работы

**Утро:** recovery SQL → KT3 для небольшой RU подборки → KT4 rehearsal.
Параллельно человек переводит/проверяет 5→30 KK записей. Для принятого KK файла
выполнить KT2 → KK часть KT3 → KT4 KK. KT1 нужен для масштабирования, а не для
начала первого RU пилота. Обязательные назначения, сложный LMS и массовую
генерацию не включать в critical path.

### KT1: воспроизводимый export и очереди массового перевода

**Files:** Create scripts/export-translation-sources.ts,
scripts/lib/translation-source-bundle.ts,
scripts/lib/translation-source-bundle.test.ts,
scripts/lib/translation-batch-ledger.ts,
scripts/lib/translation-batch-ledger.test.ts.
Modify package.json, scripts/translate-google.ts, OPERATOR_GUIDE.md.

**Interfaces (новые, должны быть реализованы этим таском):**

~~~ts
type SourceRef = { id: string; sourceHash: string };
type BatchManifest = {
  schema: 'alemprep-kk-source-sample-v1';
  questions: SourceRef[];
};
type BatchBudget = { chargedCharacters: number; reservedCharacters: number; capCharacters: number };
function splitSourceManifests(sources: SourceRef[]): BatchManifest[];
function reserveBatch(budget: BatchBudget, maximumCharacters: number): BatchBudget;
~~~

Источники читать через существующий getServiceClient/readAllPages. Реальные
условия/ключи сохранять приватно, не в Git. Selection subject/topic/type/id явная,
порядок устойчивый; snapshot source hash включает context. CLI только export,
без DB write/API calls. Full-bank driver не параллелит отдельные процессы с
одним checkpoint. Общий budget ledger считает ранее оплаченные/неопределённые
sent и новую reservation, а не только cap отдельного manifest.

- [ ] Написать тест: 61 уникальный source → партии 30/30/1, ID встречается
  один раз; пустой pool не порождает платную пустую партию.
- [ ] Написать тест: изменение одного context меняет hash всех его sources;
  sourceHash/формулы/options не изменяются от экспорта.
- [ ] Написать тест reserveBatch: cap=15000, charged=9000, reserved=0,
  request maximum=7000 → отказ до API; повтор pending/sent не обнуляет budget.
- [ ] Запустить npm test -- scripts/lib/translation-source-bundle.test.ts
  scripts/lib/translation-batch-ledger.test.ts и увидеть регрессии до реализации.
- [ ] Реализовать split максимум 30, отказ при duplicate refs и общий ledger;
  добавить supported export CLI с private artifact path guard.
- [ ] Прогнать те же тесты, полный npm test, typecheck/lint; экспорт synthetic
  61 sources. Документировать только реально добавленные CLI flags. Коммит.

### KT2: validator принятого артефакта и Google/Claude adapters

**Files:** Create scripts/lib/translation-candidate.ts,
scripts/lib/translation-candidate.test.ts,
scripts/lib/translation-review.ts,
scripts/lib/translation-review.test.ts.
Reuse scripts/lib/translation-segments.ts,
scripts/lib/kazakh-coverage.ts, scripts/lib/checks.ts.

**Interfaces (новые):**

~~~ts
type ReviewedCandidate = {
  sourceId: string;
  sourceHash: string;
  translatedHash: string;
  locale: 'kk';
  translated: { body: unknown; explanation: unknown; context: unknown };
  review: { mathRef: string; languageRef: string; sourceRef: string };
};
type CandidateCheck = { ok: true; value: ReviewedCandidate } |
  { ok: false; reason: 'stale' | 'structure' | 'math' | 'context' | 'unreviewed' };
function validateTranslationCandidate(source: unknown, candidate: unknown): CandidateCheck;
~~~

unknown здесь — граница парсинга, не способ пропустить строгий тип: Zod затем
превращает body/explanation/context в существующие типы. Candidate prompts имеют
schema alemprep-kk-candidates-v1; Google output — другой object schema.
Явные adapters приводят их к общему draft контракту, не принимают approved от модели.
Review refs требуют непустых реальных записей и exact hashes, не boolean от Claude.

- [ ] Тест: JSON extra fields/forged human approval не дают acceptance.
- [ ] Тест: перевод изменил число/latex/option ID/table shape → отказ.
- [ ] Тест matching: русский right[1] переведён и correct[leftID] равен
  новому right[1] → PASS; равен right[0] либо слиты labels → FAIL.
- [ ] Тест: stale context/source, missing KK shared context, unresolved image
  text и пустые review refs → отказ до DB.
- [ ] Тест: один sourceContextId/sourceHash в двух записях с разным переводом
  → отказ; одинаковый принятый перевод → один shared KK context.
- [ ] Запустить npm test -- scripts/lib/translation-candidate.test.ts
  scripts/lib/translation-review.test.ts; реализовать adapters/validator после RED.
- [ ] Прогнать полный unit/typecheck/lint; оформить schema и deterministic
  translatedHash в handoff. Пять файлов друга проверить в dry-run. Коммит.

### KT3: атомарный version import и exact publication — сначала RU

**Files:** Create scripts/import-reviewed-content.ts,
scripts/lib/reviewed-content-import.ts,
scripts/lib/reviewed-content-import.test.ts,
tests/db/reviewed-content-import.test.ts,
supabase/migrations/0038_reviewed_content_import.sql (если номер свободен).
Modify types/db.ts, package.json, OPERATOR_GUIDE.md.

**Новый контракт SQL/CLI:**

~~~ts
type ImportResult = {
  batchId: string;
  versions: { sourceId: string; questionId: string; versionId: string; familyId: string }[];
};
type ImportCommand = {
  batchId: string;
  batchHash: string;
  locale: 'ru' | 'kk';
  entries: ReviewedCandidate[];
};
~~~

RU path использует согласованную schema reviewed RU source, не заставляет
подделывать locale kk. Публичный CLI default dry-run читает точный файл; execution
явно отдельный flag и целевой project confirmation. Никакой новой browser action.
Service-only RPC content_import_reviewed_v1(batch_id UUID, batch_hash TEXT,
locale TEXT, entries JSONB) создаёт drafts в одной транзакции.
Отдельный service-only content_accept_version_v1(version_id UUID,
content_hash TEXT, math_review_ref TEXT, language_review_ref TEXT,
source_rights_ref TEXT) переводит точную version в approved.
Оба имени новые, не существующие команды.

Новая content_import_receipts таблица с RLS, без PUBLIC/anon/authenticated grants.
Не добавлять content kind в learning operation_receipts. Receipt batchId/hash
сохраняет результат; тот же hash → replay, другой → conflict. Audit metadata
не содержит body/ключи/student data.

RU: повторно прочитать source, проверить hash; не менять questions.body.
Определить уже существующий family или создать один stable family под блокировкой
question row. Создать version(public body без correct, grading body с ключом,
explanation, context_snapshot, deterministic content_hash) и draft publication.
Повтор не создаёт новую revision для того же exact artifact.

KK: использовать accepted RU family; создать/найти source_question_id+kk пару,
создать принятый KK context, сохранить mapping/source/translation provenance
в новой служебной таблице с RLS. Нельзя UPDATE уже созданной immutable version.
Изменённый перевод — следующая revision. Не перезаписывать чужие ручные drafts.

- [x] Unit тест: dry-run без write/RPC; unspecified file/project не запускается.
- [x] DB тест: RU import twice → одна version/family/draft; два concurrent
  вызова → один результат, different batchHash → conflict.
- [ ] DB тест: KK import → отдельный locale/context, **тот же** RU family;
  повтор/ручной existing draft не перезаписывается.
- [ ] DB тест: stale source/context и отсутствующий RU accepted family
  отклоняются атомарно, без orphan context/question/publication.
- [x] DB тест: anon/pupil не могут import/accept/read receipt; mismatched
  version contentHash или отсутствующие review refs не дают approved.
- [ ] DB/service тест: RU ответ → KK той же family → нет второго first-family
  reward; teacher report не считает повтор новой уникальной задачей.
- [ ] Реализовать migration/grants/типизацию, затем adapter/CLI. Прогнать
  npm test, npm run test:db, typecheck/lint и новый populated migration test.
- [ ] Принять независимым review. На hosted импортировать **маленький**
  reviewed RU набор как drafts; сверить mapping/hash и явно принять версии.
  После KT2 выполнить то же для accepted KK партии. Коммит.

### KT4: выпуск конкретного SHA и репетиция класса

**Files:** Modify docs/pilot/RELEASE.md,
docs/pilot/SELF_STUDY_CABINET.md; при необходимости обновить subject/topic
availability queries и страницы выбора в app/[locale]/(app)/subjects,
messages/ru.json и messages/kk.json синхронно.
tests/e2e/pilot-cabinet.spec.ts уже проверяет accepted answer → reload → teacher metrics.

- [ ] Перед rollout сверить hosted schema/grants 0035–0038, RU/KK approved
  per-topic counts, service environment presence (без значений), deployment SHA.
- [x] Локально проверены приглашение/вступление и accepted answer → reload →
  teacher report; DB проверяет wrong/правильно, replay и first-family score.
  Полная реальная последовательность вступление → практика ниже остаётся gate.
- [x] Прогнать все браузерные тесты в trusted режиме; legacy режим проверить
  отдельно как rollback compatibility, не как trusted result.
- [x] Локальный standard build зелёный после последнего clock-boundary fix.
- [ ] Required CI зелёные. Выпустить reviewed SHA, сначала
  preview smoke. Не включать LEARNING_V1_ENABLED на пустом approved каталоге.
- [x] В trusted UI счётчики/доступность тем отражают approved versions выбранной
  локали, а не тысячи legacy published. На ограниченном наборе показывать
  принятые темы; недоступные режимы полного пробника/диагностики/weekly явно
  обозначить как недоступные до заполнения blueprint, без legacy fallback.
  Объём стартового банка честно виден ученику/учителю.
- [ ] На реальных устройствах проверить RU и KK вход, слабую сеть, повтор
  ответа после обрыва, переключение аккаунтов, mobile graph/table.
- [ ] Реальные teacher/group привязки создаёт оператор; ученики не назначают
  себе роль. Desmos optional, native graph не зависит от API.
- [ ] Зафиксировать cohort limit и ответственного школы; первая группа
  небольшая и поддерживаемая, расширять после первой подтверждённой сессии.
- [ ] Записать feedback/errors/отчёт; rollback только к совместимому SHA,
  без возврата клиентских прав score/XP и без разрушительного DB отката.

## Что передать другу/акимату до фактического выпуска

«Подготовлен кабинет для наблюдения за самостоятельной практикой и графики.
Завершаем перенос принятого банка в защищённую систему результатов и первую
казахскую подборку. Начинаем ограниченным набором тем и одной группой после
репетиции на школьных устройствах, затем расширяем на обе школы».

Не говорить «весь банк переведён», «всё уже production» или «сервер держит N
учеников», пока этих доказательств нет. Local synthetic tests подтверждают
проверенные сценарии, а не production capacity.
