# Журнал исполнения production-плана

## 09.09.2026 — архитектура и планирование

- Подготовлены архитектура, девять implementation plans, карта решений, threat model, release runbook и prompts Terra/Astra.
- Изменения этой работы — только Markdown. Реализация E01–P03 не начата в этом проходе; migrations не создавались/не применялись, deployment/visibility не менялись.
- Исходные наблюдения: main `9342568`, safety `68a7c23`; подробные ограничения в `docs/pilot/RELEASE.md`.
- Исправлены устаревшие утверждения о local env и fast-forward. Наличие env key names проверено без значений; GitHub read API подтвердил public personal repo и отсутствие обнаруженной лицензии.
- Первый task для исполнителя: **E01**. Внешние D01–D07 можно собирать параллельно, без подключения детей.
- Самопроверка: [PLAN_REVIEW.md](PLAN_REVIEW.md). Typecheck exit0; lint exit0 с тремя прежними предупреждениями в untracked pitch script. Проверки связности документов и task dependency graph пройдены; runtime readiness этим не заявляется.

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
