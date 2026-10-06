# Pilot: independent practice, teacher overview and graphs

Owner approved this scope on 4 October: pupils choose topics independently;
teachers monitor their own groups. Mandatory lesson assignment is deferred.
This supersedes the assignment-only UI/cutover in the 2 October plan.

1. Add an authenticated, group-scoped read RPC and teacher pages. Count only
   server-accepted practice facts since the current pupil's group/school joining.
   Show first attempt per question family separately from repeated practice.
   Add invitations and pupil joining using existing authenticated RPCs.
2. Add a separate visualization workspace: linear/quadratic controls, an offline
   graph and table. Desmos is optional, lazy, and requires an operator-enabled
   key; failed/missing SDK must leave the local visualization usable.
3. Run DB access/metric tests, unit tests, typecheck, lint, build and browser QA.
   Document release requirements; do not equate local implementation with deploy.

Keep 0034 and all previous migrations unchanged. New report migration is 0036.
Existing assignment-start review defects remain outstanding; do not expose that
flow or imply it is accepted. KK content acceptance/import is a separate task.
No production database writes, paid APIs, or new infrastructure for this scope.
