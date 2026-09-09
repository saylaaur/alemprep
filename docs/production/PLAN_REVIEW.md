# Проверка архитектуры и плана — 09.09.2026

Выполнена самим автором как проверка согласованности документов. Это не независимый code review и не аудит production.

## Покрытие запроса

| Требование | Где задано | Исполнение / доказательство |
| --- | --- | --- |
| Архитектура до продакшена | Spec §§1–8 | E01/E02, L01–L04 |
| Достоверные баллы, защита своего прогресса | Spec §§6–7, T01–T05 | Реальные REST, concurrent submits и rollback tests |
| Аудит для команды и отчёт управлению образования | Spec §§5.3,9 | R01–R03, snapshot/golden metrics |
| Кабинет учителя и две независимые школы | Spec §5.2 | S01–S04, scope/role matrix |
| Полноценные RU/KK, неверные задания/таблицы | Spec §2 | C01/C02, human review + browser matrix |
| Кэш, общие ПК, обрывы сети | Spec §10 | U01–U03, HTTP after-commit failure и logout |
| Приток пользователей, расходы и падение БД | Spec §11 | O01–O04, N/2N, backup restore |
| GitHub public/private и Vercel | SECURITY + D01 | E03, реальные provider settings после решения |
| Размещение/данные детей/удаление | D02/D04, DATA_MAP | R03/O04/P01, принятый оператором контур |
| Desmos в согласованном дизайне | Spec §10, D07 | V01/V02, license/network/fallback gate |
| Deployment и два этапа пилота | RELEASE_RUNBOOK | P01–P03, exact SHA/alias/smoke |
| Terra исполняет, Astra ревьюит | Два отдельных prompt файла | Один task/commit, обязательные review gates |

## Исправления после самопроверки

1. Убрано неверное сообщение об отсутствии локальных ключей: ошибка была в разбиении строк env, а не доказанной конфигурации.
2. Старый fast-forward план заменён проверкой merge: main после doc-коммитов уже не предок safety.
3. Отделены Supabase SQL metadata, реальные поведенческие DB tests, GitHub deployment и Vercel alias. Они не доказывают друг друга.
4. «AI для пилота выключен» заменено на ещё не выполненное server-side требование O01.
5. Правила метрик привязаны к конкретному assignment; endline хранит comparison_baseline_id. Устранено смешение количества сдач и количества учеников.
6. Согласованы locale/purpose позиции программы, camelCase public DTO, server TTL и одноразовый receipt.
7. Тест секретности не запрещает публичный option ID: проверяет отсутствие correct/explanation fields, а не само значение одного из вариантов.
8. Лимиты/флаги поставлены перед отчётами: 0031 operations, 0032 reports, 0033 privacy. Цикла «report требует limits, limits требует готовый report» нет.
9. Отдельно описаны SQL/Auth deletion steps: внешнюю Auth API операцию нельзя объявлять частью одной PostgreSQL-транзакции.
10. Migrations и code steps не объявлены уже применёнными; H2 hosting/альтернативный Auth остаются явной внешней развилкой с критериями, не выдуманными provision-командами неизвестного провайдера.

## Проверки этого прохода

- Автоматически сверены local Markdown links, парность code fences, 28 уникальных task IDs в master и девяти plans, обязательные headers; циклы task dependencies отсутствуют.
- `npm run typecheck`: exit0.
- `npm run lint`: exit0, 0 errors; три предупреждения о неиспользуемых переменных в существующем untracked `.codex-pitch-build/polish-deck.mjs`. Этот файл не менялся.
- `git diff --check`: без ошибок для отслеживаемых изменений; новые Markdown также проверяются перед фиксацией.
- Build/unit/DB/browser/load/restore в этом planning-проходе не выполнялись: код приложения не менялся. Старые 485 unit tests и Webpack build остаются историческим свидетельством для safety SHA, не новой приёмкой production.

## Что нельзя закрыть документом

Реальная роль/region/контракт провайдера, правовое основание и сроки хранения, аккаунты и устройства школ, математическая/KK приёмка, лицензия Desmos, нагрузка на выбранном тарифе, восстановление backup, опубликованный SHA и успешное занятие. Эти gates перечислены с владельцами и не станут done от ещё одного прохода модели.
