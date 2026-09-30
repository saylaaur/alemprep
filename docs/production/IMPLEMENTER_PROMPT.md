# Промпт исполнителя — Terra High

Актуально на 30.09.2026. Следующий проход — только **A3-R2**. Модель выбирает пользователь; документ её не переключает.

[Полный текущий план](../superpowers/plans/2026-09-30-pilot-next-steps.md) · [Review c47385b](reviews/2026-09-30-c47385b.md) · [Журнал](EXECUTION_LOG.md)

```text
Ты реализуешь следующий согласованный контракт AlemPrep, не перепланируешь продукт.
Рабочий checkout: /Users/macbook/.codex/worktrees/trusted-practice/alemprep.
Ветка codex/trusted-practice; reviewed code baseline c47385b.
Основной checkout /Users/macbook/Desktop/alemprep содержит другую ветку и
материалы презентации: не переключай его и не удаляй чужие/untracked файлы.

Прочитай AGENTS.md, верх TASKS.md, review 2026-09-30-c47385b.md и Task 1
плана docs/superpowers/plans/2026-09-30-pilot-next-steps.md.
Задача: A3-R2 — draft-only INSERT программы и транзакционная сериализация
отзыва конкретной teacher→group связи с publish/invite/cancel/join.
Контракт, файлы, lock-barrier и acceptance tests заданы в Task 1.
Не переделывай A1/A2, не расширяй UI и не реализуй весь план одним коммитом.

0026–0032 уже применены владельцем; выбранные hosted каталоги проверены.
Не редактируй и не повторяй старые миграции. Новый forward SQL — 0033,
если номер по-прежнему свободен. 0034 зарезервирована для A3-B binding.
Не менять .env.local, design tokens или презентацию.

Для DB/auth/race сначала meaningful failing regression на real local Docker,
затем минимальное исправление. Synthetic данные и loopback guards обязательны.
DB и migration-reset suites запускай последовательно, дожидаясь exit code.
Фиксированные sleep не доказывают race: используй bounded pg_locks barrier.
Не объясняй прошлые timeout количеством workers без доказательств:
fileParallelism=false уже устанавливает maxWorkers=1 в установленном Vitest.

Выполни проверки Task 1; приложи точные exit/results и commit SHA.
Проверяй git diff --check; staged только явные файлы задачи, не git add .
Один контракт — один коммит. Перед hosted rollout требуется review исправления.
Не применять SQL к production в ходе локальной реализации, не деплоить
непринятый общий школьный сценарий. После correction review следующий A3-B.

Не выдавай локальный PASS за CI, hosted readiness или школьный допуск.
Не публикуй машинный контент как проверенный, не запускай платные API.
Казахский сохраняется полноценным языком; выбранный RU урок обозначается явно.
Если найдено противоречие контракта, покажи конкретный код/тест и предложи
минимальную корректировку; не обходи безопасность ради зелёного теста.
```
