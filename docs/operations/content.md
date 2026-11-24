# Content workflow

The content pipeline prepares mathematics questions and translations for publication. A published version carries the question body, grading fields, explanation, language, and family identifier. A translation should preserve the original mathematical meaning and point back to the same family.

| Task | Command |
| --- | --- |
| Check local question files | `npm run audit:content -- --input /path/to/verified --output /path/to/audit.md` |
| Inspect language coverage | `npm run audit:kk -- --output /path/to/coverage.md --manifest /path/to/sample.json` |
| Export sources for translation | `npm run content:export-sources -- --topics progressions --out-dir /path/to/export` |
| Import reviewed content | `npm run content:reviewed -- --mode import --file /path/to/batch.json` |

The reviewed content command supports `import`, `import-kk`, `accept`, and `export`. Import and acceptance run as previews unless you explicitly pass `--apply`. For a hosted apply, specify the matching `--confirm-project`. Kazakh imports require the matching Russian source artifact and a review reference. Consult the [operator CLI](../../scripts/content/import-reviewed-content.ts) and [argument parser](../../scripts/lib/reviewed-content-import.ts) for the current artifact formats.

Before publishing any batch, verify the statement, mathematical answer, explanation, translation, and material rights. Record who reviewed the exact versions and what they checked. Keep input screenshots, unreleased question files, and generated batches outside Git.
