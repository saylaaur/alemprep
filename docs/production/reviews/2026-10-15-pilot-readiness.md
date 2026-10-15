# Pilot readiness evidence — 15 October 2026

## Decision

Ready to begin a controlled first-school pilot with a supervised first-pupil check and an initial group of 10–20. This does not certify 102 simultaneous users, a full ENT bank, human-reviewed Kazakh, or a completed school-network rehearsal.

The operational source of truth is [PILOT_LAUNCH.md](../../pilot/PILOT_LAUNCH.md). The four real classes, teacher account mapping, school/group IDs, backups, CSV and operator SQL remain in the private launch registry outside Git. The named team rehearsal is separate from the real school.

## Fresh hosted and browser evidence

- Four confirmed real Google teacher accounts signed in and are bound. Four independent authenticated SQL contexts expose exactly their own KK class and deny all other class reports.
- Read-only bank checker exits 0: 89 RU/89 KK families, four paired topics, no issues or warnings. The owner-approved AI-review exception remains; no human linguistic review is asserted.
- Hosted 0041 restrictive source guard is present; authenticated cannot UPDATE XP or is_admin. Production KK landing returns HTTP 200. No schema, grants, environment flags or runtime packages changed in this evidence pass.
- Team rehearsal: 2 joined participants, 17 accepted practice attempts, 6 KK/11 RU, 17 distinct sessions and session items, no missing matching learning.submit receipt. The 17/14 attempt-to-family distinction and 7/14 first score confirm repeats across locales do not become new first attempts.
- The real KK teacher browser displays the same 2 participants and 50%. CSV downloaded through the actual authenticated export route, parsed successfully, matches 17 attempts/7 of 14/50%, and includes snapshot ID, UTC asOf, Asia/Almaty and teacher-self-study-v1.
- Owner explicitly confirmed the answered KK task remains answered after a page reload. This is user-observed evidence, not an agent-executed pupil reload. Teacher browser reload and report download were observed by the agent.
- Test teacher's direct URL to a real school class returns 404, while their own report opens. Neither team rehearsal pupil has active membership in the real school; exclude this test school from official reporting.

These are point-in-time numbers. The snapshot is retained privately; later activity can increase counts. Global site signups and attempts are not school pilot participation.

## Fresh backup and recovery

Official CLI dump saved current roles, public schema, managed auth/storage schema and COPY data, with SHA256 checks. Schemas match the previously restored schema bytes. Fresh data restored only inside the existing network=none Supabase Postgres 17 container with no published ports. Counts match all 68 COPY tables before and after the rolled-back Auth-trigger/issuing/grading/idempotent-replay/scoped-teacher-report probe. The recovery container is stopped.

Storage object count is zero at the snapshot. A logical database recovery does not restore cloud settings, Vercel environment, OAuth credentials or arbitrary external files. No scheduled backup, offsite replication, purchase or new SLA is claimed. The original manual migration ledger is absent, not silently reconstructed.

## Release and test scope

Runtime release remains PR #41 code, `badbf9b98c780a851b6921f3d84f49bcca302902`. Full matrix for that code was verified 11.10: 1177 unit, 163 DB, 6 migration-path, 49 browser cases and green Verify/Gitleaks/Vercel. Do not present those historical numbers as a new 15.10 test run.

This change updates launch documentation only. Today's SQL, CSV, backup and browser checks above are fresh. Local source gates and PR CI are reported in the publishing PR. Deferred KaTeX/toolchain dependency findings remain recorded in the 11.10 report; this pass does not fix them or claim audit-clean.

## Remaining launch actions

1. Organizer confirms first-wave time, devices/connectivity and support contact.
2. Teachers use `/kk/teacher` and separate invitations per class. Pupils join before practice; pre-membership answers are not retroactively included.
3. One actual school pupil signs in, joins, answers, reloads and appears once in the teacher report on the school's device/network. Record PASS/FAIL privately; this is day 0 of launch.
4. Expand to 10–20, then by class. Observe accepted attempts and error reports, retain private daily snapshots in pilot activity days, and expand content by reviewed batches.

Google Audience of the exact configured client is not inferred from an unrelated Cloud project. Actual teacher logins are confirmed; the first school pupil login remains an explicit field check. No outgoing messages or pupil data publication occurred during this pass.
