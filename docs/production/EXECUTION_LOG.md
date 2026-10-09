# Журнал исполнения production-плана

### 09.10 pilot readiness candidate verification

- Read-only inventory, private RU/KK teacher CSV and local20-pupil/two-school rehearsal implemented.
- Independent whole-branch review: duplicate public identifiers and missing topic-language warning fixed with five RED→GREEN regressions; reviewer confirmed no remaining blockers.
- Local1108unit,161DB,6migration pass; build/types/lint pass. Final browser matrix/release recorded in PR checks.
- No hosted data writes, no real school bootstrap, no Auth/whole-database restore claim. Exact ambiguous RU quarantine transaction is prepared and atomically tested, owner access still required.


## 09.10.2026 — автономная подготовка самостоятельного RU/KK пилота

- Владелец делегировал весь план и действия; новый operational baseline: docs/pilot/PILOT_LAUNCH.md.
- Main c5b535a после security PR37; обе публичные локали200. Hosted read-only RU90/KK89, четыре темы, schools/groups/memberships0; подсказки/перевод платными API не вызывались.
- Task1: 69f622e, pilot:check; 7 unit, typecheck/lint PASS; корректно обнаруживает approved excluded source и отсутствие bindings.
- Task2: b225061, private CSV fresh authenticated RPC; 15 unit и browser download/foreign/pupil/revoke RU+KK PASS.
- Task3: 4d7a44e, 20 synthetic pupils, два класса RU/KK, concurrent start/submit/retry/reload; exact20 attempts,10 per school PASS. Local evidence не равно hosted capacity.
- Exact data-only quarantine SQL подготовлен с приватным snapshot/SHA256; local idempotence и audit-failure rollback2/2 PASS; hosted не применён. Применённые миграции0001–0040 и исходники не менялись.
- Внешние факты: Mac locked, CLI management token absent; нет реальных школ/учителей. OAuth audience, hosted backup+restore и real pupil→teacher rehearsal пока не подтверждены.
- Task4 required full verification/review/CI/deploy выполняется; итоговые статусы фиксируются в PR и финальном отчёте, не выдаются за done заранее.


## 30.09.2026 — Astra c47385b review и актуальная очередь

- [Review](reviews/2026-09-30-c47385b.md): исходные исправления 0032 подтверждены; два узких follow-up — прямое privileged создание approved-программы и сериализация отзыва teacher→group при публикации. Они не являются произвольным student bypass.
- Fresh: 23 focused DB tests, 10 focused unit tests, typecheck и lint PASS. Локальные rollback/synthetic probes воспроизвели оба случая. Полные suites/build из предыдущего прохода не выдаются за свежую проверку.
- Hosted через SQL Editor: selected function count 15 и function/permission fingerprint, 13 pilot tables/RLS/browser-access fingerprint и non-internal trigger fingerprint совпали с local 0032. Только read-only catalog SQL; business data и схема не менялись. Полная schema/constraints/alias/release smoke ещё нужны.
- Remote main `bb903a2`, рабочий code HEAD `c47385b`; PR для `codex/trusted-practice` отсутствует. Push/merge/deploy в этом проходе не выполнялись.
- [Новый handoff](../superpowers/plans/2026-09-30-pilot-next-steps.md): A3-R2 (0033) → binding (0034) → student entry → A4 bypass closure → A5 summary → A6 admission. Синхронизированы верхние указатели и промпт исполнителя; прошлые записи сохраняются как история.

## 23.09.2026 — L02c-R candidate: authoritative issuance, expiry and bounded catalogs

- Исправлены R1–R4 из [L02c review](reviews/2026-09-23-l02c.md). После любого успешного `start_learning_v1` public DTO читается из owner-scoped immutable session rows, поэтому concurrent receipt replay не может подставить stale question body под чужой item ID. Practice выбирает детерминированно по validated actor+operation, а retry всегда получает исходный receipt. Активный row с `expires_at <= trusted now` отдаётся state API как expired. Assessment catalog читает каждый нужный question type отдельной bounded query, поэтому первые 160 single больше не вытесняют multi/matching.
- Четыре synthetic DB regression scenarios теперь включены в обычный `test:db`: same-clock catalog race, effective expiry, independent practice starts и complete catalog over 160 rows. Ранее отдельная review probe переименована в `L02c server regressions`; immutable synthetic rows остаются до local reset по тому же правилу, что и прежние DB fixtures.
- Fresh local evidence: `npm test` — 59 files / 605 PASS; `npm run test:db` — 10 files / 74 PASS, 61.78s; `npm run typecheck` and `npm run lint` exit 0; `npx next build --webpack` exit 0, 25 routes. DB suite работала только против synthetic local Docker Supabase, без hosted/staging/production. SQL migrations, Vercel, GitHub, paid APIs, push и merge не менялись.
- Next: повторный Astra review exact candidate SHA. L02d, L03 и pilot release остаются закрыты до ACCEPT; standard Turbopack/CI build остаётся отдельным внешним gate.

## 23.09.2026 — Astra L02c review: CHANGES REQUIRED

- Проверен code SHA `f0492b66abf1fdc6adc8e5e2509d3c5a70db89ac` относительно `9035732`: [отчёт и карточка исправлений](reviews/2026-09-23-l02c.md). R1 P1: same-operation/equal-clock replay может вернуть другой question body под сохранённым item ID. R3 P1: все новые practice operations выбирают первый UUID. R2 P2: deadline не меняет возвращаемое active state. R4 P2: limit 160 отрезает необходимые blueprint types.
- Все четыре дефекта воспроизведены real local DB probes с expected-behavior assertions; final run — 4 failures, exit 1, как и ожидается до исправления. Probes и отдельный Vitest config находятся в `tests/review/`; штатные suites их не включают. SQL/runtime-код в этом review не изменялся.
- Fresh verification: typecheck/lint exit 0; unit 59 files / 604 PASS; полный DB suite 9 files / 70 PASS (58.35s); отдельный полный migration suite 1 file / 5 PASS (164.46s) с возвратом на current 0028; webpack production build exit 0. DB, probes и migration выполнялись последовательно, процессы завершены с получением exit code. Standard Turbopack/CI этим review не подтверждены.
- Исправлено объяснение предыдущего прохода: доказательств лимита времени среды не было. Ранее выводился только `exec_command.output`, терялся возвращённый `session_id`; нужно дожидаться shell через `write_stdin`, не запускать следующий reset поверх незавершённого. В этом review оба полных suite завершились штатно.
- Next ready: **L02c-R R1–R4**, затем L02d и общий L02 acceptance. Review сам не создавал commits/push/merge; hosted БД, платные API и deployment не менялись. Исходный пользовательский workspace не изменён; evidence лежит в текущем worktree.

## 21.09.2026 — Astra L02b working-tree review: CHANGES REQUIRED

- Объект: 4f771c0 плюс uncommitted SQL/test corrections; SHA-256 в [review packet](reviews/2026-09-21-l02b.md).
- Воспроизведены browser DELETE accepted v1 attempt (HTTP 200) и повторная profile mutation при concurrent replay (3 UPDATE вместо 2). Review probes сохранены для L02b-R.
- Typecheck/lint exit 0; existing DB suite 55 PASS/1 timeout, exit 1. Полный migration-path результат — в review packet. Production SQL в review не менялась; hosted/push/merge отсутствуют.
- Next: L02b-R по R1–R4. L02c не открыт.

## 21.09.2026 — L02a-R CI PASS и merge, следующий L02b

- [PR #28](https://github.com/saylaaur/alemprep/pull/28), exact head `eec0650155c2918c44a317120bce39b815ad1471`: required `verify`, `gitleaks`, `Vercel` SUCCESS. [Verify run](https://github.com/saylaaur/alemprep/actions/runs/35573506855) завершился за 5m49s: typecheck/lint/unit, standard Turbopack build, local DB, isolated migration-path и 4 Playwright Chromium сценария PASS. Локальный запрет порта не воспроизвёлся в CI.
- GitHub подтвердил merge 21.09 07:40:08 UTC: `008ea49807a1c8bffac386e961445f744587fd4f`. Main сохранён под защитой required checks; merge выполнен с `--match-head-commit`, без admin bypass. Основная папка `/Users/macbook/Desktop/alemprep` обновлена fast-forward, пользовательские untracked материалы сохранены.
- Application source, dependencies и workflows совпадают с прежним main `52d5181`; runtime cutover не выполнялся, hosted SQL не запускалась. Автоматический Vercel production rollout и alias→SHA этим проходом отдельно не подтверждались. Hosted 0027 остаётся unconfirmed.
- **Next ready: L02b (0028 rewards/streak/achievements)** от принятого кода `008ea49` и этой документальной записи; отдельный Astra gate обязателен. K00–K03 остаются контентным направлением, весь L02/школьный допуск не закрыты. Старые pending-формулировки ниже и в review packet — история до этого merge.

## 21.09.2026 — независимое принятие L02a-R и интеграция планов

- Независимый read-only reviewer завершил [review](reviews/2026-09-21-l02ar.md) точного `e475f67aa4c117fc0e3515b3a3da1d7ede98c3e8`: ACCEPT в пределах завершения L02a-R evidence, без P0/P1/P2. Матрица review 15.09 закрыта. Reviewer прочитал код и фактические логи; новый DB reset не запускал. Прерванный ранее из-за лимита review не использовался как одобрение.
- Стандартный `npm run build` повторён вне ограниченной сети: шрифты больше не являются текущим failure, но Turbopack падает на создании внутреннего процесса/порта (`Operation not permitted`). `npm run build -- --webpack` с фиктивными CI-переменными завершился exit 0, 25 static pages. Это дополнительная локальная проверка, не замена обязательного standard CI build.
- Локально объединён согласованный контентный план `fcdede3` с технической веткой. Конфликты только Markdown: сохранены review/history, native-KK путь K00–K03, актуальные номера 0027/0028/0029; следующий технический ID — L02b после required CI и интеграции. Runtime/SQL/test payload совпадает с reviewed `e475f67`.
- Read-only GitHub подтвердил текущий origin `https://github.com/saylaaur/alemprep.git`, signed-in owner `saylaaur`, permission ADMIN и remote main `52d5181`. Это новые проверенные данные о назначении отправки; source-код/тесты/документация относятся к этому проекту. CI/push/merge фиксируются отдельно после фактического результата. Hosted migration и платные API не выполнялись.

## 16.09.2026 — L02a-R test-evidence candidate, pending Astra review

- От базы `78c960586a2cbae882561fd472faa40949d3a73a` исправлена P2 matrix: fractional, negative и `timeSpentMs=7200001` теперь передаются как настоящий `graded_items` array; допустимая граница `7200000` принята. Добавлены service-only integration scenarios: changed submit payload conflict, receipt replay после quarantine без новых audit facts, сдача двух mock blocks, A1/A2/B1 с запретом подмены item.
- Добавлен test-only connection helper и `learning-rpc-locking.test.ts`: controlled PostgreSQL barriers подтверждают quarantine-first для start и submit, start-first затем quarantine, а также expiry во время ожидания `profiles FOR UPDATE`. Все барьеры наблюдают `pg_stat_activity.wait_event_type = 'Lock'`, имеют timeout и `finally` cleanup; это не sleep-based assertion.
- Upgrade `0026 → 0027` теперь сдаёт active session, выданную до upgrade, сверяет item/denominator/manifest и start receipt replay; grants обеих RPC проверены для anon/authenticated/service_role. Убрано повторное применение 0026 после `resetTo('0026')`.
- Локальная verification: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm test` 56 files / 575 tests exit 0; serial `npm run test:db:migration` 4/4 exit 0 (134.73 s); затем final serial `npm run test:db` 6 files / 44 tests exit 0 (34.29 s). Ранний migration failure был следствием параллельных local resets после перезапуска Docker; debug reset до 0023 воспроизведён отдельно успешно, затем gates выполнялись только последовательно.
- Schema/hosted: новая migration не создана; 0027 проверена только на local Docker и **не подтверждена применённой hosted**. Build/CI/browser/hosted smoke этим candidate не запускались: `npm run build` блокируется execution sandbox — сначала Google Fonts fetch, при retry с сетью Turbopack не может создать subprocess/bind port (`Operation not permitted`). Это не application assertion и требует exact-head CI вне sandbox. L02a остаётся pending; следующий шаг — Astra review exact commit, затем только при ACCEPT L02b.

## 15.09.2026 — повторное Astra review L02a-R

- Reviewed `78c960586a2cbae882561fd472faa40949d3a73a`: [CHANGES REQUIRED](reviews/2026-09-15-l02ar.md). R1–R4 SQL fixes подтверждены. Один P2 в новом тесте: fractional/negative/oversized values передаются объектом вместо массива, отказ случается до проверки чисел. Остальные незакрытые обязательные сценарии и следующий test-only проход перечислены в отчёте.
- Свежие проверки: typecheck/lint exit 0; unit 56 files / 575 tests exit 0; DB 5 files / 40 tests exit 0, 31.40 s. Local prosrc обеих RPC совпал с committed 0027; EXECUTE anon/authenticated=false, service_role=true.
- Mutation probe на loopback Docker: внутри synthetic transaction удалена числовая проверка; object cases по-прежнему rejected, array с timeSpentMs=7200001 accepted. На исходной функции этот array rejected. DDL и fixture откатились ROLLBACK. Это дефект теста, не доказательство текущего обхода SQL. Production не затронут.
- Migration-path/build/CI/browser/hosted smoke этим review не запускались. Source/SQL/tests не изменены; сохранены review/docs без commit/push/merge. Следующий ready: завершить L02a-R tests, L02b закрыт.
## 20.09.2026 — пересмотр казахского контента и допуска, planning only

- По предложению владельца оценён native-KK путь из купленных пробников. [Новый план](../superpowers/plans/2026-09-20-kazakh-pilot-rebaseline.md) рекомендует образец → 20–30 кандидатов → 50–80 принятых задач, а не автоматическую закупку десяти и массовую генерацию. Подготовлен [intake](../pilot/KAZAKH_SOURCE_INTAKE.md). Поставщик/цена/reviewer пока неизвестны.
- Сверены код legacy generation/import, текущий checkout `0e638fa` и сохранённый commit `3f4c5a2`. KK legacy importer требует переводной lineage; нужен отдельный native draft/import contract K01/K03. C00a/C00b, L/E и UI не выбрасываются. Google остаётся резервом; тариф проверен на официальной странице, смета проекта 10.09: первые 200 math ~$1.06, весь RU ~$34.39 до credit/retries/налогов/редактора.
- Статус L02a-R не повышен: commit доступен в Git, временный worktree prunable. Исторические 575 unit / 44 DB / 4 migration tests не являются свежим acceptance; в §2 нового плана перечислен остаток review matrix. Hosted/CI/runtime 20.09 не проверялись. 0026 применена по предыдущему сообщению владельца; 0027 hosted не подтверждена. Смена маршрута контента это не меняет.
- Обновлены входные документы, критерий языков программы и относительный срок: дата 20–21 сентября снята. Финансирование рассматривается после evidence пилота; API перевод не объявляется главным барьером.
- Изменения только Markdown; код, SQL, production, платные API и покупки не выполнялись. Проверка этого прохода — diff/ссылки/согласованность документов, не повтор runtime gates. Следующее: K00 и завершение L02a-R, затем synthetic K01.

## 09.09.2026 — архитектура и планирование

- Подготовлены архитектура, девять implementation plans, карта решений, threat model, release runbook и prompts Terra/Astra.
- Изменения этой работы — только Markdown. Реализация E01–P03 не начата в этом проходе; migrations не создавались/не применялись, deployment/visibility не менялись.
- Исходные наблюдения: main `9342568`, safety `68a7c23`; подробные ограничения в `docs/pilot/RELEASE.md`.
- Исправлены устаревшие утверждения о local env и fast-forward. Наличие env key names проверено без значений; GitHub read API подтвердил public personal repo и отсутствие обнаруженной лицензии.
- Первый task для исполнителя: **E01**. Внешние D01–D07 можно собирать параллельно, без подключения детей.
- Самопроверка: [PLAN_REVIEW.md](PLAN_REVIEW.md). Typecheck exit0; lint exit0 с тремя прежними предупреждениями в untracked pitch script. Проверки связности документов и task dependency graph пройдены; runtime readiness этим не заявляется.

## 15.09.2026 — Astra review L02a: CHANGES REQUIRED

- Reviewed code `a502299708ef07aa534d50bb26089eef75a03a22`, base `0e638fa544f487f8ebae68199d1c0a746f76ff28`. [Отчёт и карточка L02a-R](reviews/2026-09-15-l02a.md) перечисляют 4 воспроизведённых P2 defects и недостающее обязательное DB evidence. Это не ACCEPT; зависимый L02b не открыт.
- Local PostgreSQL function bodies сверены с 0026. Synthetic transaction/savepoint probes подтвердили: unsupported scoring и position gap принимаются с attempt/XP; пустые topic/subject UUID разрешают выдачу без scope; новый submit после quarantine принятой session получает неверный error. Все probe fixtures откатились ROLLBACK; hosted данные не читались и не менялись.
- Свежий `npm run test:db` exit0: 4 files / 33 tests, 27.66s. Этот PASS покрывает существующие тесты, не устраняет findings дополнительных проб. Migration-path/build/browser в review заново не запускались.
- Владелец сообщил о применении миграции после передачи 0026: operator confirmation записано, remote checksum/grants не подтверждены. 0026 больше не редактировать; исправления — только новая migration. Application code и SQL этим review не изменены. Entry points обновлены на L02a-R, расширение прав/деплой/платные запросы отсутствуют.

## 15.09.2026 — L02a-R implementation candidate, pending Astra gate

- Base `a502299708ef07aa534d50bb26089eef75a03a22`; в изолированной ветке создана forward-only `0027_learning_rpc_validation.sql`. Она заменяет только тела двух service-only RPC: пустые topic/subject IDs становятся `invalid-input`; active submit требует `ent-v1` с обеих сторон, positions `0..N-1` и count 1..80; уже submitted session после ownership/integrity и same-operation replay возвращает `already-submitted` до revalidation publication. Receipt/manifest v1/signatures/grants сохранены; reward/streak policy не менялась.
- Сначала новые `tests/db/learning-rpc-validation.test.ts` воспроизвели R1–R4 на 0026: 4/4 expected failures. После local-only `supabase migration up --local` для 0027: 7/7 validation tests passed. Дополнены replay start после quarantine, две different concurrent submit operations и malformed value matrix с проверкой отсутствия attempts/rewards/receipts.
- Migration-path test теперь создаёт populated 0026 state, применяет SQL 0026→0027 и проверяет submitted receipt, active session, replay и service-only grants. `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run test:db` exit 0, 5 files / 40 tests; `npm run test:db:migration` exit 0, 1 file / 4 tests. Local Docker после suite восстановлен на latest schema. Vite сообщает прежнее предупреждение configLoader native; ошибок/новых warnings lint нет.
- Hosted Supabase, Vercel, GitHub/CI и платные API не менялись. 0027 не применять hosted до exact-SHA review и отдельного rollout evidence. Verdict этой записи — candidate, не ACCEPT; L02b остаётся закрытым.

## Формат следующей записи

Не копировать запись как выполненную без запуска. Для каждого task указать: ID, дату, base/head SHA, изменения, команды и exit/results, локальная/CI/DB/browser среда, migration names и applied/not applied, реально выполненные external actions, review verdict, blockers и следующий ready ID. Для документов указывать проверку ссылок/контрактов вместо вымышленных runtime тестов.

## 09.09.2026 — E01 в работе: baseline и security candidate

- Base: `a490cfe`; isolated worktree `/private/tmp/alemprep-release-foundation`, branch `codex/release-foundation`. Untracked presentation/material files из main не переносились и не stage.
- После `npm ci --legacy-peer-deps` baseline: `npm test` — 35 files, 470 tests, exit 0.
- Security history `68a7c23` объединена обычным merge в candidate `b9dad4589154b1506a4aa7199eed4bf717d6894a`, parents `a490cfe` и `68a7c23`. Merge принёс 0022 session manifest и 0023 revoke computed-profile writes; миграции **не применялись** ни к staging, ни к production.
- Candidate checks: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm test` — 36 files, 485 tests, exit 0; `npm run build -- --webpack` exit 0, 25 pages.
- Standard `npm run build` не принят: в sandbox DNS не разрешает `fonts.googleapis.com`; вне sandbox тот же URL возвращает HTTP 200, после чего Turbopack останавливается на создании дочернего процесса с `binding to a port: Operation not permitted`. Это ограничение данного execution environment; исходники не менялись. Нужен зелёный стандартный build на CI/Vercel для candidate SHA.
- Read-only GitHub 09.09: latest production deployment and latest green Verify относятся к `a97a62e54baa0b00d7231169b9ec1e851b18756b`. Candidate не pushed, PR/CI/preview не создавались. Vercel alias→SHA, production env key presence, actual schema/release smoke остаются не подтверждены.
- Next: подготовить ограниченный review diff/PR только после отдельного разрешения на external push, затем получить CI evidence; параллельно E02 может начать harness only после согласования точного test DB target.

### Обновление: PR/CI evidence

- По явному разрешению branch отправлен и создан draft [PR #1](https://github.com/saylaaur/alemprep/pull/1) из `codex/release-foundation` в `main`. PR не merged; `main`, production alias и Supabase не менялись.
- Candidate `d3e4e300e42f1112d612feedc3fc37872abcc8d1` прошёл GitHub Verify [run 34374295579](https://github.com/saylaaur/alemprep/actions/runs/34374295579): clean install, typecheck, lint, 485 tests и **standard** `npm run build` завершились success. CI делает локальный Turbopack failure environmental evidence, не source failure.
- Vercel Preview deployment `6353576427` success: `https://alemprep-pkfhxfz0n-saylaaurs-projects.vercel.app`. Anonymous smoke к `/ru`, `/kk`, `/ru/dashboard`, `/kk/dashboard` останавливается Vercel SSO HTTP302 до приложения; SSO не обходили. Для application browser smoke нужны допущенный Vercel user или отдельный test environment.
- E01 всё ещё в работе: production alias→SHA/env key presence, actual effective schema после последнего запуска и полный synthetic user smoke не подтверждены. Следующий безопасный технический блок — E02 local/staging test harness после выбора/подтверждения test DB target.

### Обновление: merge и production

- По разрешению владельца PR #1 снят с draft и merged 09.09.2026 в 16:13 UTC, main `dfd0c5bff028c9800325908c2af5d2e804faa251`. GitHub Verify run `34374689430` для candidate `93f9c8a` success; Vercel Production deployment `6354222580` для merge SHA success.
- Гостевой production smoke: `/ru` HTTP200; `/kk/dashboard` HTTP307 → `/kk/login`. Это не authenticated synthetic smoke. Владелец подтвердил применение 0022/0023; в браузере ранее виден success 0023. Полная техническая приёмка E01/E02 ещё требуется.
- Владелец разрешил самостоятельно коммитить и мержить готовые изменения после проверок с итоговым summary.

## 09.09.2026 — P0 казахский контент: изменение плана

- Владелец уточнил приоритет казахского для двух сельских школ и запросил экономный перевод существующих заданий. Обновлены TASKS, основной порядок, архитектура, content plan и prompt исполнителя: **следующий C00a**, затем C00b; технические ворота E01/E02 сохраняются, C00c требует E02 и человеческой приёмки.
- Read-only команда `./node_modules/.bin/tsx --tsconfig tsconfig.scripts.json scripts/audit-production-inventory.ts --output /private/tmp/alemprep-kk-inventory-20260909.md` exit0, 16:27 UTC: 4 705 всего, 4 646 published RU, 0 published KK, 59 drafts суммарно. Читались только метаданные вопросов и taxonomy. Публичный отчёт содержит агрегаты, не тексты и не персональные данные.
- В коде уже есть RU→KK перевод с source_question_id через Haiku + Sonnet; предложен отдельный Google NMT путь с offline хранением, dry-run, бюджетом, защитой структуры, проверкой контекстов и human review. Google pricing/language support проверены по официальным страницам, ссылки и условные расчёты в плане 03.
- В этом проходе менялись только документы. Перевод API не вызывался, контент/БД не менялись, новые миграции не создавались. Нулевой опубликованный KK-банк пока не исправлен. Приёмка этого изменения — diff/связность документов; runtime тесты относятся к будущим C00a–C00c.
- Проверки перед коммитом: `git diff --check` exit0; локальные ссылки шести изменённых документов существуют; `npm run typecheck` exit0; `npm run lint` exit0, только три прежних предупреждения в untracked `.codex-pitch-build/polish-deck.mjs`. Эти файлы не включались в изменения.

## 10.09.2026 — стратегия до лета и границы первого пилота

- По запросу владельца ROADMAP заменён актуальной стратегией до 01.06.2027; прежний файл сохранён дословно в `docs/archive/ROADMAP-2026-05.md`. Старые рыночные оценки и цели не используются как текущие факты.
- Владелец уточнил назначение кейса: показать опыт достижения результата для будущих стартапов и технические навыки для стажировок. Зафиксированы этапы, определения метрик, критерии роста/остановки, ресурс/бюджет, роли и evidence для портфолио. Численные цели не выданы за достигнутые результаты или договорённости со школами.
- Добавлен `docs/pilot/SUPERVISED_PILOT.md`: небольшой сопровождаемый этап, ручная сводка вместо полного UI, обязательные SP0–SP7; технический E–P план сохранён. Ориентир 20–21 сентября условный, контроль срока 13 сентября; без допуска только synthetic репетиция. Все новые gate-пункты пока требования, а не PASS.
- Согласованы ссылки SCOPE/README/TASKS/IMPLEMENTER_PROMPT; следующим code task остаётся C00a. Сценарии приложения, БД, тарифы и доступы не менялись, перевод/сообщения школам не запускались.
- Проверки документации: ссылки восьми активных документов существуют; архив побайтно совпадает с прежним ROADMAP; `git diff --check` exit0. `npm run typecheck` exit0; `npm run lint` exit0, три прежних предупреждения в untracked pitch script. Проверки сценариев приложения этим проходом не заявляются.


## 10.09.2026 — C00a: доступность контента, чтение и смета

- Исправлены обрезка question counts/pools первой страницей PostgREST, расхождение каталога и тренажёра, потеря query errors. Чтение идёт страницами по 500 со стабильным ID-порядком; ошибка любой страницы прерывает результат. Ошибки не превращаются в отсутствие заданий. Отсутствующий/чужого языка context также даёт ошибку вместо неполного условия.
- Тема без опубликованных заданий текущего языка не ведёт по активной ссылке в пустой тренажёр. Прямой URL показывает локализованное объяснение, доступные темы того же языка (если есть) и возврат к предметам. Ошибка загрузки попадает в существующий error boundary с retry. Никакого RU fallback для вопросов.
- До создания mock/diagnostic/weekly sessions сервер проверяет оба блока и shortfall по каждому требуемому типу. Пустая или укороченная диагностика больше не создаёт сессию; пустой weekly старт не расходует неделю. Intro проверяет доступность; устаревший intro повторно проверяется сервером. Сетевой отказ снимает spinner и показывает ошибку. Убраны автоматические повторные создания mock sessions; атомарный старт/завершение остаётся L01/L02.
- Новый read-only `npm run audit:kk`: все таблицы через пагинацию; покрытие RU/KK по темам, пары по source_question_id, missing/draft/duplicate/stale/published-unverified; ни публикация, ни совпавший hash не считаются человеческой приёмкой. Скрипт не вызывает Translation API и не пишет в БД.
- Production SELECT в **15:26 UTC 10.09**: 4 705 всего, 4 646 опубликованных RU, 0 KK, 59 drafts; 4 646 отсутствующих пар. У опубликованных вопросов не найдено ссылок на отсутствующий/чужого языка context. Это metadata evidence, не предметная проверка и не транзакционный снимок. Публичный отчёт: `docs/qa/kazakh-coverage.md`.
- Приватный предварительный manifest: `/private/tmp/alemprep-kk-source-sample-20260910.json` (30 math IDs/source hashes, без текста/ответов; не в Git). Отбор детерминированный; повторяется через audit:kk. Есть radicals, single/multi/matching, общий контекст, формулы, текстовый вариант, отрицание. Структурированной таблицы в опубликованном math-банке для выборки не найдено: synthetic table fixture покрывает извлечение, C00b должен проверить её end-to-end. Это проба перевода, не утверждённая программа школы.
- Предварительная смета естественного текста: 30 → 6 671 уникальных code points / $0.13; первые 200 math → 53 021 / $1.06; весь RU → 1 719 637 / $34.39, до кредита/налогов/повторов. Формулы грубо исключены; точные payload/placeholders и лимит расходов — C00b. Неизвестно, свободен ли месячный кредит. Ключи, PII, реальные вопросы и ответы в отчёт/коммит не включены.
- Проверки: исходная база 485 tests; регрессии запросов сначала 8 failures, старта assessment 12 failures, затем исправлены. Финально **42 files / 521 tests PASS**, `npm run typecheck` exit0, `npm run lint` exit0 без предупреждений, стандартный `npm run build` (Turbopack) exit0 с тестовыми публичными env, `git diff --check` exit0. In-memory mock имитирует лимит PostgREST; это не RLS/SQL integration test.
- Визуальная проверка: renderToStaticMarkup реальных компонентов с синтетическими данными и production CSS, браузер RU/KK, мобильная ширина 390px; текст/карточки читаемы, локаль ссылок сохранена. Это не проверка полного авторизованного production-сценария. Изменённые routes проходят production build; CI проверяется перед слиянием.
- Независимое code review: блокирующих introduced defects не найдено; reviewer не подтверждал production/browser evidence и качество KK языка. Технический C00a завершён; **внешняя приёмка KK UI и программы человеком остаётся открытой**. Новых переводов, миграций и платных запросов нет; pilot readiness этим коммитом не заявляется. Следующий кодовый блок C00b, при отсутствии API/budget — dry-run/provider fixtures и независимый E02.

## 11.09.2026 — C00b: budgeted Google NMT drafts (dry-run)

- Base: `ad3404c`. Добавлен `content:translate-google`: Google Cloud Translation Advanced v3 REST только для офлайн-артефакта. По умолчанию это dry-run; `--execute` требует одновременно `--max-chars`, `--max-usd`, `GOOGLE_TRANSLATE_PROJECT_ID` и краткоживущий `GOOGLE_TRANSLATE_ACCESS_TOKEN` из operator shell. Секреты не читаются из NEXT_PUBLIC, не добавляются в `.env.local`, Git, Vercel или браузер. API key не используется: v3 требует OAuth/ADC по официальной документации.
- Артефакт draft/checkpoint принудительно вне repo. Никаких insert/update в Supabase, миграций, автопубликации, изменения `is_published`, context_id или ученического Translation API. Manifest/source hash проверяется заново перед подготовкой: обновившийся RU становится stale. Контексты обрабатываются отдельной сущностью один раз; C00c создаёт KK context и пере-привязывает только принятые пары.
- Extractor переводит только language-bearing leaves. Сохраняет exact LaTex, числа, URL, inline code, IDs, correct single/multi, форму таблицы и matching mapping по позиции. Утрата/дубликат/изменение placeholder отклоняет результат. Русский внутри formula, изображения и неоднозначные units создают manual-review issue и не уходят в автоматический batch. Утверждённый glossary имеет source-hash в checkpoint: точный самостоятельный термин подставляется без API, а термин внутри предложения становится `glossary-inflection-review`, потому что слепая замена не гарантирует казахское склонение. Timeout/429 без quota/5xx имеют максимум три попытки с backoff/jitter; отправка checkpoint `sent` сохраняется до сети. `sent` после сбоя требует явного resume, а не автоматического повторения.
- Pricing проверен по [Google NMT pricing](https://cloud.google.com/products/translate/pricing): billed code points включают placeholders/whitespace, $20/M после ежемесячного кредита. Лимиты считают masked payload и worst-case 3 attempts, не обещают exactly-once billing. Операторская инструкция: `docs/production/GOOGLE_TRANSLATION_RUNBOOK.md`.
- Read-only real dry-run C00a manifest (11.09, production SELECT, после повторного code review): stale 0; 20 eligible entities, 11 manual-review entities (15 `russian-in-latex`, 12 `ambiguous-unit`, 7 `glossary-inflection-review`); 4 993 initial chars/$0.09986, 14 979 worst-case chars/$0.29958. Context от stale/manual-only вопроса не входит в paid batch; canonical path check не позволяет записать draft через symlink в repo. Приватный output: `/private/tmp/alemprep-kk-google-dryrun-c00b-review-20260911.json`; исходные тексты/переводы не попали в Git. Это не API trial, не качество/педагогическая приёмка и не готовность пилота.
- Локальные проверки: `npm run typecheck` exit0; `npm run lint` exit0; `npm test` — 48 files / 549 tests PASS; standard `npm run build` exit0, 25 routes. Тесты включают placeholders, formulas/numbers/URLs, table/matching/context, timeout/429/5xx/missing responses, checkpoint sent/stale/cache, cap/concurrency helpers и dry-run command guards. Зелёный CI и независимый review требуются перед merge. Следующий внешний шаг после merge: оператор/методист принимает budget и manual issues; платный `--execute` запускается только после явного решения. C00c остаётся обязательным.

## 12.09.2026 — E03: source-only security gate

- Read-only redacted scan доступных 208 Git-коммитов не обнаружил совпадений по шаблонам private key, GitHub/OpenAI/Google/AWS key и JWT-like secrets. Это предварительная проверка без вывода значений, не доказательство отсутствия всех видов секретов. CI добавляет Gitleaks с явным `--log-opts=--all` для полного reachable history.
- Verify и Security workflows имеют только минимальные read permissions; external Actions закреплены точными SHA, Dependabot обновляет GitHub Actions и npm. Security не создаёт PR comments и не загружает scan artifact. Regression test ловит mutable action ref, `pull_request_target` и job-level `contents: write`.
- Локально: `npm run typecheck`, `npm run lint`, `npm test` — 49 files / 551 tests PASS; `git diff --check` PASS. Standard `npm run build` в этом worktree не прошёл из-за сетевой ошибки получения Inter/JetBrains Mono с Google Fonts; код шрифтов не менялся. До merge обязательны независимый review и CI build. Внешние настройки visibility, branch protection, Vercel access, 2FA/recovery и rotation при реальном finding этим изменением не выполнены.

## 12.09.2026 — E02: fail-closed test-target guard

- До создания DB/browser harness добавлен чистый, не сетевой guard для тестовой цели. Он допускает `APP_ENV=local` только на HTTP loopback; hosted staging требует одновременно `APP_ENV=staging`, корректный `ALEMPREP_TEST_STAGING_REF` и точное совпадение `https://<ref>.supabase.co`. Production ref `euypaocjzcqlapfilrak` отвергается раньше создания клиента независимо от переменных окружения.
- Проверки guard: 5 тестов, включая production URL, remote URL без allowlist и ошибочный remote URL в local mode. Полный unit suite: 50 files / 556 tests PASS; `npm run typecheck`, `npm run lint` и `git diff --check` PASS. Local `npm run build` снова не получил Inter/JetBrains Mono из Google Fonts в текущей сети; это внешняя ошибка загрузки шрифта, не обход проверки сборки. CI build остаётся обязательным evidence.
- Фактические SQL/RLS и browser tests ещё **не запускались**: Docker CLI есть, Docker daemon выключен, Supabase CLI/config отсутствуют. Этот commit намеренно не называет E02 завершённым и не подключается к hosted/prod базе.

## 12.09.2026 — E03: GitHub governance

- Read-only inventory до изменения: public personal repository `saylaaur/alemprep`, единственный collaborator — владелец; `main` не был защищён, GitHub Action SHA pinning и GitHub secret scanning были выключены. На момент проверки открыто 7 Dependabot version PR; они не merged этим task и требуют обычного review из-за возможных breaking changes.
- Включена защита `main`: изменения только через PR; обязательны актуальные `verify`, `gitleaks` и `Vercel`; stale reviews сбрасываются; правило действует на администратора; force-push и удаление ветки запрещены. Approval count остаётся 0, так как текущий владелец один, но обязательные проверки не обходятся через прямой push.
- Для Actions включено GitHub SHA pinning. Включены GitHub Secret Scanning, Push Protection и Dependabot Security Updates. После включения read-only запрос вернул 0 open secret-scanning alerts. GitHub не включил validity checks через этот API, поэтому это не заявляется как закрытая защита.
- Repository visibility намеренно не менялась: source остаётся public до решения D01 и контрольного Vercel preview после возможной приватизации. Public source не содержит student data по правилам проекта, но отсутствие лицензии не является лицензией open source. Vercel/Supabase ownership, 2FA/recovery, collaborators outside GitHub и branch recovery ещё требуют отдельного evidence.

## 12.09.2026 — E03: Dependabot security remediation

- После включения Dependabot Security Updates GitHub обнаружил 11 открытых alerts: 5 high, 4 moderate и 2 low; три historical alerts уже были auto-dismissed и не учитывались как открытые. Каждый patch-level security PR обновлялся на актуальный protected `main`, затем отдельно проходил обязательные `verify`, `gitleaks` и `Vercel` до merge.
- Merged patch fixes: `js-yaml` 4.1.1→4.3.2, `browserslist` 4.28.2→4.28.9, `vitest`/`@vitest/mocker` 4.1.9→4.1.11, `brace-expansion` 1.1.14→1.1.18, `postcss-selector-parser` 6.1.2→6.1.4 и `esbuild` 0.28.0→0.28.2. Итоговый read-only Dependabot API inventory: **0 open high, 0 moderate, 0 low alerts**.
- Крупные или продуктовые version PR (включая Vitest 5, KaTeX, SDK и GitHub Actions 7) не были merged этим task: они не требовались для закрытия alert и должны получить отдельную оценку совместимости. Это не разрешение считать все зависимости «актуальными», а доказательство закрытия именно известного security backlog на момент проверки.

## 13.09.2026 — E01: public release evidence refresh

- GitHub deployment metadata: последний Vercel deployment с environment `Production` был successful 12.09 17:28:52 UTC для SHA `9efcb6736ecc0a97d6864f0c9134b25989356f1e`; GitHub Actions runs для этого SHA завершились success. GitHub payload при этом содержит `production_environment: false`, поэтому он сам по себе не доказывает, что public alias указывает на тот же deployment.
- Anonymous HTTP evidence: `https://alemprep.vercel.app/` возвращает 307 на `/ru`; `https://alemprep.vercel.app/kk` возвращает 200. Точный deployment URL требует Vercel SSO и не предоставляет anonymous evidence mapping alias→SHA. Это подтверждает доступность public entry routes в момент проверки, но не auth flow, не production data, не полный smoke и не alias-to-SHA identity.
- Следующее обязательное E01 evidence: владелец запускает `docs/pilot/check-release.sql` в Supabase SQL Editor и сохраняет только JSON metadata без строк пользователей; затем Vercel owner сверяет public alias с deployment SHA в control plane. До этих двух действий E01 и G0 остаются открытыми.

## 13.09.2026 — CI: timezone-stable AI quota tests

- PR с документацией выявил mismatch после полуночи в Алматы: четыре `assistant-actions` expectations брали локальный календарный день GitHub runner, а mock и реальная `consume_ai_daily_quota()` используют `timezone('Asia/Almaty', now())::DATE`. Проверка выявила и product preflight: `askAssistant` делал SELECT личной квоты по timezone сервера до вызова атомарного RPC.
- `askAssistant` и оба `daily-limit` reset timestamp теперь используют один календарь `Asia/Almaty` с SQL RPC. Test expectations используют тот же календарь; отдельная regression-проверка фиксирует границу, где UTC ещё 12 сентября, а Алматы уже 13 сентября. Локально: `TZ=UTC` targeted 26 tests PASS; полный suite 50 files / 557 tests PASS; typecheck/lint PASS. CI обязана подтвердить тот же набор на clean runner.

## 13.09.2026 — E02: local Supabase DB and browser harness

- Base `6c30237`, isolated worktree `/private/tmp/alemprep-e02-db-harness`, branch `codex/e02-db-harness`. Добавлены pinned dev dependencies Supabase CLI `2.117.0`, Playwright `1.58.2` и `pg` `8.20.0`; локальная конфигурация `supabase/config.toml`; commands `npm run test:db` и `npm run test:e2e`. Обычный Vitest намеренно не запускает DB suite.
- Local Docker Desktop 29.6.1 поднял чистый Supabase и последовательно применил migrations `0001`–`0023`. Это отдельная локальная БД с synthetic Auth-аккаунтами: migration в hosted/staging/production не применялись и production project ref не использовался.
- Harness до CLI/client/network вызова допускает только loopback HTTP с `APP_ENV=local`; production ref остаётся fail-closed в `tests/db/test-target.ts`. `scalar` отдельно принимает только loopback PostgreSQL URL, прежде чем создаётся `pg.Pool`. Hosted staging намеренно отвергается: отдельный staging harness потребует собственных credentials, retention controls и review. Harness создаёт пользователей через local Auth admin API, получает настоящий password JWT, выполняет REST/RPC и local-only SQL, затем удаляет synthetic Auth users. Local REST доказал: профиль B не виден пользователю A, пользователь не может повысить свой `is_admin`, а намеренное отключение local RLS делает этот же тест видимой утечкой.
- Browser suite сериализует обычную SSR-сессию Supabase в cookies без login route/backdoor. На локальном Chrome прошли 4 сценария: RU/KK guest redirect остаётся в своей locale, synthetic user открывает protected dashboard, logout A очищает shared browser до login B, hostile `next` в callback остаётся на app origin. Playwright trace отключён; test artifacts ignored; JWT/password не пишутся в repository или report.
- Проверки: `npm run typecheck` PASS; `npm run lint` PASS; `npm test` — 50 files / 559 tests PASS; `npm run test:db` — 2 files / 10 tests PASS; `npm run test:e2e` — 4 tests PASS; `npm run build` PASS (25 routes); `git diff --check` PASS. Первичная загрузка bundled Chromium не завершилась из-за external CDN reset/DNS; local Google Chrome прошёл те же tests. CI будет устанавливать Playwright Chromium отдельно.
- Verify workflow теперь в отдельном Docker stack запускает DB и browser suites и останавливает stack в `always()`. Зелёный CI и независимый review ещё требуются до merge. E02 создаёт harness/evidence baseline; L01–L04, аудит, atomic scoring и full pilot gates этим commit не закрыты.

## 13.09.2026 — E02: CI acceptance and merge

- PR #25 (`test: add local Supabase integration harness`) прошёл `verify` (3m37s), Gitleaks и Vercel Preview, затем был merged в `main` как `e565c5f`. CI подтвердил стандартный build, clean local Supabase stack, real JWT/RLS DB suite и Playwright Chromium. Временная ветка удалена после merge.
- E02 теперь даёт воспроизводимую базу evidence для DB/browser проверки. Это не закрывает L01–L04, school scopes, аудит, restore или full supervised-pilot gates.

## 13.09.2026 — L01: immutable learning boundary (working branch)

- В ветке `codex/l01-content-model` добавлена только expand-миграция `0024_learning_integrity_schema.sql`; она **не применялась** к hosted/staging/production Supabase. Существующие sessions/attempts получают `integrity_version=0`; finished legacy sessions получают `submitted`, незавершённые — `active`. Версии заданий immutable, их public/grading/review данные разделены; новые внутренние таблицы RLS-enabled и без browser-role grants.
- Public DTO использует строгий allowlist и не сериализует correct, grading body или explanation до review. Server input принимает только bounded strict Zod contracts; config/service-role boundary помечены `server-only`. Audit metadata ограничен коротким code-only envelope, без answers/payload/cookie/token/email fields.
- Migration-path test на чистой local DB применяет 0024 сначала к empty 0023 baseline, затем к populated legacy fixture; проверяет preservation/status/integrity и RESTRICT удаления question. Проверки working branch: `npm test` — 54 files / 572 tests PASS; обычный DB suite — 3 files / 16 tests PASS; isolated migration suite — 1 file / 2 tests PASS; browser smoke — 4 tests PASS; typecheck/lint PASS; Webpack production build PASS. Standard Turbopack build в sandbox не может открыть внутренний port; GitHub CI остаётся независимым evidence. Повторное независимое review approved. Production migration требует отдельного operator runbook.


## 14.09.2026 — Planning rebaseline: L02 partial, следующий L02a

- Плановый проход по запросу владельца: Astra планирует, Terra High реализует ограниченные карточки. Сверен локальный `main` `52d5181`. E02 merge `e565c5f`, L01 merge `de12ef9`, L02 implementation `63d8ab7`/merge `52d5181` подтверждены git log. Прежняя запись L01 working branch историческая; код уже в main. Это не подтверждает hosted deployment/schema.
- L02 **не принят целиком**, несмотря на merge: FULL OUTER JOIN в 0025 не ограничивает RHS целевой session до JOIN; посторонняя issued session приводит к rejection. Это статический вывод, regression этого случая в данном проходе не запускался. Также найдены неполные SQL NULL/manifest/time checks, отсутствие start audit/streak/achievements, отсутствие production start/submit/review wiring и слишком общий mapping RPC errors. Требования L02 не закрываются существующими ограниченными тестами.
- Новый исполняемый документ: `docs/superpowers/plans/2026-09-14-execution-rebaseline.md`. Следующий ready ID **L02a**, затем L02b/c/d с Astra gate, L03a/b/c/d и L04. Техническая часть Google pipeline уже существует; ожидание денег/человеческой вычитки не блокирует synthetic разработку L/S/R/U/O. C00c и реальная программа остаются открытыми.
- Зарезервированы новые corrective 0026/0027; будущий revoke теперь 0028, последующие резервы сдвинуты до 0036. **Новые SQL не созданы, 0024/0025 не изменены.** Hosted применение 0024/0025 пользователем не подтверждено; в этом проходе remote DB не читалась и не менялась. Исторические номера в старых journal/review entries не являются текущей командой к исполнению.
- Синхронизированы TASKS, production README, IMPLEMENTER/REVIEWER prompts, архитектура, будущие миграционные ссылки в планах 02–07 и release runbook. Зафиксированы review gates, compatibility flag/cutover sequence, последовательное выполнение DB/reset suites и запрет считать незавершённую команду PASS. Уточнение policy: diagnostic без XP/streak; weekly 30 не чаще раза за Almaty ISO-week; legacy display не доказывает новое достижение.
- Изменения только документационные. Application/unit/DB/browser tests в этом проходе не запускались; прежние результаты не переобозначались как свежие. Production/платные API/материалы презентации/секреты не менялись. Проверка документации: 13 файлов, локальные Markdown links/fences/whitespace PASS; git diff --check PASS; резервы миграций сверены, application/SQL diff отсутствует. План сохраняется отдельным docs-коммитом; rollout не выполняется.

## 14.09.2026 — L02a: корректность trusted learning RPC (implementation candidate)

- Base `0e638fa`, isolated worktree `/private/tmp/alemprep-l02a-rpc-correctness`, branch `codex/l02a-rpc-correctness`. Добавлена только forward migration `0026_learning_rpc_correctness.sql`; `0024` и `0025` не менялись. Hosted/staging/production Supabase не читались и не менялись.
- `start_learning_v1` теперь принимает строгий service-only plan с locale, проверяет locale/topic/subject против immutable version, ограничивает форму mode/session, срок и поля JSON. Approved publications блокируются последовательно по version ID до выдачи. Start создаёт один `learning.started` audit event на session вместе с rows и receipt.
- `commit_learning_v1` ограничивает issued rows целевой session до FULL JOIN, сверяет saved manifest и question denominator, заново проверяет quarantine под lock, берёт accepted time одним server clock после receipt и нужных locks. JSON null/extra/missing fields и invalid numeric inputs отклоняются до writes; accepted receipt доступен при повторе после expiry. Browser и anon роли лишены EXECUTE.
- Добавлены local synthetic DB regressions: две active sessions одного ученика, 20 одинаковых submit, changed-payload conflict, mock pair, post-expiry replay, null/malformed inputs, catalog mismatch, quarantine, atomic rollback and role grants. DB files сериализованы (`fileParallelism: false`); concurrency остаётся внутри одного regression.
- Local evidence: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm test` — 56 files / 575 tests PASS; targeted RPC DB — 17 tests PASS; `npm run test:db` после final reset — 4 files / 33 tests PASS; isolated `npm run test:db:migration` — 1 file / 3 tests PASS за 116s, затем current local schema восстановлена и full DB suite повторён PASS. `supabase db reset --local` применил `0001`–`0026` только к Docker local stack.
- Standard `npm run build` в этом execution environment не получил PASS: sandbox не скачал Google Fonts, а повтор вне sandbox упал внутри Turbopack на `Operation not permitted` при создании child process/port для KaTeX CSS. Это не source-level diagnostic; обязательны CI build и отдельный Astra L02a gate по exact commit before L02b. Никакого deploy/remote migration/платного API не выполнялось.

## 21.09.2026 — L02a-R: завершение local regression evidence (candidate)

- В ветке `codex/l02ar-evidence-completion` закрыта матрица замечаний review `78c9605` без изменения production SQL: добавлены проверяемые barriers для quarantine-first и start-first/submit-first, естественное истечение срока при ожидании publication lock, strict SQL NULL/JSON null и full item/denominator matrix. Snapshot helper сравнивает profile, sessions, session items, attempts, rewards, receipts и audit после каждого отказа или replay.
- Числовая проверка имеет mutation control в откатываемой транзакции local PostgreSQL: при временном удалении guards over-limit duration принимается, после ROLLBACK исходная функция и факты восстанавливаются. Это доказывает, что regression действительно защищает numeric branch, а не только форму JSON. Другие evidence включают A1/A2/B1 substitution, сдачу обоих mock blocks, changed-payload conflict и accepted retry после quarantine.
- Свежие local проверки: `npm run typecheck` PASS; `npm run lint` PASS; `npm test` — 56 files / 575 tests PASS; targeted RPC DB — 3 files / 33 tests PASS; `npm run test:db:migration` — 1 file / 4 tests PASS за 137.43s; затем `npm run test:db` — 6 files / 49 tests PASS за 61.43s. Миграционные и DB-прогоны выполнялись последовательно на Docker local synthetic Supabase; hosted/staging/production не читались и не менялись.
- `npm run build` получил normal dependency tree, но не прошёл из-за недоступности `fonts.googleapis.com` при fetch Inter и JetBrains Mono. Это external network failure после запуска Turbopack, не TypeScript/source regression; CI build остаётся обязательным evidence. Независимый Astra review не завершён в этом проходе, поэтому L02b не открыт и candidate не считать принятым.
## 22.09.2026 — L02b-R2 candidate: complete local gates

- После final serial local reset: полный `npm run test:db` — **8 files / 68 tests PASS, 72.48s**; полный `npm run test:db:migration` — **1 file / 5 tests PASS, 166.49s**. `learning-rewards` с controlled weekly RPC fixtures — **15/15 PASS**. Migration suite завершает восстановлением latest schema.
- Test-only scoped trigger контролирует `finished_at` двух настоящих service weekly RPC: разные дни W02 дают ровно один `weekly-bonus:2026-W02`; W02→W03 создаёт два weekly keys и второй `+30`. Добавлена race-проверка двух sessions из freeze-состояния: один расход, одно пересечение границы 7 и конечный freeze count 1.
- Next: commit exact candidate SHA and repeat Astra review. No hosted/deploy action is authorized by these local gates.

## 22.09.2026 — L02b-R candidate: trusted rewards and replay corrections

- В `0028` browser RLS теперь не позволяет удалить/создать trusted (`integrity_version=1`) facts; wrapper берёт тот же advisory lock до receipt lookup. Legacy server actions больше не пытаются молча mint achievements: до L03 badges выдаёт только trusted RPC.
- Добавлены постоянные probes: authenticated/anon DELETE, concurrent same-operation replay, retry после сдвига accepted session на другой Almaty day, concurrent daily cap. Rewards suite покрывает одну RU/KK family, Asia/Almaty ISO-week boundary, 7 последовательных trusted days, scattered days, diagnostic history и rollback audit/achievement facts.
- Local evidence at this intermediate candidate: reset 0001–0028 PASS; `learning-rewards` 13/13, `l02b-review-probes` 4/4, `learning-atomic` 17/17, `learning-rpc-locking` 5/5, `learning-rpc-validation` 11/11, focused 0027→0028 migration test PASS; `npm test` 576/576; typecheck/lint PASS. The later R2 entry records the final complete DB/migration gates.
- Hosted Supabase, Vercel, GitHub/CI, paid APIs, push and merge were not changed. Next: commit this candidate, then exact-SHA Astra review; L02c remains closed.
## 22.09.2026 — Astra L02b exact-SHA review: ACCEPT

- Независимый review принял code SHA `0e1be82dd606289426246a4c60f10d06409a6494`: R1 browser trusted-fact RLS, R2 replay lock, R3 migration-path privilege placement и R4 evidence matrix закрыты.
- Evidence: `npm run test:db` **8/68 PASS, 72.48s**; `npm run test:db:migration` **1/5 PASS, 166.49s**; `npm test` **56/576 PASS**; typecheck/lint/diff check clean. Test-only weekly clock trigger scoped and cleaned in `finally`.
- L02c is now ready. This gate does not authorize hosted migration, Vercel deployment, paid APIs, or a pilot release.

## 28.09.2026 — A1/L02: CI acceptance and merge; A2 ready

- [PR #31](https://github.com/saylaaur/alemprep/pull/31) опубликован из `codex/l02cr-fixes`, head `6f6b3557ca4c3d169a30883d627afdff5482f0c7` (application code `8907703`). Review полного L02 и correction принят: [local review](reviews/2026-09-27-l02-final.md). После required checks PR merged как `bb903a24b2e95c6b2abb9846ee8e6a3404890154` в 06:26:25 UTC.
- [Verify run 36385798188](https://github.com/saylaaur/alemprep/actions/runs/36385798188) SUCCESS за 7m25s: typecheck, lint, unit, стандартный `npm run build`, isolated Supabase DB, migration-path, Chromium browser smoke и cleanup. Gitleaks и Vercel Preview также PASS. Это закрывает прежний локальный пробел standard build. Новых тестовых прогонов после документационных правок не требовалось: application diff с accepted main отсутствует.
- Required schema до 0028 уже находится в main после PR #30; diff PR #31 не добавляет миграций. Hosted SQL в этом проходе не применялась. Merge может инициировать обычный Vercel production deployment; состояние публичного alias и schema не устанавливалось. Новый trusted UI ещё не включён.
- Основной checkout на ветке `codex/pilot-execution-rebaseline` синхронизирован с принятым main. Единственный merge conflict был в исторических статусах TASKS; он заменён фактической очередью. Незакоммиченные пользовательские материалы сохранены.
- Следующий ID **A2/L03a**: [packet](../superpowers/plans/2026-09-28-l03a-trusted-practice-packet.md). Исправлена ошибка планирования: сервер уже выдаёт одну задачу на session, поэтому сохраняется ответ → проверка → объяснение → следующая задача. Очистка owner-scoped pending при смене account входит сразу в A2. Shared-school scope, отчётность, legacy cutover и release rehearsal остаются A3–A6; школьный допуск пока не выдан.
