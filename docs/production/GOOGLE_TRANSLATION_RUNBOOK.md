# Google NMT drafts — operator runbook

This command produces private machine drafts only. It never inserts rows in Supabase, changes `is_published`, or makes an in-browser translation feature. A Kazakh and subject-matter reviewer must accept the resulting pairs before C00c.

## Before any paid request

1. Review the latest private C00a/C00b dry-run artifact. Resolve every `manualReview` and `staleSourceIds` item; do not quietly send it anyway.
2. Confirm Google Cloud billing and the current price in the [official pricing page](https://cloud.google.com/products/translate/pricing). NMT is billed per input Unicode code point, including placeholders and whitespace; the code reserves up to three attempts for each request.
3. Create a least-privilege operator identity for Cloud Translation Advanced v3 and export a short-lived access token in the shell. The v3 API uses OAuth/ADC, not an API key; do not place credentials in `.env.local`, Git, `NEXT_PUBLIC_*`, Vercel, or a browser.

```sh
export GOOGLE_TRANSLATE_PROJECT_ID='your-google-project-id'
export GOOGLE_TRANSLATE_ACCESS_TOKEN="$(gcloud auth print-access-token)"
```

Google documents the v3 `translateText` endpoint and bearer-token flow in its [text-translation guide](https://docs.cloud.google.com/translate/docs/translate-text) and [authentication guide](https://docs.cloud.google.com/translate/docs/authentication).

## Run

Always start with the default read-only dry run. Both the manifest and output are private files outside the repository.

```sh
npm run content:translate-google -- \
  --manifest /private/path/alemprep-kk-source-sample.json \
  --output /private/path/alemprep-kk-google-dryrun.json
```

To allow a paid call, the operator must explicitly add all three gates. `max-chars` and `max-usd` cover worst-case three attempts, not only the first request. Select limits from the preceding dry-run, then add room only if the operator has approved that amount.

```sh
npm run content:translate-google -- \
  --manifest /private/path/alemprep-kk-source-sample.json \
  --output /private/path/alemprep-kk-google-drafts.json \
  --checkpoint /private/path/alemprep-kk-google.checkpoint.json \
  --execute --max-chars 20000 --max-usd 0.40
```

The script sends at most two entities concurrently, chunks only below its conservative request limits, retries transient timeouts/429/5xx at most three times, and records `sent` before each request. A lingering `sent` means it may have been billed: inspect it and make an explicit resume decision rather than rerunning blindly. A quota-exhausted 429 stops without retry.

## After a run

Keep the private draft and checkpoint outside Git. Record initial/max characters, actual retries, provider errors, and reviewer time. Check every rejected output; a missing or altered placeholder, structure, formula, number, URL, option ID, matching relationship, or context is rejected. Human review checks meaning, inequalities/negation, terminology, correct answers and media. C00c, not this script, owns creation of KK contexts and any publication.
