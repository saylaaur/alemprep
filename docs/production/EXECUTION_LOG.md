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
