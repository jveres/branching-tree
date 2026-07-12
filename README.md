# Branching tree

`BranchingTree` manages branchable state for chat transcripts, message
versions, and tree UIs while keeping one selected root-to-leaf path ready to
render.

[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Core coverage](https://img.shields.io/badge/core%20coverage-100%25-16a34a)](#quality-checks)
[![Tests](https://img.shields.io/badge/tests-97%20passing-16a34a)](#quality-checks)
[![Demo](https://img.shields.io/badge/demo-Loom-8b6cff)](#demo)

<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="assets/demo-screenshot-dark.png"
  >
  <source
    media="(prefers-color-scheme: light)"
    srcset="assets/demo-screenshot-light.png"
  >
  <img
    alt="Conversation version tree with a minimap and selection details."
    src="assets/demo-screenshot-light.png"
  >
</picture>

`BranchingTree` is a source-only TypeScript data structure for branchable
conversations, versioned messages, and ordered trees with a cached selected
path.
It stores every branch, keeps one selected path ready for fast transcript
rendering, and exposes generic helpers for visualization, persistence, and
branch editing.

It was built for chat apps where every message can have multiple generated
versions. The API stays generic, so the same model also fits drafts, workflows,
edit histories, decision trees, and other branchable sequences.

## Why branching tree?

Most chat UIs render a single linear transcript, but real chat state is often a
tree: users edit prompts, assistants regenerate answers, and each turn can have
multiple versions. `BranchingTree` keeps that tree explicit and returns the
selected conversation through cached snapshots.

## Features

Use `BranchingTree` when you need a focused state model for branchable data
without coupling your application to a chat-specific schema.

- **Cached selected-path reads:** `selectedPath` and `selectedPathEntries` reuse
  frozen snapshots between path changes.
- **Generic branching model:** Store plain-data values with an `id` as shallow,
  frozen snapshots.
- **Version navigation:** Switch siblings by offset, index, ID, or full path.
- **Serializable state:** Persist and restore the full tree with
  `BranchingTreeState<T>`.
- **Visualization-ready helpers:** Use `getSelectedPathNeighborhood()` and
  stable edge IDs to build tree maps.
- **Branch editing utilities:** Trim, delete, clone, and linearize branch
  state with focused helpers.
- **Fully covered core:** Unit tests enforce 100% statement, branch, function,
  and line coverage for `branching-tree.ts`.

## Getting started

This repository isn't published to npm. It requires Node.js 20.19 or later on
the 20.x release line, or Node.js 22.12 or later, because it uses Vite 8. It
also links Loom from `../loom`.

Set up and verify the project from the `branching-tree` directory:

1. If the sibling `../loom` directory doesn't exist, clone Loom:

   ```sh
   git clone https://github.com/jveres/loom.git ../loom
   ```

2. Install dependencies with `pnpm`:

   ```sh
   pnpm install
   ```

3. Start the browser demo from the `demo/` Vite app:

   ```sh
   pnpm run dev
   ```

   Vite prints the local URL after the development server starts.

4. Run formatting checks, linting, TypeScript 7 type checking, and unit tests
   with coverage:

   ```sh
   pnpm run check
   ```

5. Build the production demo bundle:

   ```sh
   pnpm exec vite build demo
   ```

## Basic usage

Create a tree with plain-data values that have unique, stable `id` strings.
Appending adds a value as a child of the current `head`, or as a child of the
root when the tree is empty.

Node IDs are opaque strings. Prototype-like names such as `__proto__` and IDs
that contain `->` are supported.

```ts
import { BranchingTree } from "./branching-tree";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const tree = new BranchingTree<Message>();

tree.append({ id: "user-1", role: "user", content: "Draft an intro." });
tree.append({ id: "assistant-1a", role: "assistant", content: "Version A" });
tree.addSibling("assistant-1a", {
  id: "assistant-1b",
  role: "assistant",
  content: "Version B",
});

console.log(tree.selectedPath);
// [
//   { id: "user-1", role: "user", content: "Draft an intro." },
//   { id: "assistant-1b", role: "assistant", content: "Version B" },
// ]
```

Export a cloned state object with `getState()`, then pass it to the constructor
or `loadState()` to restore the tree:

```ts
const savedState = tree.getState();
const restoredTree = new BranchingTree<Message>(savedState);

const existingTree = new BranchingTree<Message>();
existingTree.loadState(savedState);
```

## Chat app patterns

Use siblings as message versions. The selected sibling at each depth forms the
visible conversation, while unselected siblings remain available for version
switching.

```ts
// Generate another version without switching away from the selected one.
tree.addSibling(
  "assistant-1b",
  { id: "assistant-1c", role: "assistant", content: "Version C" },
  { select: false },
);

// Render version controls for the selected assistant message.
const versions = tree.getSiblingEntries("assistant-1b");
// versions[1]?.selected === true
// versions[1]?.siblingCount === 3

// Switch directly to a different version.
tree.selectSiblingById("assistant-1c");

// Stream tokens into the selected assistant message.
tree.updateHead({
  id: "assistant-1c",
  role: "assistant",
  content: "Version C with more text",
});

// Regenerate after a user message by pruning later messages first.
tree.truncateAfter("user-1");
tree.append({ id: "assistant-2", role: "assistant", content: "New answer" });
```

`selectedPath` and `selectedPathEntries` are cached. Repeated reads return the
same frozen arrays in O(1) time. Consecutive appends invalidate the cache
without rebuilding it. The first subsequent read traverses the selected path
and performs sibling lookups, with O(N) worst-case cost for N nodes. Value
updates refresh or preserve the relevant cached entries directly.

## Visualization helpers

Use `getSelectedPathNeighborhood()` when you need data for a tree map like the
demo. The helper returns only graph facts: which nodes are visible, how they
relate to each other, which ones are selected, and how many direct children are
hidden. It doesn't include coordinates or rendering details.

```ts
const graph = tree.getSelectedPathNeighborhood();

for (const node of graph.nodes) {
  console.log(
    node.nodeId,
    node.depth,
    node.siblingIndex,
    node.hiddenChildCount,
  );
}

for (const edge of graph.edges) {
  console.log(edge.parentId, edge.childId, edge.selected);
}
```

Limit the neighborhood when you want a focused view around the selected path.
`maxDepth` is an inclusive, zero-based selected-path depth. `siblingWindow` is
intended for finite numbers; it is floored to a nonnegative integer and includes
that many siblings on each side of the selected node:

```ts
const focusedGraph = tree.getSelectedPathNeighborhood({
  maxDepth: 4,
  siblingWindow: 1,
});
```

Use `getFullTopology()` when you need every reachable value in the tree without
layout coordinates:

```ts
const topology = tree.getFullTopology();
```

Use `getBranchSummary(id)` when you need subtree facts for collapsed
branches, badges, or inspectors:

```ts
const summary = tree.getBranchSummary("assistant-1b");
// { nodeId, descendantCount, leafCount, maxDepth, branchPoints }
```

Each `BranchingTreePathNeighborhoodNode<T>` includes the same fields as
`BranchingTreeSiblingEntry<T>`, plus these map-oriented fields:

- `depth` is the selected-path depth where the node appears.
- `childCount` is the total number of direct children under the node.
- `hiddenChildCount` is the number of direct children that aren't visible in the
  returned neighborhood.

Each `BranchingTreePathNeighborhoodEdge` includes these fields:

- `id` is a stable edge ID from `BranchingTree.createEdgeId(parentId, childId)`.
- `parentId` and `childId` identify the connected nodes.
- `selected` is `true` when the edge is part of the selected path.

`getFullTopology()` returns the same edge shape and
`BranchingTreeTopologyNode<T>` entries for every reachable valued node.

## Performance characteristics

The selected-path cache defers reconstruction until a read needs the updated
path. The following bounds describe the core data structure and exclude demo
layout or rendering work. N is the total node count, E is the edge count, S is
a subtree size, P is a sibling-group size, H is the selected-path length, and W
is a requested sibling-window size.

| Operation | Complexity | Notes |
| --- | --- | --- |
| `append()` when the selected head is known | Amortized O(1) | Subsequent consecutive appends don't rebuild the path cache. |
| Clean `selectedPath`, `selectedPathEntries`, or `head` read | O(1) | Returns the current frozen snapshot. |
| First selected-path read after invalidation | O(N) worst case | Traverses H selected nodes and looks each one up in its sibling group. |
| `loadState()`, `getFullTopology()`, or `getStats()` | O(N + E) | Validation and topology traversal avoid repeated linear membership checks. |
| `getBranchSummary(id)` | O(S) | Visits each node in the subtree once. |
| `deleteNode(id)` | O(P + S) | Removes the sibling reference, then deletes the subtree iteratively. |
| Neighborhood with `siblingWindow: W` | O(H × W + C) | Allocates only the window entries; C is the number of direct children scanned for hidden counts. |

## API reference

These sections group the exported types and the read, write, selection,
deletion, and state-helper APIs by the workflow they support.

### Core concepts

The tree stores all branches, but `selectedPath` returns only the currently
selected path from the root to a leaf. The default sentinel root has no value,
so selected-path and topology results omit it.

- `new BranchingTree<T>(initialState?)` creates an empty tree or clones and
  validates an existing state.
- `ROOT_NODE_ID` is the default sentinel root ID.
- `rootNodeId` returns the configured root ID.
- `selectedPath` returns the current frozen snapshot. A clean-cache read is
  O(1); the first read after path invalidation has O(N) worst-case cost.
- `selectedPathEntries` has the same cache behavior and includes sibling
  metadata.
- `head` returns the last value in `selectedPath`, or `null` for an empty tree.

### Exported types

The module exports the state, result, and option types needed to build values,
persist trees, and consume visualization helpers.

- `Identified` is the `{ id: string }` constraint for stored values.
- `BranchingTreeNode<T>` stores a value, parent ID, child IDs, and selected
  child index.
- `BranchingTreeState<T>` is the serializable tree state.
- `BranchingTreeStats` and `SiblingPosition` describe aggregate tree and
  sibling-position results.
- `BranchingTreePathEntry<T>`, `BranchingTreeSiblingEntry<T>`, and
  `BranchingTreeChildEntry<T>` describe selected values and sibling metadata.
- `BranchingTreePathNeighborhood<T>`,
  `BranchingTreePathNeighborhoodNode<T>`, and
  `BranchingTreePathNeighborhoodEdge` describe a selected-path graph.
- `BranchingTreeTopology<T>`, `BranchingTreeTopologyNode<T>`, and
  `BranchingTreeTopologyEdge` describe a full reachable graph.
- `BranchingTreePathNeighborhoodOptions` configures `maxDepth` and
  `siblingWindow`.
- `BranchingTreeBranchSummary` describes subtree counts for one node.
- `Reidentified<T>` describes a value whose ID has been replaced.
- `IdFactory` and `IdOptions` configure generated node and root IDs.
- `InsertOptions` and `DeleteSiblingsOptions` configure insertion selection and
  sibling deletion.

### Reading data

Read APIs don't expose mutable tree structure. They return primitives, frozen
snapshots and result objects, or detached node and state clones. Values are
shallow-copied and frozen when they enter the tree; nested objects remain
caller-owned.

> **Note:** Clone or freeze nested data before insertion when you need deep
> value isolation.

- `getState()` returns a detached clone of the complete tree state for
  persistence or transfer.
- `selectedPath` returns the selected values from root to leaf.
- `selectedPathEntries` returns the selected values with `siblingIndex`,
  `siblingCount`, `hasPreviousSibling`, and `hasNextSibling`.
- `head` returns the selected leaf value.
- `hasNode(id)`, `hasParent(id)`, and `hasChildren(id)` return boolean checks.
- `getNode(id)` returns a cloned node, or `undefined` when the ID doesn't
  exist.
- `getValue(id)` returns a node value, or `undefined` when the ID doesn't exist
  or points to an unvalued root.
- `getSiblingPosition(id)` returns `{ current, total }` using one-based indexes.
- `getSiblings(id)` returns cloned sibling nodes for the referenced node.
- `getChildren(id)` returns cloned child nodes for the referenced node.
- `getSiblingValues(id)` returns sibling values for the referenced node.
- `getChildValues(id)` returns child values for the referenced node.
- `getSiblingEntries(id)` returns sibling values with selection metadata.
- `getChildEntries(id)` returns child values with selection metadata relative to
  the referenced parent node.
- `getPathEntriesTo(id)` returns path entries from the root to a reachable node
  without changing the selected path. It returns `[]` for missing or
  unreachable nodes.
- `getFullTopology()` returns every reachable valued node and edge without
  layout coordinates.
- `getBranchSummary(id)` returns `nodeId`, descendant, leaf, depth, and
  branch-point counts, or `null` when the node doesn't exist. The descendant
  count excludes the requested node.
- `getSelectedPathNeighborhood(options)` returns the selected path plus each
  selected node's visible siblings as graph nodes and edges. `maxDepth` is
  inclusive and zero-based. `siblingWindow` is floored to a nonnegative
  integer around the selected sibling.
- `getSelectedPathState()` returns a serializable state containing only the
  current selected path. It preserves the selected nodes' IDs and values while
  pruning all inactive siblings and descendants.
- `getStats()` returns `totalNodes`, `selectedPathLength`, `orphanedNodes`,
  `maxDepth`, `leafCount`, and `branchPoints`. `totalNodes` includes the
  sentinel root and unreachable nodes. Depth, leaf, and branch-point counts
  describe the root-reachable component and include the sentinel root.

### Writing data

Write APIs keep selection explicit. By default, inserted siblings become the
selected branch. Pass `{ select: false }` to keep the current selected sibling
when the parent already has a child. The first child of a parent is always the
selected child because there is no alternative branch yet.

- `append(value, options)` inserts a value after the current `head`.
- `appendChild(parentId, value, options)` inserts a value under a specific
  parent.
- `addSibling(referenceId, value, options)` appends a sibling under the
  reference node's parent.
- `update(value)` replaces an existing node value by `id`.
- `updateHead(value)` replaces the current `head` value. This is useful for
  streaming updates to the selected leaf.
- `upsert(value, options)` updates an existing value or appends a new one.
- `loadState(state)` validates and loads a serialized state object.
- `reset(rootId)` clears the tree and creates a new root node.

Insertion methods throw for duplicate IDs or missing parent and reference
nodes. `update()` and `updateHead()` return `false` when their target doesn't
exist or isn't the selected head.

### Loading state safely

The constructor and `loadState()` clone values and tree structure before they
validate the input. A failed `loadState()` call throws without changing the
current tree.

A loaded state must meet these requirements:

- The root record must have `parentId: null`. If the default root record is
  absent, loading creates an empty `ROOT_NODE_ID` sentinel before validation.
- Every record key must match `node.id`, and every stored `value.id` must match
  its node ID.
- Every non-root node must have a value and a parent.
- Parent and child references must exist, point back to each other, and contain
  no duplicate child IDs.
- Every `selectedChildIndex` must be an integer. Selection reads clamp integers
  outside the available child range.

Structurally consistent disconnected components are permitted. `getStats()`
counts them in `orphanedNodes`; root-path APIs treat them as unreachable.

### Selecting branches

Selection APIs change which sibling is selected at a branch point. In a chat
app, these methods switch between message versions.

- `selectSibling(id, offset)` requires an integer offset and returns `false`
  for missing nodes or movement outside the sibling group.
- `selectSiblingAt(id, index)` requires an integer, zero-based index and returns
  `false` for missing nodes or indexes outside the sibling group.
- `selectSiblingById(id)` selects a reachable non-root node by ID and selects
  its ancestor path. It returns `false` for missing, root, or unreachable nodes.
- `selectPathTo(id)` selects every parent-to-child edge needed to reach a node.
  It throws when the node is missing or unreachable from `rootNodeId`.

### Deleting branches

Deletion APIs remove subtrees and invalidate the cached selected path. The next
selected-path read rebuilds the cache. Methods return `false` when the target
can't be deleted or there is nothing to remove.

- `deleteNode(id)` removes a node and its descendants.
- `deleteBranch(id)` is an alias for `deleteNode(id)` when the call site is
  branch-oriented.
- `deleteDescendants(id)` keeps a node and removes all children below it.
- `truncateAfter(id)` selects the path to a node, then removes everything below
  it.
- `deleteSiblings(id)` removes every sibling of the referenced node, including
  the referenced node.
- `deleteSiblings(id, { keepTarget: true })` removes every sibling except the
  referenced node.

### State helpers

Static helpers create IDs and serializable state without mutating an existing
tree instance. They are useful when importing linear data, duplicating a tree,
or generating IDs with the same convention as the library.

#### `createNodeId(prefix)`

`createNodeId` returns a string ID with a prefix and a random suffix. The
default prefix is `node`, so `BranchingTree.createNodeId()` returns IDs shaped
like `node-abc123`.

```ts
const id = BranchingTree.createNodeId("message");
```

#### `createEdgeId(parentId, childId)`

`createEdgeId` returns a stable, collision-free string ID for a parent-to-child
edge. Use it as an opaque key for rendered edge elements. Components that don't
contain `->` produce the readable `parent->child` form. If either component
contains `->`, the method returns an encoded `edge:...` form.

```ts
const edgeId = BranchingTree.createEdgeId("message-1", "message-2");
// edgeId === "message-1->message-2"
```

#### `createLinearState(values, options)`

`createLinearState` converts an array into a single selected path under a root
node. Every input value receives a new ID, and the return type is
`BranchingTreeState<Reidentified<T>>`.

Use this helper when you want to import existing values but don't want to reuse
their current IDs.

```ts
const linearState = BranchingTree.createLinearState(
  [
    { id: "source-user", role: "user", content: "Hello" },
    { id: "source-assistant", role: "assistant", content: "Hi" },
  ],
  {
    idFactory: (() => {
      const ids = ["user-1", "assistant-1"];
      return () => ids.shift() ?? "unused";
    })(),
  },
);
```

The optional `options` object supports these fields:

- `idFactory` generates the ID for each non-root value.
- `idPrefix` is passed to `createNodeId` when `idFactory` isn't provided.
- `rootId` sets the root node ID. The default is `ROOT_NODE_ID`.

#### `cloneStateWithNewIds(state, options)`

`cloneStateWithNewIds` copies an existing tree state while preserving its
structure, selected child indexes, and values. It assigns a new ID to every
non-root node and rewrites parent and child references to match.

Use this helper when you need a duplicate tree that won't collide with IDs from
the source state.

```ts
const clonedState = BranchingTree.cloneStateWithNewIds(linearState, {
  idPrefix: "copy",
});
```

The optional `options` object supports these fields:

- `idFactory` generates the new ID for each non-root node.
- `idPrefix` is passed to `createNodeId` when `idFactory` isn't provided.
- `rootId` sets the cloned root ID. The default is the source state's `rootId`.

Both state helpers copy each value with its generated ID:

```ts
const firstClonedId = clonedState.nodes[clonedState.rootId]?.childrenIds[0];
const clonedValue = firstClonedId
  ? clonedState.nodes[firstClonedId]?.value
  : undefined;
// clonedValue?.id === firstClonedId
```

## Demo

The repository includes a [Loom](https://github.com/jveres/loom)-powered browser
demo that loads a large chat-like branching tree and renders it as a top-down
conversation version map.
The visible map stays focused on the selected path and sibling versions, keeps
reused nodes in stable positions when switching versions, and uses compact
subtree badges for hidden direct children.

The demo lives in `demo/`: `demo/index.html` is the Vite HTML entry,
`demo/main.ts` mounts the Loom shell, and the same entry imports
`demo/styles.css`.

The demo supports drag-to-pan, wheel zoom, zoom buttons, Shift-wheel pan,
double-click zoom, fit-to-view, size presets, click-to-select nodes, keyboard
navigation, sibling version switching, selected-path highlighting, a collapsible
minimap, adding versions and child messages, truncating after a message,
deleting from a selected message, and pruning message versions with or without
keeping the selected version. It also includes a **Create linear** action backed
by `getSelectedPathState()` and uses `getSelectedPathNeighborhood()` for map
rendering. New demo messages use `BranchingTree.createNodeId`. The minimap uses
`getFullTopology()` for whole-tree graph facts.

Run `pnpm run dev`, then open the local URL printed by Vite. The demo remembers
node coordinates across version switches, reuses existing SVG elements where
possible, appends only newly needed nodes for the selected path window, and
preserves zoom and pan across resize events. This keeps path switching
responsive on trees with hundreds of messages.

`mountDemo()` returns a cleanup function. Call it before remounting the demo so
the Loom scope, event listeners, minimap listeners, and scheduled animation
frames are released.

Build the demo production bundle with Vite when you want to inspect output size:

```sh
pnpm exec vite build demo
```

## Quality checks

The current toolchain uses TypeScript 7.0.2, Vite 8.1.4, Vitest 4.1.10, and
Biome 2.5.3. The main check runs formatting verification, linting, type
checking, and unit tests with coverage.

```sh
pnpm run check
```

Use the focused scripts when you need to run one part of the quality gate:

| Command | Purpose |
| --- | --- |
| `pnpm run format` | Format repository files in place. |
| `pnpm run format:check` | Check formatting without writing changes. |
| `pnpm run lint` | Run Biome lint rules. |
| `pnpm run typecheck` | Run the TypeScript 7 compiler without emitting files. |
| `pnpm run test:unit` | Run the Vitest suite without coverage. |
| `pnpm run test` | Run tests with V8 coverage. |
| `pnpm run coverage` | Run the same coverage command explicitly. |

The suite currently contains 97 passing tests. `vitest.config.ts` applies 100%
statement, branch, function, and line thresholds specifically to
`branching-tree.ts`; demo files aren't included in that coverage claim.
