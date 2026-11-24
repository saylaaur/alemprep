# AlemPrep

AlemPrep is a web app for Kazakhstan’s Unified National Testing exam (ҰБТ / ЕНТ). Students practise mathematics by topic in Kazakh or Russian, review worked explanations, and explore functions in an interactive graphing tool. Teachers can invite students to their class and follow participation and results.

[Open AlemPrep](https://alemprep.vercel.app) · [Local development](docs/development/setup.md) · [Architecture](docs/development/architecture.md)

## What it does

- **Practice by topic** in Kazakh (`/kk`) or Russian (`/ru`). The initial bilingual school release covered progressions, equations, powers, and radicals.
- **Explore graphs** with editable expressions and parameter controls. The built-in graphing tool runs without an external graphing API.
- **Save graded attempts on the server.** The browser submits answers, and retries can recover a saved result without counting it twice.
- **Explore supplementary learning content.** An optional release adds short physics videos, practice sets, and a library with spaced review.
- **Follow class activity.** Teachers use invitation links, see results for their own classes, and can download a CSV report.

## Run locally

Use Node.js **22–24**, npm, and Docker for local Supabase.

```sh
npm ci --legacy-peer-deps
npx supabase start
cp .env.example .env.local
npm run dev
```

Before opening [http://localhost:3000/kk](http://localhost:3000/kk), set the local Supabase URL and keys from `npx supabase status`. Configure Google OAuth if you want to sign in through the app. See the [setup and test guide](docs/development/setup.md) for the environment variables, callbacks, and browser tests.

## Repository layout

| Path | Contents |
| --- | --- |
| [app/](app/), [components/](components/) | Next.js routes and React UI |
| [lib/](lib/) | Grading, practice, graphing, school access, and reporting |
| [i18n/](i18n/), [messages/](messages/) | Kazakh and Russian routing and interface strings |
| [supabase/](supabase/) | PostgreSQL migrations and school operator SQL |
| [scripts/](scripts/) | Content preparation, release checks, and local test tooling |
| [tests/](tests/) | Database, migration, and browser integration tests |

The app uses TypeScript, Next.js, React, Tailwind CSS, and Supabase Auth and PostgreSQL. GitHub Actions runs type checking, lint, unit tests, a production build, database tests, browser tests, and secret scanning.

## Guides

- [School pilot](docs/product/school-pilot.md)
- [Content workflow](docs/operations/content.md)
- [Video lessons](docs/development/video-lessons.md) and [library rollout](docs/operations/books-and-reminders.md)
- [Releases and recovery](docs/operations/releases.md)
- [Project history](docs/project-history.md)
- [Security reporting](SECURITY.md)
