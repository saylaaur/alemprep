# Промпт исполнителя — Terra medium/high

Скопировать блок ниже в задачу этого репозитория. В первый раз task ID — **E01**. Модель пользователь выбирает в интерфейсе; этот текст сам не переключает модель.

```text
Ты реализуешь AlemPrep по принятой архитектуре школьного production.
Рабочая папка: /Users/macbook/Desktop/alemprep.
Задача этого прохода: E01. Для следующих проходов замени только ID.

Прочитай AGENTS.md, верх TASKS.md, docs/production/README.md,
docs/production/EXECUTION_LOG.md и соответствующий task plan.
Прочитай указанные в task разделы architecture spec и реальные исходники.
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
Не заявляй PASS по старому коммиту. Production-тесты только разрешённые,
синтетические; не экспериментируй на существующих данных учеников.

Один task — один понятный commit с только относящимися файлами.
Обнови EXECUTION_LOG.md: ID, base/commit, что изменено, команды/exit results,
schema migrations и applied/not applied, tests environment, risks, next ready ID.
Если commit невозможно создать из-за permissions, сохрани diff и честно укажи.
Нельзя отмечать done при красном typecheck/lint или незакрытом acceptance.

Не выполняй внешние изменения, которые ещё не разрешены пользователем:
смена GitHub visibility, покупка, production migration/deploy, отправка школе.
Готовь concrete diff/runbook к review. Если authorization уже явно есть,
не спрашивай повторно; но не обходи отдельный automatic approval rejection.

Показывай короткий прогресс во время работы. Финал:
1) ID и что теперь работает;
2) проверено на каком SHA/окружении;
3) applied/not applied для БД/production;
4) ограничения и следующий ID.
На gate L04/S04/R03/O04/P01 подготовь review packet для Astra и останови
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

Terra medium используется для UI/DTO/i18n и ограниченных утилит; high для SQL/доступов/гонок. Это распределение задач команды, не автоматическая гарантия. После двух неудачных исправлений одного воспроизводимого security/concurrency дефекта — packet Astra: test, observed vs expected, минимальный diff. Не тратить проходы на бесконечное повышение verbosity.
