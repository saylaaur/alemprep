# План исполнения после сверки кода — 14 сентября 2026

**Уточнение 20.09:** [актуальный статус и контентный маршрут](2026-09-20-kazakh-pilot-rebaseline.md) имеют приоритет над статусами/сроками этой сверки. Следующая техническая задача — остаток L02a-R от сохранённого `3f4c5a2`, не повтор L02a с нуля; L02b ещё не принят. Номера: 0027 L02a-R, 0028 L02b, 0029 L04; последующие номера перед реализацией сверить с миграциями candidate. Native-KK K00–K03 не отменяет L/S/R/U/O gates.

> Роли: Astra фиксирует контракты и принимает рискованные изменения; Terra High реализует одну карточку за проход. При реализации применять `superpowers:executing-plans`. Этот документ уточняет очередность и разбивает L02/L03; остальные контракты остаются в планах 01–09. При противоречии статусов/номеров миграций приоритет у этого документа. Это план, не отчёт об исполнении перечисленных ниже карточек.

**Цель:** сопровождаемый пилот в двух сельских школах с полноценным KK/RU, достоверными результатами, ограниченным доступом и проверенным восстановлением. Затем самостоятельная работа учителя и расширение. Стратегия и портфолио — в `ROADMAP.md`; интерфейс и стек заново не проектируем.

## 1. Что действительно есть

Сверка локального `main` на `52d5181`. Hosted schema и public alias в этом проходе не проверялись. Слова «merged», «проверено локально», «применено в production» и «принято для пилота» означают разные состояния.

| Блок | Есть в коде / историческое evidence | Что ещё не закрыто |
| --- | --- | --- |
| MVP | OAuth, RU/KK интерфейс, практика, пробники, диагностика, weekly, прогресс, admin review | Полная приёмка реальных школьных сценариев |
| E01/E03 | Часть release/security evidence в журнале | Точный alias→SHA, hosted schema, отдельный synthetic staging, полный smoke; E03 не принят |
| C00a | Аудит покрытия, исправления счётчиков и ошибок загрузки | Наличие казахской оболочки не означает наличие KK заданий |
| C00b | Google offline pipeline, сегменты, budget/checkpoint guards, dry-run и тесты | Реальный платный перевод и вычитка не выполнены; деньги ожидаются |
| C00c/C01/C02 | Существующие импорт/admin-инструменты и подробные планы | Принятые RU/KK пары, immutable публикации для уроков, программа, новый карантин/жалобы |
| E02 | `e565c5f`: Docker/Supabase harness, реальные JWT/RLS, четыре browser auth-сценария; CI принят | Эти тесты не доказывают целостность новых learning RPC и изоляцию школ |
| L01 | `de12ef9`: 0024, immutable версии, public/grading/review DTO, validation/server boundary | Применение 0024 в hosted БД пользователем не подтверждено |
| L02 | `63d8ab7`, merge `52d5181`: 0025 start/commit RPC, часть submit-сервиса и тестов | **Частично реализован, не принят.** Ошибки ниже; нет production wiring start/submit/review, стрика/достижений |
| L03/L04 | Старые режимы ещё используют legacy actions | Новый сервис не подключён; прямые writes и доступ к answer-bearing данным ещё не закрыты |
| S/R/U/O/V/P | Планы, существующие UI/квоты и макет визуализации | Нет принятого кабинета/изоляции школ, школьных отчётов, полного retry/cache gate, нагрузочного/restore evidence, Desmos API и допуска |

Инвентаризация **от 09.09**, не новая проверка: 4 646 опубликованных RU, 0 KK, 59 черновиков суммарно. Перед покупкой/импортом обновить смету по выбранному набору. Исторические зелёные CI не заменяют тесты нового candidate; в этом плановом проходе тесты приложения не запускались.

### Найденные пробелы L02

1. `commit_learning_v1`: `FULL OUTER JOIN public.session_items` ограничивает session только в `ON`. Items любых других sessions становятся unmatched rows и отклоняют нормальную сдачу. Нужен scoped RHS до JOIN и regression на двух сессиях. Это вывод из SQL, не выполненный в этом проходе эксперимент.
2. Проверяется наличие `manifest_hash`, но при submit он не пересчитывается. JSON-проверки через `<>` пропускают SQL NULL; отсутствуют некоторые проверки mode/полей/числовых границ. Время приёма вычисляется до ожидания блокировок.
3. Start не пишет `learning.started`; публикации требуют согласованной проверки/блокировки относительно карантина. В submit не завершены награды, стрик и достижения по контракту.
4. `service.ts` содержит только dependency-injected `submit`; нет реального loader/factory, start и разрешённого review. `repository.ts` — только commit adapter; SQL errors превращаются в `temporarily-unavailable`, даже когда повтор не поможет.
5. Старые actions/initial props используют исходные body/explanation. Наличие безопасного DTO в отдельном модуле не защищает эти маршруты.
6. Atomic DB tests не покрывают несколько выданных sessions одновременно; rollback trigger слишком широкий. Migration-reset suite и обычные DB/browser suites нельзя запускать параллельно на одном stack.

**Следствие:** не начинать L03 поверх непринятого L02. Если 0024/0025 уже применены, не откатывать их руками; исправления будут новыми миграциями. Если ещё не применены, для текущей разработки hosted применение не требуется. Состояние hosted ledger уточнить перед выпуском.

## 2. Порядок, зависимости и границы

Один исполнитель идёт так:

`L02a → L02b → L02c → L02d → Astra L02 gate → L03a → L03b → L03c → L03d → L04 → C01/C02 → S01/S02/S03/S04 → O01 → R01/R02/R03 → U01/U02/U03 → O02/O03/O04 → P01/P02/P03`.

- **Следующая ready карточка — L02a.** Следующий проход не начинает весь этот список.
- E01/E03 и контентная дорожка выполняются при доступности окружения/оператора. До E03 вся разработка и DB-тесты только на локальных synthetic данных. E03 нужен до стендовой приёмки, не до написания сервиса.
- Отсутствие оплаты/перевода **не блокирует код** L/S/R/U/O и synthetic реализацию C01/C02. Реальная публикация C01, school assignment и допуск требуют C00c и утверждённой программы. В журнале различать `implemented on synthetic` и `content/operator acceptance pending`.
- Дорожка контента: обновлённая смета → согласованный небольшой платный sample → проверка человеком → разрешённый объём → импорт draft → принятые версии/программа. Не переводить весь банк по умолчанию. Инструкция: `docs/production/GOOGLE_TRANSLATION_RUNBOOK.md`.
- U01-базовые operation ID/state invariants обязательны уже в L03; полный stress/reload/retry пакет проверяется в U01. Не писать два независимых механизма pending.
- V01/V02 — после U01/O01 и D07, по плану 08. Согласованный макет сохраняем. Desmos не задерживает обычную практику, если не нужен в принятом уроке.
- Не сокращать требования к серверу ради даты. До SP0–SP7 разрешена репетиция со взрослыми на synthetic данных. Учительский UI можно временно заменить операторской сводкой только по `docs/pilot/SUPERVISED_PILOT.md`; scopes/аудит/restore этим не заменяются.

### Порядок выпуска, отдельный от порядка коммитов

Main может автоматически деплоиться через Vercel. До merge кода, требующего новой схемы, Terra указывает совместимость с deployed schema. Для L03-кандидатов добавить серверный `LEARNING_V1_ENABLED`: отсутствует/false — прежний совместимый путь, true — только новый путь, **никакого fallback при ошибке нового сервиса**. На synthetic стенде true; это временный механизм выкладки, не школьный access control.

Не объявлять режим false безопасным для пилота. До L04 оставить v1 выключенным на публичном окружении: старые прямые writes могут нарушать его инварианты. Перед cutover — rehearsal полного candidate, блокировка старых записей на уровне БД, 0028 revoke, совместимый SHA с v1, smoke. После cutover false означает maintenance/отказ, а не возврат legacy writes. Переключатель глобальной аварийной остановки и школьные режимы оформляет O01. Ранние docs/expand commits можно интегрировать по действующему разрешению пользователя; не мержить несовместимый промежуточный L03-код с расчётом «потом применим SQL».

## 3. Карточки Terra High: исправление L02

Каждая карточка: сначала воспроизводимый отрицательный тест → реализация → соответствующие проверки → один commit → evidence в `EXECUTION_LOG.md`. Не менять 0024/0025 и не выдавать себе независимое Astra review.

### L02a — Транзакции корректны при нескольких сессиях

**Depends:** E02/L01, текущий L02 partial. **Files:** NEW `supabase/migrations/0026_learning_rpc_correctness.sql`; MODIFY `tests/db/learning-atomic.test.ts`, `tests/db/helpers.ts` при необходимости, `vitest.db.config.ts`, `types/db.ts` только при изменении сигнатур; NEW `tests/db/learning-rpc-validation.test.ts`. Не подключать UI/service factory.

**Контракт:** прежние имена/signatures `start_learning_v1` / `commit_learning_v1` и Receipt сохраняются. Внутренние helpers закрыты для PUBLIC/anon/authenticated. Manifest v1 — существующий `sha256:` от упорядоченных `versionId:contentHash`, соединённых запятыми; start проверяет, submit пересчитывает из ordered session_items. Mode/expiry/locale/scoring/принадлежность topic/subject проверять отдельно; hash не заменяет эти проверки. Start plan дополнить обязательной locale; это внутренний service-only input, test fixtures обновить.

- [ ] Первый regression: выдать practice A1 и A2 одному actor до сдачи; A1 принимается. Выдать B1 другому actor; A2 принимается. Две сессии пары не ломают друг друга. Подставленный item из A2 в A1 отклоняется. Весь fixture живёт одновременно.
- [ ] Scoped CTE `issued AS (... WHERE session_id = target)` до FULL JOIN; проверить точное множество, позиции, version IDs, score bounds и неизменный denominator. Проверять сохранённый manifest, total_questions, поддерживаемые mode/scoring; legacy NULL отвергать.
- [ ] SQL NULL, JSON null, missing поля, extra поля, неверный UUID, большие числа, дроби, пустые/повторные items дают стабильную доменную ошибку и ноль writes. Использовать null-safe проверки до casts; не перехватывать все DB failures как invalid-input. Лимиты ≤80 items/≤2 sessions, длительности из spec §6. Проверить допустимый набор sessions: practice ровно одна с одним item; mock pair ровно две; diagnostic/weekly одна; смешанные режимы отклонить.
- [ ] Время для новой сдачи/Almaty day получить одним `clock_timestamp()` после необходимых locks и replay lookup. Дождавшаяся lock после expiry новая сдача отклоняется. Старый принятый receipt при повторе после expiry остаётся прежним. В RPC не принимать клиентский clock.
- [ ] Start блокирует/checks approval rows в детерминированном порядке; новые start и submit видят карантин до принятия. Повтор уже принятой операции возвращает receipt, не делает переоценку. Будущий C02 quarantine writer обязан соблюдать тот же порядок. Start receipt + issued rows + `learning.started` атомарны: один event на созданную session, replay не добавляет event.
- [ ] Rollback failure injection только для конкретной marker operation; снять trigger/function в finally. Обычные DB files сериализовать (`fileParallelism: false`), параллельные submit внутри concurrency test сохранить. Никогда не запускать reset/migration suite вместе с DB/E2E на одном stack.
- [ ] Дополнительные реальные тесты: 20 identical calls → один результат/event/reward; same op changed payload → conflict; different ops same session → один submit; anon **и** authenticated не вызывают обе RPC; после любого отказа сверить actual DB rows, а не только HTTP.

**Проверки:** `npm run typecheck`, `npm run lint`, `npm run test:db`, затем отдельно `npm run test:db:migration`; после migration suite восстановить полный latest local schema перед другими suites. Зафиксировать команды reset/start и дождаться завершения, не считать выдачу session_id завершённой командой. Gate Astra: SQL diff + multi-session/NULL/replay/rollback/role evidence; только потом L02b.

### L02b — Награды и стрик из принятой операции

**Depends:** принятое L02a. **Files:** NEW `supabase/migrations/0027_learning_rewards.sql`, `tests/db/learning-rewards.test.ts`; MODIFY `lib/streak.ts`, `lib/streak.test.ts`, `lib/gamification.ts` и его tests, `types/db.ts`. Создавать только отсутствующие test-файлы. SQL helper predicates должны иметь tests parity с существующими achievement thresholds, без копирования непроверенных browser counters.

**Уточнение policy v1:** practice/mock_exam/weekly: 10 XP за первую полностью правильную family за день, максимум 200 от ответов; exam bonus 50 за завершённый блок, максимум два/день. Сохранить weekly bonus 30, но только один раз за ISO-неделю Asia/Almaty; уникальность weekly reward — по user+week независимо от дня выдачи (нужен отдельный partial unique index на weekly reward_key). Diagnostic — 0 XP и не продлевает streak. Зафиксировать это уточнение spec §7 и UI-копирайта при L03; не менять прежние баллы задним числом.

- [ ] Награды и profile `xp = xp + фактически вставленная сумма`, streak/freezes/longest_streak, новые achievements, receipt и audit входят в одну транзакцию. Задержанная revalidation UI не отменяет receipt.
- [ ] Сохранить freeze-семантику `advanceStreak`: один пропущенный день при наличии freeze, награда за каждые семь дней, max 3. День только Asia/Almaty; параллельные sessions не продлевают дважды и не тратят freeze дважды. Старый отображаемый XP/streak не обнулять.
- [ ] Новые достижения считают integrity=1 факты, а не прежние attempts/profile totals. Порог streak для нового badge подтверждать доверенными активными днями; legacy display streak сам по себе не даёт badge. Использовать ограниченные SQL aggregates/EXISTS по порогам, не загружать историю целиком. Не создавать асинхронную очередь только ради этих badge predicates.
- [ ] DB tests: family RU/KK одна награда; concurrent cap из нескольких sessions; weekly в два разных дня той же недели; новая неделя; diagnostic без наград; retry на следующий день; timezone boundary; rollback отменяет reward/streak/badge; legacy-only history не открывает новый badge.

**Проверки:** typecheck/lint, `npm test`, DB suite, отдельный migration suite (последовательно). Astra принимает численные invariants и policy tests. Не закрывать карточку «XP работает», если streak/achievements пропущены.

### L02c — Реальная выдача и чтение состояния на сервере

**Depends:** L02a/b. **Files:** MODIFY `lib/learning/{contracts,validation,service,repository}.ts` и tests, `lib/server/actor.ts` только при необходимости; NEW `lib/content/learning-catalog.ts`, его unit tests, `tests/db/learning-service.test.ts`. Использовать `lib/supabase/admin.ts`, `lib/content/{versions,public-question}.ts`, существующие blueprint из `lib/exam.ts`, `lib/weekly.ts` и diagnostic-actions.

**Контракт:** `startLearning(raw: unknown): Promise<Result<StartedLearning>>` сам вызывает getActor. `StartInput` остаётся строгим. assignmentId пока отклоняется как forbidden до S02; никаких произвольных question IDs/actor IDs/grade plans извне. Repository ищет только approved immutable версии нужной locale/topic/subject, bounded выборкой под существующий blueprint. При нехватке возвращает content-unavailable; не переводит в запросе и не выдаёт draft/сокращённый exam.

- [ ] Start hash — canonical validated **request**, kind/mode/locale/topic/second/assignment; не случайная выборка. Same actor/op retry сначала восстанавливает исходную выдачу по receipt, не пересэмплирует items. Изменение request под тем же op → conflict. Обе exam sessions появляются одной RPC.
- [ ] Настроить production server factory/repository: actor Auth, закрытый admin client, конкретные row decoders. Публичные DTO строить explicit allowlist. Type casts не заменяют проверку DB JSON.
- [ ] Добавить `getLearningState(sessionId): Promise<Result<LearningState>>`: union `{status:'active',session:StartedSession}` / `{status:'submitted',receipt:Receipt}` / `{status:'expired'|'cancelled',sessionId:string}`. Проверять UUID/auth/owner; чужой ID → not-found. Для пары читать две известные owner sessions; state не отдаёт grading/explanation. Это общий API восстановления для L03/U01, а не новый start.
- [ ] Unit+DB: RU/KK выбора, пустой approved catalog, два simultaneous start same op, both-or-neither pair, replay при смене публикации, logout/чужой ID, state после reload. Никакие production questions автоматически не становятся approved: только synthetic seeds на этом этапе.

**Проверки:** typecheck/lint/unit/DB/build. Результат — вызываемый серверный start/state без изменения страниц. RPC/API errors наружу только enum + requestId, без SQL/ключей/ответов в логах.

### L02d — Реальный submit, разрешённый review и приёмка сервиса

**Depends:** L02c. **Files:** MODIFY `lib/learning/{service,repository,contracts,validation,grading}.ts` и tests; extend `tests/db/learning-service.test.ts`, `tests/fixtures/learning.ts`.

- [ ] `submitLearning(raw: unknown)` использует реальный getActor и issued immutable loader, нормализует пропуск в null/0, оценивает каждый item сервером и вызывает закрытый commit adapter. Не принимать client correctness/points/time as clock. Проверить single/multi/matching, включая неполное matching, неверные ID и прототипные ключи.
- [ ] `getLearningReview(sessionId)` доступен owner submitted session; active/expired без submit не раскрывает ответы. До S02 assignment-bound review закрыт. При S02 правило baseline/endline до closes_at включается **до** выдачи таких sessions.
- [ ] Replay ищет прежний outcome до active/expiry rejection при действующем actor. Strict Receipt decoder: UUID, timestamp, finite bounded integers, score≤maxScore, correctCount≤totalQuestions, integrity/scoring literals. SQLSTATE + точное доменное сообщение/JSON code маппить в enum; lock/connection errors retryable, expired/invalid/forbidden нет. Не regex по произвольному SQL тексту и не raw error.message в браузер.
- [ ] Сквозной DB test реального service: start→submit→state→review; dropped-response retry; changed payload conflict; другой user; содержание DTO до/после review. Mocks не заменяют этот тест.

**Проверки:** typecheck/lint/unit/DB/build. **Astra L02 gate:** весь контракт L02 из плана 02, включая новые L02a–d, против точного SHA. PASS локальных тестов без полного интерфейса и ownership-path review недостаточен. Только после принятия L02 разрешён L03.

## 4. Карточки Terra High: подключение приложения

Общие файлы для L03: `lib/supabase/{practice-actions,diagnostic-actions,weekly-actions,assistant-actions}.ts`, `lib/supabase/queries.ts`, `components/practice/*`, соответствующие `app/[locale]/(app)` routes, `messages/{ru,kk}.json`. В каждой карточке изменять только свой путь и общий код, без которого он не работает. После каждой: typecheck/lint, targeted unit/DB tests, build и соответствующий browser test на synthetic. Перенесённый путь обязан работать с v1=true; обычный compatibility smoke проверяет false до L04.

### L03a — Одна практика от выдачи до подтверждения

**Depends:** Astra L02 gate. **Files:** `practice-actions.ts` (practice exports), topic page, `PracticeView.tsx`, `QuestionAnswerInput.tsx`, NEW `lib/learning/{pending.ts,pending.test.ts}`, `components/practice/SaveStatus.tsx`, `tests/e2e/trusted-practice.spec.ts`, config/tests для `LEARNING_V1_ENABLED`.

- [ ] Один item/session, itemId вместо questionId в submit. Initial props/RSC/network/storage не содержат correct/explanation/private marker. UI не вычисляет authoritative result.
- [ ] Pending envelope фиксирует owner/session/operationId/неизменное тело до отправки; states idle/pending/confirmed/failed. Timeout оставляет pending, retry посылает тот же envelope; другой ответ ждёт исхода. Перезагрузка сверяет owner и getLearningState. Одна новая операция только для нового намерения пользователя.
- [ ] Review только после Receipt; `+XP` из receipt. Revalidation exception после commit не показывает «ответ не сохранён». Legacy draft предлагает restart, не повышается до integrity=1.
- [ ] Browser: start, неверный/верный ответ, explanation после commit, double click, dropped response+retry, reload, expired и KK content-unavailable. Эти тесты фиксируют минимальный U01 contract уже сейчас.

### L03b — Парный пробник

**Depends:** L03a. **Files:** exam exports `practice-actions.ts`, `MockExamView.tsx`, full-practice routes, `lib/exam-storage.ts`/tests, NEW `tests/e2e/trusted-exam.spec.ts`.

- [ ] Два блока выдаются атомарно с общей server expiry. Предсказуемый blueprint/denominator, пропуски=0; client timer только отображает остаток. Изменение системных часов не продлевает сдачу.
- [ ] Обе sessions сохраняют собственные стабильные submit operation IDs; U01 pending модуль общий. Reload, сдача второго блока после первого, race автосдачи с кнопкой не дублируют результаты.
- [ ] Убрать client manifest/createExamSession bypass на v1 path; не передавать answer keys через full-practice props/storage. Browser тест пары также ловит исходный cross-session SQL bug.

### L03c — Диагностика и weekly

**Depends:** L03b. **Files:** diagnostic/weekly actions и views, связанные страницы, NEW `tests/e2e/trusted-assessments.spec.ts`.

- [ ] Сохранить существующие blueprint, использовать один сервис/pending модуль. Нет отдельного вычисления score/XP в этих actions. Применить diagnostic/weekly policy L02b; заменить устаревшие обещания бонуса синхронно RU/KK.
- [ ] Два browser пути start→submit→reload→review; zero answers, sparse answers, insufficient approved content, repeat weekly reward, diagnostic no reward. В первом пилоте эти режимы ещё могут быть выключены O01.

### L03d — Убрать альтернативные записи и недоверенные агрегаты

**Depends:** L03a–c. **Files:** все четыре action modules, `lib/supabase/queries.ts`, NEW `lib/supabase/queries/learning.ts`, `lib/streak.ts`, progress/dashboard routes, соответствующие unit/DB/E2E tests.

- [ ] Инвентаризировать все exported server actions и server-role clients; старые record/finish/create экспорты удалены либо тонко вызывают v1 без произвольного actor/score/manifest. До cutover compatibility ветка явно обозначена и недоступна при v1=true; после L04 она не fallback.
- [ ] AI-разбор проверяет trusted owner session и review policy, не любую legacy attempt. Отдельный server-only AI write; default-off config раннего O01 допустим без новой SQL. Direct ai_turns writes закроет L04.
- [ ] Школьные источники данных только integrity=1, legacy personal history маркирована. Дни/quota/streak/progress — Asia/Almaty. Пагинация/агрегаты вместо выгрузки всего банка/истории и N+1.
- [ ] Action contract/security tests проверяют вызов без UI; RSC answer secrecy по всем четырём путям. Обновить mapping action→service→RPC→grants в review packet. L03 accepted только после проверки всех путей.

### L04 — Закрытие прямого доступа и rehearsal

**Depends:** принятое L03d. **Files/contract:** задача L04 в плане 02; новая миграция **0028_learning_write_cutover.sql**. Там полный REST/RPC/grants matrix, включая собственные attempts/sessions, profile, achievements, ai_turns, чтение questions.body/explanation/contexts, views и функции.

- [ ] Тесты должны запрещать подделку **собственных** результатов, не только чужие записи. В каждом случае сверять состояние БД.
- [ ] Выполнить upgrade rehearsal с populated legacy → expand/corrections → compatible app → write pause/revoke → smoke; rollback к совместимому SHA, без возврата опасных grants. Действительно проверить остановку старого клиента прямым REST, а не только banner UI.
- [ ] Astra принимает SQL + все публичные action paths + browser + реальный REST evidence. Hosted SQL/alias/app состояние фиксируется отдельно; L04 local PASS не означает production cutover.

## 5. Дальше: готовые блоки без повторного проектирования

Следующие task IDs сохраняются из планов 03–09. Для них уже заданы Files/Consumes/Produces и checklist. Передавать Terra соответствующую секцию, а не всю историю чата. Если таблица ниже уточняет dependency, использовать её; безопасность из исходного плана не ослабляется.

| Следующий task | Конкретный результат и граница | Обязательное доказательство |
| --- | --- | --- |
| E01/E03 | Release identity и отдельный стенд с synthetic данными/ключами. Сначала local harness; staging target разрешать только после fail-closed проверки allowlist | Alias/schema/SHA record, отсутствие production credentials в preview/tests. План 01 |
| C00c | Idempotent draft import + human acceptance register; не помечать машинный перевод reviewed | Изменённый source hash инвалидирует review; формулы/options/tables сохранены. Real stage ждёт оплаты/человека, importer тестируется сейчас. План 03 |
| C01 | Утверждённые immutable версии + versioned program; начальный importer из legacy с dry-run, без автоповышения is_published→approved | RU/KK пары, одинаковая family, checksums/review refs; 100% покрытия выбранного урока. Synthetic реализация независима от оплаты |
| C02 | Жалоба + scoped quarantine + корректный рендер | Table/formula/context fixture; карантин перекрывает новые выдачи и непринятые submit, уже принятые факты остаются воспроизводимыми |
| S01 | Школы/groups/memberships/invite; оператор создаёт школу, teacher только своё | Роли/подмена school ID/token replay/expiry/revoke на реальном REST. План 04 |
| S02 | Assignment с фиксированной program version, списком допустимых участников и server limits/review close | Чужая группа, late join/revoke race, early review, изменение locale не обходят scope |
| S03 | RU/KK teacher UI: свои классы, приглашение, назначение, статус выполнения; вход ученика в группу | Учитель без global admin проходит сценарий. Отчётные метрики подключаются R02, не выдумываются UI |
| S04 | Целевая проверка двух школ | User/teacher A не видит B через URL/API/export, revoke действует при гонке; Astra gate |
| O01 | Server flags, mode/program/participant restrictions, learning stop, AI/Desmos default off, bounded rate/quota/export costs | Ошибка чтения флагов fail-closed; прямой API не обходит скрытую кнопку; rate-limit не расходует повторно accepted receipt. План 07 |
| R01 | Audit-derived, versioned report snapshot, server-only job, фиксированные cutoff/denominator | Golden fixtures: legacy/demo/retry исключены, withdrawal и no-shows учтены, повтор одного report даёт те же числа. План 05 |
| R02 | Своя teacher summary/CSV, внешние агрегаты | Scope в выгрузке, CSV injection, малые группы/suppression, цифры сверены с фактами |
| R03 | Выгрузка/отзыв/удаление/retention и reconciliation | Synthetic lifecycle + tombstones после restore; реальные сроки/основания требуют D02/D04; Astra gate |
| U01 | Полный retry/offline/reload coverage поверх pending из L03a | Ответ принят, HTTP потерян; смена страницы/повтор/перезапуск дают один receipt. План 06 |
| U02 | Общий компьютер и приватный кэш | Logout A/login B, Back, несколько вкладок, RSC/prefetch/CDN/service worker если есть: ответы/отчёты A не доступны B. Никакого public cache персональных результатов |
| U03 | Телефон/клавиатура/KK длинные строки/реальный рендер | Browser evidence и репетиция на школьном устройстве; AI mock translation не заменяет human language acceptance |
| O02 | Safe telemetry/health/alerts + incident runbook | Request IDs, DB/commit error и latency; secrets/answers/PII не в логах; simulated alert доходит назначенному ответственному |
| O03 | Измеренная ёмкость, burst/backpressure, EXPLAIN и стоимость | На staging: для supervised цели 15/30 concurrent; для полного пилота предварительно 60/120 до D03. Проверить не только HTTP, но correctness/no duplicates и восстановление после всплеска |
| O04 | Восстановленная копия, jobs recovery, rollback | Restore в другой synthetic stack, schema+counts+RLS+receipt+deletion tombstones; измеренные RPO/RTO, Astra gate |
| V01/V02 | Desmos в согласованном дизайне, lifecycle/offline fallback, explicit flag | При заблокированном SDK практика сохраняется; D07/license/key и real network acceptance до включения. План 08 |
| P01 | Exact candidate dry run + RU/KK инструкции учителю + запасной урок | Полный gates register PASS/FAIL/NOT CHECKED, ни одного открытого P0/P1. План 09 |
| P02/P03 | Контролируемый выпуск и одно сопровождаемое занятие; затем вторая школа | Реальные метрики/инциденты/отзыв учителя. Успешный питч и обещание пилота не считать использованием продукта |

Нагрузка не равна обещанию «сайт никогда не упадёт». Приёмка включает ограничения выдачи/запросов, лимиты DB connections, отказ дорогих функций, outage UI, повтор после восстановления, расходные пределы и реальный restore. Конкретную ёмкость заявлять только после O03 на выбранном hosting.

## 6. Реестр новых миграций

Ни одного нового SQL-файла этим планом не создано. 0024/0025 уже существуют; статусы hosted — **не подтверждены**. Номера прежних ещё не созданных миграций сдвинуты на два, чтобы исправлять принятый код forward-only.

| Номер | Задача / файл |
| --- | --- |
| 0024 | L01 — learning_integrity_schema (существует, не менять) |
| 0025 | L02 partial — learning_integrity_rpc (существует, не менять) |
| 0026 | L02a — learning_rpc_correctness |
| 0027 | L02b — learning_rewards |
| 0028 | L04 — learning_write_cutover |
| 0029 | C01 — pilot_programs |
| 0030 | C02 — content_reports |
| 0031 | S01 — schools_and_access |
| 0032 | S02 — school_assignments |
| 0033 | O01 — pilot_operation_limits |
| 0034 | R01 — pilot_reports |
| 0035 | R03 — privacy_lifecycle |
| 0036 | O03 — measured_query_indexes, только если измерения требуют |

Перед созданием проверить все ветки/ledger на занятый номер. Если номер уже существует, остановить только schema change и передать Astra конфликт; не переименовывать применённый SQL. C01/S/O synthetic код можно готовить без paid content, но не применять миграции вне этой последовательности/зависимостей.

## 7. Правила передачи работы Terra → Astra

Минимальный вход: task ID, base SHA, этот документ/нужная секция плана 01–09, AGENTS.md, верх TASKS.md, последний relevant log. Полную историю и все планы за проход читать не нужно. Новая задача берётся только после acceptance зависимостей, а не факта merge.

Обязательный выход:

```text
Task: L02a
Base / tested code SHA / current head:
Changed interfaces and migrations:
Acceptance checklist: each PASS / FAIL / NOT CHECKED
Commands, exit codes, environment, relevant evidence paths:
Hosted migrations: confirmed / not confirmed / not applied by this agent
Compatibility with current deployment:
Known limitations / exact failing case:
Next ready task and gate required:
```

- Сохранять session_id запущенных команд и дождаться exit code; `running` не PASS. Один Supabase stack — один reset/suite lifecycle. Не печатать environment/key dumps. Скриншоты/trace/fixtures только synthetic, без токенов в Git.
- Не заменять стандартный build локальным Webpack без пометки. Если локальная среда блокирует стандартный build, fallback evidence отдельно, стандартный CI обязателен перед release.
- Review проверяет **весь контракт**, не только добавленные тесты. После фикса изменившийся код проверяется вновь; usage limit/прерванное review не считается approval.
- Astra gates: L02a, L02b, весь L02d, L04, S04, R03, O04, P01. Terra не устраняет архитектурный вопрос произвольным ослаблением теста. После двух неудачных попыток одного воспроизводимого дефекта передать минимальный failing case.
- Один task — один тематический commit. Пользователь уже разрешил обычные commits/push/merge; повторное разрешение на каждую ветку не требуется. Это не отменяет CI/review/schema compatibility и не разрешает оплату/данные детей/рассылку/изменение hosting без конкретного согласования.

## 8. Что нужно от владельца и школ

Для L02a и дальнейшего synthetic кода — **ничего нового**, можно работать без денег на перевод.

До реального урока нужны: дата/классы/предмет/число учеников и пик входов/устройства/Google доступ; ответственный учитель в каждой школе; проверяющий казахский и предмет; согласованный translation budget и credentials только через защищённое локальное окружение; решение по участию/данным/размещению и срокам хранения; ответственный за инциденты/backup. Полный список D01–D07 — `docs/production/DECISIONS.md`.

Перед hosted rollout отдельно подтвердить, какие 0024/0025 уже применены, и сверить actual schema. Не просить применить будущие 0026/0027 до их реализации и review. До SP-ready/P01 технический статус: **подготовка и synthetic репетиции, не готовый школьный production**.

## 9. Самопроверка плана

- [x] Статусы сверены с исходниками и git; merge L02 не помечен как acceptance.
- [x] Следующий ready task один; ближайшие изменения имеют файлы, интерфейсы и regression cases.
- [x] Отсутствие paid KK не образует ложную зависимость для безопасности/школьного кода.
- [x] Зарезервированы forward-only миграции, исходные планы и архитектура синхронизируются с новыми номерами.
- [x] Описаны privacy/cache, сохранение, scope, отчёты, нагрузка, расходы, rollback/restore и release gates.
- [x] Кодирование, операторская приёмка и участие детей имеют разные критерии готовности.
- [x] В этом проходе нет реализации, платных API, новых миграций или изменения production.
