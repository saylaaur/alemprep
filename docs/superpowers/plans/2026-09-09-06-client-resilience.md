# 06 — Client resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Слабая сеть и общий школьный компьютер не теряют подтверждённые результаты и не смешивают учеников.
**Architecture:** Клиентский draft с operation ID, повтор той же операции и повторное чтение server receipt; no-store личных страниц, очистка локального состояния при выходе.
**Tech Stack:** React, Web Storage/BroadcastChannel, Next.js, Vitest/Playwright.
**Spec:** [архитектура](../specs/2026-09-09-production-pilot-architecture.md), §10.

## Global Constraints

- Подтверждённый результат не зависит от localStorage, клиентского времени или скрытой кнопки.
- Существующие design tokens, темы и согласованный дизайн визуализации сохраняются.
- RU/KK: ключи сообщений в паритете, контент пилота принят человеком по математике и казахскому языку.

## U01 — Pending/retry и явное подтверждение

**Files:** create `lib/learning/{pending,pending.test}.ts`, `components/practice/SaveStatus.tsx`, `tests/e2e/save-retry.spec.ts`; modify `lib/exam-storage.ts`, все четыре practice views и `messages/{ru,kk}.json`.
**Consumes:** L03 SubmitInput/Receipt/error enum.
**Produces:** `PendingSubmission={v:2;userId:string;createdAt:number;input:SubmitInput;state:'draft'|'pending'}`; `readPending(userId:string,storage:Storage):PendingSubmission|null`, `writePending(pending,storage):boolean`, `clearPending(userId,storage):void`; server result не хранится как authoritative.

- [ ] Tests null/corrupt/oversized JSON, другой user, TTL>24h, changed operation payload, Storage throws/quota exceeded. Namespace `alemprep:pending:v2:<userId>:<sessionId>`. Старое SavedExam с embedded answers/correct не использовать: очистить legacy keys и предложить fresh server resume.
- [ ] State machine draft→pending→confirmed либо actionable error. Generate operationId один раз при freeze submit. При сетевой неопределённости текст «Подтверждение пока не получено», не «не сохранилось навсегда» и не success. Менять отправленный answer до outcome нельзя.
- [ ] Retry schedule1/2/4/8/16s+jitter; online event не создаёт параллельные loops; AbortController на unmount. 401 — login/retry только same user; forbidden/expired/invalid/conflict — stop, не endless retry. RetryAfter учитывается. Timeout после commit возвращает тот же receipt без нового XP.
- [ ] Browser test отсоединяет HTTP response **после** DB commit (test interception на стенде), затем повторяет stable operation; DB attempts/rewards/audit равны одному submit. Отдельно обрыв до commit → pending → восстановление сети → один результат. Reload до ответа использует draft+server session, не создаёт session снова.
- [ ] При storage недоступен честно показать, что черновик не переживёт закрытие вкладки; до закрытия работает memory retry. Practice/diagnostic/weekly/exam дают одинаковые состояния. Typecheck/lint/unit/DB/build/E2E; commit U01.

## U02 — Logout, кэш и общие устройства

**Files:** modify `lib/supabase/{auth-actions,middleware}.ts`, `proxy.ts`, `components/layout/{AppShell,Sidebar}.tsx`, `lib/exam-storage.ts`, `app/auth/callback/route.ts`; create `lib/learning/session-boundary.ts`, `tests/e2e/shared-device.spec.ts`, `tests/e2e/private-cache.spec.ts`.
**Consumes:** U01 state и S03 teacher routes.
**Produces:** no-store/private и смена auth context на всех личных поверхностях; server session остаётся final authority.

- [ ] Стандарт shared-device — sessionStorage; personal opt-in хранит draft localStorage≤24h. Logout сначала очищает AlemPrep drafts обоих storage, сообщает другим вкладкам, затем signOut; если network signOut не подтверждён — явный статус и server reauth, не показывать «вы вышли» с действующим личным экраном.
- [ ] На auth change/pageshow persisted перепроверить пользователя и скрыть приватный cached content до проверки. BroadcastChannel только сообщает о смене, не передаёт JWT/ответы. StudentA logout → back/forward → studentB login не видит имя/ответы/учительскую roster A.
- [ ] Проверить middleware exclusions: новые api routes выполняют свою auth, teacher/assignments закрыты независимо от proxy; locale boundary `/ru` не совпадает с произвольным `/rubbish`. Достаточно server layout и action auth даже если middleware обходится нестандартным URL.
- [ ] E2E две браузерные context A/B + две вкладки A, HTML/RSC/action/redirect; inspect cache headers и отсутствие cross-user marker в ответе. Server fetch/request cache не делит пользовательские данные, no unsafe global memo. Не добавлять `force-cache` profile/roster и не решать проблему одним cache-busting query parameter.
- [ ] Проверить OAuth next/locale, open redirect, повтор callback, истечение cookies, revoked account. Не передавать raw Supabase errors. Typecheck/lint/unit/DB/build/E2E; commit U02.

## U03 — Устройства, язык и доступность

**Files:** existing app/practice/teacher/content components по найденным дефектам; `tests/e2e/accessibility.spec.ts`, `docs/pilot/DEVICE_ACCEPTANCE.md`, `messages/{ru,kk}.json`.
**Consumes:** C02 content fixtures, U02 flow.
**Produces:** проверенный маршрут от login до teacher report на принятом наборе устройств.

- [ ] Test matrix: 360×800 Android-like viewport, iPhone Safari/WebKit, laptop Chromium; dark/light, RU/KK. Никакого body horizontal scroll; table overflow локальный. Полные KK подписи не обрезают primary action.
- [ ] Keyboard: видимый focus, логичный порядок, все формы с label/error association, modal trap/escape, live region save status, touch target около44px. Формулы/графики имеют текстовый смысл и не только цветовой статус. Проверить reduced-motion; approved theme не менять глобально.
- [ ] Slow network профиль: latency400ms, down1Mbps/up256Kbps и packet disconnect на submit; это synthetic acceptance profile, потом фактическая школьная сеть. Desmos/AI blocked не ломают задание. Повторить на настоящем школьном устройстве до G5.
- [ ] `npm run test:e2e -- tests/e2e/accessibility.spec.ts tests/e2e/shared-device.spec.ts` + typecheck/lint/build. Артефакты только synthetic; отдельная реальная школа даёт чеклист без детских скриншотов. Commit U03.
