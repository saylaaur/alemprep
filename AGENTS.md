# Working on AlemPrep

Use the [development guide](docs/development/setup.md) for setup and checks and the [architecture guide](docs/development/architecture.md) to locate code.

- Keep changes within the requested scope. Use the existing Next.js App Router structure and TypeScript conventions.
- Update both `messages/kk.json` and `messages/ru.json` when changing localised copy.
- Add schema changes in a new migration. Keep existing migrations intact.
- Use the local Supabase stack and synthetic data for database and browser tests.
- Keep environment files, credentials, identifiable school records, and restricted source materials out of Git.
