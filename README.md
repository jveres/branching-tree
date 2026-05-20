# Branching tree

`BranchingTree` is a small TypeScript data structure for a rooted, ordered tree
where every node can select one child. The selected child pointers define one
active path through the tree, exposed as `selectedPath`.

The main use case is a chat transcript where each message can have multiple
versions. Each version is a sibling, and the active conversation is the selected
path. The API stays generic, so the same structure works for drafts, workflows,
edit histories, and other branchable sequences.

## Install

This repository is currently a local TypeScript package. Install dependencies
with `pnpm` before running tests and quality checks.

```sh
pnpm install
```

## Basic usage

Create a tree with values that include an `id` string. Appending adds a value as
a child of the current `head`, or as a child of the root when the tree is empty.

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

## Chat app patterns

Use siblings as message versions. The selected sibling at each depth forms the
visible conversation, while unselected siblings remain available for version
switching.

```ts
// Generate another assistant version without switching away from the active one.
tree.addSibling(
  "assistant-1b",
  { id: "assistant-1c", role: "assistant", content: "Version C" },
  { select: false },
);

// Render version controls for the active assistant message.
const versions = tree.getSiblingEntries("assistant-1b");
// versions[1]?.selected === true
// versions[1]?.siblingCount === 3

// Switch directly to a different version.
tree.selectSiblingById("assistant-1c");

// Stream tokens into the active assistant message.
tree.updateHead({
  id: "assistant-1c",
  role: "assistant",
  content: "Version C with more text",
});

// Regenerate after a user message by pruning later messages first.
tree.truncateAfter("user-1");
tree.append({ id: "assistant-2", role: "assistant", content: "New answer" });
```

`selectedPath` and `selectedPathEntries` are cached, so reading the active
conversation and its version metadata is O(1). Tree writes rebuild those cached
arrays.

## Core concepts

The tree stores all branches, but `selectedPath` returns only the currently
selected path from the root to a leaf.

- `ROOT_NODE_ID` identifies the sentinel root node.
- `BranchingTreeNode<T>` stores a value, parent id, child ids, and selected
  child index.
- `BranchingTreeState<T>` is the serializable tree state.
- `BranchingTreePathEntry<T>` describes a selected path value plus its sibling
  metadata.
- `BranchingTreeSiblingEntry<T>` describes a sibling and whether it's selected.
- `selectedPath` returns the cached selected values in O(1) time.
- `selectedPathEntries` returns cached selected values plus sibling metadata in
  O(1) time.
- `head` returns the last value in `selectedPath`, or `null` for an empty tree.

## Reading data

Read APIs either return immutable cached arrays or cloned node structures, so
callers can't accidentally mutate the tree shape.

- `selectedPath` returns the active values from root to leaf.
- `selectedPathEntries` returns the active values with `siblingIndex`,
  `siblingCount`, `hasPreviousSibling`, and `hasNextSibling`.
- `head` returns the active leaf value.
- `hasNode(id)`, `hasParent(id)`, and `hasChildren(id)` return boolean checks.
- `getSiblingPosition(id)` returns `{ current, total }` using one-based indexes.
- `getSiblings(id)` returns cloned sibling nodes for the referenced node.
- `getSiblingValues(id)` returns sibling values for the referenced node.
- `getSiblingEntries(id)` returns sibling values with selection metadata.
- `getStats()` reports node count, selected path length, depth, leaves, branch
  points, and unreachable nodes.

## Writing data

Write APIs keep selection explicit. By default, inserted siblings become the
selected branch. Pass `{ select: false }` to keep the current selected sibling
when the parent already has a child. The first child of a parent is always the
selected child because there is no alternative branch yet.

- `append(value, options)` inserts a value after the current `head`.
- `appendChild(parentId, value, options)` inserts a value under a specific
  parent.
- `addSibling(referenceId, value, options)` creates a sibling next to an
  existing node.
- `update(value)` replaces an existing node value by `id`.
- `updateHead(value)` replaces the current `head` value without searching the
  tree. This is useful for streaming updates to the active leaf.
- `upsert(value, options)` updates an existing value or appends a new one.
- `loadState(state)` validates and loads a serialized state object.
- `reset(rootId)` clears the tree and creates a new root node.

## Selecting branches

Selection APIs change which sibling is active at a branch point. In a chat app,
these methods switch between message versions.

- `selectSibling(id, offset)` moves selection among siblings by offset.
- `selectSiblingAt(id, index)` selects a sibling by zero-based index in the
  referenced node's sibling group.
- `selectSiblingById(id)` selects an existing non-root node by id and selects
  the ancestor path needed to reach it.
- `selectPathTo(id)` selects every parent-to-child edge needed to reach a node.

## Deleting branches

Deletion APIs remove subtrees and then rebuild the cached selected path. Methods
return `false` when there is nothing to delete.

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

## State helpers

Static helpers create ids and serializable state without mutating an existing
tree instance. They are useful when importing linear data, duplicating a tree,
or generating ids with the same convention as the library.

### `createNodeId(prefix)`

`createNodeId` returns a string id with a prefix and a random suffix. The
default prefix is `node`, so `BranchingTree.createNodeId()` returns ids shaped
like `node-abc123`.

```ts
const id = BranchingTree.createNodeId("message");
```

### `createLinearState(values, options)`

`createLinearState` converts an array into a single selected path under a root
node. Every input value receives a new id, and the return type is
`BranchingTreeState<Reidentified<T>>`.

Use this helper when you want to import existing values but don't want to reuse
their current ids.

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

- `idFactory` generates the id for each non-root value.
- `idPrefix` is passed to `createNodeId` when `idFactory` isn't provided.
- `rootId` sets the root node id. The default is `ROOT_NODE_ID`.

### `cloneStateWithNewIds(state, options)`

`cloneStateWithNewIds` copies an existing tree state while preserving its
structure, selected child indexes, and values. It assigns a new id to every
non-root node and rewrites parent and child references to match.

Use this helper when you need a duplicate tree that won't collide with ids from
the source state.

```ts
const clonedState = BranchingTree.cloneStateWithNewIds(linearState, {
  idPrefix: "copy",
});
```

The optional `options` object supports these fields:

- `idFactory` generates the new id for each non-root node.
- `idPrefix` is passed to `createNodeId` when `idFactory` isn't provided.
- `rootId` sets the cloned root id. The default is the source state's `rootId`.

Both state helpers copy each value with its generated id:

```ts
const clonedValue = clonedState.nodes["copy-abc123"]?.value;
// clonedValue?.id === "copy-abc123"
```

## Demo

The repository includes a browser demo that loads a large chat-like branching
tree and renders it as a top-down conversation version map. The visible map stays
focused on the selected path and sibling versions, keeps reused nodes in stable
positions when switching versions, and uses compact subtree badges for hidden
descendants.

The demo supports drag-to-pan, wheel zoom, zoom buttons, Shift-wheel pan,
double-click zoom, fit-to-view, size presets, click-to-select nodes, sibling
version switching, and active path highlighting.

```sh
pnpm run demo
```

Open the local Vite URL printed by the command. The demo remembers node
coordinates across version switches, reuses existing SVG elements where possible,
and appends only newly needed nodes for the selected path window. This keeps path
switching responsive on trees with hundreds of messages.

## Quality checks

The project uses TypeScript, Vitest, oxlint, and oxfmt. The `check` script runs
format checking, linting, type checking, and unit tests with coverage.

```sh
pnpm run check
```

Coverage thresholds are set to 100% for statements, branches, functions, and
lines in `vitest.config.ts`.
