import {
  BranchingTree,
  ROOT_NODE_ID,
  type BranchingTreeNode,
  type BranchingTreePathNeighborhoodEdge,
  type BranchingTreePathNeighborhoodNode,
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
  selected: boolean;
  hiddenChildCount: number;
};

type PositionedEdge = BranchingTreePathNeighborhoodEdge & {
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
const ROW_GAP = 112;
const MAP_PADDING = 48;
const FIT_PADDING = 28;
const CANVAS_PADDING = 96;
const ROOT_X = MAP_PADDING + NODE_WIDTH / 2 + COLUMN_WIDTH * 3;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.8;
const DEFAULT_SIZE: DemoSize = 128;
const DRAG_THRESHOLD = 4;
const WHEEL_ZOOM_SPEED = 0.0015;
const CHILD_INDICATOR_RADIUS = 10;
const CHILD_INDICATOR_STEM = 10;
const CHILD_INDICATOR_DEPTH = CHILD_INDICATOR_STEM + CHILD_INDICATOR_RADIUS * 2;
const EDGE_BADGE_CLEARANCE = 8;
const MINIMAP_WIDTH = 248;
const MINIMAP_HEIGHT = 170;
const MINIMAP_PADDING = 14;
const MINIMAP_MARGIN = 16;
const MINIMAP_DOT = 2.5;
const MINIMAP_DOT_ACTIVE = 3.6;
const NODE_SCROLL_MARGIN = 48;

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
let minimap: HTMLElement;
let minimapSvg: SVGSVGElement;
let minimapCount: HTMLElement;
let minimapToggle: HTMLButtonElement;

let tree = new BranchingTree<DemoMessage>();
let layout: LayoutModel = createEmptyLayout();
let nodeElements = new Map<string, SVGGElement>();
let edgeElements = new Map<string, SVGPathElement>();
let positionCache = new Map<string, CachedPosition>();
let selectedNodeIds = new Set<string>();
let selectedEdgeIds = new Set<string>();
let highlightedNodeId: string | null = null;
let viewportGroup: SVGGElement | null = null;
let edgeLayer: SVGGElement | null = null;
let childLinkLayer: SVGGElement | null = null;
let nodeLayer: SVGGElement | null = null;
let childBadgeLayer: SVGGElement | null = null;
let childLinkElements = new Map<string, SVGLineElement>();
let childBadgeElements = new Map<string, SVGGElement>();
let minimapDotElements = new Map<string, SVGCircleElement>();
let minimapEdgeElements = new Map<string, SVGLineElement>();
let minimapActiveNodeIds = new Set<string>();
let minimapActiveEdgeIds = new Set<string>();
let minimapHeadId: string | null = null;
let dragState: DragState | null = null;
let inspectorNodeId: string | null = null;
let suppressNextClick = false;
let currentSize: DemoSize = DEFAULT_SIZE;
let nextGeneratedSeed = DEFAULT_SIZE + 1;
let camera: Camera = { x: 0, y: 0, scale: 1 };
let cameraAnimationId: number | null = null;
let resizeAnimationId: number | null = null;
let minimapStructureDirty = true;
let minimapCollapsed = false;
let demoStarted = false;

export function startDemo(): void {
  if (demoStarted) return;
  demoStarted = true;

  svg = mustElement<SVGSVGElement>("tree-map");
  mapPanel = mustElement<HTMLElement>("map-panel");
  minimap = mustElement<HTMLElement>("minimap");
  minimapSvg = mustElement<SVGSVGElement>("minimap-svg");
  minimapCount = mustElement<HTMLElement>("minimap-count");
  minimapToggle = mustElement<HTMLButtonElement>("minimap-toggle");

  setDemoActions({
    addChild,
    addVersion,
    deleteBranch,
    deleteSiblingGroup,
    fitMap,
    keepOnlyVersion,
    createLinearPath,
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
    if (id) {
      selectNodeAndFocus(id);
    }
  });

  svg.addEventListener("keydown", (event) => {
    const node = getNodeElement(event.target);
    const id = node?.dataset.id;
    if (!id) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectNodeAndFocus(id);
      return;
    }

    const targetId = getKeyboardNavigationTarget(id, event.key);
    if (!targetId) return;

    event.preventDefault();
    selectNodeAndFocus(targetId);
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
    cancelCameraAnimation();
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
  window.addEventListener("resize", () => scheduleViewportResize());

  mapPanel.addEventListener("scroll", () => updateMinimapPosition());
  minimap.addEventListener("pointerdown", (event) => event.stopPropagation());
  minimap.addEventListener("wheel", (event) => event.stopPropagation());
  minimapToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setMinimapCollapsed(!minimapCollapsed);
  });
  minimapSvg.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest(".minimap-dot") : null;
    const id = target instanceof SVGCircleElement ? target.dataset.id : null;
    if (id) selectNode(id);
  });

  loadTree(DEFAULT_SIZE);
}

function loadTree(size: DemoSize): void {
  currentSize = size;
  loadState(createDemoState(size), size + 1);
}

function createLinearPath(): void {
  loadState(tree.getSelectedPathState(), nextGeneratedSeed);
  setActiveSizeButton(null);
}

function loadState(state: BranchingTreeState<DemoMessage>, nextSeed: number): void {
  const started = performance.now();
  nextGeneratedSeed = nextSeed;
  tree = new BranchingTree(state);
  positionCache = new Map();
  minimapStructureDirty = true;
  resetSvgLayers();
  layout = createVisibleLayout();
  syncMap(layout);
  fitMap();

  const inspectorId = tree.head?.id ?? layout.nodes[0]?.id;
  applySelectionClasses(inspectorId ?? null);
  if (inspectorId) {
    renderInspector(inspectorId);
  } else {
    renderEmptyInspector();
  }

  demoStore.renderTime = formatMs(performance.now() - started);
  updateMetrics();
  syncMinimap(inspectorId ?? null);
}

export function createDemoState(targetNodeCount: number): BranchingTreeState<DemoMessage> {
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
    const childCount = getChildCount(
      parent,
      parentInfo.depth,
      parentInfo.seed,
      remaining,
      countUserLeaves(nodes),
    );
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

function countUserLeaves(nodes: Readonly<Record<string, BranchingTreeNode<DemoMessage>>>): number {
  let count = 0;

  for (const node of Object.values(nodes)) {
    if (node.value?.role === "user" && node.childrenIds.length === 0) count++;
  }

  return count;
}

function getRole(depth: number): ChatRole {
  return depth % 2 === 0 ? "user" : "assistant";
}

function getVersionLabel(siblingIndex: number, siblingCount: number): string {
  return siblingCount === 1 ? "main" : `v${siblingIndex + 1}/${siblingCount}`;
}

function createVisibleLayout(): LayoutModel {
  const neighborhood = tree.getSelectedPathNeighborhood();
  const stats = tree.getStats();
  const nodes: PositionedNode[] = [];
  const edges: PositionedEdge[] = [];
  const nodeById = new Map<string, PositionedNode>();
  const edgeIds = new Set<string>();
  const nodesByDepth = new Map<number, BranchingTreePathNeighborhoodNode<DemoMessage>[]>();

  for (const node of neighborhood.nodes) {
    const siblings = nodesByDepth.get(node.depth);
    if (siblings) {
      siblings.push(node);
    } else {
      nodesByDepth.set(node.depth, [node]);
    }
  }

  for (const [depth, siblings] of nodesByDepth) {
    const selected = siblings.find((node) => node.selected) ?? siblings[0];
    if (!selected) continue;

    const positions = getSiblingPositions(siblings, selected.nodeId, depth);
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
        selected: sibling.selected,
        hiddenChildCount: sibling.hiddenChildCount,
      };

      nodes.push(node);
      nodeById.set(node.id, node);
    }
  }

  for (const neighborhoodEdge of neighborhood.edges) {
    const parent = nodeById.get(neighborhoodEdge.parentId);
    const child = nodeById.get(neighborhoodEdge.childId);
    if (!parent || !child) continue;

    const edge: PositionedEdge = {
      ...neighborhoodEdge,
      d: createEdgePath(parent, child, neighborhoodEdge.selected),
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
  siblings: readonly BranchingTreePathNeighborhoodNode<DemoMessage>[],
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
    maxBottom = Math.max(maxBottom, node.y + NODE_HEIGHT / 2 + getChildIndicatorDepth(node));
  }

  return {
    width: maxRight + MAP_PADDING,
    height: maxBottom + MAP_PADDING,
  };
}

function getChildIndicatorDepth(node: PositionedNode): number {
  return node.hiddenChildCount > 0 ? CHILD_INDICATOR_DEPTH : 0;
}

function resetSvgLayers(): void {
  nodeElements = new Map();
  edgeElements = new Map();
  childLinkElements = new Map();
  childBadgeElements = new Map();
  selectedNodeIds = new Set();
  selectedEdgeIds = new Set();
  highlightedNodeId = null;
  svg.textContent = "";

  viewportGroup = svgElement("g");
  edgeLayer = svgElement("g");
  childLinkLayer = svgElement("g");
  nodeLayer = svgElement("g");
  childBadgeLayer = svgElement("g");
  viewportGroup.append(edgeLayer, childLinkLayer, nodeLayer, childBadgeLayer);
  svg.append(viewportGroup);
  applyCamera();
}

function syncMap(model: LayoutModel): void {
  removeMissingElements(edgeElements, (id) => model.edgeIds.has(id));
  removeMissingElements(nodeElements, (id) => model.nodeById.has(id));
  removeMissingElements(
    childLinkElements,
    (id) => (model.nodeById.get(id)?.hiddenChildCount ?? 0) > 0,
  );
  removeMissingElements(
    childBadgeElements,
    (id) => (model.nodeById.get(id)?.hiddenChildCount ?? 0) > 0,
  );

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

  for (const node of model.nodes) {
    syncChildIndicator(node);
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
  const clipPath = svgElement("clipPath");
  const clipRect = svgElement("rect");
  const textGroup = svgElement("g");
  const selectionRing = svgElement("rect");
  const rect = svgElement("rect");
  const role = svgElement("text");
  const label = svgElement("text");
  const meta = svgElement("text");
  const title = svgElement("title");
  const clipId = createNodeTextClipId(node.id);
  const versionLabel = getVersionLabel(node.siblingIndex, node.siblingCount);

  group.setAttribute("class", `tree-node role-${node.value.role}`);
  group.setAttribute("transform", `translate(${node.x} ${node.y})`);
  group.setAttribute("tabindex", "0");
  group.setAttribute("role", "treeitem");
  group.setAttribute("aria-label", createNodeAriaLabel(node, versionLabel));
  group.dataset.id = node.id;
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }

    selectNodeAndFocus(node.id);
  });

  rect.setAttribute("class", "node-card");
  rect.setAttribute("x", String(-NODE_WIDTH / 2));
  rect.setAttribute("y", String(-NODE_HEIGHT / 2));
  rect.setAttribute("width", String(NODE_WIDTH));
  rect.setAttribute("height", String(NODE_HEIGHT));

  clipPath.setAttribute("id", clipId);

  clipRect.setAttribute("x", String(-NODE_WIDTH / 2 + 10));
  clipRect.setAttribute("y", String(-NODE_HEIGHT / 2 + 6));
  clipRect.setAttribute("width", String(NODE_WIDTH - 20));
  clipRect.setAttribute("height", String(NODE_HEIGHT - 12));
  clipPath.append(clipRect);

  textGroup.setAttribute("clip-path", `url(#${clipId})`);

  selectionRing.setAttribute("class", "node-selection-ring");
  selectionRing.setAttribute("x", String(-NODE_WIDTH / 2));
  selectionRing.setAttribute("y", String(-NODE_HEIGHT / 2));
  selectionRing.setAttribute("width", String(NODE_WIDTH));
  selectionRing.setAttribute("height", String(NODE_HEIGHT));
  selectionRing.setAttribute("rx", "8");

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
  meta.textContent = createNodeMetaText(node);

  title.textContent = createNodeTitle(node);
  textGroup.append(role, label, meta);
  group.append(title, clipPath, selectionRing, rect, textGroup);

  nodeElements.set(node.id, group);
  nodeLayer.append(group);
}

function updateNodeElement(element: SVGGElement, node: PositionedNode): void {
  const versionLabel = getVersionLabel(node.siblingIndex, node.siblingCount);

  element.classList.remove("role-assistant", "role-user");
  element.classList.add(`role-${node.value.role}`);
  element.setAttribute("aria-label", createNodeAriaLabel(node, versionLabel));

  const title = element.querySelector("title");
  if (title) title.textContent = createNodeTitle(node);

  const role = element.querySelector<SVGTextElement>(".node-role");
  if (role) role.textContent = roleLabels[node.value.role];

  const label = element.querySelector<SVGTextElement>(".node-label");
  if (label) label.textContent = `${node.value.id} · ${versionLabel}`;

  const meta = element.querySelector<SVGTextElement>(".node-meta");
  if (meta) meta.textContent = createNodeMetaText(node);
}

function createNodeMetaText(node: PositionedNode): string {
  return `${node.siblingIndex + 1}/${node.siblingCount} · ${shorten(node.value.content, 24)}`;
}

function createNodeTextClipId(nodeId: string): string {
  return `node-text-clip-${nodeId.replaceAll(/[^A-Za-z0-9_-]/g, "-")}`;
}

function createNodeTitle(node: PositionedNode): string {
  const hiddenChildren = formatHiddenChildren(node.hiddenChildCount);
  const suffix = hiddenChildren ? ` (${hiddenChildren})` : "";
  return `${node.value.role}: ${node.value.content}${suffix}`;
}

function createNodeAriaLabel(node: PositionedNode, versionLabel: string): string {
  const hiddenChildren = formatHiddenChildren(node.hiddenChildCount);
  const suffix = hiddenChildren ? `, ${hiddenChildren}` : "";
  return `${node.value.role} ${node.id} ${versionLabel}${suffix}`;
}

function formatHiddenChildren(count: number): string {
  if (count === 0) return "";
  return `${count} hidden ${count === 1 ? "child" : "children"}`;
}

function syncChildIndicator(node: PositionedNode): void {
  if (node.hiddenChildCount === 0) return;

  let link = childLinkElements.get(node.id);
  if (!link) {
    link = createChildLink();
    childLinkElements.set(node.id, link);
    childLinkLayer?.append(link);
  }
  updateChildLink(link, node);

  let badge = childBadgeElements.get(node.id);
  if (!badge) {
    badge = createChildBadge();
    childBadgeElements.set(node.id, badge);
    childBadgeLayer?.append(badge);
  }
  updateChildBadge(badge, node);
}

function createChildLink(): SVGLineElement {
  const line = svgElement("line");
  line.setAttribute("class", "node-child-link");
  return line;
}

function updateChildLink(line: SVGLineElement, node: PositionedNode): void {
  const startY = node.y + NODE_HEIGHT / 2;
  const endY = startY + CHILD_INDICATOR_STEM;

  line.setAttribute("x1", String(node.x));
  line.setAttribute("y1", String(startY));
  line.setAttribute("x2", String(node.x));
  line.setAttribute("y2", String(endY));
}

function createChildBadge(): SVGGElement {
  const badge = svgElement("g");
  const circle = svgElement("circle");
  const count = svgElement("text");

  badge.setAttribute("class", "node-child-badge");

  circle.setAttribute("class", "node-child-dot");
  circle.setAttribute("cx", "0");
  circle.setAttribute("cy", "0");
  circle.setAttribute("r", String(CHILD_INDICATOR_RADIUS));

  count.setAttribute("class", "node-child-count");
  count.setAttribute("x", "0");
  count.setAttribute("y", "0.5");

  badge.append(circle, count);
  return badge;
}

function updateChildBadge(badge: SVGGElement, node: PositionedNode): void {
  const y = node.y + NODE_HEIGHT / 2 + CHILD_INDICATOR_STEM + CHILD_INDICATOR_RADIUS;

  badge.setAttribute("class", `node-child-badge role-${node.value.role}`);
  badge.setAttribute("transform", `translate(${node.x} ${y})`);

  const count = badge.querySelector<SVGTextElement>(".node-child-count");
  if (!count) {
    return;
  }
  count.textContent = formatCount(node.hiddenChildCount);
}

function formatCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function getKeyboardNavigationTarget(id: string, key: string): string | null {
  switch (key) {
    case "ArrowUp":
      return getKeyboardParentTarget(id);
    case "ArrowDown":
      return getKeyboardChildTarget(id);
    case "ArrowLeft":
      return getKeyboardSiblingTarget(id, -1);
    case "ArrowRight":
      return getKeyboardSiblingTarget(id, 1);
    case "Home":
      return layout.nodes[0]?.id ?? null;
    case "End":
      return layout.nodes.at(-1)?.id ?? null;
    default:
      return null;
  }
}

function getKeyboardParentTarget(id: string): string | null {
  const parentId = tree.getNode(id)?.parentId ?? null;
  if (!parentId || parentId === tree.rootNodeId) return null;

  return parentId;
}

function getKeyboardChildTarget(id: string): string | null {
  const children = tree.getChildEntries(id);
  const child = children.find((entry) => entry.selected) ?? children[0];
  return child?.nodeId ?? null;
}

function getKeyboardSiblingTarget(id: string, offset: number): string | null {
  const siblings = tree.getSiblingEntries(id);
  const current = siblings.find((entry) => entry.nodeId === id);
  if (!current) return null;

  return siblings[current.siblingIndex + offset]?.nodeId ?? null;
}

function focusNode(id: string, options: { scrollIntoView?: boolean } = {}): void {
  const element = nodeElements.get(id);
  if (!element) return;

  element.focus({ preventScroll: true });
  if (options.scrollIntoView === true) smoothScrollNodeIntoView(element);
}

function smoothScrollNodeIntoView(element: SVGGElement): void {
  const nodeBounds = element.getBoundingClientRect();
  const panelBounds = mapPanel.getBoundingClientRect();
  let deltaX = 0;
  let deltaY = 0;

  if (nodeBounds.left < panelBounds.left + NODE_SCROLL_MARGIN) {
    deltaX = nodeBounds.left - panelBounds.left - NODE_SCROLL_MARGIN;
  } else if (nodeBounds.right > panelBounds.right - NODE_SCROLL_MARGIN) {
    deltaX = nodeBounds.right - panelBounds.right + NODE_SCROLL_MARGIN;
  }

  if (nodeBounds.top < panelBounds.top + NODE_SCROLL_MARGIN) {
    deltaY = nodeBounds.top - panelBounds.top - NODE_SCROLL_MARGIN;
  } else if (nodeBounds.bottom > panelBounds.bottom - NODE_SCROLL_MARGIN) {
    deltaY = nodeBounds.bottom - panelBounds.bottom + NODE_SCROLL_MARGIN;
  }

  if (deltaX === 0 && deltaY === 0) return;

  const maxScrollLeft = Math.max(0, mapPanel.scrollWidth - mapPanel.clientWidth);
  const maxScrollTop = Math.max(0, mapPanel.scrollHeight - mapPanel.clientHeight);
  const targetScrollLeft = clamp(mapPanel.scrollLeft + deltaX, 0, maxScrollLeft);
  const targetScrollTop = clamp(mapPanel.scrollTop + deltaY, 0, maxScrollTop);
  const appliedScrollX = targetScrollLeft - mapPanel.scrollLeft;
  const appliedScrollY = targetScrollTop - mapPanel.scrollTop;
  const remainingX = deltaX - appliedScrollX;
  const remainingY = deltaY - appliedScrollY;

  if (appliedScrollX !== 0 || appliedScrollY !== 0) {
    mapPanel.scrollTo({
      left: targetScrollLeft,
      top: targetScrollTop,
      behavior: "smooth",
    });
  }

  smoothPanCameraBy(-remainingX, -remainingY);
}

function smoothPanCameraBy(deltaX: number, deltaY: number): void {
  if (deltaX === 0 && deltaY === 0) return;

  cancelCameraAnimation();
  const started = performance.now();
  const duration = 180;
  const startCamera = camera;

  const tick = (time: number): void => {
    const progress = clamp((time - started) / duration, 0, 1);
    const eased = 1 - (1 - progress) ** 3;

    camera = {
      ...startCamera,
      x: startCamera.x + deltaX * eased,
      y: startCamera.y + deltaY * eased,
    };
    applyCamera();

    if (progress < 1) {
      cameraAnimationId = requestAnimationFrame(tick);
    } else {
      cameraAnimationId = null;
    }
  };

  cameraAnimationId = requestAnimationFrame(tick);
}

function cancelCameraAnimation(): void {
  if (cameraAnimationId === null) return;

  cancelAnimationFrame(cameraAnimationId);
  cameraAnimationId = null;
}

function selectNodeAndFocus(id: string): void {
  selectNode(id);
  focusNode(id, { scrollIntoView: true });
}

function selectNode(id: string, measure = true): void {
  if (!tree.hasNode(id)) return;

  const started = performance.now();
  tree.selectPathTo(id);
  refreshView(id);

  if (measure) demoStore.selectTime = formatMs(performance.now() - started);
}

function refreshView(preferredInspectorId: string | null, structureChanged = false): void {
  if (structureChanged) minimapStructureDirty = true;

  layout = createVisibleLayout();
  syncMap(layout);

  const nextInspectorId = getInspectableId(preferredInspectorId);
  applySelectionClasses(nextInspectorId);
  if (nextInspectorId) {
    renderInspector(nextInspectorId);
  } else {
    renderEmptyInspector();
  }
  updateMetrics();
  syncMinimap(nextInspectorId);
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
  refreshView(id, true);
  demoStore.selectTime = formatMs(performance.now() - started);
}

function addChild(): void {
  if (!inspectorNodeId) return;

  const parent = layout.nodeById.get(inspectorNodeId);
  if (!parent) return;

  const started = performance.now();
  const siblingIndex = tree.getChildren(inspectorNodeId).length;
  const depth = parent.depth + 1;
  const id = createGeneratedId();

  tree.appendChild(
    inspectorNodeId,
    createGeneratedMessage(id, depth, siblingIndex, siblingIndex + 1),
  );
  refreshView(id, true);
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

  refreshView(preferredInspectorId, true);
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

function applySelectionClasses(nextHighlightedNodeId: string | null): void {
  const nextNodeIds = new Set(layout.nodes.filter((node) => node.selected).map((node) => node.id));
  const nextEdgeIds = new Set(layout.edges.filter((edge) => edge.selected).map((edge) => edge.id));
  toggleClasses(nodeElements, selectedNodeIds, nextNodeIds, "is-selected");
  toggleClasses(edgeElements, selectedEdgeIds, nextEdgeIds, "is-selected");
  bringEdgesToFront(nextEdgeIds);

  if (highlightedNodeId && highlightedNodeId !== nextHighlightedNodeId) {
    nodeElements.get(highlightedNodeId)?.classList.remove("is-head");
  }
  if (nextHighlightedNodeId) nodeElements.get(nextHighlightedNodeId)?.classList.add("is-head");

  selectedNodeIds = nextNodeIds;
  selectedEdgeIds = nextEdgeIds;
  highlightedNodeId = nextHighlightedNodeId;
}

function bringEdgesToFront(edgeIds: Set<string>): void {
  if (!edgeLayer) return;

  for (const edgeId of edgeIds) {
    const edge = edgeElements.get(edgeId);
    if (edge) edgeLayer.append(edge);
  }
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

type MinimapPlacement = {
  xById: Map<string, number>;
  depthById: Map<string, number>;
  maxX: number;
  maxDepth: number;
};

function placeMinimapNodes(
  nodes: Readonly<Record<string, BranchingTreeNode<DemoMessage>>>,
  rootId: string,
): MinimapPlacement {
  const xById = new Map<string, number>();
  const depthById = new Map<string, number>();
  let leafCursor = 0;
  let maxDepth = 0;

  const assign = (id: string, depth: number): void => {
    depthById.set(id, depth);
    if (depth > maxDepth) maxDepth = depth;

    const childIds = nodes[id]?.childrenIds ?? [];
    if (childIds.length === 0) {
      xById.set(id, leafCursor);
      leafCursor += 1;
      return;
    }

    let sum = 0;
    for (const childId of childIds) {
      assign(childId, depth + 1);
      sum += xById.get(childId) ?? 0;
    }
    xById.set(id, sum / childIds.length);
  };
  assign(rootId, -1);

  return { xById, depthById, maxX: Math.max(0, leafCursor - 1), maxDepth };
}

function syncMinimap(headId: string | null): void {
  if (minimapStructureDirty) {
    renderMinimapTopology();
    minimapStructureDirty = false;
  }

  syncMinimapSelection(headId);
  updateMinimapPosition();
}

function renderMinimapTopology(): void {
  if (!minimapSvg) return;

  const state = tree.getState();
  const nodeIds = Object.keys(state.nodes).filter((id) => id !== state.rootId);
  minimapDotElements = new Map();
  minimapEdgeElements = new Map();
  minimapActiveNodeIds = new Set();
  minimapActiveEdgeIds = new Set();
  minimapHeadId = null;

  minimapSvg.setAttribute("width", String(MINIMAP_WIDTH));
  minimapSvg.setAttribute("height", String(MINIMAP_HEIGHT));
  minimapSvg.setAttribute("viewBox", `0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`);
  minimapCount.textContent = `${nodeIds.length} messages`;

  const placement = placeMinimapNodes(state.nodes, state.rootId);
  const innerWidth = MINIMAP_WIDTH - MINIMAP_PADDING * 2;
  const innerHeight = MINIMAP_HEIGHT - MINIMAP_PADDING * 2;
  const px = (id: string): number =>
    placement.maxX > 0
      ? MINIMAP_PADDING + ((placement.xById.get(id) ?? 0) / placement.maxX) * innerWidth
      : MINIMAP_WIDTH / 2;
  const py = (id: string): number =>
    placement.maxDepth > 0
      ? MINIMAP_PADDING + ((placement.depthById.get(id) ?? 0) / placement.maxDepth) * innerHeight
      : MINIMAP_HEIGHT / 2;

  const edgeLayer = svgElement("g");
  const dotLayer = svgElement("g");
  minimapSvg.replaceChildren(edgeLayer, dotLayer);

  for (const id of nodeIds) {
    const parentId = state.nodes[id]?.parentId;
    if (!parentId || parentId === state.rootId) continue;

    const line = svgElement("line");
    const edgeId = BranchingTree.createEdgeId(parentId, id);
    line.setAttribute("class", "minimap-edge");
    line.setAttribute("x1", String(px(parentId)));
    line.setAttribute("y1", String(py(parentId)));
    line.setAttribute("x2", String(px(id)));
    line.setAttribute("y2", String(py(id)));
    line.dataset.id = edgeId;
    minimapEdgeElements.set(edgeId, line);
    edgeLayer.append(line);
  }

  for (const id of nodeIds) {
    const role = state.nodes[id]?.value?.role ?? "user";
    const dot = svgElement("circle");
    dot.setAttribute("class", `minimap-dot role-${role}`);
    dot.setAttribute("cx", String(px(id)));
    dot.setAttribute("cy", String(py(id)));
    dot.setAttribute("r", String(MINIMAP_DOT));
    dot.dataset.id = id;
    minimapDotElements.set(id, dot);
    dotLayer.append(dot);
  }
}

function syncMinimapSelection(headId: string | null): void {
  const nextNodeIds = new Set(tree.selectedPathEntries.map((entry) => entry.nodeId));
  const nextEdgeIds = new Set<string>();
  const entries = tree.selectedPathEntries;

  for (let index = 1; index < entries.length; index++) {
    const parent = entries[index - 1];
    const child = entries[index];
    if (parent && child) nextEdgeIds.add(BranchingTree.createEdgeId(parent.nodeId, child.nodeId));
  }

  for (const id of minimapActiveNodeIds) {
    if (nextNodeIds.has(id)) continue;

    const dot = minimapDotElements.get(id);
    dot?.classList.remove("is-active");
    dot?.setAttribute("r", String(MINIMAP_DOT));
  }

  for (const id of nextNodeIds) {
    if (minimapActiveNodeIds.has(id)) continue;

    const dot = minimapDotElements.get(id);
    dot?.classList.add("is-active");
    dot?.setAttribute("r", String(MINIMAP_DOT_ACTIVE));
  }

  toggleClasses(minimapEdgeElements, minimapActiveEdgeIds, nextEdgeIds, "is-selected");

  if (minimapHeadId && minimapHeadId !== headId) {
    minimapDotElements.get(minimapHeadId)?.classList.remove("is-head");
  }
  if (headId) minimapDotElements.get(headId)?.classList.add("is-head");

  minimapActiveNodeIds = nextNodeIds;
  minimapActiveEdgeIds = nextEdgeIds;
  minimapHeadId = headId;
}

function setMinimapCollapsed(collapsed: boolean): void {
  minimapCollapsed = collapsed;
  minimap.classList.toggle("is-collapsed", collapsed);
  minimapToggle.setAttribute("aria-expanded", String(!collapsed));
  minimapToggle.setAttribute("aria-label", collapsed ? "Expand minimap" : "Collapse minimap");
  minimapToggle.setAttribute("title", collapsed ? "Expand minimap" : "Collapse minimap");
  updateMinimapPosition();
}

function updateMinimapPosition(): void {
  if (!minimap) return;

  const left = mapPanel.scrollLeft + mapPanel.clientWidth - minimap.offsetWidth - MINIMAP_MARGIN;
  const top = mapPanel.scrollTop + mapPanel.clientHeight - minimap.offsetHeight - MINIMAP_MARGIN;
  minimap.style.transform = `translate(${Math.max(MINIMAP_MARGIN, left)}px, ${Math.max(MINIMAP_MARGIN, top)}px)`;
}

function fitMap(): void {
  const bounds = mapPanel.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) return;

  cancelCameraAnimation();
  mapPanel.scrollLeft = 0;
  mapPanel.scrollTop = 0;
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
  return getRenderedContentBounds() ?? getLayoutContentBounds();
}

function getRenderedContentBounds(): ContentBounds | null {
  if (!viewportGroup || layout.nodes.length === 0) return null;

  try {
    const box = viewportGroup.getBBox();
    if (!isFiniteBounds(box)) return null;

    return {
      left: box.x,
      top: box.y,
      width: Math.max(1, box.width),
      height: Math.max(1, box.height),
    };
  } catch {
    return null;
  }
}

function isFiniteBounds(bounds: DOMRect): boolean {
  return (
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

function getLayoutContentBounds(): ContentBounds {
  if (layout.nodes.length === 0) return { left: 0, top: 0, width: 1, height: 1 };

  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const node of layout.nodes) {
    left = Math.min(left, node.x - NODE_WIDTH / 2);
    right = Math.max(right, node.x + NODE_WIDTH / 2);
    top = Math.min(top, node.y - NODE_HEIGHT / 2);
    bottom = Math.max(bottom, node.y + NODE_HEIGHT / 2 + getChildIndicatorDepth(node));
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

  cancelCameraAnimation();
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
  updateMinimapPosition();
}

function scheduleViewportResize(): void {
  if (resizeAnimationId !== null) return;

  resizeAnimationId = requestAnimationFrame(() => {
    resizeAnimationId = null;
    const bounds = mapPanel.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;

    applyCamera();
  });
}

function getCanvasSize(): CanvasSize {
  const bounds = mapPanel.getBoundingClientRect();
  const content = getContentBounds();
  const transformedRight =
    CANVAS_PADDING + camera.x + (content.left + content.width) * camera.scale + CANVAS_PADDING;
  const transformedBottom =
    CANVAS_PADDING + camera.y + (content.top + content.height) * camera.scale + CANVAS_PADDING;
  const visibleRight = mapPanel.scrollLeft + bounds.width;
  const visibleBottom = mapPanel.scrollTop + bounds.height;

  return {
    width: Math.max(bounds.width, visibleRight, transformedRight),
    height: Math.max(bounds.height, visibleBottom, transformedBottom),
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
  cancelCameraAnimation();
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
  if (!moved && nodeId) {
    selectNodeAndFocus(nodeId);
  }
}

function createEdgePath(parent: PositionedNode, child: PositionedNode, selected = false): string {
  const startX = parent.x;
  const startY = parent.y + NODE_HEIGHT / 2;
  const endX = child.x;
  const endY = child.y - NODE_HEIGHT / 2;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  if (deltaX === 0) return `M ${startX} ${startY} L ${endX} ${endY}`;

  const railY = getEdgeRailY(startY, endY);
  if (!selected && isInteriorSibling(child)) {
    return [
      `M ${startX} ${startY}`,
      `L ${startX} ${railY}`,
      `L ${endX} ${railY}`,
      `L ${endX} ${endY}`,
    ].join(" ");
  }

  if (selected) {
    return createRoundedEdgePath(startX, startY, endX, endY, railY, deltaX, deltaY);
  }

  const radius = Math.min(10, Math.abs(deltaX) / 2, Math.abs(endY - railY) / 3);
  const directionX = Math.sign(deltaX);
  const directionY = Math.sign(deltaY) || 1;
  const secondCornerStartX = endX - radius * directionX;
  const secondCornerEndY = railY + radius * directionY;

  return [
    `M ${startX} ${startY}`,
    `L ${startX} ${railY}`,
    `L ${secondCornerStartX} ${railY}`,
    `Q ${endX} ${railY} ${endX} ${secondCornerEndY}`,
    `L ${endX} ${endY}`,
  ].join(" ");
}

function createRoundedEdgePath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  railY: number,
  deltaX: number,
  deltaY: number,
): string {
  const radius = Math.min(10, Math.abs(deltaX) / 2, Math.abs(endY - railY) / 3);
  const directionX = Math.sign(deltaX);
  const directionY = Math.sign(deltaY) || 1;
  const firstCornerStartY = railY - radius * directionY;
  const firstCornerEndX = startX + radius * directionX;
  const secondCornerStartX = endX - radius * directionX;
  const secondCornerEndY = railY + radius * directionY;

  return [
    `M ${startX} ${startY}`,
    `L ${startX} ${firstCornerStartY}`,
    `Q ${startX} ${railY} ${firstCornerEndX} ${railY}`,
    `L ${secondCornerStartX} ${railY}`,
    `Q ${endX} ${railY} ${endX} ${secondCornerEndY}`,
    `L ${endX} ${endY}`,
  ].join(" ");
}

function isInteriorSibling(node: PositionedNode): boolean {
  return node.siblingIndex > 0 && node.siblingIndex < node.siblingCount - 1;
}

function getEdgeRailY(startY: number, endY: number): number {
  const centeredY = startY + (endY - startY) * 0.5;
  const belowBadgeY = startY + CHILD_INDICATOR_DEPTH + EDGE_BADGE_CLEARANCE;
  return Math.min(Math.max(centeredY, belowBadgeY), endY - EDGE_BADGE_CLEARANCE);
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
