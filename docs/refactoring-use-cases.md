# Refactoring use cases

This document collects product and visualization use cases that can guide the
next `BranchingTree` refactor. The goal is to keep the core data structure
generic while making it easier to build specialized maps, inspectors, and
domain-specific projections on top of it.

## Core observation

`BranchingTree` is useful when a user needs one selected linear path through a
larger branchable structure. The current chat demo is one instance of that
pattern, but the same shape appears in other domains where users need to
compare alternatives, inspect hidden branches, and switch the active route.

The refactor needs to protect this core invariant:

- The full structure remains available.
- The selected path is cheap to read.
- Sibling alternatives are easy to inspect and switch.
- Visualization helpers expose graph facts without owning the rendering layer.

## Chat version history

Chat remains the primary use case. Each message can have multiple versions, and
the selected sibling at each turn forms the visible transcript.

Important workflows include:

- Switching between regenerated answers without rebuilding the whole transcript.
- Showing sibling versions near the active path.
- Revealing hidden descendants only when the user needs more context.
- Keeping the selected path stable while new branches appear.
- Deleting, truncating, and linearizing branches through public APIs.

The current API fits this use case well. The main improvement area is a clearer
visualization adapter that computes a map model from tree state and selection
state.

## Expanding ego graph demo

An expanding ego graph demo can show `BranchingTree` as a dynamic exploration
model rather than a static transcript. The user starts with one query as the
top node. The demo then generates several AI response versions as the first
layer. As the user selects responses or asks follow-up questions, the graph
expands only around the current area of interest.

This idea is close to an ego graph because the view stays centered on the
current topic or selected node. It is still tree-shaped in the core state:
generated alternatives are siblings, and follow-up explorations are children.
The difference from the current demo is that branches appear lazily as the user
navigates.

Useful behavior includes:

- Starting from one user query and generating multiple AI response versions.
- Expanding children only when the user selects, opens, or continues a node.
- Keeping already generated branches stable so the map grows in place.
- Showing unexplored nodes as expandable prompts, loading states, or counts.
- Treating navigation as a signal of user interest.
- Preserving the selected path as the current exploration route.
- Supporting pruning when the user decides a branch is not useful.

This demo would stress a different part of the API. The core tree already
supports appending children and siblings, but the demo needs stronger read
models for partial expansion, pending nodes, and subtree summaries.

Possible names for this demo include:

- **Expanding ego graph:** Accurate when the visible map is centered around a
  selected node or topic.
- **Interest graph:** Clearer for product users because the graph grows based
  on user attention.
- **Exploration tree:** More generic and avoids implying full graph semantics.
- **Topic expansion map:** Useful when the demo focuses on knowledge
  exploration instead of chat history.

The best working name is **expanding ego graph** if the visual design stays
centered around the current node. If the demo remains a top-down branching
tree, **exploration tree** may be more accurate.

## Decision graphs

Decision graphs use a similar active-path pattern. A node can represent a
question, condition, observation, or action. Siblings represent possible choices
or alternate decisions at the same point.

Useful behavior includes:

- Rendering the current decision route as the active path.
- Showing nearby alternatives without expanding the whole decision space.
- Attaching labels such as `yes`, `no`, `unknown`, or `defer` to sibling edges.
- Storing metadata such as confidence, severity, source, or owner.
- Comparing two selected routes to understand where decisions diverge.

This use case exposes a possible API gap: edge metadata. Today edges are
derived from parent-child relationships and don't carry their own value. A
future adapter might let callers provide edge labels without changing the core
tree state.

## Troubleshooting and diagnostics

Troubleshooting flows are a direct fit for the core structure. Each node can
represent a symptom, observation, check, or corrective action. Siblings
represent alternative findings or next actions at the same decision point.

Useful behavior includes:

- Selecting the current diagnostic route as the active path.
- Showing nearby alternative findings without expanding the whole procedure.
- Summarizing unresolved branches by count, severity, or subsystem.
- Recording the selected route as an audit or support artifact.
- Pruning impossible branches as more facts become known.

This use case is fully supported by the strict tree model when cross-references
remain external metadata.

## Complex training materials

Training handbooks and troubleshooting manuals are another strong fit. Aircraft
issue handbooks are a good example because procedures often branch by symptom,
aircraft configuration, warning state, or previous action result.

Useful behavior includes:

- Treating the selected path as the active procedure.
- Showing sibling procedures as alternatives for the current step.
- Collapsing deep branches behind counts or severity indicators.
- Filtering visible branches by aircraft model, subsystem, training mode, or
  failure category.
- Recording the selected path as a training or audit artifact.
- Validating required steps before downstream steps become selectable.

This use case suggests that `BranchingTree` values need to stay fully generic,
but helper APIs can make metadata-driven filtering and projection easier.

## Adaptive learning paths

Adaptive learning paths use the selected path as the learner's route through
material. Siblings can represent alternate explanations, difficulty levels,
practice exercises, or remediation paths.

Useful behavior includes:

- Showing the learner's current path through a lesson.
- Offering alternative explanations at the same concept.
- Expanding follow-up exercises based on performance or interest.
- Collapsing future material behind summary counts.
- Persisting the selected path as progress state.

This use case is fully supported when each learning route is tree-shaped and
shared references remain outside the core tree.

## Planning and agent exploration trees

Planning workflows also match the model. A node can represent a proposed step,
tool call, result, retry, or alternative plan. The selected path is the current
candidate plan or executed route.

Useful behavior includes:

- Comparing alternate plan branches.
- Keeping failed attempts available for inspection.
- Selecting the current execution path.
- Truncating and regenerating downstream steps after a decision changes.
- Summarizing unexplored or discarded branches.

This use case is close to chat history, but the values represent actions and
results rather than messages.

## Branching forms and configuration wizards

Branching forms are another strict-tree use case. Each answer determines which
question or configuration step appears next. Siblings are alternative answers
or mutually exclusive configuration choices.

Useful behavior includes:

- Rendering the selected path as the current configuration.
- Switching earlier answers and updating downstream choices.
- Preserving alternative paths for comparison.
- Exporting the selected path as a final configuration artifact.
- Deleting or truncating branches after a changed answer.

This use case is fully supported when each configuration option owns its
downstream choices.

## Adjacent use cases and limits

Some domains are related to the selected-path pattern but aren't fully modeled
by a strict tree. They are still useful for planning because they show where
the core structure must stop and where overlay data begins.

### Neural network inference topology

Neural network inference flow is related, but it stresses the model in a
different way. CNN, NN, and DNN topologies are often directed acyclic graphs
rather than strict trees. Skip connections, shared layers, and multi-input
operations don't map cleanly to a parent-owned child tree.

The tree model can still be useful for selected execution paths and simplified
views:

- A path can represent the active route through conditional routing, mixture of
  experts, or dynamic inference.
- Siblings can represent alternative operators, model versions, pruning choices,
  or routing branches.
- Hidden child counts can summarize collapsed layer groups or subgraphs.
- Node metadata can carry tensor shape, operator type, latency, memory cost, or
  activation statistics.

For full neural network topology, a pure tree is probably not enough. The
refactor can still support this direction by separating the core tree from
projection helpers:

- Keep `BranchingTree` as the selected-path tree.
- Add projection APIs that can emit renderable nodes, edges, groups, and
  annotations.
- Allow callers to overlay secondary links for cross-connections without making
  them part of the ownership tree.

## Refactoring direction

The next refactor needs to avoid turning the core library into a demo-specific
renderer. A better split is:

- **Core tree:** Stores nodes, parent-child ownership, selected siblings, and
  cached selected paths.
- **Read models:** Produce typed snapshots for selected paths, sibling groups,
  neighborhoods, and full-tree summaries.
- **Projection adapters:** Convert read models into render-friendly graph
  primitives.
- **Demo renderer:** Owns SVG layout, colors, interaction, minimap behavior, and
  domain-specific message presentation.

This split keeps chat-specific UI code out of the library while still giving
applications enough structure to build maps like the demo.

## API pressure

These use cases point to the read models and extension points that matter most.
The first helpers belong in the core library; the rest can stay in adapters or
application state.

- `getFullTopology()` returns all reachable graph facts without layout.
- `getSelectedPathNeighborhood()` accepts depth and sibling limits.
- `getBranchSummary(id)` returns descendant counts, leaf counts, depth, and
  branch point counts for a subtree.
- `getPathEntriesTo(id)` returns path entries without mutating the selected
  path.
- Applications can store expansion state outside the core tree and combine it
  with topology helpers when rendering lazy exploration maps.
- `getSiblingGroup(id)` could return a stable group object for rendering version
  clusters.
- Projection helpers could accept callbacks for labels, groups, metadata, and
  filtering.
- Edge helper APIs could support derived edge labels without storing edge
  values in the core tree.
- Secondary overlay edges could represent cross-links for decision manuals or
  neural network diagrams.

## Design constraints

The refactor needs to preserve the properties that make the current library
useful.

- Keep selected path reads O(1).
- Keep mutation APIs explicit and predictable.
- Keep serialized state compact and framework-independent.
- Keep layout and DOM rendering outside the core package.
- Keep helpers deterministic so renderers can preserve node positions.
- Avoid requiring reactive frameworks in the library.
- Avoid making the data model chat-specific.

## Open questions

These questions need answers before a larger API change.

- Should edge labels be derived by callbacks or stored as first-class data?
- Should filters hide nodes, collapse nodes, or produce grouped summary nodes?
- Should cross-links be part of core state, or an external overlay layer?
- How much of the current demo layout belongs in reusable helper functions?
- Should expanding ego graph state use application metadata, wrapper state, or
  a separate adapter package?

## Next steps

Use this document to plan the next small, reversible refactor before adding more
demo features.

1. Decide whether sibling groups need a first-class read model.
2. Keep SVG layout, minimap, and interaction code inside `demo/`.
3. Prototype expanding ego graph state outside the core tree.
4. Add tests for any new core helper before changing the demo.
5. Update the README after each stable API addition.
