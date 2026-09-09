# 09 — Launch and pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Выпустить принятую версию и провести ограниченный, измеримый пилот в двух школах.
**Architecture:** Прогон exact candidate на принятой инфраструктуре, expand/cutover, одна первая группа, затем вторая школа. Решение о запуске включает код, данные, людей и восстановление.
**Tech Stack:** Existing application, GitHub/Vercel либо принятый D02 hosting, PostgreSQL, runbooks и школьная репетиция.
**Spec:** [архитектура](../specs/2026-09-09-production-pilot-architecture.md); [master gates](../../production/README.md).

## Global Constraints

- Запуск детей запрещён до закрытия G0–G7 из главного плана. Условное «тесты зелёные» не заменяет отсутствующие доказательства.
- Секреты, дампы, детские данные и персональные выгрузки не попадают в Git, CI artifacts, публичные preview или логи.
- Существующие design tokens, темы и согласованный дизайн визуализации сохраняются.

## P01 — Полная репетиция выпуска и приёмка

**Files:** create `docs/pilot/LAUNCH_ACCEPTANCE.md`, `docs/pilot/TEACHER_GUIDE.ru.md`, `docs/pilot/TEACHER_GUIDE.kk.md`, `docs/pilot/LESSON_FALLBACK.md`; update `docs/pilot/RELEASE.md`, `docs/production/EXECUTION_LOG.md`.
**Consumes:** E03,L04,C02,S04,R03,U03,O04; D01–D06. V02 только если модуль включается.
**Produces:** exact candidate SHA и checklist evidence G0–G7, подписанные ответственные ссылки, готовый урок/резервный материал.

- [ ] Заморозить candidate: schema list/checksums, node/lockfile, env names, feature flags, content/program version. Никаких необозначенных изменений после test run. После исправления нового P0/P1 повторить affected tests и build для нового SHA.
- [ ] На fresh synthetic staging выполнить всю последовательность миграций и `npm ci --legacy-peer-deps`, typecheck/lint/unit/DB/build/E2E. Воспроизвести direct own-score denial, чужую школу, retry/timeout, restore golden report, no AI call. Схема/host equivalent production выбранного D02.
- [ ] Проверить оба языка в реальном OAuth и школьной сети: учитель создаёт assignment, два ученика разных scope сдают, teacher видит свои результаты, export корректен, signout/shared device безопасен. Не использовать реальные ответы/учётки детей для атакующих тестов.
- [ ] Teacher guide: вход/присоединение, назначение программы, срок, подтверждение результата, помощь ученику, завершение урока, error report и контакт поддержки. KK guide принимается человеком. Брошюру/выгрузку можно создать отдельным artifact task после текста; здесь Markdown достаточно.
- [ ] Lesson fallback: принятую программу можно объяснить с доски/локальной распечатки без входа; такой урок помечается отдельно, не превращается в fake онлайн attempts. Подготовить учителю порядок проверки связи за15min до начала и остановки при массовом pending.
- [ ] Astra review architecture invariants и фактические outputs. Любой open P0/P1/security/data gate → NO-GO. Владелец принимает дату/расходы/оператора и конкретный deploy; разрешение на «план» не заменяет внешнюю публикацию.
- [ ] Commit P01 документов evidence без персональных данных. Никаких автоматически вымышленных подписей/«учитель подтвердил».

## P02 — Контролируемый production deployment и первая группа

**Files:** update `docs/pilot/{RELEASE,LAUNCH_ACCEPTANCE}.md`, `docs/production/EXECUTION_LOG.md`; production infrastructure actions по [runbook](../../production/RELEASE_RUNBOOK.md).
**Consumes:** P01 GO и конкретно разрешённое действие выпуска.
**Produces:** confirmed alias→SHA, server smoke, первая школьная группа и журнал фактов занятия.

- [ ] Сохранить prior compatible SHA/settings, убедиться в свежем backup и доступе восстановления. Объявленное окно без занятий для cutover. Подготовить migration plan с точными files/checksums и rollback compatibility **до** кнопки deploy.
- [ ] Выполнить runbook по порядку: pause writes при contract cutover → DB migration → exact app release → verify grants/schema/alias → synthetic smoke → unpause разрешённого scope. Не возвращать UPDATE XP клиенту ради старого приложения.
- [ ] Smoke synthetic на production только выделенным операторским account_kind=test без воздействия на учащихся: RU/KK login→issued task→submit→receipt→reload→teacher scoped view→logout. Реальный Google login не подменять cookie injection доказательством OAuth.
- [ ] Проверить flags: AI off, Desmos off если нет G8; public registration/enrolment policy D03, только согласованная первая группа. Не подключать обе школы одним массовым rollout.
- [ ] Первое занятие: техответственный доступен, учитель заранее вошёл, fallback готов. Во время занятия следить за save success/errors, lock timeouts, backlog/cost; после — reconcile trusted counts и список инцидентов. Не обещать учащимся, что несохранённый pending уже попал в отчёт.
- [ ] Если data leak/integrity issue — остановка новых школьных writes/набора, incident procedure, scope containment; при внешнем Desmos outage — module off. Если всё принято, записать факты и P02 done. Commit отчёта без детей/контактов.

## P03 — Вторая школа, сопровождение и итог

**Files:** create `docs/pilot/PILOT_LOG.md`, `docs/pilot/REPORT_INTERPRETATION.md`; update `docs/production/EXECUTION_LOG.md`, `TASKS.md`.
**Consumes:** P02, первое занятие без незакрытых P0/P1 и school readiness второй школы.
**Produces:** завершённый пилот с проверяемой отчётностью и решением о следующем этапе.

- [ ] Открыть вторую школу только после проверки её аккаунтов/устройств/языка/контактов, используя отдельные memberships/groups/invites. Пройти короткий teacher smoke второй школы, не копировать чужие roster.
- [ ] Каждый день занятий: synthetic health до урока, review ошибок сохранения и очереди, backup freshness, content issues, budget. Каждую неделю: teacher feedback, отчёт completion/paired coverage, confirmed content fixes новой версией. Не менять content version посреди контрольного замера.
- [ ] Baseline и endline в сопоставимых условиях с фиксированными accepted variants. Фиксировать отсутствие участника и технический сбой отдельно. Не дописывать несуществующие ответы ради красивых графиков.
- [ ] Итог: report ID/period/cutoff/versions, eligible/active/completed, paired N, gain в процентных пунктах, пропуски, incidents, контентные исправления, техническая устойчивость и расход. Small-cell suppression и authority policy обязательны. Отправку внешнего отчёта выполняет уполномоченный человек; агент не рассылает сам.
- [ ] Решение продолжать/расширять принимает владелец со школами. Если pilot завершён — отозвать временные invites/roles, применить принятый retention schedule, сохранить согласованные агрегаты. Новые функции по результатам обратной связи — новый backlog, не молчаливое расширение scope.
- [ ] Обновить TASKS реальными статусами; commit P03. «Пилот завершён» только после фактических занятий/отчёта, не в день готовности кода.
