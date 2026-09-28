# L03a / A2 — защищённый экран практики: implementation packet

Статус: подготовлен 28.09.2026. Реализация начинается только после успешного CI reviewed L02 candidate. Этот packet конкретизирует A2 из `2026-09-27-first-class-rebaseline.md`; он не добавляет school scope, отчётность, казахский контент, Desmos или cutover legacy writes.

## Цель и границы

Для одного topic-practice создаётся и завершается session через `lib/learning`. До завершения браузер получает только `PublicQuestion`: prompt/options/context без `correct`, `gradingBody` и explanation. Браузер не считает score/XP и не определяет correctness. После одного submit owner получает receipt, затем review с explanation/grading body.

Trusted UX сохраняет тренировку по одной задаче: ответ → серверная проверка → объяснение → следующая задача. `selectPracticeSession` уже выдаёт ровно один item/session (`lib/content/learning-catalog.ts`), и исходная карточка L03a прямо требует этот контракт. Атомарный commit фиксирует всю сессию из одного item. Прежнее утверждение этого packet о необходимости сдавать целый урок было ошибкой; новый RPC не нужен. Последовательность фиксированной школьной программы добавляется в A3, а не имитируется случайной выборкой всей темы.

Пока `LEARNING_V1_ENABLED` отсутствует или false, остаётся legacy UI для совместимого публичного release. При true topic page вызывает только trusted actions; ошибка trusted path показывает retry/status и никогда не возвращает legacy questions/actions. Этот flag — временный release mechanism, не pilot access control и не разрешение запускать учеников до L04/A3–A6.

## Contract и data flow

```text
topic route (flag=true)
  -> LearningPracticeView
  -> server action: startLearning({ operationId, locale, mode:'practice', topicSlug })
  -> StartedLearning(public items only)
  -> browser drafts + stable sessionStorage envelope
  -> server action: submitLearning({ stable operationId, sessionId, answers:[one issued item] })
  -> Receipt
  -> server action: getLearningReview(sessionId)
  -> review (owner-only explanation and grading body)
```

`operationId` для start создаётся до первого request и сохраняется в `sessionStorage`; повтор start использует тот же input. Для submit создаётся отдельный UUID в момент нажатия «Проверить» и сохраняется вместе с неизменяемым payload. Если ответ сети неизвестен, интерфейс блокирует изменение ответов, сообщает «подтверждение не получено» и повторяет ровно этот payload. Новый start создаётся по явному намерению «Следующая задача» после подтверждения текущего результата; таймаут не создаёт новую операцию. Explicit skip отправляет `answer:null` и тоже ждёт серверного подтверждения.

Черновик хранит schema version, owner, route locale/topic, start envelope, sessionId, единственный item ID, local answer, показанное время и pending submit envelope. Он не хранит answer keys, score или explanation. Перед чтением/отображением черновика сравнить owner с текущим server-authenticated пользователем; при смене account/logout удалить старое сохранение уже в A2. Owner в storage служит только разделению локальных черновиков, не передаётся как authority в actions. При reload UI сначала вызывает `getLearningState(sessionId)`; server response — единственный источник активного item. При `not-found`, `unauthenticated`, несовпадении IDs, expired или cancelled черновик очищается. При submitted state UI запрашивает review вместо повторной сдачи. Для восстановления prompt после submitted использовать сохранённый start envelope и owner-scoped start replay: state содержит только receipt, review не гарантирует public context. Ни один запрос не пересэмплирует контент при replay. Private данные не помещать в общий server cache.

## Изменения по файлам

1. Новый server-action bridge `lib/supabase/learning-actions.ts` с `'use server'`. Экспортирует `startTopicLearning`, `readLearningState`, `submitTopicLearning`, `readLearningReview`, делегируя в `lib/learning/{start,state,submit,review}`. Серверный flag проверяется в каждом action, не только в route. Start bridge принимает только practice selector, не другие modes. Bridge не принимает actor, score, version ID, correct answer, grading body или arbitrary plan. Exceptions нормализуются в enum/requestId; revalidation после commit не превращает принятый ответ в ложный failure.
2. Новый `lib/learning/pending.ts` и tests. Строго валидирует JSON storage envelope, UUID, bounded answers/timers and route/session association. Экспортирует pure create/restore/clear helpers; `sessionStorage` остаётся тонким adapter в client component.
3. Новый `components/practice/LearningPracticeView.tsx` и `SaveStatus.tsx`. Отдельный trusted flow, чтобы legacy `PracticeView` не получить случайный fallback. Состояния: loading start, active draft, submitting/unknown delivery, receipt loading, review, terminal error. Только review render получает correct/explanation.
4. Обобщить `QuestionAnswerInput` и `QuestionStem` на публичную render shape `{type, body}`. Они не должны требовать `Question`/`QuestionBody` с `correct`. Отдельно проверить TypeScript, что `PublicQuestionBody` соответствует этим props.
5. Изменить `app/[locale]/(app)/practice/topic/[topic]/page.tsx`: при true получать только topic metadata, а не `getQuestionsForTopic`; рендерить `LearningPracticeView` с locale/topicSlug/name. При false оставить current `PracticeView`. Нужен server-only typed reader metadata или существующий query без body. Не отправлять `questions`, `contexts` или legacy body через props на trusted ветке.
6. Добавить server-only config parser `lib/learning/feature-flag.ts` с default false, accepting only exact `'true'`; covered unit test. Проверять его на server route, не через `NEXT_PUBLIC_*`.
7. Добавить RU/KK parity strings: start/retry, saving, unknown delivery, submit, expired, no content, review, completed. Не оставлять русские hardcodes в новом UI; legacy translation debt не расширять.
8. Дополнить локальный E2E launcher `scripts/start-local-e2e-server.mjs`: после проверки loopback target передать `SERVICE_ROLE_KEY` из local Supabase status как `SUPABASE_SERVICE_ROLE_KEY` только серверному процессу, без печати ключа. Сейчас launcher передаёт только anon credentials, поэтому новые production factories иначе не заработают в browser tests. Trusted/legacy проверки запускать с раздельным явно заданным флагом и без reuse чужого dev-server с другим env. Hosted credentials не использовать.

## Test matrix and acceptance

- RED/GREEN unit: pending envelope rejects unknown fields, wrong owner/route/session and invalid UUID; preserves exactly one frozen submit payload across serialization. Account switch/logout clears pending before any answer is rendered or retried.
- Server-action tests: wrapper passes only supported public input; user identity remains server-derived; raw error messages do not reach UI.
- Component/browser tests: initial RSC/action payload and storage contain no correct/explanation/private marker; trusted UI does not import `checkAnswer`. Submit uses the one issued item ID, `null` only for an explicit skip. Public input/stem components accept public DTO without fake grading fields.
- E2E with `LEARNING_V1_ENABLED=true`: start → draft → reload → submit → review; network retry repeats one submit operation; double click does not make a second client request; expired/foreign session gives no review. Smoke false confirms current legacy route remains reachable while rollout is staged.
- DB evidence remains L02-owned: one accepted receipt/facts under duplicate operation, owner isolation and browser-role RPC denial. Re-run relevant DB files after action wiring; do not infer them from component tests.
- `npm run typecheck`, `npm run lint`, `npm test`, sequential `npm run test:db`, `npm run test:db:migration`, CI standard build and trusted E2E are required before A2 is marked complete.

## Decisions and non-goals

- The flag enables the trusted topic-practice path only. Other modes (`mock_exam`, `diagnostic`, `weekly`) still have legacy routes and are not protected by this packet; restrict them server-side before the student pilot under A3/A4. Do not claim global protection from enabling the practice flag.
- The in-question AI panel is absent from trusted practice until its data-flow/privacy contract is reviewed. It must never be given grading body or answer key before submit.
- No direct `recordAttempt`, `finishExamSession`, `createExamSession` call from trusted component. L04 removes or closes these bypasses after compatible roll-out evidence.
- A real school lesson needs A3 participants/program, A4 cutover, A5 report and A6 rehearsal after this work. L03a is a necessary UI bridge, not pilot readiness.
