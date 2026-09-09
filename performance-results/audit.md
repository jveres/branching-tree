# Performance audit

The audit on September 9, 2026 found three useful runtime improvements:
linear demo generation, neighborhood counting bounded by visible nodes, and
retained inspector buttons using Loom's keyed update callback.

## Measured runtime gains

You can compare all library workloads in [before.json](before.json),
[after.json](after.json), and [final.json](final.json). Times below are median
milliseconds per operation on macOS arm64, Node.js 22.21.1.

| Workload | Before | Final | Reduction |
| --- | ---: | ---: | ---: |
| Generate 128 messages | 0.509 | 0.0335 | 93.4% |
| Generate 256 messages | 3.350 | 0.0518 | 98.5% |
| Generate 512 messages | 8.603 | 0.1070 | 98.8% |
| Generate with target 4,096 (3,020 actual messages) | 672.040 | 0.6741 | 99.9% |
| 10,000-child neighborhood, sibling window 1 | 0.17046 | 0.00220 | 98.7% |
| 10,000-child neighborhood, max depth 0 | 0.08949 | 0.00078 | 99.1% |
| Update metadata for 512 inspector rows (browser) | 3.25 | 0.50 | 84.6% |
| Load 512 messages, complete button handler (production browser) | 13.20 | 5.45 | 58.7% |

The generator now maintains its user-leaf count incrementally and walks its
queue with an index. Previously, it enumerated every existing node for each
parent and shifted the queue. SHA-256 hashes of all four generated fixtures
match the original implementation exactly, including IDs, content, topology,
and selections. The large target exhausts the deterministic generator's queue
at 3,020 messages in both versions.

Neighborhood queries now count visible children from their result and subtract
that count from each node's child count. They no longer inspect hidden child
arrays to calculate badge counts. Selected-path construction retains its
existing cost; the wide-tree benchmark materializes that path before timing.
Ordinary small neighborhoods remain around 0.006 ms, with no meaningful gain.
Loading, topology, statistics, and deep path selection remain broadly unchanged.

## Loom and dependencies

Loom is pinned to `github:jveres/loom#v0.7.0`, the latest GitHub tag checked
with `git ls-remote --tags`. The lockfile resolves commit
`bd3d24aaf47ddeac02bddbd6883b96230bcc4d8d`. Installation no longer depends on
`../loom`. Biome updates from 2.5.10 to 2.5.12; Vitest and its V8 coverage
provider update from 4.1.11 to 5.0.0. TypeScript 7.0.2 and Vite 8.2.2 were
already current. The lockfile also refreshes compatible transitive dependencies.

The inspector now uses `each(..., { update })` with stable node IDs. Changed
labels, indexes, roles, selection classes, and head classes update in place.
Previously, keys included the displayed fields, causing replacement whenever
those fields changed. The browser stress workload changes the version-count
label for 512 rows: it previously inserted and removed 512 buttons per update;
now it performs zero child insertions or removals. Existing focus and click
handlers remain intact. The list and empty-state binding are independent so
clearing the list removes every row before showing the empty message.

The keyed update API is available in v0.7.0 but predates that release. The
feature newly added in v0.7.0 is `morphChildren`, described in the
[tagged API documentation](https://github.com/jveres/loom/blob/v0.7.0/docs/api.md).
It offers no clear advantage over this demo's existing keyed SVG maps.
Frame coalescers duplicate existing resize scheduling, virtual lists would
change the inspector's variable-height layout, and deferred effects would
change update timing. None were added without evidence of a benefit.

## Browser audit

Chrome 152 ran the production Vite preview on localhost without CPU or network
throttling. The initial trace recorded LCP 342 ms, FCP 344 ms, and CLS 0.00.
A post-change trace recorded LCP 193 ms and CLS 0.00. These are individual
local reload traces, not statistically controlled load-time gains or field
measurements. Requests were cache-revalidated; this was not a mobile cold-load
audit. INP, TBT, and Speed Index were not measured.

The page requests one document, one stylesheet, and two JavaScript chunks,
with no third-party requests. Initial compressed JavaScript was 23.00 KB;
the final build is 23.10 KB. CSS stays at 2.71 KB gzip. No asset or network
optimization had a material measured opportunity. Render-blocking CSS showed
zero estimated FCP/LCP savings. The post-change trace reported 32 ms of
attributed startup reflow and no estimated savings. See Chrome's
[forced-reflow guidance](https://developer.chrome.com/docs/performance/insights/forced-reflow)
for the distinction between necessary geometry reads and repeated thrashing.

## Reproduce and validate

The original source revision is `d257a56067491346f8754cb2adc7f117b870d1df`.
The benchmark script warms each workload ten times, then measures fifteen
batches. Each batch contains twenty operations, except the large generator
(two) and wide neighborhoods (one hundred). Module loading, fixture setup,
and coverage instrumentation are outside the timed region. Results include
minimum, median, maximum, iteration counts, and fixture fingerprints.
`after.json` isolates the algorithm changes before dependency updates;
`final.json` repeats them using the final dependency set.

Run the library benchmark and project checks with:

```sh
pnpm install --frozen-lockfile
pnpm bench performance-results/recheck.json
pnpm check
pnpm exec vite build demo
```

Browser measurements use five warmups and twenty samples, with one animation
frame between operations. The timer includes synchronous DOM work but excludes
the subsequent paint. The inspector benchmark uses the actual dev-mode UI and
store with a synthetic 512-sibling group; it isolates row updates rather than
claiming this is the default demo workload. Results and browser verification
are saved in [browser.json](browser.json). The final production button handler
measured 5.45 ms in a fresh isolated tab. A repeat in the previously profiled
tab measured 33.75 ms, so that outlier is retained in the raw results and is
not used as a controlled comparison. These timings are environment-sensitive;
the isolated algorithm and DOM-mutation measurements provide stronger evidence
than an individual page-load trace.

To repeat the inspector measurement, start `pnpm dev`. In its browser console,
replace the filesystem path below with your repository's absolute path:

```js
const audit = await import('/@fs/ABSOLUTE_REPO_PATH/scripts/browser-performance.mjs');
const { default: store } = await import('/version-history/store.ts');
const { demoActions } = await import('/version-history/actions.ts');
audit.verifyInspector(store, demoActions);
await audit.measureInspector(store);
await audit.measureSizeButton();
```

The verification covers text and class updates, retained DOM identity and
focus, event handlers, reordering, removal, and empty-state recovery. Project
checks pass 99 tests and enforce 100% statement, branch, function, and line
coverage for the library. Regression cases include wide neighborhoods before
and after deletion and the larger seeded generator fixture. Benchmarks use
observed results rather than flaky elapsed-time assertions in the test suite.
