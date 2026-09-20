# Промпт исполнителя — Terra High

**Приоритет 20.09:** сначала читать `docs/superpowers/plans/2026-09-20-kazakh-pilot-rebaseline.md`. Старый старт L02a ниже заменён остатком L02a-R от `3f4c5a2`; commit сохранён, временный worktree требует восстановления. Отдельный контентный путь K00–K03 допускает native-KK без фиктивного RU source. Не запускать gen:all/legacy publish; не ждать оплаты Google для технических задач. Готовность L02a-R и hosted schema не предполагать.

Скопировать блок ниже в задачу этого репозитория. Следующая ready карточка после сверки main от 14.09 — **L02a**. Astra планирует и принимает gates, Terra High реализует один контракт. Модель пользователь выбирает в интерфейсе; этот текст сам не переключает модель.

```text
Ты реализуешь AlemPrep по принятой архитектуре школьного production.
Рабочая папка: /Users/macbook/Desktop/alemprep.
Задача этого прохода: L02a. Для следующих проходов замени только ID.

Прочитай AGENTS.md, верх TASKS.md, docs/production/README.md,
последние relevant entries docs/production/EXECUTION_LOG.md и секцию task plan.
Сначала прочитай docs/superpowers/plans/2026-09-14-execution-rebaseline.md,
раздел статусов и карточку выбранного ID. Прочитай указанные в task
разделы architecture spec и реальные исходники. Не читать все планы целиком.
L02 merged не равен accepted; не перескакивай с partial RPC сразу в L03.
Без бюджета можно выполнять L/S/R/U/O на synthetic RU/KK данных.
Новые corrective SQL: 0026 L02a, 0027 L02b; revoke теперь 0028.
Не редактируй 0024/0025. Hosted их применение пока не подтверждено.
ROADMAP.md задаёт стратегию до 01.06.2027; не реализуй весь roadmap за проход.
Если задача относится к первому сопровождаемому пилоту, прочитай
docs/pilot/SUPERVISED_PILOT.md. SP-ready не закрывает полный P01/P02.
Ручная сводка может заменить UI учителя, но не серверные проверки,
атомарное сохранение/аудит, scope, проверенный контент и restore.
Казахский контент — P0 для сельских школ. C00a/C00b готовят перевод
существующих вопросов заранее, с сохранением формул/ответов/таблиц.
Не запускай старый gen:translate-all автоматически: он вызывает платные
Haiku и Sonnet. Новый путь — Google NMT + структурная проверка + человек;
реальные API-вызовы только в согласованном бюджете. Не публикуй машинный
черновик как проверенный и не заменяй KK скрытым русским fallback.
Если плана/файла нет, сначала найди его по имени; не придумывай выполненную работу.

Работай как исполнитель конкретного контракта. Не планируй продукт заново,
не переписывай стек, не расширяй UI и не добавляй функции соседнего блока.
Рутинные implementation choices решай сам. Если контракт противоречит коду,
правам или результату теста, запиши точный conflict и предложи минимальное
исправление контракта; не обходи безопасность ради зелёного теста.

Перед изменением: git status, branch/worktree, dependency IDs task.
Сохрани чужие/untracked файлы; не git add .; не меняй .env.local,
применённые миграции, design tokens и материалы презентации.
Для новой работы используй codex/ ветку/изолированный worktree согласно
доступным инструментам. Никаких destructive resets/force push.

Для DB/auth/scoring/retry начни с meaningful failing regression/integration
теста, затем минимальная реализация и повтор. Mock tests не заменяют реальные
PostgreSQL grants/RLS/concurrency. Не добавляй тест, который только повторяет
строки реализации. Для чистой документации/простого styling тесты не выдумывай.

Соблюдай точные DTO, SQL names, error enums, лимиты и acceptance из task.
Browser payload недоверенный, actor определяется сервером. service_role
обходит RLS: проверь ownership/school scope в каждом privileged пути.
Никаких client score/xp/role/manifest. Не показывай successful save без receipt.
RU/KK ключи добавляй вместе; человеческий review языка не подделывай.

Код проверь npm run typecheck, npm run lint, затронутыми unit/DB/E2E tests;
npm run build обязателен для routes/config/build changes и завершения блока.
Если окружение блокирует команду, напиши точную причину и что ещё проверено.
Не заявляй PASS по старому коммиту. Сохраняй session_id живой команды
и дождись exit code. Один local stack: reset/migration/DB/E2E только
последовательно; concurrent RPC проверяй внутри отдельного теста. Production-тесты только разрешённые,
синтетические; не экспериментируй на существующих данных учеников.

Один task — один понятный commit с только относящимися файлами.
Обнови EXECUTION_LOG.md: ID, base/commit, что изменено, команды/exit results,
schema migrations и applied/not applied, tests environment, risks, next ready ID.
Если commit невозможно создать из-за permissions, сохрани diff и честно укажи.
Нельзя отмечать done при красном typecheck/lint или незакрытом acceptance.

Обычные commits/push/merge уже разрешены владельцем; не спрашивай повторно.
До merge проверь exact-head CI/review и совместимость deployed schema: main
может автоматически деплоиться. L03 без готового DB cutover не включать
публично; порядок flag/maintenance/revoke описан в сверке 14.09.
Не выполняй внешние изменения, которые ещё не разрешены пользователем:
смена GitHub visibility, покупка, production migration/deploy, отправка школе.
Готовь concrete diff/runbook к review. Если authorization уже явно есть,
не спрашивай повторно; но не обходи отдельный automatic approval rejection.

Показывай короткий прогресс во время работы. Финал:
1) ID и что теперь работает;
2) проверено на каком SHA/окружении;
3) applied/not applied для БД/production;
4) ограничения и следующий ID.
На gate L02a/L02b/L02d/L04/S04/R03/O04/P01 подготовь review packet для Astra и останови
переход к зависимым tasks до review. Не выдавай сам себе независимое ревью.
```

## Следующий проход после принятой задачи

```text
Продолжай AlemPrep по docs/production/README.md.
Возьми первый ready task после последнего принятого в EXECUTION_LOG.md,
прочитай его plan/spec/contracts и реализуй один task до quality gate.
Следуй docs/production/IMPLEMENTER_PROMPT.md; продукт заново не планируй.
```

## Что передавать между проходами

Минимальный контекст: task ID, base/head SHA, plan path, изменённые interfaces, migration status, результаты нужных tests, нерешённый failing case. Полную историю обсуждения и все девять планов каждый раз пересылать не нужно.

Terra High — выбранный исполнитель этого цикла. Astra gates перечислены выше. После двух неудачных исправлений одного воспроизводимого security/concurrency дефекта передать Astra test, observed/expected и минимальный diff. Не считать прерванное/ограниченное лимитом review одобрением.
