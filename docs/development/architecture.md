# Architecture

AlemPrep runs as one Next.js application backed by Supabase Auth and PostgreSQL. Routes under `/kk` and `/ru` share components and domain logic. The `next-intl` route configuration selects interface strings, and published content versions determine the language of the questions.

| Area | Code | Responsibility |
| --- | --- | --- |
| Identity | [Auth callback](../../app/auth/callback/route.ts), [Supabase clients](../../lib/supabase/), [proxy](../../proxy.ts) | Google OAuth, sessions, and protected routes |
| Learning | [Learning service](../../lib/learning/) | Issue a versioned question, grade answers on the server, and load saved results |
| Class access | [Pilot service](../../lib/pilot/), [database migrations](../../supabase/migrations/) | School roles, class membership, and invitation redemption |
| Teacher reports | [Teacher exports](../../lib/teacher/), [report queries](../../lib/supabase/queries/teacher.ts) | Class-scoped activity, first-attempt results, and CSV |
| Content | [Content tooling](../../scripts/content/), [import validation](../../scripts/lib/reviewed-content-import.ts) | Draft, validate, review, and publish versioned content |
| Graphs | [Graph engine](../../lib/graph/), [Canvas UI](../../components/graph/) | Parse supported expressions and draw interactive plots |

With trusted practice enabled, the server issues questions from approved versions and supplies the browser with the fields needed to answer them. On submission, it resolves the actor from the signed-in session, validates the answers against the issued items, and grades them using the saved versions. The database commits results and rewards in one transaction. A repeated operation can return its receipt without creating another attempt.

The teacher report uses confirmed attempts made after joining the class. The first-attempt metrics group language and revision variants by problem family. The teacher may see their own class only. Database grants and row-level security enforce access to the underlying records. The CSV endpoint checks access on each export and returns a private response.

The native graphing tool runs in the browser. Optional Desmos integration and AI assistance have their own configuration. Core practice and class reporting do not require either service.
