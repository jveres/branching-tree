import {
  type BranchingTreeNode,
  type BranchingTreeState,
  type Identified,
  ROOT_NODE_ID,
} from "../../branching-tree";

export type ChatRole = "user" | "assistant";

export type DemoMessage = Identified & {
  role: ChatRole;
  content: string;
  tokenCount: number;
  turn: number;
};

const prompts = [
  "Compare retrieval strategies for a product assistant.",
  "Turn this answer into a terse status update.",
  "List risks before shipping the conversation view.",
  "Draft a migration note for persisted branches.",
  "Explain why sibling navigation must stay cheap.",
  "Summarize the selected branch for a support agent.",
  "Propose labels for alternate assistant drafts.",
  "Refine the wording without changing meaning.",
];

const answers = [
  "Use a compact branch map, preserve every version, and defer expensive work until the structure changes.",
  "The selected path remains the visible transcript while nearby siblings provide fast version switching.",
  "Cache layout positions separately from selection state so node clicks only update a small set of classes.",
  "Render edges once and update selection classes without rebuilding the graph.",
  "Keep message metadata close to each node so the inspector can update without scanning the DOM.",
  "Treat regeneration as branch pruning followed by append, not as a wholesale transcript rewrite.",
  "Store stable ids for every message version to make persisted paths and links durable.",
  "Use sibling counts and indexes to drive version controls at each message depth.",
];

export function createDemoState(targetNodeCount: number): BranchingTreeState<DemoMessage> {
  const root = createRootNode();
  const nodes: Record<string, BranchingTreeNode<DemoMessage>> = {
    [ROOT_NODE_ID]: root,
  };
  const queue: Array<{ id: string; depth: number; seed: number }> = [
    { id: ROOT_NODE_ID, depth: -1, seed: 1 },
  ];
  let nextId = 1;
  let userLeafCount = 0;
  let queueIndex = 0;

  while (queueIndex < queue.length && nextId <= targetNodeCount) {
    const parentInfo = queue[queueIndex++];
    if (!parentInfo) break;

    const parent = nodes[parentInfo.id];
    if (!parent) continue;

    const remaining = targetNodeCount - nextId + 1;
    const childCount = getChildCount(
      parent,
      parentInfo.depth,
      parentInfo.seed,
      remaining,
      userLeafCount,
    );
    if (childCount === 0) continue;

    // This parent stops being a leaf; each new user child needs a reply.
    if (parent.value?.role === "user") userLeafCount--;

    const childIds: string[] = [];
    for (let index = 0; index < childCount; index++) {
      const id = `msg-${String(nextId).padStart(4, "0")}`;
      const depth = parentInfo.depth + 1;
      const turn = Math.max(0, Math.floor(depth / 2));
      const value = createMessage(id, depth, turn, index, childCount, parentInfo.seed);

      nodes[id] = {
        id,
        value,
        parentId: parent.id,
        childrenIds: [],
        selectedChildIndex: 0,
      };
      childIds.push(id);
      if (value.role === "user") userLeafCount++;
      queue.push({ id, depth, seed: parentInfo.seed + index + nextId });
      nextId++;
    }

    parent.childrenIds.push(...childIds);
    parent.selectedChildIndex = Math.min(
      childIds.length - 1,
      Math.abs(parentInfo.seed + parentInfo.depth) % childIds.length,
    );
  }

  return { rootId: ROOT_NODE_ID, nodes };
}

export function createMessage(
  id: string,
  depth: number,
  turn: number,
  siblingIndex: number,
  siblingCount: number,
  seed: number,
): DemoMessage {
  const role = getRole(depth);
  const source = role === "assistant" ? answers : prompts;
  const text =
    source[Math.abs(seed + siblingIndex + depth) % source.length] ?? source[0] ?? "Message";
  const versionLabel = getVersionLabel(siblingIndex, siblingCount);

  return {
    id,
    role,
    content: `${text} ${versionLabel === "main" ? "" : `Alternative ${versionLabel}.`}`.trim(),
    tokenCount: 18 + ((seed + depth * 7 + siblingIndex * 11) % 180),
    turn,
  };
}

function getChildCount(
  parent: BranchingTreeNode<DemoMessage>,
  depth: number,
  seed: number,
  remaining: number,
  userLeafCount: number,
): number {
  const isUserLeaf = parent.value?.role === "user" && parent.childrenIds.length === 0;
  const pendingRequiredReplies = userLeafCount - (isUserLeaf ? 1 : 0);
  const capacity = remaining - pendingRequiredReplies;

  if (capacity <= 0) return 0;
  if (depth < 0) return capacity >= 2 ? 1 : 0;

  const desiredCount = getDesiredChildCount(depth, seed);
  if (parent.value?.role === "user") {
    return Math.min(capacity, Math.max(isUserLeaf ? 1 : 0, desiredCount));
  }

  return Math.min(Math.floor(capacity / 2), desiredCount);
}

function getDesiredChildCount(depth: number, seed: number): number {
  if (depth < 0) return 1;

  const roll = getSampleRoll(depth, seed);
  if (depth <= 1) return 2 + ((roll + seed) % 3);
  if (depth <= 4) return [1, 2, 3, 1, 4, 2, 1, 3][roll % 8] ?? 1;
  if (depth <= 8) return [0, 1, 2, 1, 3, 0, 2, 1, 4, 0, 1, 2, 0, 3, 1, 2][roll] ?? 0;
  if (depth <= 12) return roll % 5 === 0 ? 2 : roll % 3 === 0 ? 1 : 0;
  return roll === 0 ? 1 : 0;
}

function getSampleRoll(depth: number, seed: number): number {
  return Math.abs(seed * seed * 7 + seed * 11 + depth * 13) % 16;
}

function getRole(depth: number): ChatRole {
  return depth % 2 === 0 ? "user" : "assistant";
}

export function getVersionLabel(siblingIndex: number, siblingCount: number): string {
  return siblingCount === 1 ? "main" : `v${siblingIndex + 1}/${siblingCount}`;
}

function createRootNode(): BranchingTreeNode<DemoMessage> {
  return {
    id: ROOT_NODE_ID,
    parentId: null,
    childrenIds: [],
    selectedChildIndex: 0,
  };
}
