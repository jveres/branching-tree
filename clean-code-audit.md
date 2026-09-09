# Clean code audit

The September 9, 2026 audit fixes two high-severity and six medium-severity
findings. The final review identified no remaining high- or medium-severity
findings in the reviewed code.

## Scope and review passes

The review covers the tree library, demo, benchmark scripts, tests, and project
configuration. Generated output and dependency source are excluded. Findings
require a correctness, lifecycle, scalability, or tooling impact; stylistic
preferences alone don't qualify as medium severity.

| Pass | Findings | Result |
| --- | --- | --- |
| 1: State boundaries and lifecycle | Valued-root export, empty IDs, DOM disposal, failed initialization | Fixed; failing library and browser regressions reproduced first |
| 2: Traversal, selection, events, and tooling | Recursive minimap layout, clamped selection, pointer cancellation, shared benchmark cache | Fixed; regression checks added where behavior changes |
| 3: Re-review of fixes and remaining code | No new high or medium findings | Checks, build, browser verification, and benchmark spot check pass |

## Resolved findings

Each finding below describes the original trigger and the resulting behavior.

| ID | Severity | Finding and fix | Verification |
| --- | --- | --- | --- |
| C01 | High | `getSelectedPathState()` assigned a valued root as its own parent. It now preserves the root record and skips it while linking descendants. | Export reloads successfully, preserves values and IDs, prunes inactive siblings, and doesn't expose internal child arrays. |
| C02 | Medium | Truthiness checks treated empty-string IDs as missing during traversal, sibling insertion, and cloning. Null/undefined checks now preserve these IDs, including an explicit empty root. The legacy default-root fallback remains when no empty root record exists. | Selection, clone, and root round-trip regressions pass; existing default-root fallback test passes. |
| C03 | High | `scope.stop()` didn't dispose Loom's DOM-owned bindings. Stopped demo content still reacted to store updates. Cleanup now disposes and removes mounted subtrees, releases imperative SVG/tree caches, and is idempotent. | Old text stays unchanged after store writes, mount roots are empty, stale cleanup doesn't stop the next mount, and queued resize work is cancelled. |
| C04 | Medium | Partial initialization left the controller marked active, and rejected asynchronous loads left an unhandled rejection and loading message. Initialization now rolls back; shell cleanup cancels pending mounting; failures show a reload message and log the cause. | Incomplete scaffolding fails, a subsequent mount works, stopped pending imports don't mount, and an injected missing minimap produces the visible error message. |
| C05 | Medium | Recursive minimap placement exceeded the JavaScript stack on deep paths. An explicit post-order stack preserves the layout without recursion. Pure layout and message generation now live outside DOM/controller initialization. | A 20,000-node path, branch-centering fixture, multiple roots, and empty topology pass. Message-generation tests run independently. |
| C06 | Medium | A loaded out-of-range selected index could select a newly inserted sibling even with `select: false`. Insertion now retains the effective selection from the original sibling range. | A saved index of 99 with two children keeps the second child selected after an unselected insert. |
| C07 | Medium | `pointercancel` followed the pointer-up selection path and changed the inspected branch. Cancellation now only clears gesture state; a completed pointer-up still selects. | Browser pointer-event regression checks both cancellation and completed selection. |
| C08 | Medium | The benchmark's Vite server used the same dependency cache as the dev server despite a different configuration. It now uses `node_modules/.vite-performance`. | Benchmark completes while the dev cache metadata remains unchanged. |

The message generator moved to `demo/version-history/messages.ts`; its tests
moved out of the library suite. Minimap placement moved to
`demo/shared/minimap-layout.ts`. These boundaries let you test the pure logic
without importing the controller, reactive store, or browser lifecycle.

## Validation

The final checks pass 106 tests in three files. Library coverage remains 100%
for statements, branches, functions, and lines. Formatting, linting, TypeScript
checking, the production build, and `git diff --check` pass.

The browser regression helper verifies disposal, remounting, stale cleanup,
pending resize cancellation, initialization rollback, cancelled shell loading,
visible initialization errors, and pointer cancellation. Its error-message
case deliberately hides the minimap lookup and produces one expected console
error. The pointer fixture stubs OS pointer capture because synthetic pointer
events cannot acquire it; DOM event handlers and state changes run normally.

The performance spot check retains the earlier gains: generating 512 messages
remains around 0.11 ms and a wide neighborhood query around 0.002 ms. All four
sample-state fingerprints still match the saved performance baseline.

## Reproduce

Run the automated checks and benchmark from the repository root:

```sh
pnpm check
pnpm exec vite build demo
pnpm bench
```

For browser lifecycle checks, start `pnpm dev`, open the demo, reload it, and
run the following in its console. Replace `ABSOLUTE_REPO_PATH` with your checkout
path. The fixture removes the demo while testing teardown; reload afterward.

```js
const audit = await import('/@fs/ABSOLUTE_REPO_PATH/scripts/browser-clean-code.mjs');
await audit.runCleanCodeAudit();
```

The audit is a review of the repository and tested behaviors, not a guarantee
that every possible input or browser environment has been exhausted.
