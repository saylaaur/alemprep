# Visualization patch review — 10.10.2026

## Follow-up after corrections — ACCEPT in reviewed pilot scope

Original review below is historical evidence for cdcde836. Applied owner-supplied correction cfa05f68. All original math reproductions pass; the chosen minimum updates after a slider change in RU/KK browser tests.

Independent follow-up found two additional cases, both now resolved: adaptive bounded derivative refinement keeps smooth1/x, log and sqrt near domain edges accurate, while corners/holes stay undefined. Sampled x-only equations/inequalities using named functions or nonlinear domain boundaries explicitly return unsupported instead of a false solution. This is a deliberate pilot limit; ordinary callable curves, y>f(x), simple0<x<1 restrictions and direct restricted x=c remain available.

Seven further regressions were observed RED7failed/158passed and then GREEN165focused. Final full unit1177PASS, build/types/lintPASS; requested graph/trusted browser suite plus6 RU/KK graph regressions:25PASS on the final code. Independent reviewer re-probed the additional fixes and reports no remaining blockers in the reviewed scope. PR/CI/rollout are recorded separately after execution.

No packages, applied migrations, hosted data or environment changes. Design remains the supplied canvas/snapping upgrade.

Original verdict: CHANGES REQUIRED. Design can be retained; mathematical/input correctness blocks publishing the supplied patch.

Base: main740560110b89a87ed8882e9029bc0930304e1946. Candidate: cdcde836b9204ec016cabc2ab6099be82e4373c2 on codex/graph-desmos. Source: owner-supplied alemprep-viz-2026-10-09.zip. Archive instructions are context; no hosted push/merge/deploy or SQL executed for this review. Applied only in an existing isolated worktree. Production remains the accepted pilot release.

## Reproduced findings

| Severity | Location | Input and actual result | Required behavior |
| --- | --- | --- | --- |
| P1 | lib/graph/user-input.ts:83 | f(x)=f'(x): a single evaluation at1 takes342ms on this Mac (independent reviewer345ms). Depth12 permits exponentially branching evaluation; graph fitting samples thousands synchronously. | Reject direct/indirect cyclic definitions before evaluation; use a shared evaluation budget. Never run the full dangerous graph fit to demonstrate the freeze. |
| P2 | lib/graph/user-input.ts:73 | f(x)=x^2 {0<x<3}; g(x)=f(x): f's own plotted branch at4 is NaN, g's branch returns16. | Callable definitions must preserve their domain conditions, including transformed arguments. |
| P2 | lib/graph/user-input.ts:107 | x^2 {a<x<b}: params=[], no sliders; empty scope makes all values undefined. | Merge restriction variables into parameters and preserve defaults/scopes. |
| P2 | lib/graph/user-input.ts:201 | x^2<1 {0<x<1} and x>0 {0<x<1}: strips=[], although interval(0,1) is nonempty. | Resolve restriction boundaries; do not sample a narrow domain away on a fixed2000-unit window. |
| P2 | lib/graph/parse.ts:361 | f=abs(x): f'(0)=0 and f''(0)=2000. f=sin(x)/x: f'(0)=0 although f(0) is undefined. | Check source domain and agreement/convergence of one-sided derivatives; do not invent a finite derivative at a cusp/hole. |
| P2 | lib/graph/user-input.ts:150 | x>2: strips=(2,1000), fake boundary at1000, no shading above1000. GraphTool does not supply the visible window. | Viewport-aware intervals or explicit unbounded endpoints; pan/zoom must not change mathematical solutions. |
| P2 | lib/graph/user-input.ts:232 | x=3 {x<0}: verticals=[3], despite contradictory domain. | Apply restriction in the direct vertical equation shortcut. |

Browser-confirmed P2: components/graph/GraphCanvas.tsx:259–272 reads a selected marker only when its index changes. Select Minimum(1,−4) for x²−2x−3, then set a=2. The new chip says Minimum(0.5,−3.5), but the canvas and live announcement retain Minimum(1,−4), off the new curve. Recompute/clear selection when marker coordinates change, including sliders and viewport changes. Screenshot: /private/tmp/alemprep-viz-stale-marker.png.

Lower priority: x=x produces50 arbitrary vertical lines near−1000; handle identity or explicitly report unsupported instead of inventing discrete roots (user-input.ts:238).

## Verification

- Clean accepted baseline1108unit PASS.
- Supplied patch1153unit PASS; typecheck/lint/build PASS.
- Independent mathematical review plus parent read-only probes reproduced the findings above; no eval/new package/schema/env changes.
- Initial E2E launch blocked because Docker engine was stopped. Docker Desktop and the isolated loopback Supabase were started, then actual browser scenarios were rerun. Initial targeted run:18PASS/3FAIL. One teacher dashboard startup/read failure passed the focused rerun; one review click was obscured by the toolbar and the dialog selector was ambiguous, so those test probes were corrected, not product code. Final mobile probe: snap(3,3), table, fullscreen/Escape and no page overflow PASS; selected-marker slider regression FAIL twice. Existing19 targeted scenarios passed across the initial/focused runs; not claiming a single wholly green E2E run. Final probe evidence: /private/tmp/alemprep-viz-e2e-probes-final.log (1PASS/1FAIL).
- Physical-phone pinch/inertia and hosted authenticated flow are not certified by these local tests.

## Fix order / handoff

1. Freeze prevention: parse named-function dependencies including derivative calls and reject cycles. Cover direct, indirect and derivative cycles with bounded-work tests.
2. Correct derivatives/domain handling: source must exist at evaluation point; undefined cusp/hole derivatives stay undefined. Keep ordinary polynomial/trig derivatives accurate.
3. Preserve definition restrictions and collect condition parameters; test f/g transforms and sliders.
4. Correct x-only equation/inequality restrictions and viewport/unbounded intervals, including narrow domains and identities.
5. Resolve any browser regression below; test selected-point updates, snap(3,3), fullscreen/Escape, tables, RU/KK and graph fallback.
6. Repeat unit/types/lint/build and local graph+trusted browser tests, then independent review before PR/CI/merge. Retain visual design; do not change hosted content, teacher results, applied migrations, secrets or paid SDK policy.

No external messages sent. No production changes made by this review.

Temporary browser probes preserved outside Git at /private/tmp/alemprep-viz-review-20261010/viz-review.spec.ts; to reproduce, copy into tests/e2e/viz-review.spec.ts and run the guarded local test command with trusted/pilot flags. No unsafe mathematical input was exercised through the full browser fit.
