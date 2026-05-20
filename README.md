# Branching tree

`BranchingTree` is a small TypeScript data structure for a rooted, ordered tree
where every node can select one child. The selected child pointers define a
single active path through the tree, exposed as `selectedPath`.

Use it when you need to keep alternative branches at any position while still
reading or appending to one current path.

## Install

This repository is currently a local TypeScript package. Install dependencies
with `pnpm` before running the test and quality checks.

```sh
pnpm install
```

## Basic usage

Create a tree with values that include an `id` string. Appending adds a value as
a child of the current `head`, or as a child of the root when the tree is empty.

```ts
import { BranchingTree } from "./branching-tree";

type Step = {
  id: string;
  label: string;
};

const tree = new BranchingTree<Step>();

tree.append({ id: "draft", label: "Draft" });
tree.append({ id: "review", label: "Review" });
tree.addSibling("review", { id: "legal-review", label: "Legal review" });

console.log(tree.selectedPath);
// [
//   { id: "draft", label: "Draft" },
//   { id: "legal-review", label: "Legal review" },
// ]
```

## Core concepts

The tree stores all branches, but `selectedPath` returns only the currently
selected path from the root to a leaf.

- `ROOT_NODE_ID` identifies the sentinel root node.
- `BranchingTreeNode<T>` stores a value, parent id, child ids, and selected
  child index.
- `BranchingTreeState<T>` is the serializable tree state.
- `selectedPath` returns the cached selected values in O(1) time.
- `head` returns the last value in `selectedPath`, or `null` for an empty tree.

## API overview

The public API keeps tree operations separate from value operations. Methods
that can't complete return `false` when the operation is safe to ignore, and
throw when the request would create invalid state.

- `append(value)` inserts a value after the current `head`.
- `update(value)` replaces an existing node value by `id`.
- `upsert(value)` updates an existing value or appends a new one.
- `addSibling(referenceId, value)` creates a sibling next to an existing node.
- `selectSibling(id, offset)` moves selection among siblings by offset.
- `selectPathTo(id)` selects every parent-to-child edge needed to reach a node.
- `deleteNode(id)` removes a node and its subtree.
- `deleteSiblings(id)` removes every sibling of the referenced node, including
  the node.
- `deleteSiblings(id, { keepTarget: true })` removes every sibling except the
  referenced node.
- `getState()` returns a cloned state object.
- `loadState(state)` validates and loads a serialized state object.
- `getStats()` reports node count, selected path length, depth, leaves, branch
  points, and unreachable nodes.

## State helpers

Static helpers create ids and serializable state without mutating an existing
tree instance. They are useful when importing linear data, duplicating a tree,
or generating ids with the same convention as the library.

### `createNodeId(prefix)`

`createNodeId` returns a string id with a prefix and a random suffix. The
default prefix is `node`, so `BranchingTree.createNodeId()` returns ids shaped
like `node-abc123`.

```ts
const id = BranchingTree.createNodeId("step");
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
    { id: "source-a", label: "First" },
    { id: "source-b", label: "Second" },
  ],
  {
    idFactory: (() => {
      const ids = ["a", "b"];
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
const clonedState = BranchingTree.cloneStateWithNewIds(linearState);
```

The optional `options` object supports these fields:

- `idFactory` generates the new id for each non-root node.
- `idPrefix` is passed to `createNodeId` when `idFactory` isn't provided.
- `rootId` sets the cloned root id. The default is the source state's `rootId`.

Both state helpers copy each value with its generated id:

```ts
const clonedValue = clonedState.nodes["new-id"]?.value;
// clonedValue?.id === "new-id"
```

## Quality checks

The project uses TypeScript, Vitest, oxlint, and oxfmt. The `check` script runs
format checking, linting, type checking, and unit tests with coverage.

```sh
pnpm run check
```

Coverage thresholds are set to 100% for statements, branches, functions, and
lines in `vitest.config.ts`.
