# Полная локальная проверка и восстановление миграций

5 октября 2026. Ветка: codex/trusted-practice, исходный HEAD 987c6dc.
Проверялись код кабинета/графиков и дальнейшие исправления в этой ветке.
**Локальные проверки пройдены; production допуск ещё не подтверждён.**
Номера результатов ниже заменяют ранний узкий проход кабинета 652/117/4.

## Исправленные дефекты

| Дефект | Исправление | Проверка |
| --- | --- | --- |
| Повтор 0035 падает с 42P07 на существующем live index | Транзакция, IF NOT EXISTS; условное сохранение оригиналов RPC и пересоздание audit trigger | Исходная ошибка воспроизведена; 0035/0036 применяются дважды, сохранённая функция не становится рекурсивной обёрткой |
| Reload активной сессии возвращает вопрос после отзыва полномочий | Новый service-only active-access RPC; state/replay используют отдельный guarded reader | Withdrawn, cancelled, school/group paused, school/group membership ended, closed, quarantined |
| Повтор исходного assigned-start после ответа возвращал temporarily-unavailable вместо терминального состояния | Терминальное состояние возвращает already-submitted/expired | Unit и DB: тот же operation не продвигает выдачу и не создаёт вторую сессию/попытку |
| expired → submitted мог считаться завершением без принятого ответа | Trigger требует выданный item/attempt/receipt; прогресс дополнительно требует submit operation receipt | Переход отвергнут, ложный прогресс не начисляется |
| Исторический неправильный submitted мог пережить повтор старого start receipt | Проверка accepted facts выполняется до receipt replay | Старый active/completed receipt и новый start закрываются с temporarily-unavailable; история не удаляется |
| Порядок блокировок start отличался от submit | Operation advisory lock до assignment authority locks | Пока start ждёт operation lock, отмена назначения не блокируется; после отмены start запрещён |
| Активный generic-start replay после карантина восстанавливал отозванный вопрос | Общая active-access проверка для free-practice replay | Вопрос не выдаётся повторно, исходная сессия не заменяется новой |
| Свежий start мог получить expired при небольшом расхождении часов Node и БД | Пять секунд резерва в планировании practice/diagnostic/weekly/mock; строгий лимит SQL не меняется | Реальный service + DB при server clock +2s: RED expired до исправления, GREEN после; replay тот же, одна сессия, срок не превышает 2 часа |

Принятый ранее submit и исторический review остаются доступны владельцу после
отзыва участия. Это отдельный reader для grading/replay; не возвращаем
отозванный активный вопрос через него. В гонке reload с submit повторное чтение
возвращает только терминальное состояние, не обходит запрет на активное.

0034 сохранена байт-в-байт, SHA-256:
934a447137ba6db18aea3087735a6a4ff696e53810c23ec2a7e3dcc26cf5d9f4.
Владелец прямо запросил исправление 0035 после ошибки; её правки ограничены
восстановлением повторного применения. Новая функциональная защита — в 0037.
0036 не изменена. Hosted применение этих файлов в этом проходе не выполнялось.

## Ворота проверки

Все DB/Playwright записи сделаны только в guarded локальном Docker Supabase
на синтетических аккаунтах. DB suite, migration reset и E2E шли последовательно:
общая БД не сбрасывалась под одновременно работающим браузером.

| Команда | Наблюдаемый результат |
| --- | --- |
| npm test | Exit 0; 655/655, 69 файлов |
| npm run test:db | Exit 0; 131/131, 18 файлов |
| npm run test:db:migration | Exit 0; 6/6, clean и populated upgrade |
| npm run typecheck | Exit 0; app и scripts TS configurations |
| npm run lint | Exit 0 |
| npm run build | Exit 0; обычный Turbopack, Next 16.3.6 |
| Trusted E2E, serial workers | Exit 0; 21 passed, 1 intentional legacy skip; включая полный pupil → accepted answer → reload → teacher report |
| Legacy E2E, serial workers | Exit 0; 9 passed, 13 intentional trusted skips |
| npm audit --omit=dev | Exit 0; 0 известных runtime advisory |
| npm audit | Exit 1; 7 high записей dev/build dependency chain, 0 critical |

Browser команды используют DESMOS_ENABLED=true,
NEXT_PUBLIC_DESMOS_API_KEY=LOCAL_E2E_KEY и отдельные
LEARNING_V1_ENABLED=true/false. Desmos SDK в браузерных сценариях подменён
локальным mock. Реальную лицензию, production SDK key и сеть эти тесты не проверяют.

В первый полный trusted запуск с четырьмя workers все сценарии завершились,
но runner завис при shutdown. Он был остановлен и **не засчитан как зелёный**.
Полный повтор с одним worker завершился exit 0. Конфигурация теперь задаёт
workers: 1, поскольку файлы используют общий локальный DB harness.
Точная внутренняя причина зависания Chrome worker не доказана; параллельный
runner не объявляем проверенным.

Дополнительный screenshot/cabinet повтор дал 2 сбоя: временно недоступный
teacher RPC и topic metadata с PGRST303. Этот код означает отказ проверки/parsing
JWT claims ([PostgREST](https://docs.postgrest.org/en/stable/references/errors.html#group-3-jwt)),
а не ошибку SQL 0035. Точный claim/message исходного отказа не был сохранён,
поэтому причина не объявляется установленной или исправленной. Повтор того же
subset без изменений приложения и без automatic retries прошёл 5/5 exit 0;
32 новых синтетических JWT direct REST probes дали 0 ошибок. Следующий полный
trusted прогон с безопасной локальной диагностикой не повторил PGRST303.
Auth-гарантии не ослаблялись, исключение не замаскировано retries в тестах.
Этот intermittent локальный отказ остаётся ограничением стабильности evidence;
проверка Auth/teacher/student на реальном preview обязательна до выпуска.
Failure log: /private/tmp/alemprep-final-cabinet-1005.log;
successful repeat: /private/tmp/alemprep-cabinet-jwt-recheck-1005.log.

Следующий полный диагностический прогон не повторил JWT-отказ, но нашёл fresh
start с expired (20 passed, 1 failed, 1 intentional skip). Это привело к отдельному
воспроизводимому clock-boundary regression выше. Лимиты 2h/30min/45min/160min
по-прежнему проверяются БД; планирование теперь оставляет 5 секунд резерва.
Paired mock сохраняет одинаковый expiry и manifest semantics. Большое расхождение
часов всё ещё закрывается с ошибкой; JWT validation не ослаблялась.
Логи RED/GREEN: /private/tmp/alemprep-clock-red-1005.log и
/private/tmp/alemprep-clock-green-1005.log; исходный browser failure:
/private/tmp/alemprep-expired-before-fix-1005.log. Финальные gates повторяются
после исправления; не скрываем старые failures за passing repeat. Unit 655/655,
DB 131/131, typecheck/lint/обычный build после этой правки прошли. Финальный
обычный trusted browser запуск без diagnostic import завершился exit 0:
21 passed, 1 intentional legacy skip, 1.1 минуты.

Мобильный KK screenshot графиков осмотрен: активная функция, формула, график,
контролы, таблица и Desmos fallback доступны без горизонтального overflow.
Screenshot отключает CSS animations, чтобы не показывать промежуточный цвет
переключения; это изменение артефакта теста, не production темы.

Что охватывает полный набор: Auth/locales, public-only question DTO, draft
reload и account switch/logout, lost-response replay без повторных XP/attempts,
expiration/foreign session, single/multi/matching, unapproved content, права
учителя и координатора, приглашение/вступление, чужой класс, актуальное членство,
first-family и 30-дневные метрики, RU/KK графики на мобильном экране,
SDK failure/retry/destroy, транзакции и migration recovery.

Логи текущего локального прохода находятся в /private/tmp:
alemprep-final-unit-1005.log, alemprep-final-db-1005.log,
alemprep-final-migrations-1005.log, alemprep-final-typecheck-1005.log,
alemprep-final-lint-1005.log, alemprep-final-build-1005.log,
alemprep-final-e2e-trusted-1005.log, alemprep-final-e2e-legacy-1005.log.
Это локальные evidence, не загруженные CI artifacts.

## Зависимости

Next и eslint-config-next обновлены 16.3.4 → 16.3.6. Compatible транзитивный
brace-expansion обновлён без смены дизайн-системы.
[Next advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j)
касается next/og ImageResponse с недоверенным SVG; такой путь в нашем app,
components, lib и scripts не найден. Уязвимую версию всё равно заменили.
Это не доказательство, что приложение было эксплуатируемо или атаковано.

Оставшиеся 7 записей относятся к одной цепочке braces/chokidar/micromatch/
fast-glob/Tailwind 3/Next ESLint tooling.
[Braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
нужно учитывать при обработке недоверенных glob patterns в dev/build.
npm audit fix --force предлагает Tailwind 4 и несовместимый downgrade
eslint-config-next; они намеренно не применены в срочном выпуске.
Runtime audit 0 не означает отсутствие любых уязвимостей приложения.

## Факты production и главный блокер

Read-only чтения 05.10 (UTC timestamp 04.10 20:24):

- 4 705 legacy вопросов: опубликованы 4 646 RU, 0 KK; 59 drafts.
- Question versions: **0 RU, 0 KK**.
- Approved version publications: **0 RU, 0 KK**.
- Пропущенных/чужого языка contexts у опубликованного legacy банка: 0.

Это несколько чтений, не транзакционный снимок. Legacy published не
подтверждает правильность задач или их принятие редактором.
На production не проводились записи контента, изменения secrets или платные
Google/Anthropic вызовы. Alias → новый SHA и hosted grants этого выпуска не
подтверждены. Наличие новой схемы не создаёт immutable bank автоматически.

**Не включать trusted flag на пустом approved bank.** Иначе ученик не получит
принятый вопрос, а legacy client score не заполнит доверенный teacher report.

## Пакет перевода

[Полный handoff](../../pilot/translation-handoff/README.md) содержит контекст,
готовые Claude prompts, честный review template и operator guide.
Подготовлены 30 реальных RU источников с hashes, ключами, объяснениями,
glossary и общим context. Они передаются отдельным приватным архивом;
исходные задания/ответы не добавляются в этот публичный репозиторий.
Это техническая выборка, не 30 уже принятых заданий.

Переводим существующие задачи один раз и сохраняем KK версии. Отдельный сайт
или перевод при каждом посещении не нужен. Google sample runner существует,
но batch driver для всего банка и импорт Google/Claude artifacts в versions
ещё предстоит дописать; инструкции не выдают будущие команды за работающие.
Перевод/математическая/языковая приёмка этой партии не выполнены.

Свежий допустимый Google dry-run: 4 993 initial / 14 979 maximum characters,
до $0.29958 без доступного кредита. При этом часть источников требует ручной
обработки; это не цена полного перевода всех 30.
Грубая natural-text оценка всего банка: $34.39–36.96 без кредита/повторов/
placeholders/человеческой проверки. Это **не cap** массового запуска.
[Официальный тариф](https://cloud.google.com/translate/pricing).

## Следующее по порядку

1. Владелец применяет исправленную 0035 → 0036 → 0037 и read-only SQL проверки
   из [migration guide](../../pilot/MIGRATIONS_0035_0037.md). 0037 всегда последняя.
2. Исполнитель выполняет **KT3 RU subset**: строгий импорт маленького принятого
   RU набора в drafts/immutable versions и точное одобрение, без автопереноса
   всех published legacy. Проверить реальную математику/объяснения.
3. Настроить настоящие школы/классы/учительские memberships; deployment preview
   на совместимой схеме с approved RU контентом; ученик → ответ → reload →
   teacher report, затем limited production rehearsal.
4. Друг переводит первые 5 → 30. **KT2** проверяет artifacts/source hashes/
   структуру/связи/shared context; **KT3 KK** сохраняет same-family pairs.
5. После приёмки KK расширять до 100–200 и тематического покрытия; **KT1**
   добавляет batching и единый бюджетный ledger перед массовым переводом.

Точные coding cards: [content-and-release plan](../../superpowers/plans/2026-10-05-content-and-release.md).
Независимый boundary review не нашёл оставшихся блокирующих дефектов в
рассмотренных исправлениях; translation workflow review проверил совместимость
реальных форматов и команд. Это review конкретного объёма, не универсальный
security audit, нагрузочная сертификация или допуск школ.

## Что не покрыто локальной проверкой

Полная математическая приёмка 4 646 RU; казахский банк; реальная школьная сеть;
платный Google run; production provisioning/backup recovery; sustained load
production; реальный Desmos SDK; hosted replay/security smoke; выпуск проверенного
SHA. Эти ограничения не скрываем за зелёными unit/DB/browser тестами.
