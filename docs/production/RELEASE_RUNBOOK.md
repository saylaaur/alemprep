# Выпуск, откат и запуск пилота

Применять после P01 и конкретного разрешения внешнего действия. Документирование и локальная проверка не меняют production сами по себе. Указанные номера миграций — зарезервированная последовательность планов, а не уже существующие файлы.

## 1. Что собрать перед кнопкой выпуска

Release record: candidate full SHA, verified CI run, test timestamps, schema/migration names+checksums, target project IDs/regions, domain→deployment mapping, build Node/lockfile, env key names/presence (без values), content/program versions, feature flags, prior compatible SHA, backup ID/time/restore evidence, operator и school window в закрытом реестре.

Если каких-либо обязательных доказательств нет — не писать «готово к pilot». Разработку synthetic задач продолжать. Контакты/секреты/child IDs в Git release record не добавлять.

## 2. Git и CI

1. `git status --short`, inspect base..head diff, redacted secret/content scan. Stage только task files. Локальные pitch/generated/docs не публикуются автоматически.
2. Подготовить branch/PR к **проверенному** `saylaaur/alemprep`, записать payload scope. Предыдущий branch push был остановлен автоматической проверкой разрешений, не GitHub. Без конкретного разрешения после этого отказа его не повторять и не обходить другим инструментом.
3. PR triggers Verify; plain branch push сам по себе не triggers существующий workflow. Preview работает на staging env, не production service key. CI Node22 clean install/typecheck/lint/test/build плюс новые DB/E2E suites.
4. Review точного head. Merge создаёт новый SHA при merge/squash — production build и smoke должны относиться к нему; зелёный pre-merge head не заменяет deployment metadata нового SHA.

## 3. Согласование БД перед миграцией

1. Read-only inventory: tables/columns/functions/grants/RLS/constraints/indexes. Старый hosted проект без migration ledger нельзя reset или пометить всеми версиями без сверки.
2. Сопоставить каждую реально применённую миграцию с definitions/checksum; расхождение оформить corrective новой миграцией. Baseline ledger заводить только по проверенным объектам и процедуре выбранного CLI, сохранив audit; не переигрывать seeds над production.
3. Проверить sequence 0024→0034 на fresh DB и populated synthetic baseline. Уникальные constraints/backfill отрабатывают legacy NULLs. Большие backfill — batch с измеренным временем/locks, не безлимитный transaction в час урока.
4. Schema expansion совместима со старым app, contract revokes — отдельное окно. Новые grants нельзя включать позже UI «когда-нибудь»; новый table сразу RLS/default deny.

## 4. Первая починка совместимости и основной cutover

Текущий риск: 0023 запрещает user-client UPDATE XP, а старый main мог его выполнять. E01 сначала подтверждает actual active SHA. При несовместимости приоритет — minimal compatible safety release с проверками и собственным разрешением, а не ожидание teacher/Desmos.

Основной переход L04:

1. До окна: restoreable backup, candidate проверен, old active sessions policy известна, оператор доступен.
2. Pause новых учебных writes/starts, сохранить pending пользователей без fake success. Завершённые receipts остаются readable.
3. Expand migrations уже приняты. Применить новую revoke/cutover migration, отменить несовместимые legacy active sessions выбранной процедурой; не повышать integrity задним числом.
4. Выпустить exact compatible application SHA. Проверить production aliases из control plane, а не название последнего GitHub deployment.
5. Read-only grants/schema check; synthetic positive/negative smoke на test account. Проверить отсутствие child data в логах.
6. Unpause только согласованного school/group scope. Наблюдать save errors, lock timeout, denied writes и queue. Оставить AI/Desmos off без gates.

## 5. Конкретный smoke после выпуска

В двух локалях: guest redirect → реальный OAuth → issued session → valid answer → receipt → reload тот же score → teacher своей группы видит сдачу → другая школа недоступна → report preview → logout и back не показывает данные.

Дополнительно: повтор operation не даёт новый attempt/XP; missing/foreign item rejected; raw correct не присутствует до review; private route headers/RSC; feature flags; health. Глубокая fuzz/concurrency проверка остаётся на staging. Production smoke synthetic records помечены account_kind=test и не учитываются в отчёте.

## 6. Откат и инциденты

| Ситуация | Действие |
| --- | --- |
| Новый UI сломан, схема совместима с prior safe SHA | Откат app на проверенный compatible SHA, alias verification, smoke |
| DB grants уже изменились, prior app пишет напрямую | Не откатывать на него; pause writes + forward fix |
| Подозрение на чужие данные/подделку фактов | Stop school writes/enrolment, revoke affected access, preserve sanitized evidence, incident owner |
| Потеря/повреждение БД | Изолированный restore, tombstones, reconcile, только затем восстановление доступа; учесть принятый RPO |
| AI/Desmos/exports расходуют бюджет или недоступны | Disable optional module/exports, основной submit защищён отдельными лимитами |
| Provider auth outage | Не создавать bypass-login; резервный урок, pending и повторный вход после восстановления |

Не восстанавливать клиентские XP/role grants как rollback. Не запускать второй writable DB одновременно без протокола, не стирать весь audit ради производительности. Evidence инцидента и дампы — только закрытое хранилище с принятым сроком.

## 7. Разделение сред

| Среда | Данные/ключи | Доступ |
| --- | --- | --- |
| Local | Synthetic seed, local Auth/DB | Разработчик |
| CI | Synthetic, временные локальные ключи, dummy build config | No production secrets, restricted artifacts |
| Preview/staging | Synthetic isolated project, accepted testing providers | Команда/методист с ограниченным доступом |
| Production | Только принятые данные/контент, уникальные ключи | Участники и минимальные операторы |

Публичный demo по умолчанию отдельный synthetic scope/проект. Нельзя ставить `DEMO=true` из query и показывать детям чужую историю. Staging не подключается к production ради удобства тестов.
