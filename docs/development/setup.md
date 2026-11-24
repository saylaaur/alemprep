# Local development

## Install and run

Use Node.js 22–24 and npm. GitHub Actions uses Node.js 22. Start Docker before running the local Supabase CLI.

```sh
npm ci --legacy-peer-deps
npx supabase start
npx supabase status
cp .env.example .env.local
```

Set the following in `.env.local`. Use the values from your local stack or a dedicated development project.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Local API URL, normally `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Local anon key |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000`, or the local origin you actually open |
| `SUPABASE_SERVICE_ROLE_KEY` | Local server-only key for trusted grading and operations |
| `ANTHROPIC_API_KEY` | Server-only key if you want to test the optional AI assistant or use the content tools |

Run `npm run dev` and open [localhost:3000](http://localhost:3000). Enable the Google provider on the development Supabase stack and allow the app’s exact `/auth/callback` URL to exercise Google sign-in. The OAuth client uses the callback URL provided by your Supabase environment. The automated tests create synthetic accounts and do not need Google credentials.

Set `LEARNING_V1_ENABLED=true` to exercise server-graded practice. That flow needs approved question versions in the target database. Use `PILOT_TOPICS_ONLY=true` with it to match the limited school release.

## Checks

Run routine checks from the repo root:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The build loads fonts through `next/font` and needs network access to fetch them for a fresh checkout. For integration checks, keep the local Supabase stack running:

```sh
npm run test:db
npm run test:db:migration
npx playwright install chromium
CI=1 npm run test:e2e
CI=1 LEARNING_V1_ENABLED=true npm run test:e2e
CI=1 LEARNING_V1_ENABLED=true PILOT_TOPICS_ONLY=true npm run test:e2e -- tests/e2e/pilot-topics-only.spec.ts
```

The test scripts enforce a local loopback database. The Playwright harness starts its own app server on port 3001. See the [Verify workflow](../../.github/workflows/verify.yml) for the complete CI setup.

## Editing

- Routes use Next.js App Router. Interface strings live in [messages/](../../messages/). Keep both locales in sync.
- Add a migration under [supabase/migrations/](../../supabase/migrations/) for a database change and update [types/db.ts](../../types/db.ts) when necessary.
- Co-locate unit tests with the modules they exercise. Keep integration scenarios in [tests/](../../tests/).
