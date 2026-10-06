# Как применить 0035, 0036 и исправление 0037

5 октября 2026. Эти файлы проверяются на локальном Supabase; этот документ
не утверждает, что hosted БД уже обновлена.

## Что означала ошибка

`42P07: relation "sessions_assignment_participant_item_live_unique" already exists`
означает, что индекс существует. Это возможно после предыдущего полного или
частичного запуска 0035. По одной ошибке нельзя определить, выполнились ли
остальные команды. Не удаляйте индекс и не изменяйте 0034.

0035 теперь запускается целиком в транзакции: существующий индекс сохраняется,
переименование исходных функций выполняется только при отсутствии сохранённой
копии, audit trigger пересоздаётся. Повторное применение не превращает сохранённую
функцию в рекурсивную обёртку. Это исправление именно файла восстановления 0035;
новые изменения поведения вынесены в 0037.

## Порядок в SQL Editor

1. Открыть свой production-проект AlemPrep. Проверить, что 0034 уже применена.
2. Скопировать **весь** `supabase/migrations/0035_pilot_learning_binding_corrections.sql`
   из текущей ветки, включая `BEGIN;` и `COMMIT;`. Выполнить. Старую сохранённую
   вкладку «35» обновить новым содержимым.
3. Выполнить весь `supabase/migrations/0036_teacher_self_study_dashboard.sql`.
   Повторный запуск разрешён; функция read-only, таблицы не меняются.
4. Выполнить весь **новый** `supabase/migrations/0037_pilot_recovery_boundary.sql`.
   Он должен идти **последним**, в том числе если повторно запускаете 0035.
5. Выполнить проверку ниже. Если есть ошибка, сохранить точный текст и прекратить
   последовательность до разбора; не удалять таблицы/индексы и не отключать RLS.

Если SQL Editor явно сообщает `current transaction is aborted`, завершить
неудачную транзакцию командой `ROLLBACK;`, затем запустить целый файл заново.
Не выполнять отдельный `COMMIT` после ошибки и не продолжать с середины файла.

0034 остаётся без изменений; SHA-256:
`934a447137ba6db18aea3087735a6a4ff696e53810c23ec2a7e3dcc26cf5d9f4`.

## Проверка существования и прав

Безопасные чтения. `to_regprocedure` возвращает NULL при отсутствии функции,
поэтому эта проверка сама не упадёт из-за отсутствующей сигнатуры.

```sql
SELECT
  to_regclass('public.sessions_assignment_participant_item_live_unique') AS live_index,
  to_regprocedure('public.pilot_start_assigned_learning_v1(uuid,uuid,text,uuid)') AS assigned_start,
  to_regprocedure('public.pilot_start_assigned_learning_v1_0034(uuid,uuid,text,uuid)') AS saved_start,
  to_regprocedure('public.commit_learning_v1_pre_pilot_binding(uuid,uuid,text,uuid,jsonb,text)') AS saved_commit,
  to_regprocedure('public.pilot_teacher_dashboard_v1(uuid)') AS teacher_dashboard,
  to_regprocedure('public.learning_active_session_access_v1(uuid,uuid)') AS active_access,
  to_regprocedure('public.pilot_session_has_accepted_completion_v1(uuid)') AS accepted_completion;

SELECT pg_get_indexdef(to_regclass('public.sessions_assignment_participant_item_live_unique')) AS definition;

SELECT p.proname,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS pupil_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS server_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'pilot_start_assigned_learning_v1', 'learning_active_session_access_v1',
  'pilot_session_has_accepted_completion_v1', 'pilot_teacher_dashboard_v1'
)
ORDER BY p.proname;
```

Все семь объектов первой строки должны существовать. Индекс должен быть
**UNIQUE** на `sessions(assignment_participant_id, pilot_program_item_id)` для
ненулевых привязок со статусами `active`/`submitted`. Если определение другое,
не считать совпадение имени достаточным и прислать результат проверки.

Для первых трёх серверных функций ожидаем `anon=false`, `authenticated=false`,
`service_role=true`. У `pilot_teacher_dashboard_v1` ожидаем `anon=false`,
`authenticated=true`; данные эта функция ограничивает текущей ролью/школой/классом.

## Что закрывает 0037

- Активное назначенное задание не выдаётся повторно после отзыва участия,
  отмены назначения, закрытия окна, окончания членства, паузы школы/класса
  или карантина контента.
- Простой перевод статуса через `expired → submitted` не создаёт завершение.
  Прогресс требует выданного item, принятой попытки и receipt транзакции.
- Исторический ошибочный `submitted` блокирует повтор старого start receipt
  и новую выдачу, а не превращается в завершённое задание. История не удаляется.
- Порядок блокировок start согласован с submit: операция перед authority.
- Принятый ранее ответ можно повторно подтвердить и просмотреть после отзыва
  доступа; повтор не создаёт второй результат/XP.

TS-код этого выпуска дополнительно возвращает `already-submitted`/`expired`
при повторе исходного старта; тот же operation ID никогда не выдаёт следующую задачу.

## После SQL

Применение SQL не развёртывает приложение, не создаёт школы/учителей и не
заполняет immutable банк. **Не включать `LEARNING_V1_ENABLED=true` только потому,
что миграции прошли.** Production-инвентаризация 05.10 обнаружила 0 RU/KK
versions и 0 approved versions; нужна отдельная загрузка принятого контента,
затем preview/production репетиция ученик → ответ → reload → отчёт учителя.

Старый legacy путь не является заменой доверенных результатов кабинета.
Откат приложения допустим только на код, совместимый с действующими grants;
не возвращать ученику права записи score/XP и не откатывать БД вслепую.
