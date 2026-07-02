# AlemPrep — Настройка окружения под спринт с Claude Code

> Пошаговый чек-лист: что поставить и настроить перед стартом. Задачи спринта — в `SPRINT.md`,
> стратегия — в `MVP_PLAN.md`, код-гайд — в `CLAUDE.md`.

---

## 0. Что уже готово в репозитории ✅

- `.claude/commands/verify.md` — команда `/verify` (typecheck + lint + build).
- `CLAUDE.md` — код-гайд, Claude Code читает его автоматически.
- `.gitignore` покрывает `.env.local`, `scripts/generated|references`.
- Node v22, npm 10 — подходят.
- Ветка `main` чистая.

Тебе нужно доставить только ключи, зависимости и (опц.) Supabase MCP.

---

## 1. Claude Code

Если ещё не стоит:
```bash
npm install -g @anthropic-ai/claude-code
claude --version
```
Залогинься своей подпиской **Max** (`claude` → следуй подсказке входа). Max нужен ради
высоких лимитов — на спринт с параллельными агентами это критично.

> ⚠️ Подписка Max ≠ Anthropic API. Пайплайн контента (Haiku) считается **по API-биллингу**
> отдельно. Это ок — стоимость всего MVP-контента ~$5–15.

---

## 2. Ключи → `.env.local`

```bash
cp .env.local.example .env.local
```
Заполни (см. комментарии в файле):

| Переменная | Где взять | Для чего |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | клиент (уже был) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role | прямая запись задач в БД пайплайном |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | Haiku-пайплайн |

⚠️ `service_role` и `ANTHROPIC_API_KEY` — секреты. Они уже под `.gitignore`, не коммить.

---

## 3. Зависимости и проверка базы

```bash
npm install --legacy-peer-deps     # флаг обязателен (React 19)
npm run typecheck                  # должно быть 0 ошибок
npm run build                      # опц., проверяет типы честно
```
Если зелёно — базовая линия в порядке, можно стартовать.

---

## 4. Чистая git-база

Закоммить план и настройку одним коммитом, чтобы спринт стартовал с чистого дерева:
```bash
git add MVP_PLAN.md SPRINT.md SETUP.md .env.local.example
git commit -m "docs: пересмотренный план MVP + бриф спринта + сетап окружения"
```
> Если git ругается на `.git/index.lock` — это залипший лок от прерванной сессии. Убедись,
> что никакой `claude`/`git` не запущен, и удали: `rm -f .git/index.lock`.

---

## 5. Параллельная работа через git worktree (ядро скорости)

Два независимых трека (Контент и UI) не пересекаются по файлам — гоняй их параллельно
в отдельных рабочих копиях, каждую своим экземпляром Claude Code:

```bash
# из корня репо
git worktree add ../alemprep-content -b sprint/content
git worktree add ../alemprep-ui      -b sprint/ui
```
- Терминал 1: `cd ../alemprep-content && claude` → скармливай промпты **Трека Контент**
  (A → B → C → D из `SPRINT.md`).
- Терминал 2: `cd ../alemprep-ui && claude` → промпты **Трека UI** (E1 T5, E2 T7).

Внутри каждой сессии: один таск = один коммит, `/verify` перед закрытием, токены/`.env`
не трогать. По готовности слить ветки в `main`:
```bash
git checkout main && git merge sprint/content && git merge sprint/ui
git worktree remove ../alemprep-content && git worktree remove ../alemprep-ui
```

> Оба трека независимы по файлам (`scripts/` vs `components/`), поэтому merge-конфликтов
> быть почти не должно. `.env.local` в worktree не копируется — скопируй его в каждую копию
> или сделай симлинк.

---

## 6. Нужны ли скилы/плагины? — честно

Много ставить **не надо**. Claude Code уже читает `CLAUDE.md` и имеет `/verify`. Полезное:

- **Git worktrees** — это и есть твой «параллелизм», встроено в git, ставить нечего (см. §5).
- **Субагенты** — Claude Code сам порождает их внутри сессии при сложных задачах; свои
  определять в `.claude/agents/` для этого спринта не обязательно.
- **Supabase MCP (опционально, полезно)** — даёт Claude Code читать схему БД и проверять
  заливку. Настройка ниже.
- Случайные плагины из маркетплейсов под эту задачу — не нужны, только шум.

---

## 7. (Опционально) Supabase MCP для Claude Code

Даёт агенту видеть схему БД — удобно для миграций тем (B1/B2) и проверки вставленных задач.
**Важно по безопасности:** для MCP используй **personal access token в read-only**, НЕ
service-role ключ.

1. Токен: supabase.com/dashboard/account/tokens → создать.
2. В шелл-профиль: `export SUPABASE_ACCESS_TOKEN=sbp_...`
3. Создай `.mcp.json` в корне репо (удалённый HTTP-сервер, привязка к проекту, read-only):

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=euypaocjzcqlapfilrak&read_only=true",
      "headers": { "Authorization": "Bearer ${SUPABASE_ACCESS_TOKEN}" }
    }
  }
}
```
4. Перезапусти `claude`, проверь `/mcp` — сервер `supabase` должен подключиться.

> `read_only=true` и привязка к `project_ref` — чтобы агент не мог случайно ничего сломать
> и видел только этот проект. Записью в БД занимается пайплайн через service-role, не MCP.

---

## 8. Порядок старта (сводка)

1. Claude Code + вход Max (§1)
2. Ключи в `.env.local` (§2)
3. `npm install --legacy-peer-deps` + `/verify` зелёный (§3)
4. Коммит базы (§4)
5. Миграции тем B1 (информатика) + B2 (физика) — быстрые, дают topic_slug пайплайну
6. Worktree'ы (§5) → параллельно Трек Контент (A→B→C→D) и Трек UI (E1, E2)
7. F дизайн → G деплой (последними)

Как поставишь ключи — пиши, прогоним первый запуск пайплайна (Эпик A) вместе.

*Чек-лист живой. Версия 1.0 — июль 2026.*
