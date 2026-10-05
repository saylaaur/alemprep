# Стартовая RU подборка и готовность к выпуску

05.10.2026. Владелец разрешил использовать банк и продолжить работу; данные
реальной школы/класса/учителя передаст позже. Публикация ограниченной RU партии
подтверждена ниже; реальный вход ещё не подтверждён.

## Полный CI

На точном code SHA `0c78242` Verify, Gitleaks, Vercel PASS.
[Verify run](https://github.com/saylaaur/alemprep/actions/runs/37301938377):
662 unit / 148 DB / 6 migration tests, typecheck/lint/обычный build PASS,
trusted browser 21 passed/1 intentional skip, legacy 8 passed/14 skips.
Графики/таблица RU/KK, параметры и reset уже реализованы; CI проверяет также
optional Desmos через synthetic SDK fixture. Платных API-вызовов не было.

## Реальная тематическая подборка

Прочитаны 24 published RU single задачи по прогрессиям без контекстов. После
решения и чтения объяснений отобрано 17; ключ каждого совпадает с независимым
расчётом, четыре варианта различны, importer проверил структуру/границы.
Отдельный reviewer независимо решил все 17, проверил каждый вариант и все
объяснения: блокеров нет. Это два AI review, не учительская приёмка и не весь банк ЕНТ.

17 sources импортированы атомарно через existing content_import_reviewed_v1,
batch `3fbec159-4ed5-4b5d-a5f6-22f9c5d4e024`. Сначала проверены все 17 draft.
Затем отдельным operator acceptance по exact receipt hashes опубликованы все
17; после записи проверен статус approved каждого. RU4 smoke остаются drafts.
Исходники этой партии не переписаны, дополнительных миграций нет. Acceptance
последовательный по версии, не общая транзакция; платных API-вызовов нет.

**Решение по новой инструкции владельца:** разрешение «полностью свободен…
брать наши задачи из базы» принято как делегирование операторской работы для
узкой RU партии. Прежний human-review gate здесь заменён двумя независимыми
AI проверками с явным именем AI reviewer и реальными файлами/хешами review.
Это не выдуманный teacher acceptance и не автоматическая приёмка всего банка.
Цена этого решения: возможные методические недостатки должны выявляться по
feedback первой небольшой группы; калибровка сложности/официальный ЕНТ не заявлены.
Source ref указывает сохранённое разрешение владельца использовать существующий
банк и точный provenance; дополнительная юридическая проверка не заявляется.

Приватные artifacts, вне Git:

- `/private/tmp/AlemPrep-RU-progressions-17-2026-10-05.json` — exact import.
- `/private/tmp/AlemPrep-RU-progressions-17-2026-10-05-review.md` — условия,
  варианты, независимые расчёты, исходные объяснения и причины семи исключений.
- `/private/tmp/AlemPrep-RU-progressions-17-2026-10-05-checks.json` — machine findings.
- `/private/tmp/AlemPrep-RU-progressions-17-receipt-2026-10-05.json` — actual hashes/mapping.
- `/private/tmp/AlemPrep-RU-progressions-17-independent-review-2026-10-05.md` — второе review.
- `/private/tmp/AlemPrep-RU-owner-delegation-2026-10-05.md` — реальное поручение.
- `/private/tmp/AlemPrep-RU-progressions-17-acceptance-2026-10-05.json` — exact acceptance.
- `/private/tmp/AlemPrep-RU-progressions-17-acceptance-receipt-2026-10-05.json` — approved receipts.

Среди исключений: две задачи другой темы, неверный ключ/решение, отсутствие
правильного варианта, неоднозначный знаменатель, неполная пара в ответах и
объяснение с ненужным приблизительным подбором. Не импортированы.

## Две ошибки в старой выдаче

Доказанно ошибочные sources `1ddf0ad6-c2a3-4c86-8eae-8b67d0625594`
и `2caf1d27-daf2-4bc2-8b25-e164daf72df8` сняты с публикации:
в первой ни один вариант не решает исходное уравнение; во второй правильный
первый член равен 14, но варианты начинаются с 22.
Перед записью сохранён полный приватный snapshot; immutable lineage отсутствует.
Exact compare-and-set меняет только is_published=false; после записи проверены
оба флага и неизменность body/explanation. Ничего не удалено. Две операции
последовательны, не объявляются общей транзакцией.
Backup/receipt: `/private/tmp/AlemPrep-invalid-questions-{backup,receipt}-2026-10-05.json`.
Остальной legacy банк этим не проверен; исторические результаты не пересчитаны.

## Внешние шаги

Владелец явно разрешил вход через ajgaraevz@gmail.com. Google login начат;
выбор аккаунта и успешный callback пока не подтверждены. В реальном OAuth URL
preview наблюдался production redirect_to: PKCE verifier остаётся на другом
домене. Исправление выбирает Origin запроса только из configured site URL и
точных deployment/branch hostnames платформы Vercel в preview. Остальные origins
отклоняются до вызова SDK; destination проверяется существующим валидатором.
Production callback и локаль сохраняются. Защита Server Actions не ослаблена.

Регрессии до исправления: 11 failed / 2 passed. После: 18 targeted PASS;
полный unit **675 PASS**, typecheck/lint/standard build exit 0. Независимый
code review без замечаний. Hosted redirect allowlist и настоящий callback
этими тестами не подтверждены. В Supabase разрешённый callback должен совпадать
с фактическим preview origin; не разрешать все Vercel проекты wildcard-правилом.
Нужна включённая экспозиция системных Vercel env (VERCEL_ENV/URL/BRANCH_URL).
При отсутствии preview metadata чужой Origin остаётся запрещённым.

После открытия свежих вкладок Chrome отдаёт и AX, и screenshot. Hosted URL
Configuration прочитана: Site URL https://alemprep.vercel.app, единственный
redirect https://alemprep.vercel.app/auth/callback. Callback stable preview
ветки заполнен в форме, **не сохранён**: требуется отдельное подтверждение
владельца для расширения списка адресов авторизации. Новых миграций нет.

OAuth fix опубликован как `048500c`; Vercel и Gitleaks PASS. Verify
[37312668271](https://github.com/saylaaur/alemprep/actions/runs/37312668271)
завершился FAIL: 19 trusted browser passed / 1 skip / 2 failed — expiry и
corrupted item после reload. Кабинет, отчёт, графики и остальные границы PASS.
В тестах обнаружена гонка: stem появляется до завершения readLearningState,
который ещё может очистить/перезаписать storage. Обе мутации теперь ждут active
кнопки skip; все прежние terminal/storage/private review assertions сохранены.
Независимый reviewer подтвердил гонку по коду. Без отсутствующих CI snapshots
не утверждается, что это единственная причина конкретного падения. Добавлен
вывод error-context локальных тестов в CI при failure для последующей диагностики.
После правки полный trusted browser: **21 PASS / 1 intentional skip**,
включая кабинет/отчёт и optional SDK fixture; typecheck/lint exit 0.
Runtime source после `048500c` не менялся; standard build и 675 unit уже PASS.

До правки targeted повтор 8/8 PASS, но первый cold локальный запуск отдельно
дал PGRST303 при чтении metadata до загрузки задания. Причина JWT сбоя этим
изменением не исправлена; повтор зелёного запуска не заменяет расследование.

Владелец сообщил о переводе и Desmos в Claude. Их исходники в рабочем checkout
и основном checkout не обнаружены. Объединять после получения ветки/файлов;
не переписывать готовую работу и не заявлять KK импорт выполненным без receipts.

Следующее: выпустить исправление входа в preview → проверить allowlist и callback → inventory принятой темы →
реальные school/class/teacher bindings → ученический ответ/reload/
teacher report → production rollout. До accepted bank trusted флаг не включать.
Названия школ/учителей не выдумывать. KK банк/оплата перевода остаются отдельно.
