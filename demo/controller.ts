import {
  BranchingTree,
  ROOT_NODE_ID,
  type BranchingTreeNode,
  type BranchingTreeSiblingEntry,
  type BranchingTreeState,
  type Identified,
} from "../branching-tree";
import { setDemoActions } from "./actions";
import demoStore, { type DemoSize } from "./store";

type ChatRole = "user" | "assistant";

type DemoMessage = Identified & {
  role: ChatRole;
  content: string;
  tokenCount: number;
  turn: number;
};

type PositionedNode = {
  id: string;
  parentId: string | null;
  value: DemoMessage;
  x: number;
  y: number;
  depth: number;
  siblingIndex: number;
  siblingCount: number;
  descendantCount: number;
};

type PositionedEdge = {
  id: string;
  d: string;
};

type LayoutModel = {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  nodeById: Map<string, PositionedNode>;
  edgeIds: Set<string>;
  width: number;
  height: number;
  maxDepth: number;
  branchCount: number;
  messageCount: number;
  linkCount: number;
};

type CachedPosition = {
  x: number;
  y: number;
};

type Camera = {
  x: number;
  y: number;
  scale: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startCameraX: number;
  startCameraY: number;
  nodeId: string | null;
  moved: boolean;
};

type CanvasSize = {
  width: number;
  height: number;
};

type ContentBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const SVG_NS = "http://www.w3.org/2000/svg";
const NODE_WIDTH = 190;
const NODE_HEIGHT = 52;
const VERSION_GAP = 18;
const COLUMN_WIDTH = NODE_WIDTH + VERSION_GAP;
const ROW_GAP = 96;
const MAP_PADDING = 48;
const FIT_PADDING = 28;
const CANVAS_PADDING = 96;
const ROOT_X = MAP_PADDING + NODE_WIDTH / 2 + COLUMN_WIDTH * 3;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.8;
const DEFAULT_SIZE: DemoSize = 128;
const DRAG_THRESHOLD = 4;
const WHEEL_ZOOM_SPEED = 0.0015;

const roleLabels: Record<ChatRole, string> = {
  assistant: "AI",
  user: "YOU",
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

let svg: SVGSVGElement;
let mapPanel: HTMLElement;

let tree = new BranchingTree<DemoMessage>();
let layout: LayoutModel = createEmptyLayout();
let nodeElements = new Map<string, SVGGElement>();
let edgeElements = new Map<string, SVGPathElement>();
let positionCache = new Map<string, CachedPosition>();
let selectedNodeIds = new Set<string>();
let selectedEdgeIds = new Set<string>();
let selectedHeadId: string | null = null;
let viewportGroup: SVGGElement | null = null;
let edgeLayer: SVGGElement | null = null;
let nodeLayer: SVGGElement | null = null;
let dragState: DragState | null = null;
let inspectorNodeId: string | null = null;
let suppressNextClick = false;
let currentSize: DemoSize = DEFAULT_SIZE;
let nextGeneratedSeed = DEFAULT_SIZE + 1;
let camera: Camera = { x: 0, y: 0, scale: 1 };
let demoStarted = false;

export function startDemo(): void {
  if (demoStarted) return;
  demoStarted = true;

  svg = mustElement<SVGSVGElement>("tree-map");
  mapPanel = mustElement<HTMLElement>("map-panel");

  setDemoActions({
    addChild,
    addVersion,
    deleteBranch,
    deleteSiblingGroup,
    fitMap,
    keepOnlyVersion,
    loadLinearTranscript,
    loadSize(size) {
      loadTree(size);
      setActiveSizeButton(size);
    },
    nextVersion() {
      selectAdjacentSibling(1);
    },
    previousVersion() {
      selectAdjacentSibling(-1);
    },
    resetTree() {
      loadTree(currentSize);
      setActiveSizeButton(currentSize);
    },
    selectNode,
    selectSiblingVersion,
    truncateAfterSelection,
    zoomIn() {
      zoomBy(1.18);
    },
    zoomOut() {
      zoomBy(0.85);
    },
  });

  mapPanel.addEventListener("click", (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }

    const node = getNodeElement(event.target);
    const id = node?.dataset.id;
    if (id) selectNode(id);
  });

  svg.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    const node = getNodeElement(event.target);
    const id = node?.dataset.id;
    if (!id) return;

    event.preventDefault();
    selectNode(id);
  });

  mapPanel.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;

    event.preventDefault();
    document.body.classList.add("is-map-dragging");

    const node = getNodeElement(event.target);
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCameraX: camera.x,
      startCameraY: camera.y,
      nodeId: node?.dataset.id ?? null,
      moved: false,
    };
    mapPanel.setPointerCapture(event.pointerId);
  });

  mapPanel.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD) {
      dragState.moved = true;
      mapPanel.classList.add("is-dragging");
    }

    if (!dragState.moved) return;

    event.preventDefault();
    camera = {
      ...camera,
      x: dragState.startCameraX + deltaX,
      y: dragState.startCameraY + deltaY,
    };
    applyCamera();
  });

  mapPanel.addEventListener("pointerup", (event) => finishDrag(event));
  mapPanel.addEventListener("pointercancel", (event) => finishDrag(event));
  mapPanel.addEventListener("dblclick", (event) => handleDoubleClickZoom(event));
  mapPanel.addEventListener("dragstart", (event) => event.preventDefault());
  mapPanel.addEventListener("selectstart", (event) => event.preventDefault());
  mapPanel.addEventListener("wheel", (event) => handleWheel(event), { passive: false });
  window.addEventListener("resize", () => fitMap());

  loadTree(DEFAULT_SIZE);
}

function loadTree(size: DemoSize): void {
  currentSize = size;
  loadState(createDemoState(size), size + 1);
}

function loadLinearTranscript(): void {
  const transcript = createLinearTranscript();
  loadState(
    BranchingTree.createLinearState(transcript, {
      idFactory: createSequentialIdFactory("linear"),
    }),
    transcript.length + 1,
  );
  setActiveSizeButton(null);
}

function loadState(state: BranchingTreeState<DemoMessage>, nextSeed: number): void {
  const started = performance.now();
  nextGeneratedSeed = nextSeed;
  tree = new BranchingTree(state);
  positionCache = new Map();
  resetSvgLayers();
  layout = createVisibleLayout();
  syncMap(layout);
  fitMap();

  const headId = tree.head?.id ?? layout.nodes[0]?.id;
  if (headId) {
    applySelectionClasses();
    renderInspector(headId);
  } else {
    applySelectionClasses();
    renderEmptyInspector();
  }

  demoStore.renderTime = formatMs(performance.now() - started);
  updateMetrics();
}

function createLinearTranscript(): DemoMessage[] {
  return [
    createImportedMessage("source-user-1", "user", "Summarize the current workspace state.", 0, 38),
    createImportedMessage(
      "source-assistant-1",
      "assistant",
      "The tree keeps one active transcript while preserving alternate message versions.",
      0,
      84,
    ),
    createImportedMessage("source-user-2", "user", "Show the operations a chat UI needs.", 1, 42),
    createImportedMessage(
      "source-assistant-2",
      "assistant",
      "Version switching, branch pruning, truncation, and regeneration all map to tree APIs.",
      1,
      92,
    ),
  ];
}

function createImportedMessage(
  id: string,
  role: ChatRole,
  content: string,
  turn: number,
  tokenCount: number,
): DemoMessage {
  return { id, role, content, tokenCount, turn };
}

function createSequentialIdFactory(prefix: string): () => string {
  let nextId = 1;
  return () => `${prefix}-${String(nextId++).padStart(4, "0")}`;
}

function createDemoState(targetNodeCount: number): BranchingTreeState<DemoMessage> {
  const root = createRootNode();
  const nodes: Record<string, BranchingTreeNode<DemoMessage>> = {
    [ROOT_NODE_ID]: root,
  };
  const queue: Array<{ id: string; depth: number; seed: number }> = [
    { id: ROOT_NODE_ID, depth: -1, seed: 1 },
  ];
  let nextId = 1;

  while (queue.length > 0 && nextId <= targetNodeCount) {
    const parentInfo = queue.shift();
    if (!parentInfo) break;

    const parent = nodes[parentInfo.id];
    if (!parent) continue;

    const remaining = targetNodeCount - nextId + 1;
    const childCount = Math.min(remaining, getChildCount(parentInfo.depth, parentInfo.seed));
    if (childCount === 0) continue;

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

function createMessage(
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

function getChildCount(depth: number, seed: number): number {
  if (depth < 0) return 1;
  if (depth > 15) return seed % 3 === 0 ? 1 : 0;
  if (depth % 5 === 1) return 4;
  if (depth % 3 === 0) return 3;
  if (depth % 2 === 0) return 2;
  return 1;
}

function getRole(depth: number): ChatRole {
  return depth % 2 === 0 ? "user" : "assistant";
}

function getVersionLabel(siblingIndex: number, siblingCount: number): string {
  return siblingCount === 1 ? "main" : `v${siblingIndex + 1}/${siblingCount}`;
}

function createVisibleLayout(): LayoutModel {
  const state = tree.getState();
  const stats = tree.getStats();
  const descendantCounts = createDescendantCounts(state);
  const nodes: PositionedNode[] = [];
  const edges: PositionedEdge[] = [];
  const nodeById = new Map<string, PositionedNode>();
  const edgeIds = new Set<string>();
  const entries = tree.selectedPathEntries;

  for (let depth = 0; depth < entries.length; depth++) {
    const entry = entries[depth];
    if (!entry) continue;

    const siblings = tree.getSiblingEntries(entry.nodeId);
    const positions = getSiblingPositions(siblings, entry.nodeId, depth);

    for (const sibling of siblings) {
      const position = positions.get(sibling.nodeId);
      if (!position) continue;

      const node: PositionedNode = {
        id: sibling.nodeId,
        parentId: sibling.parentId,
        value: sibling.value,
        x: position.x,
        y: position.y,
        depth,
        siblingIndex: sibling.siblingIndex,
        siblingCount: sibling.siblingCount,
        descendantCount: descendantCounts.get(sibling.nodeId) ?? 0,
      };

      nodes.push(node);
      nodeById.set(node.id, node);
    }
  }

  for (const child of nodes) {
    if (child.parentId === null || child.parentId === state.rootId) continue;

    const parent = nodeById.get(child.parentId);
    if (!parent) continue;

    const edge: PositionedEdge = {
      id: createEdgeId(parent.id, child.id),
      d: createEdgePath(parent, child),
    };
    edges.push(edge);
    edgeIds.add(edge.id);
  }

  const bounds = getLayoutBounds(nodes);
  const messageCount = Math.max(0, stats.totalNodes - 1);

  return {
    nodes,
    edges,
    nodeById,
    edgeIds,
    width: bounds.width,
    height: bounds.height,
    maxDepth: stats.maxDepth,
    branchCount: stats.branchPoints,
    messageCount,
    linkCount: Math.max(0, messageCount - 1),
  };
}

function getSiblingPositions(
  siblings: readonly BranchingTreeSiblingEntry<DemoMessage>[],
  selectedNodeId: string,
  depth: number,
): Map<string, CachedPosition> {
  const positions = new Map<string, CachedPosition>();
  const y = MAP_PADDING + NODE_HEIGHT / 2 + depth * ROW_GAP;
  const cachedAnchor = siblings
    .map((sibling) => ({ sibling, position: positionCache.get(sibling.nodeId) }))
    .find((entry) => entry.position !== undefined);
  const selected = siblings.find((sibling) => sibling.nodeId === selectedNodeId) ?? siblings[0];
  if (!selected) return positions;

  const parentPosition = selected.parentId ? positionCache.get(selected.parentId) : undefined;
  const anchorSibling = cachedAnchor?.sibling ?? selected;
  const anchorPosition = cachedAnchor?.position;
  const anchorX = anchorPosition?.x ?? parentPosition?.x ?? ROOT_X;
  const anchorIndex = anchorSibling.siblingIndex;
  const planned = siblings.map((sibling) => ({
    sibling,
    x: anchorX + (sibling.siblingIndex - anchorIndex) * COLUMN_WIDTH,
  }));
  const left = Math.min(...planned.map((item) => item.x - NODE_WIDTH / 2));
  const offset = left < MAP_PADDING ? MAP_PADDING - left : 0;

  for (const item of planned) {
    const cached = positionCache.get(item.sibling.nodeId);
    const position = cached ?? { x: item.x + offset, y };
    positionCache.set(item.sibling.nodeId, position);
    positions.set(item.sibling.nodeId, position);
  }

  return positions;
}

function getLayoutBounds(nodes: readonly PositionedNode[]): { width: number; height: number } {
  let maxRight = MAP_PADDING + NODE_WIDTH;
  let maxBottom = MAP_PADDING + NODE_HEIGHT;

  for (const node of nodes) {
    maxRight = Math.max(maxRight, node.x + NODE_WIDTH / 2);
    maxBottom = Math.max(maxBottom, node.y + NODE_HEIGHT / 2);
  }

  return {
    width: maxRight + MAP_PADDING,
    height: maxBottom + MAP_PADDING,
  };
}

function createDescendantCounts(
  state: BranchingTreeState<DemoMessage>,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();

  const countFor = (id: string): number => {
    const existing = counts.get(id);
    if (existing !== undefined) return existing;

    const node = state.nodes[id];
    if (!node) {
      counts.set(id, 0);
      return 0;
    }

    let total = 0;
    for (const childId of node.childrenIds) {
      total += 1 + countFor(childId);
    }
    counts.set(id, total);
    return total;
  };

  countFor(state.rootId);
  return counts;
}

function resetSvgLayers(): void {
  nodeElements = new Map();
  edgeElements = new Map();
  selectedNodeIds = new Set();
  selectedEdgeIds = new Set();
  selectedHeadId = null;
  svg.textContent = "";

  viewportGroup = svgElement("g");
  edgeLayer = svgElement("g");
  nodeLayer = svgElement("g");
  viewportGroup.append(edgeLayer, nodeLayer);
  svg.append(viewportGroup);
  applyCamera();
}

function syncMap(model: LayoutModel): void {
  removeMissingElements(edgeElements, (id) => model.edgeIds.has(id));
  removeMissingElements(nodeElements, (id) => model.nodeById.has(id));

  for (const edge of model.edges) {
    const element = edgeElements.get(edge.id);
    if (element) {
      element.setAttribute("d", edge.d);
    } else {
      appendEdgeElement(edge);
    }
  }

  for (const node of model.nodes) {
    const element = nodeElements.get(node.id);
    if (element) {
      element.setAttribute("transform", `translate(${node.x} ${node.y})`);
      updateNodeElement(element, node);
    } else {
      appendNodeElement(node);
    }
  }

  applyCamera();
}

function removeMissingElements<T extends Element>(
  elements: Map<string, T>,
  hasNextElement: (id: string) => boolean,
): void {
  for (const [id, element] of elements) {
    if (!hasNextElement(id)) {
      element.remove();
      elements.delete(id);
    }
  }
}

function appendEdgeElement(edge: PositionedEdge): void {
  if (!edgeLayer) return;

  const path = svgElement("path");
  path.setAttribute("class", "tree-edge");
  path.setAttribute("d", edge.d);
  path.dataset.id = edge.id;
  edgeElements.set(edge.id, path);
  edgeLayer.append(path);
}

function appendNodeElement(node: PositionedNode): void {
  if (!nodeLayer) return;

  const group = svgElement("g");
  const rect = svgElement("rect");
  const role = svgElement("text");
  const label = svgElement("text");
  const meta = svgElement("text");
  const title = svgElement("title");
  const versionLabel = getVersionLabel(node.siblingIndex, node.siblingCount);

  group.setAttribute("class", `tree-node role-${node.value.role} is-new`);
  group.setAttribute("transform", `translate(${node.x} ${node.y})`);
  group.setAttribute("tabindex", "0");
  group.setAttribute("role", "treeitem");
  group.setAttribute("aria-label", `${node.value.role} ${node.id} ${versionLabel}`);
  group.dataset.id = node.id;
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }

    selectNode(node.id);
  });

  rect.setAttribute("class", "node-card");
  rect.setAttribute("x", String(-NODE_WIDTH / 2));
  rect.setAttribute("y", String(-NODE_HEIGHT / 2));
  rect.setAttribute("width", String(NODE_WIDTH));
  rect.setAttribute("height", String(NODE_HEIGHT));

  role.setAttribute("class", "node-role");
  role.setAttribute("x", String(-NODE_WIDTH / 2 + 12));
  role.setAttribute("y", "-8");
  role.textContent = roleLabels[node.value.role];

  label.setAttribute("class", "node-label");
  label.setAttribute("x", String(-NODE_WIDTH / 2 + 54));
  label.setAttribute("y", "-8");
  label.textContent = `${node.value.id} · ${versionLabel}`;

  meta.setAttribute("class", "node-meta");
  meta.setAttribute("x", String(-NODE_WIDTH / 2 + 12));
  meta.setAttribute("y", "13");
  meta.textContent = `${node.siblingIndex + 1}/${node.siblingCount} · ${shorten(
    node.value.content,
    node.descendantCount > 0 ? 22 : 30,
  )}`;

  title.textContent = `${node.value.role}: ${node.value.content}`;
  group.append(title, rect, role, label, meta);

  if (node.descendantCount > 0) {
    const badge = svgElement("text");
    badge.setAttribute("class", "node-badge");
    badge.setAttribute("x", String(NODE_WIDTH / 2 - 12));
    badge.setAttribute("y", "13");
    badge.setAttribute("text-anchor", "end");
    badge.textContent = `+${node.descendantCount}`;
    group.append(badge);
  }

  nodeElements.set(node.id, group);
  nodeLayer.append(group);
  window.setTimeout(() => group.classList.remove("is-new"), 220);
}

function updateNodeElement(element: SVGGElement, node: PositionedNode): void {
  const versionLabel = getVersionLabel(node.siblingIndex, node.siblingCount);

  element.classList.remove("role-assistant", "role-user");
  element.classList.add(`role-${node.value.role}`);
  element.setAttribute("aria-label", `${node.value.role} ${node.id} ${versionLabel}`);

  const title = element.querySelector("title");
  if (title) title.textContent = `${node.value.role}: ${node.value.content}`;

  const role = element.querySelector<SVGTextElement>(".node-role");
  if (role) role.textContent = roleLabels[node.value.role];

  const label = element.querySelector<SVGTextElement>(".node-label");
  if (label) label.textContent = `${node.value.id} · ${versionLabel}`;

  const meta = element.querySelector<SVGTextElement>(".node-meta");
  if (meta) {
    meta.textContent = `${node.siblingIndex + 1}/${node.siblingCount} · ${shorten(
      node.value.content,
      node.descendantCount > 0 ? 22 : 30,
    )}`;
  }

  let badge = element.querySelector<SVGTextElement>(".node-badge");
  if (node.descendantCount === 0) {
    badge?.remove();
    return;
  }

  if (!badge) {
    badge = svgElement("text");
    badge.setAttribute("class", "node-badge");
    badge.setAttribute("x", String(NODE_WIDTH / 2 - 12));
    badge.setAttribute("y", "13");
    badge.setAttribute("text-anchor", "end");
    element.append(badge);
  }
  badge.textContent = `+${node.descendantCount}`;
}

function selectNode(id: string, measure = true): void {
  if (!tree.hasNode(id)) return;

  const started = performance.now();
  tree.selectPathTo(id);
  refreshView(id);

  if (measure) demoStore.selectTime = formatMs(performance.now() - started);
}

function refreshView(preferredInspectorId: string | null): void {
  layout = createVisibleLayout();
  syncMap(layout);
  applySelectionClasses();

  const nextInspectorId = getInspectableId(preferredInspectorId);
  if (nextInspectorId) {
    renderInspector(nextInspectorId);
  } else {
    renderEmptyInspector();
  }
  updateMetrics();
}

function getInspectableId(preferredId: string | null): string | null {
  if (preferredId && layout.nodeById.has(preferredId)) return preferredId;

  const headId = tree.head?.id ?? null;
  if (headId && layout.nodeById.has(headId)) return headId;

  return layout.nodes[0]?.id ?? null;
}

function selectSiblingVersion(id: string): void {
  const started = performance.now();
  if (!tree.selectSiblingById(id)) return;

  refreshView(id);
  demoStore.selectTime = formatMs(performance.now() - started);
}

function selectAdjacentSibling(offset: number): void {
  if (!inspectorNodeId) return;

  const siblings = tree.getSiblingEntries(inspectorNodeId);
  const current = siblings.find((entry) => entry.nodeId === inspectorNodeId);
  if (!current) return;

  const next = siblings[current.siblingIndex + offset];
  if (!next) return;

  const started = performance.now();
  if (!tree.selectSibling(inspectorNodeId, offset)) return;

  refreshView(next.nodeId);
  demoStore.selectTime = formatMs(performance.now() - started);
}

function addVersion(): void {
  if (!inspectorNodeId) return;

  const reference = layout.nodeById.get(inspectorNodeId);
  if (!reference) return;

  const started = performance.now();
  const id = createGeneratedId();
  tree.addSibling(inspectorNodeId, {
    ...createGeneratedMessage(
      id,
      reference.depth,
      reference.siblingCount,
      reference.siblingCount + 1,
    ),
    role: reference.value.role,
    turn: reference.value.turn,
  });
  refreshView(id);
  demoStore.selectTime = formatMs(performance.now() - started);
}

function addChild(): void {
  if (!inspectorNodeId) return;

  const parent = layout.nodeById.get(inspectorNodeId);
  if (!parent) return;

  const started = performance.now();
  const state = tree.getState();
  const siblingIndex = state.nodes[inspectorNodeId]?.childrenIds.length ?? 0;
  const depth = parent.depth + 1;
  const id = createGeneratedId();

  tree.appendChild(
    inspectorNodeId,
    createGeneratedMessage(id, depth, siblingIndex, siblingIndex + 1),
  );
  refreshView(id);
  demoStore.selectTime = formatMs(performance.now() - started);
}

function truncateAfterSelection(): void {
  if (!inspectorNodeId) return;

  const id = inspectorNodeId;
  mutateTree(() => tree.truncateAfter(id), id);
}

function keepOnlyVersion(): void {
  if (!inspectorNodeId) return;

  const id = inspectorNodeId;
  mutateTree(() => tree.deleteSiblings(id, { keepTarget: true }), id);
}

function deleteBranch(): void {
  if (!inspectorNodeId) return;

  const id = inspectorNodeId;
  mutateTree(() => tree.deleteBranch(id), null);
}

function deleteSiblingGroup(): void {
  if (!inspectorNodeId) return;

  const id = inspectorNodeId;
  mutateTree(() => tree.deleteSiblings(id), null);
}

function mutateTree(mutator: () => boolean, preferredInspectorId: string | null): void {
  const started = performance.now();
  if (!mutator()) return;

  refreshView(preferredInspectorId);
  demoStore.selectTime = formatMs(performance.now() - started);
}

function createGeneratedId(): string {
  let id = BranchingTree.createNodeId("msg");
  while (tree.hasNode(id)) {
    id = BranchingTree.createNodeId("msg");
  }
  return id;
}

function createGeneratedMessage(
  id: string,
  depth: number,
  siblingIndex: number,
  siblingCount: number,
): DemoMessage {
  const seed = nextGeneratedSeed;
  nextGeneratedSeed++;

  return createMessage(
    id,
    depth,
    Math.max(0, Math.floor(depth / 2)),
    siblingIndex,
    siblingCount,
    seed,
  );
}

function applySelectionClasses(): void {
  const nextNodeIds = new Set(tree.selectedPath.map((value) => value.id));
  const nextEdgeIds = new Set<string>();
  const path = tree.selectedPath;

  for (let index = 1; index < path.length; index++) {
    const parent = path[index - 1];
    const child = path[index];
    if (parent && child) nextEdgeIds.add(createEdgeId(parent.id, child.id));
  }

  const nextHeadId = path.at(-1)?.id ?? null;

  toggleClasses(nodeElements, selectedNodeIds, nextNodeIds, "is-selected");
  toggleClasses(edgeElements, selectedEdgeIds, nextEdgeIds, "is-selected");

  if (selectedHeadId && selectedHeadId !== nextHeadId) {
    nodeElements.get(selectedHeadId)?.classList.remove("is-head");
  }
  if (nextHeadId) nodeElements.get(nextHeadId)?.classList.add("is-head");

  selectedNodeIds = nextNodeIds;
  selectedEdgeIds = nextEdgeIds;
  selectedHeadId = nextHeadId;
}

function renderInspector(id: string): void {
  const node = layout.nodeById.get(id);
  if (!node) return;

  inspectorNodeId = id;
  const siblingPosition = tree.getSiblingPosition(id);
  demoStore.messageTitle = `${node.value.id} · turn ${node.value.turn}`;
  demoStore.messageRole = node.value.role;
  demoStore.messageVersion = `${siblingPosition.current}/${siblingPosition.total}`;
  demoStore.messageTokens = String(node.value.tokenCount);
  demoStore.messageContent = node.value.content;

  renderSiblingList(id);
  renderPathList();
  updateActionButtons(id);
}

function renderEmptyInspector(): void {
  inspectorNodeId = null;
  demoStore.messageTitle = "No message";
  demoStore.messageRole = "-";
  demoStore.messageVersion = "-";
  demoStore.messageTokens = "-";
  demoStore.messageContent = "";
  demoStore.siblings = [];
  demoStore.pathEntries = [];
  updateActionButtons(null);
}

function renderSiblingList(id: string): void {
  demoStore.siblings = tree.getSiblingEntries(id).map((entry) => ({
    index: String(entry.siblingIndex + 1),
    label: `${entry.value.id} ${getVersionLabel(entry.siblingIndex, entry.siblingCount)}`,
    nodeId: entry.nodeId,
    role: entry.value.role,
    selected: entry.selected,
  }));
}

function renderPathList(): void {
  const entries = tree.selectedPathEntries;
  const headId = tree.head?.id;
  demoStore.pathEntries = entries.map((entry) => ({
    head: entry.value.id === headId,
    label: `${entry.value.id} · ${entry.value.role} · ${entry.siblingIndex + 1}/${entry.siblingCount}`,
    nodeId: entry.nodeId,
  }));
}

function updateActionButtons(id: string | null): void {
  const entry = id
    ? tree.selectedPathEntries.find((pathEntry) => pathEntry.nodeId === id)
    : undefined;
  const hasSelection = id !== null;
  const hasSiblings = (entry?.siblingCount ?? 0) > 1;

  demoStore.canPreviousVersion = entry?.hasPreviousSibling === true;
  demoStore.canNextVersion = entry?.hasNextSibling === true;
  demoStore.canAddVersion = hasSelection;
  demoStore.canAddChild = hasSelection;
  demoStore.canTruncate = id !== null && tree.hasChildren(id);
  demoStore.canKeepOnlyVersion = hasSelection && hasSiblings;
  demoStore.canDelete = hasSelection;
  demoStore.canDeleteVersions = hasSelection;
}

function setActiveSizeButton(size: DemoSize | null): void {
  demoStore.currentSize = size;
}

function updateMetrics(): void {
  demoStore.nodeCount = String(layout.messageCount);
  demoStore.edgeCount = String(layout.linkCount);
  demoStore.pathCount = String(tree.selectedPath.length);
  demoStore.summary = `${layout.messageCount} messages · ${layout.branchCount} branch points · depth ${layout.maxDepth}`;
}

function fitMap(): void {
  const bounds = mapPanel.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) return;

  const content = getContentBounds();
  const nextScale = Math.min(
    (bounds.width - FIT_PADDING * 2) / content.width,
    (bounds.height - FIT_PADDING * 2) / content.height,
    MAX_ZOOM,
  );
  camera = { x: 0, y: 0, scale: clamp(nextScale, MIN_ZOOM, MAX_ZOOM) };
  centerCamera(content, bounds);
  applyCamera();
}

function centerCamera(
  content = getContentBounds(),
  bounds = mapPanel.getBoundingClientRect(),
): void {
  camera = {
    ...camera,
    x:
      (bounds.width - content.width * camera.scale) / 2 -
      CANVAS_PADDING -
      content.left * camera.scale,
    y:
      (bounds.height - content.height * camera.scale) / 2 -
      CANVAS_PADDING -
      content.top * camera.scale,
  };
}

function getContentBounds(): ContentBounds {
  if (layout.nodes.length === 0) return { left: 0, top: 0, width: 1, height: 1 };

  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const node of layout.nodes) {
    left = Math.min(left, node.x - NODE_WIDTH / 2);
    right = Math.max(right, node.x + NODE_WIDTH / 2);
    top = Math.min(top, node.y - NODE_HEIGHT / 2);
    bottom = Math.max(bottom, node.y + NODE_HEIGHT / 2);
  }

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function zoomBy(factor: number): void {
  const bounds = mapPanel.getBoundingClientRect();
  zoomAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, factor);
}

function zoomAt(clientX: number, clientY: number, factor: number): void {
  const nextScale = clamp(camera.scale * factor, MIN_ZOOM, MAX_ZOOM);
  if (nextScale === camera.scale) return;

  const bounds = mapPanel.getBoundingClientRect();
  const pointX = mapPanel.scrollLeft + clientX - bounds.left;
  const pointY = mapPanel.scrollTop + clientY - bounds.top;
  const contentX = (pointX - CANVAS_PADDING - camera.x) / camera.scale;
  const contentY = (pointY - CANVAS_PADDING - camera.y) / camera.scale;

  camera = {
    scale: nextScale,
    x: pointX - CANVAS_PADDING - contentX * nextScale,
    y: pointY - CANVAS_PADDING - contentY * nextScale,
  };
  applyCamera();
}

function applyCamera(): void {
  const canvas = getCanvasSize();
  svg.setAttribute("width", String(Math.ceil(canvas.width)));
  svg.setAttribute("height", String(Math.ceil(canvas.height)));
  svg.setAttribute("viewBox", `0 0 ${canvas.width} ${canvas.height}`);
  viewportGroup?.setAttribute(
    "transform",
    `translate(${CANVAS_PADDING + camera.x} ${CANVAS_PADDING + camera.y}) scale(${camera.scale})`,
  );
}

function getCanvasSize(): CanvasSize {
  const bounds = mapPanel.getBoundingClientRect();
  const contentWidth = layout.width * camera.scale + CANVAS_PADDING * 2;
  const contentHeight = layout.height * camera.scale + CANVAS_PADDING * 2;

  return {
    width: Math.max(bounds.width, contentWidth),
    height: Math.max(bounds.height, contentHeight),
  };
}

function handleWheel(event: WheelEvent): void {
  event.preventDefault();

  if (event.shiftKey) {
    panBy(-event.deltaX - event.deltaY, 0);
    return;
  }

  zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED));
}

function handleDoubleClickZoom(event: MouseEvent): void {
  event.preventDefault();
  zoomAt(event.clientX, event.clientY, event.altKey ? 0.75 : 1.35);
}

function panBy(deltaX: number, deltaY: number): void {
  camera = {
    ...camera,
    x: camera.x + deltaX,
    y: camera.y + deltaY,
  };
  applyCamera();
}

function finishDrag(event: PointerEvent): void {
  if (!dragState || dragState.pointerId !== event.pointerId) return;

  const { moved, nodeId } = dragState;
  if (mapPanel.hasPointerCapture(event.pointerId)) {
    mapPanel.releasePointerCapture(event.pointerId);
  }
  mapPanel.classList.remove("is-dragging");
  document.body.classList.remove("is-map-dragging");
  dragState = null;

  suppressNextClick = moved || nodeId !== null;
  if (!moved && nodeId) selectNode(nodeId);
}

function createEdgePath(parent: PositionedNode, child: PositionedNode): string {
  const startX = parent.x;
  const startY = parent.y + NODE_HEIGHT / 2;
  const endX = child.x;
  const endY = child.y - NODE_HEIGHT / 2;
  const distance = Math.max(32, endY - startY);

  return `M ${startX} ${startY} C ${startX} ${startY + distance * 0.4}, ${endX} ${endY - distance * 0.4}, ${endX} ${endY}`;
}

function createRootNode(): BranchingTreeNode<DemoMessage> {
  return {
    id: ROOT_NODE_ID,
    parentId: null,
    childrenIds: [],
    selectedChildIndex: 0,
  };
}

function createEmptyLayout(): LayoutModel {
  return {
    nodes: [],
    edges: [],
    nodeById: new Map(),
    edgeIds: new Set(),
    width: 1,
    height: 1,
    maxDepth: 0,
    branchCount: 0,
    messageCount: 0,
    linkCount: 0,
  };
}

function toggleClasses<T extends Element>(
  elements: Map<string, T>,
  previousIds: Set<string>,
  nextIds: Set<string>,
  className: string,
): void {
  for (const id of previousIds) {
    if (!nextIds.has(id)) elements.get(id)?.classList.remove(className);
  }

  for (const id of nextIds) {
    if (!previousIds.has(id)) elements.get(id)?.classList.add(className);
  }
}

function createEdgeId(parentId: string, childId: string): string {
  return `${parentId}->${childId}`;
}

function getNodeElement(target: EventTarget | null): SVGGElement | null {
  return target instanceof Element ? target.closest<SVGGElement>(".tree-node") : null;
}

function svgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

function mustElement<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing demo element #${id}.`);
  return element as unknown as T;
}

function shorten(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatMs(value: number): string {
  return `${value.toFixed(value < 10 ? 2 : 1)} ms`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
