# L03a / A2 — защищённый экран практики: implementation packet

Статус: подготовлен 28.09.2026. Реализация начинается только после успешного CI reviewed L02 candidate. Этот packet конкретизирует A2 из `2026-09-27-first-class-rebaseline.md`; он не добавляет school scope, отчётность, казахский контент, Desmos или cutover legacy writes.

## Цель и границы

Для одного topic-practice создаётся и завершается session через `lib/learning`. До завершения браузер получает только `PublicQuestion`: prompt/options/context без `correct`, `gradingBody` и explanation. Браузер не считает score/XP и не определяет correctness. После одного submit owner получает receipt, затем review с explanation/grading body.

Первый trusted UX — урок из всей выданной сессии, а не legacy «проверить одну задачу». Ученик может менять ответы до финальной отправки, затем видит review каждой задачи. Это необходимо, потому что `commit_learning_v1` принимает и фиксирует весь issued denominator атомарно. Не создавать новый per-question RPC или подменять проверку локальным `checkAnswer`.

Пока `LEARNING_V1_ENABLED` отсутствует или false, остаётся legacy UI для совместимого публичного release. При true topic page вызывает только trusted actions; ошибка trusted path показывает retry/status и никогда не возвращает legacy questions/actions. Этот flag — временный release mechanism, не pilot access control и не разрешение запускать учеников до L04/A3–A6.

## Contract и data flow

```text
topic route (flag=true)
  -> LearningPracticeView
  -> server action: startLearning({ operationId, locale, mode:'practice', topicSlug })
  -> StartedLearning(public items only)
  -> browser drafts + stable sessionStorage envelope
  -> server action: submitLearning({ stable operationId, sessionId, all item answers })
  -> Receipt
  -> server action: getLearningReview(sessionId)
  -> review (owner-only explanation and grading body)
```

`operationId` для start создаётся до первого request и сохраняется в `sessionStorage`; повтор start использует тот же input. Для submit создаётся отдельный UUID в момент нажатия «Завершить» и сохраняется вместе с неизменяемым payload. Если ответ сети неизвестен, интерфейс блокирует изменение ответов, сообщает «подтверждение не получено» и повторяет ровно этот payload. Новый submit operation создаётся только после явного успешного/terminal outcome, не по таймауту.

Черновик хранит route locale/topic, sessionId, ordered item IDs, local answers, shown-at timestamps и pending submit envelope. Он не хранит answer keys, score или explanation. При reload UI сначала вызывает `getLearningState(sessionId)`; server response — единственный источник активных items. При `not-found`, `unauthenticated`, несовпадении IDs или terminal state черновик очищается. При submitted state UI запрашивает review вместо повторной сдачи. A4 дополнит очистку при смене account/logout и policy no-store; A2 не называет browser storage источником прав.

## Изменения по файлам

1. Новый server-action bridge `lib/supabase/learning-actions.ts` с `'use server'`. Экспортирует ровно `startTopicLearning`, `readLearningState`, `submitTopicLearning`, `readLearningReview`, делегируя в `lib/learning/{start,state,submit,review}`. Он не принимает actor, score, version ID, correct answer, grading body или arbitrary plan.
2. Новый `lib/learning/pending.ts` и tests. Строго валидирует JSON storage envelope, UUID, bounded answers/timers and route/session association. Экспортирует pure create/restore/clear helpers; `sessionStorage` остаётся тонким adapter в client component.
3. Новый `components/practice/LearningPracticeView.tsx` и `SaveStatus.tsx`. Отдельный trusted flow, чтобы legacy `PracticeView` не получить случайный fallback. Состояния: loading start, active draft, submitting/unknown delivery, receipt loading, review, terminal error. Только review render получает correct/explanation.
4. Обобщить `QuestionAnswerInput` и `QuestionStem` на публичную render shape `{type, body}`. Они не должны требовать `Question`/`QuestionBody` с `correct`. Отдельно проверить TypeScript, что `PublicQuestionBody` соответствует этим props.
5. Изменить `app/[locale]/(app)/practice/topic/[topic]/page.tsx`: при true получать только topic metadata, а не `getQuestionsForTopic`; рендерить `LearningPracticeView` с locale/topicSlug/name. При false оставить current `PracticeView`. Нужен server-only typed reader metadata или существующий query без body. Не отправлять `questions`, `contexts` или legacy body через props на trusted ветке.
6. Добавить server-only config parser `lib/learning/feature-flag.ts` с default false, accepting only exact `'true'`; covered unit test. Проверять его на server route, не через `NEXT_PUBLIC_*`.
7. Добавить RU/KK parity strings: start/retry, saving, unknown delivery, submit, expired, no content, review, completed. Не оставлять русские hardcodes в новом UI; legacy translation debt не расширять.

## Test matrix and acceptance

- RED/GREEN unit: pending envelope rejects unknown fields, wrong route/session and invalid UUID; preserves exactly one frozen submit payload across serialization.
- Server-action tests: wrapper passes only supported public input; user identity remains server-derived; raw error messages do not reach UI.
- Component tests: before review, rendered public props have no correct/explanation and no import/use of `checkAnswer`; final submit uses all issued item IDs, with `null` for skips.
- E2E with `LEARNING_V1_ENABLED=true`: start → draft → reload → submit → review; network retry repeats one submit operation; double click does not make a second client request; expired/foreign session gives no review. Smoke false confirms current legacy route remains reachable while rollout is staged.
- DB evidence remains L02-owned: one accepted receipt/facts under duplicate operation, owner isolation and browser-role RPC denial. Re-run relevant DB files after action wiring; do not infer them from component tests.
- `npm run typecheck`, `npm run lint`, `npm test`, sequential `npm run test:db`, `npm run test:db:migration`, CI standard build and trusted E2E are required before A2 is marked complete.

## Decisions and non-goals

- Multiple existing modes (`mock_exam`, `diagnostic`, `weekly`) remain on legacy routes in A2. Exposing them under `LEARNING_V1_ENABLED=true` is postponed until each has a public browser path and test suite; no partial protected/legacy mixture.
- The in-question AI panel is absent from trusted practice until its data-flow/privacy contract is reviewed. It must never be given grading body or answer key before submit.
- No direct `recordAttempt`, `finishExamSession`, `createExamSession` call from trusted component. L04 removes or closes these bypasses after compatible roll-out evidence.
- A real school lesson needs A3 participants/program, A4 cutover, A5 report and A6 rehearsal after this work. L03a is a necessary UI bridge, not pilot readiness.
