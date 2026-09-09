import type {
  BranchingTreeTopologyNode,
  BranchingTreeTopologyEdge,
  Identified,
} from "../../branching-tree";

export type MinimapPlacement = {
  xById: Map<string, number>;
  depthById: Map<string, number>;
  maxX: number;
  maxDepth: number;
};

export function placeMinimapNodes(
  nodes: readonly Pick<BranchingTreeTopologyNode<Identified>, "nodeId" | "depth">[],
  edges: readonly Pick<BranchingTreeTopologyEdge, "parentId" | "childId">[],
): MinimapPlacement {
  const xById = new Map<string, number>();
  const depthById = new Map<string, number>();
  const childIdsByParent = new Map<string, string[]>();
  const childIds = new Set<string>();
  let leafCursor = 0;
  let maxDepth = 0;

  for (const edge of edges) {
    childIds.add(edge.childId);
    const children = childIdsByParent.get(edge.parentId);
    if (children) {
      children.push(edge.childId);
    } else {
      childIdsByParent.set(edge.parentId, [edge.childId]);
    }
  }

  // Post-order traversal keeps branch centering independent of call-stack depth.
  const stack = nodes
    .filter((node) => !childIds.has(node.nodeId))
    .reverse()
    .map((node) => ({ id: node.nodeId, depth: node.depth, expanded: false }));

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) break;
    const { id, depth, expanded } = frame;
    const children = childIdsByParent.get(id) ?? [];

    if (expanded) {
      let sum = 0;
      for (const childId of children) sum += xById.get(childId) ?? 0;
      xById.set(id, sum / children.length);
      continue;
    }

    depthById.set(id, depth);
    maxDepth = Math.max(maxDepth, depth);
    if (children.length === 0) {
      xById.set(id, leafCursor++);
      continue;
    }

    stack.push({ id, depth, expanded: true });
    for (let index = children.length - 1; index >= 0; index--) {
      const childId = children[index];
      if (childId !== undefined) stack.push({ id: childId, depth: depth + 1, expanded: false });
    }
  }

  return { xById, depthById, maxX: Math.max(0, leafCursor - 1), maxDepth };
}
