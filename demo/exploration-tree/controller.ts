import {
  BranchingTree,
  ROOT_NODE_ID,
  type BranchingTreeNode,
  type BranchingTreePathEntry,
  type BranchingTreePathNeighborhoodEdge,
  type BranchingTreePathNeighborhoodNode,
  type BranchingTreeState,
  type BranchingTreeTopology,
  type Identified,
} from "../../branching-tree";
import { type AiChatMessage, createOpenAiCompatibleChatCompletion } from "../shared/ai-client";
import {
  getAiSettingsSnapshot,
  getAiSettingsStatus,
  hasConfiguredAiSettings,
} from "../shared/ai-settings";
import { createDemoMinimap, type DemoMinimap } from "../shared/minimap";
import { setShellSummary } from "../shared/shell-store";
import { setExplorationActions } from "./actions";
import explorationStore from "./store";

type ExplorationRole = "user" | "assistant";
type ExplorationKind = "query" | "answer";
type ExplorationStatus = "draft" | "generating" | "complete";

type ExplorationItem = Identified & {
  role: ExplorationRole;
  kind: ExplorationKind;
  title: string;
  content: string;
  status: ExplorationStatus;
  score: number;
  turn: number;
  seed: number;
  expanded: boolean;
};

type PositionedNode = {
  id: string;
  parentId: string | null;
  value: ExplorationItem;
  x: number;
  y: number;
  depth: number;
  siblingIndex: number;
  siblingCount: number;
  selected: boolean;
  hiddenChildCount: number;
};

type PositionedEdge = BranchingTreePathNeighborhoodEdge & {
  className: string;
  d: string;
};

type LayoutModel = {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  nodeById: Map<string, PositionedNode>;
  edgeIds: Set<string>;
  maxDepth: number;
  branchCount: number;
  nodeCount: number;
  edgeCount: number;
  openCount: number;
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

type ContentBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type QueryTextMetrics = {
  lines: string[];
  width: number;
  height: number;
  firstLineY: number;
};

type QueryFontMetrics = {
  ascent: number;
  descent: number;
};

type GenerationContext = {
  abortController: AbortController;
  generatedNodeIds: Set<string>;
  questionId: string;
  run: number;
  signal: AbortSignal;
};

type GeneratedAnswerVersion = {
  content: string;
  score: number;
  title: string;
};

type PersistedExploration = {
  version: 1;
  tree: BranchingTreeState<ExplorationItem>;
  selectedNodeId: string | null;
  nextSerial: number;
  viewport: PersistedViewport | null;
};

type PersistedViewport = {
  x: number;
  y: number;
  scale: number;
  scrollLeft: number;
  scrollTop: number;
};

type TextLayout = {
  bodyLines: string[];
  title: string;
  titleToBodyDy: number;
  width: number;
  height: number;
  firstTitleY: number;
};

const SVG_NS = "http://www.w3.org/2000/svg";
const NODE_WIDTH = 190;
const ANSWER_NODE_WIDTH = 320;
const ANSWER_NODE_MIN_HEIGHT = 76;
const ANSWER_TEXT_MAX_LINES = 30;
const ANSWER_TEXT_FONT_SIZE = 12;
const ANSWER_TEXT_FONT_WEIGHT = 500;
const ANSWER_TEXT_FONT = `${ANSWER_TEXT_FONT_WEIGHT} ${ANSWER_TEXT_FONT_SIZE}px Inter, ui-sans-serif, system-ui, sans-serif`;
const ANSWER_TITLE_FONT_SIZE = 12;
const ANSWER_TITLE_FONT_WEIGHT = 750;
const ANSWER_TITLE_FONT = `${ANSWER_TITLE_FONT_WEIGHT} ${ANSWER_TITLE_FONT_SIZE}px Inter, ui-sans-serif, system-ui, sans-serif`;
const ANSWER_TEXT_HORIZONTAL_PADDING = 16;
const ANSWER_TEXT_TOP_PADDING = 19;
const ANSWER_TEXT_BOTTOM_PADDING = 14;
const ANSWER_TEXT_LINE_HEIGHT = 16;
const ANSWER_TITLE_LINE_HEIGHT = 16;
const ANSWER_TITLE_BODY_GAP = 6;
const QUERY_NODE_MIN_WIDTH = 170;
const QUERY_NODE_MAX_TEXT_WIDTH = 320;
const QUERY_NODE_MIN_HEIGHT = 46;
const QUERY_TEXT_MAX_LINES = 5;
const QUERY_TEXT_FONT_SIZE = 15;
const QUERY_TEXT_FONT_WEIGHT = 430;
const QUERY_TEXT_FONT_FAMILY =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const QUERY_TEXT_FONT = `${QUERY_TEXT_FONT_WEIGHT} ${QUERY_TEXT_FONT_SIZE}px ${QUERY_TEXT_FONT_FAMILY}`;
const QUERY_TEXT_HORIZONTAL_PADDING = 22;
const QUERY_TEXT_TOP_PADDING = 10;
const QUERY_TEXT_BOTTOM_PADDING = 10;
const QUERY_TEXT_LINE_HEIGHT = 18;
const VERSION_GAP = 18;
const COLUMN_WIDTH = ANSWER_NODE_WIDTH + VERSION_GAP;
const ROW_GAP = 60;
const MAP_PADDING = 48;
const FIT_PADDING = 28;
const CANVAS_PADDING = 96;
const ROOT_X = MAP_PADDING + NODE_WIDTH / 2 + COLUMN_WIDTH * 3;
const INITIAL_ZOOM = 1;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.8;
const DRAG_THRESHOLD = 4;
const WHEEL_ZOOM_SPEED = 0.0015;
const CHILD_INDICATOR_RADIUS = 10;
const CHILD_INDICATOR_STEM = 10;
const CHILD_INDICATOR_DEPTH = CHILD_INDICATOR_STEM + CHILD_INDICATOR_RADIUS * 2;
const EDGE_BADGE_CLEARANCE = 8;
const NODE_SCROLL_MARGIN = 48;
const VIEWPORT_PERSIST_DELAY = 180;
const STORAGE_KEY = "branching-tree:exploration-tree:v1";
const STORAGE_VERSION = 1;

const answerOpenings = [
  "A useful way to approach this is to separate the problem into a stable spine and a few deliberate alternatives.",
  "The strongest path is to begin broad, make the tradeoffs visible, and only deepen branches that remain relevant.",
  "I would treat this as an exploration loop: generate options, compare them, then continue from the option with the clearest signal.",
  "The practical answer is to keep the decision surface small while preserving enough context to revisit earlier versions.",
];

const answerDetails = [
  "That keeps the graph readable while still making the history inspectable. Each version should explain what it optimizes for, what it gives up, and which follow-up question it suggests.",
  "The important part is not producing every possible branch. It is making each branch semantically different enough that choosing one actually changes the next step.",
  "For a product UI, the node should summarize the answer, while the sidebar can carry the full response. This lets the map stay navigable even when the generated text is long.",
  "A good implementation can simulate this locally first, then swap the generator with a real model call without changing the underlying tree mechanics.",
];

const queryTextMetricsCache = new Map<string, QueryTextMetrics>();
const answerTextMetricsCache = new Map<string, TextLayout>();
let textMeasureContext: CanvasRenderingContext2D | null = null;
let queryFontMetrics: QueryFontMetrics | null = null;

let svg: SVGSVGElement;
let mapPanel: HTMLElement;
let minimapController: DemoMinimap<ExplorationItem> | null = null;
let tree = new BranchingTree<ExplorationItem>();
let layout: LayoutModel = createEmptyLayout();
let contentBounds: ContentBounds = createEmptyContentBounds();
let nodeElements = new Map<string, SVGGElement>();
let edgeElements = new Map<string, SVGPathElement>();
let childLinkElements = new Map<string, SVGLineElement>();
let childBadgeElements = new Map<string, SVGGElement>();
let selectedNodeIds = new Set<string>();
let selectedEdgeIds = new Set<string>();
let highlightedNodeId: string | null = null;
let viewportGroup: SVGGElement | null = null;
let edgeLayer: SVGGElement | null = null;
let childLinkLayer: SVGGElement | null = null;
let nodeLayer: SVGGElement | null = null;
let childBadgeLayer: SVGGElement | null = null;
let positionCache = new Map<string, CachedPosition>();
let dragState: DragState | null = null;
let inspectorNodeId: string | null = null;
let suppressNextClick = false;
let camera: Camera = { x: 0, y: 0, scale: 1 };
let cameraAnimationId: number | null = null;
let resizeAnimationId: number | null = null;
let resizeHandler: (() => void) | null = null;
let nextSerial = 1;
let demoStarted = false;
let generationRun = 0;
let persistenceSuspended = false;
let viewportPersistTimeoutId: number | null = null;
let lastPersistedExploration: PersistedExploration | null = null;
const activeGenerations = new Map<string, GenerationContext>();

export function startExplorationDemo(): () => void {
  if (demoStarted) return stopExplorationDemo;
  demoStarted = true;
  setShellSummary("Loading exploration");

  svg = mustElement<SVGSVGElement>("tree-map");
  mapPanel = mustElement<HTMLElement>("map-panel");
  minimapController = createDemoMinimap({
    countLabel: "nodes",
    mapPanel,
    minimap: mustElement<HTMLElement>("minimap"),
    minimapCount: mustElement<HTMLElement>("minimap-count"),
    minimapSvg: mustElement<SVGSVGElement>("minimap-svg"),
    minimapToggle: mustElement<HTMLButtonElement>("minimap-toggle"),
    onSelect(id) {
      selectNodeAndFocus(id, { scrollIntoView: true });
    },
  });

  setExplorationActions({
    createVersion,
    deleteNode,
    fitMap,
    resetExploration,
    selectNode,
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

    const id = getNodeElement(event.target)?.dataset.id;
    if (id) selectNodeAndFocus(id);
  });

  svg.addEventListener("keydown", (event) => {
    if (event.target instanceof Element && event.target.closest(".query-input")) return;

    const id = getNodeElement(event.target)?.dataset.id;
    if (!id) return;

    if (handleDraftQueryKeyboardInput(id, event)) return;

    if (event.key === "Tab" && createUserVersion(id)) {
      event.preventDefault();
      enableKeyboardHoverSuppression();
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      enableKeyboardHoverSuppression();
      deleteNodeById(id);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      enableKeyboardHoverSuppression();
      selectNodeAndFocus(id, { scrollIntoView: true });
      return;
    }

    const targetId = getKeyboardNavigationTarget(id, event.key);
    if (!targetId) return;

    event.preventDefault();
    enableKeyboardHoverSuppression();
    selectNodeAndFocus(targetId, { scrollIntoView: true });
  });

  mapPanel.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(".query-input")) return;

    disableKeyboardHoverSuppression();
    event.preventDefault();
    document.body.classList.add("is-map-dragging");

    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCameraX: camera.x,
      startCameraY: camera.y,
      nodeId: getNodeElement(event.target)?.dataset.id ?? null,
      moved: false,
    };
    mapPanel.setPointerCapture(event.pointerId);
  });

  mapPanel.addEventListener("pointermove", (event) => {
    disableKeyboardHoverSuppression();
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
  mapPanel.addEventListener("scroll", handleMapScroll, { passive: true });
  resizeHandler = () => scheduleViewportResize();
  window.addEventListener("resize", resizeHandler);

  if (!restoreExploration()) resetExploration();
  return stopExplorationDemo;
}

function stopExplorationDemo(): void {
  if (!demoStarted) return;

  flushViewportPersistence();
  demoStarted = false;
  abortGeneration();
  cancelCameraAnimation();
  if (resizeAnimationId !== null) {
    cancelAnimationFrame(resizeAnimationId);
    resizeAnimationId = null;
  }
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }
  mapPanel?.classList.remove("is-dragging", "is-keyboard-mode");
  document.body.classList.remove("is-map-dragging");
  minimapController = null;
  dragState = null;
}

function resetExploration(): void {
  const started = performance.now();
  abortGeneration();
  nextSerial = 1;
  tree = new BranchingTree<ExplorationItem>();
  const root = createDraftQuestion(0);
  tree.appendChild(ROOT_NODE_ID, root);
  positionCache = new Map();
  resetSvgLayers();
  refreshView(tree.head?.id ?? root.id, true);
  centerMapAtScale(INITIAL_ZOOM);
  explorationStore.actionTime = formatMs(performance.now() - started);
}

function restoreExploration(): boolean {
  const persisted = readPersistedExploration();
  if (!persisted) return false;

  abortGeneration();
  persistenceSuspended = true;
  try {
    tree = new BranchingTree<ExplorationItem>(persisted.tree);
    nextSerial = Math.max(persisted.nextSerial, inferNextSerial(persisted.tree));
    positionCache = new Map();
    resetSvgLayers();

    const selectedNodeId = getRestoredSelectedNodeId(persisted.selectedNodeId);
    if (selectedNodeId) restoreSelectedPath(selectedNodeId);

    refreshView(selectedNodeId, true);
    if (persisted.viewport) {
      restoreViewport(persisted.viewport);
    } else {
      centerMapAtScale(INITIAL_ZOOM);
    }
  } finally {
    persistenceSuspended = false;
  }
  persistExploration();
  return true;
}

function restoreSelectedPath(selectedNodeId: string): void {
  tree.selectPathTo(selectedNodeId);

  const value = tree.getValue(selectedNodeId);
  if (value?.kind !== "answer" || value.status !== "complete") return;

  const draftId = ensureDraftQuestionAfterAnswer(selectedNodeId);
  if (draftId) tree.selectPathTo(draftId);
}

function getRestoredSelectedNodeId(selectedNodeId: string | null): string | null {
  if (selectedNodeId && tree.hasNode(selectedNodeId)) return selectedNodeId;
  return tree.head?.id ?? tree.getFullTopology().nodes[0]?.nodeId ?? null;
}

function readPersistedExploration(): PersistedExploration | null {
  const storage = getLocalStorage();
  if (!storage) return null;

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedExploration>;
    if (parsed.version !== STORAGE_VERSION || !parsed.tree) return null;

    const state = sanitizePersistedState(parsed.tree);
    const validatedTree = new BranchingTree<ExplorationItem>(state);
    const selectedNodeId =
      typeof parsed.selectedNodeId === "string" && state.nodes[parsed.selectedNodeId]
        ? parsed.selectedNodeId
        : null;

    const snapshot: PersistedExploration = {
      version: STORAGE_VERSION,
      tree: validatedTree.getState(),
      selectedNodeId,
      nextSerial: normalizeNextSerial(parsed.nextSerial),
      viewport: normalizePersistedViewport(parsed.viewport),
    };
    lastPersistedExploration = snapshot;
    return snapshot;
  } catch {
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

function persistExploration(preferredSelectedNodeId = inspectorNodeId): void {
  if (persistenceSuspended) return;

  try {
    const state = sanitizePersistedState(tree.getState());
    const selectedNodeId =
      preferredSelectedNodeId && state.nodes[preferredSelectedNodeId]
        ? preferredSelectedNodeId
        : null;
    writePersistedExploration({
      version: STORAGE_VERSION,
      tree: state,
      selectedNodeId,
      nextSerial,
      viewport: getPersistedViewport(),
    });
  } catch {
    // localStorage can be unavailable or full; persistence is best-effort for the demo.
  }
}

function persistViewport(): void {
  if (persistenceSuspended) return;

  if (!lastPersistedExploration) {
    persistExploration();
    return;
  }

  try {
    writePersistedExploration({
      ...lastPersistedExploration,
      viewport: getPersistedViewport(),
    });
  } catch {
    // localStorage can be unavailable or full; persistence is best-effort for the demo.
  }
}

function writePersistedExploration(snapshot: PersistedExploration): void {
  const storage = getLocalStorage();
  if (!storage) return;

  lastPersistedExploration = snapshot;
  storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function sanitizePersistedState(
  state: BranchingTreeState<ExplorationItem>,
): BranchingTreeState<ExplorationItem> {
  const nodes = clonePersistedNodes(state.nodes);
  const sanitized: BranchingTreeState<ExplorationItem> = {
    rootId: state.rootId,
    nodes,
  };
  const removedIds = collectGeneratingSubtreeIds(sanitized);

  for (const node of Object.values(sanitized.nodes)) {
    node.childrenIds = node.childrenIds.filter((childId) => !removedIds.has(childId));
  }

  for (const id of removedIds) delete sanitized.nodes[id];
  normalizeSelectedIndexes(sanitized);
  return sanitized;
}

function clonePersistedNodes(
  nodes: Record<string, BranchingTreeNode<ExplorationItem>>,
): Record<string, BranchingTreeNode<ExplorationItem>> {
  const copy: Record<string, BranchingTreeNode<ExplorationItem>> = {};

  for (const [id, node] of Object.entries(nodes)) {
    const clonedNode: BranchingTreeNode<ExplorationItem> = {
      ...node,
      childrenIds: [...node.childrenIds],
    };
    if (node.value) clonedNode.value = { ...node.value };
    copy[id] = clonedNode;
  }

  return copy;
}

function getPersistedViewport(): PersistedViewport {
  return {
    x: camera.x,
    y: camera.y,
    scale: camera.scale,
    scrollLeft: mapPanel.scrollLeft,
    scrollTop: mapPanel.scrollTop,
  };
}

function normalizePersistedViewport(value: unknown): PersistedViewport | null {
  if (!isRecord(value)) return null;
  const { x, y, scale, scrollLeft, scrollTop } = value;
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(scale) ||
    !isFiniteNumber(scrollLeft) ||
    !isFiniteNumber(scrollTop)
  ) {
    return null;
  }

  return {
    x,
    y,
    scale: clamp(scale, MIN_ZOOM, MAX_ZOOM),
    scrollLeft: Math.max(0, scrollLeft),
    scrollTop: Math.max(0, scrollTop),
  };
}

function restoreViewport(viewport: PersistedViewport): void {
  cancelCameraAnimation();
  camera = {
    x: viewport.x,
    y: viewport.y,
    scale: clamp(viewport.scale, MIN_ZOOM, MAX_ZOOM),
  };
  const bounds = mapPanel.getBoundingClientRect();
  applyCamera({
    bottom: viewport.scrollTop + bounds.height,
    right: viewport.scrollLeft + bounds.width,
  });
  mapPanel.scrollLeft = viewport.scrollLeft;
  mapPanel.scrollTop = viewport.scrollTop;
  applyCamera();
}

function collectGeneratingSubtreeIds(state: BranchingTreeState<ExplorationItem>): Set<string> {
  const ids = new Set<string>();

  for (const [id, node] of Object.entries(state.nodes)) {
    if (id === state.rootId || node.value?.status !== "generating") continue;
    collectSubtreeIds(state, id, ids);
  }

  return ids;
}

function collectSubtreeIds(
  state: BranchingTreeState<ExplorationItem>,
  startId: string,
  ids: Set<string>,
): void {
  const stack = [startId];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (ids.has(id)) continue;

    ids.add(id);
    stack.push(...(state.nodes[id]?.childrenIds ?? []));
  }
}

function normalizeSelectedIndexes(state: BranchingTreeState<ExplorationItem>): void {
  for (const node of Object.values(state.nodes)) {
    node.selectedChildIndex =
      node.childrenIds.length === 0
        ? 0
        : clamp(node.selectedChildIndex, 0, node.childrenIds.length - 1);
  }
}

function inferNextSerial(state: BranchingTreeState<ExplorationItem>): number {
  let maxSerial = 0;

  for (const node of Object.values(state.nodes)) {
    maxSerial = Math.max(maxSerial, getTrailingSerial(node.id), getTrailingSerial(node.value?.id));
  }

  return maxSerial + 1;
}

function getTrailingSerial(id: string | undefined): number {
  const match = id?.match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function normalizeNextSerial(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function createDraftQuestion(turn: number): ExplorationItem {
  return {
    id: createId("question"),
    role: "user",
    kind: "query",
    title: "",
    content: "Ask something...",
    status: "draft",
    score: 100,
    turn,
    seed: Math.floor(Math.random() * 10_000),
    expanded: false,
  };
}

function submitQuestion(id: string, rawQuestion: string): void {
  const question = rawQuestion.trim();
  const value = tree.getValue(id);
  if (!question || !value || value.kind !== "query" || value.status !== "draft") return;

  const started = performance.now();
  tree.selectPathTo(id);
  tree.update({
    ...value,
    title: question,
    content: question,
    status: "complete",
  });
  refreshView(id, true);
  focusNode(id, { scrollIntoView: true });
  explorationStore.actionTime = formatMs(performance.now() - started);
  void generateAnswerVersions(id, question, value.turn, startGeneration(id));
}

async function generateAnswerVersions(
  questionId: string,
  question: string,
  questionTurn: number,
  context: GenerationContext,
): Promise<void> {
  try {
    await createGeneratedAnswerVersions(questionId, question, questionTurn, context);
  } catch (error) {
    if (context.signal.aborted || !isActiveQuestionRun(context, questionId)) return;

    const placeholder = insertGeneratingAnswer(questionId, question, questionTurn, context);
    if (placeholder) {
      tree.update(createFailedAnswer(placeholder, error));
      refreshView(getGenerationInspectorId(questionId), true);
      scrollNodeIntoViewAfterRender(placeholder.id);
    }
    explorationStore.aiStatus = getAiErrorMessage(error);
  } finally {
    finishGeneration(context);
  }
}

function insertGeneratingAnswer(
  questionId: string,
  question: string,
  questionTurn: number,
  context: GenerationContext,
): ExplorationItem | null {
  if (!isActiveQuestionRun(context, questionId)) return null;

  const placeholder = createGeneratingAnswer(question, questionTurn);
  tree.appendChild(questionId, placeholder, { select: false });
  context.generatedNodeIds.add(placeholder.id);
  refreshView(getGenerationInspectorId(questionId), true);
  scrollNodeIntoViewAfterRender(placeholder.id);
  return placeholder;
}

async function createGeneratedAnswerVersions(
  questionId: string,
  question: string,
  questionTurn: number,
  context: GenerationContext,
): Promise<void> {
  const firstPlaceholder = insertGeneratingAnswer(questionId, question, questionTurn, context);
  if (!firstPlaceholder) return;

  const settings = getAiSettingsSnapshot();
  if (!hasConfiguredAiSettings(settings)) {
    explorationStore.aiStatus = getAiSettingsStatus();
    await createSimulatedAnswerVersions(
      questionId,
      question,
      questionTurn,
      context,
      firstPlaceholder,
    );
    return;
  }

  explorationStore.aiStatus = `Planning versions with ${settings.model}...`;
  let versionCount: number;
  try {
    versionCount = await createGeneratedAnswerVersionCount(questionId, settings, context);
  } catch (error) {
    if (context.signal.aborted || !isActiveQuestionRun(context, questionId)) return;

    const current = tree.getValue(firstPlaceholder.id);
    if (!current) return;

    tree.update(createFailedAnswer(current, error));
    explorationStore.aiStatus = getAiErrorMessage(error);
    refreshView(getGenerationInspectorId(questionId), true);
    scrollNodeIntoViewAfterRender(firstPlaceholder.id);
    return;
  }

  for (let index = 0; index < versionCount; index++) {
    if (!isActiveQuestionRun(context, questionId)) return;

    const placeholder =
      index === 0
        ? firstPlaceholder
        : insertGeneratingAnswer(questionId, question, questionTurn, context);
    if (!placeholder) return;

    try {
      explorationStore.aiStatus = `Requesting ${settings.model} version ${index + 1}/${versionCount}...`;
      const answer = await createGeneratedAnswerVersion(
        questionId,
        settings,
        index,
        versionCount,
        context,
      );
      if (!isActiveQuestionRun(context, questionId)) return;

      const current = tree.getValue(placeholder.id);
      if (!current) return;

      tree.update(completeGeneratedAnswer(current, answer));
      explorationStore.aiStatus = `${settings.model} returned version ${index + 1}/${versionCount}.`;
      refreshView(getGenerationInspectorId(questionId), true);
      scrollNodeIntoViewAfterRender(placeholder.id);
    } catch (error) {
      if (context.signal.aborted || !isActiveQuestionRun(context, questionId)) return;

      const current = tree.getValue(placeholder.id);
      if (!current) return;

      tree.update(createFailedAnswer(current, error));
      explorationStore.aiStatus = getAiErrorMessage(error);
      refreshView(getGenerationInspectorId(questionId), true);
      scrollNodeIntoViewAfterRender(placeholder.id);
      return;
    }
  }
}

async function createGeneratedAnswerVersionCount(
  questionId: string,
  settings: ReturnType<typeof getAiSettingsSnapshot>,
  context: GenerationContext,
): Promise<number> {
  const content = await createOpenAiCompatibleChatCompletion({
    messages: createAnswerPlanningMessages(questionId, settings.systemInstruction),
    settings,
    signal: context.signal,
  });
  return parseGeneratedAnswerVersionCount(content);
}

async function createGeneratedAnswerVersion(
  questionId: string,
  settings: ReturnType<typeof getAiSettingsSnapshot>,
  index: number,
  total: number,
  context: GenerationContext,
): Promise<GeneratedAnswerVersion> {
  const content = await createOpenAiCompatibleChatCompletion({
    messages: createAnswerGenerationMessages(questionId, settings.systemInstruction, index, total),
    settings,
    signal: context.signal,
  });
  return parseGeneratedAnswerVersion(content, index);
}

function createAnswerPlanningMessages(
  questionId: string,
  systemInstruction: string,
): AiChatMessage[] {
  return [
    ...createSelectedPathMessages(questionId, systemInstruction),
    {
      role: "user",
      content:
        'Decide how many meaningfully different answer versions should be created for the latest user question. Return only JSON shaped as {"count":3}. The count must be an integer from 1 to 4.',
    },
  ];
}

function createAnswerGenerationMessages(
  questionId: string,
  systemInstruction: string,
  index: number,
  total: number,
): AiChatMessage[] {
  return [
    ...createSelectedPathMessages(questionId, systemInstruction),
    {
      role: "user",
      content: `Create answer version ${index + 1} of ${total}. Return only JSON shaped as {"title":"short label","content":"full answer","score":85}. Make this version meaningfully different from the other planned versions and directly answer the latest user question.`,
    },
  ];
}

function createSelectedPathMessages(
  questionId: string,
  systemInstruction: string,
): AiChatMessage[] {
  const pathEntries =
    tree.selectedPathEntries.length > 0
      ? tree.selectedPathEntries
      : tree.getPathEntriesTo(questionId);
  const contextMessages = pathEntries
    .filter((entry) => entry.value.status === "complete")
    .map(
      (entry): AiChatMessage => ({
        role: entry.value.kind === "query" ? "user" : "assistant",
        content: entry.value.content,
      }),
    );

  return [
    {
      role: "system",
      content: systemInstruction,
    },
    ...contextMessages,
  ];
}

function getGenerationInspectorId(questionId: string): string {
  return inspectorNodeId && tree.hasNode(inspectorNodeId) ? inspectorNodeId : questionId;
}

function createGeneratingAnswer(question: string, questionTurn: number): ExplorationItem {
  const seed = question.length * 17 + Math.floor(Math.random() * 10_000);
  return {
    id: createId("answer"),
    role: "assistant",
    kind: "answer",
    title: "Generating answer",
    content: "Generating answer...",
    status: "generating",
    score: 0,
    turn: questionTurn + 1,
    seed,
    expanded: false,
  };
}

function completeGeneratedAnswer(
  value: ExplorationItem,
  answer: GeneratedAnswerVersion,
): ExplorationItem {
  return {
    ...value,
    title: createGeneratedAnswerTitle(answer),
    content: answer.content,
    status: "complete",
    score: answer.score,
  };
}

function createFailedAnswer(value: ExplorationItem, error: unknown): ExplorationItem {
  return {
    ...value,
    title: "AI request failed",
    content: getAiErrorMessage(error),
    status: "complete",
    score: 0,
  };
}

async function createSimulatedAnswerVersions(
  questionId: string,
  question: string,
  questionTurn: number,
  context: GenerationContext,
  firstPlaceholder: ExplorationItem,
): Promise<void> {
  const versionCount = 1 + Math.floor(Math.random() * 4);

  for (let index = 0; index < versionCount; index++) {
    if (!isActiveQuestionRun(context, questionId)) return;

    const placeholder =
      index === 0
        ? firstPlaceholder
        : insertGeneratingAnswer(questionId, question, questionTurn, context);
    if (!placeholder) return;

    explorationStore.aiStatus = `Simulating answer ${index + 1}/${versionCount}...`;
    if (!(await waitForAiLatency(context))) return;
    if (!isActiveQuestionRun(context, questionId)) return;

    const current = tree.getValue(placeholder.id);
    if (!current) return;

    tree.update(
      completeGeneratedAnswer(current, createSimulatedAnswerVersion(question, index, versionCount)),
    );
    explorationStore.aiStatus = `Simulated answer ${index + 1}/${versionCount}.`;
    refreshView(getGenerationInspectorId(questionId), true);
    scrollNodeIntoViewAfterRender(placeholder.id);
  }
}

function createSimulatedAnswerVersion(
  question: string,
  siblingIndex: number,
  siblingCount: number,
): GeneratedAnswerVersion {
  const opening = pickRandom(answerOpenings);
  const detail = pickRandom(answerDetails);
  const version = getVersionLabel(siblingIndex, siblingCount);
  const content = `${opening} ${detail} For "${question}", version ${version} focuses on ${createAnswerFocus(
    question,
    siblingIndex,
  )}. A good next step is to ask a sharper follow-up from this branch so the graph expands in the direction that is actually useful.`;

  return {
    title: createAnswerHeadline(question, siblingIndex),
    content,
    score: 67 + Math.floor(Math.random() * 29),
  };
}

function createGeneratedAnswerTitle(answer: GeneratedAnswerVersion): string {
  return answer.title;
}

function parseGeneratedAnswerVersionCount(rawContent: string): number {
  const payload = parseJsonPayload(rawContent);
  const rawCount = isRecord(payload) ? payload.count : null;

  if (typeof rawCount === "number" && Number.isFinite(rawCount)) {
    return clamp(Math.round(rawCount), 1, 4);
  }

  if (typeof rawCount === "string") {
    const parsed = Number(rawCount);
    if (Number.isFinite(parsed)) return clamp(Math.round(parsed), 1, 4);
  }

  const fallback = rawContent.match(/\b[1-4]\b/);
  return fallback ? Number(fallback[0]) : 1;
}

function parseGeneratedAnswerVersion(rawContent: string, index: number): GeneratedAnswerVersion {
  const payload = parseJsonPayload(rawContent);
  const answer = normalizeGeneratedAnswerVersion(getGeneratedAnswerPayload(payload, index), index);
  return answer ?? createAnswerVersionFromText(rawContent, index);
}

function getGeneratedAnswerPayload(payload: unknown, index: number): unknown {
  if (Array.isArray(payload)) return payload[index] ?? payload[0] ?? payload;

  if (isRecord(payload) && Array.isArray(payload.answers)) {
    return payload.answers[index] ?? payload.answers[0] ?? payload;
  }

  return payload;
}

function normalizeGeneratedAnswerVersion(
  value: unknown,
  index: number,
): GeneratedAnswerVersion | null {
  if (typeof value === "string") return createAnswerVersionFromText(value, index);
  if (!isRecord(value)) return null;

  const content = getStringProperty(value, "content", "answer", "text");
  if (!content) return null;

  const title = getStringProperty(value, "title", "label") ?? createAnswerTitleFromContent(content);
  const score = getNumberProperty(value, "score") ?? 80;
  return {
    title,
    content,
    score: clamp(Math.round(score), 0, 100),
  };
}

function createAnswerVersionFromText(content: string, index: number): GeneratedAnswerVersion {
  const normalizedContent = content.trim();
  return {
    title: createAnswerTitleFromContent(normalizedContent) || `answer ${index + 1}`,
    content: normalizedContent,
    score: 80,
  };
}

function createAnswerTitleFromContent(content: string): string {
  return content.replace(/\s+/g, " ").trim().split(" ").slice(0, 5).join(" ");
}

function parseJsonPayload(rawContent: string): unknown {
  const trimmed = rawContent.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const firstObject = trimmed.indexOf("{");
  const lastObject = trimmed.lastIndexOf("}");
  const firstArray = trimmed.indexOf("[");
  const lastArray = trimmed.lastIndexOf("]");
  const candidates = [
    trimmed,
    fenced,
    firstObject >= 0 && lastObject > firstObject
      ? trimmed.slice(firstObject, lastObject + 1)
      : null,
    firstArray >= 0 && lastArray > firstArray ? trimmed.slice(firstArray, lastArray + 1) : null,
  ].filter(isString);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next extraction strategy.
    }
  }

  return null;
}

function getStringProperty(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }

  return null;
}

function getNumberProperty(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getAiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") return error.message;
  return "AI request failed.";
}

function isString(value: string | null | undefined | false): value is string {
  return typeof value === "string" && value !== "";
}

function createAnswerHeadline(question: string, siblingIndex: number): string {
  const normalized = question.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  const words = normalized.split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
  const focus = ["direct route", "tradeoff route", "overview route", "implementation route"][
    siblingIndex % 4
  ];
  return words ? `${focus} for ${words}` : (focus ?? "answer route");
}

function createAnswerFocus(question: string, siblingIndex: number): string {
  const themes = [
    "clarity before breadth",
    "keeping alternatives comparable",
    "turning the idea into concrete next steps",
    "surfacing constraints early",
  ];
  const subject = question.length > 48 ? `${question.slice(0, 45).trimEnd()}...` : question;
  return `${themes[siblingIndex % themes.length] ?? themes[0]} around "${subject}"`;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] ?? items[0]!;
}

function waitForAiLatency(context: GenerationContext): Promise<boolean> {
  const latency = 650 + Math.floor(Math.random() * 900);
  if (context.signal.aborted) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      finish(isActiveRun(context));
    }, latency);

    const abort = (): void => finish(false);
    const finish = (value: boolean): void => {
      if (settled) return;

      settled = true;
      window.clearTimeout(timer);
      context.signal.removeEventListener("abort", abort);
      resolve(value);
    };

    context.signal.addEventListener("abort", abort, { once: true });
    if (context.signal.aborted) abort();
  });
}

function isActiveRun(context: GenerationContext): boolean {
  return (
    demoStarted &&
    !context.signal.aborted &&
    context.run <= generationRun &&
    activeGenerations.get(context.questionId) === context
  );
}

function isActiveQuestionRun(context: GenerationContext, questionId: string): boolean {
  return isActiveRun(context) && tree.hasNode(questionId);
}

function startGeneration(questionId: string): GenerationContext {
  abortGeneration(questionId);
  const abortController = new AbortController();
  const context = {
    abortController,
    generatedNodeIds: new Set<string>(),
    questionId,
    run: ++generationRun,
    signal: abortController.signal,
  };
  activeGenerations.set(questionId, context);
  return context;
}

function abortGeneration(questionId?: string): void {
  if (questionId !== undefined) {
    const context = activeGenerations.get(questionId);
    if (!context) return;

    activeGenerations.delete(questionId);
    context.abortController.abort();
    return;
  }

  const contexts = [...activeGenerations.values()];
  activeGenerations.clear();
  for (const context of contexts) context.abortController.abort();
}

function finishGeneration(context: GenerationContext): void {
  if (activeGenerations.get(context.questionId) === context) {
    activeGenerations.delete(context.questionId);
  }
}

function abortGenerationsForSubtree(id: string): void {
  const subtreeIds = getSubtreeNodeIds(id);
  for (const context of [...activeGenerations.values()]) {
    if (subtreeIds.has(context.questionId) || hasGeneratedNodeIn(context, subtreeIds)) {
      abortGeneration(context.questionId);
    }
  }
}

function hasGeneratedNodeIn(context: GenerationContext, ids: ReadonlySet<string>): boolean {
  for (const id of context.generatedNodeIds) {
    if (ids.has(id)) return true;
  }

  return false;
}

function getSubtreeNodeIds(id: string): Set<string> {
  const ids = new Set<string>();
  const stack = [id];

  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (ids.has(nodeId)) continue;

    ids.add(nodeId);
    const node = tree.getNode(nodeId);
    for (const childId of node?.childrenIds ?? []) stack.push(childId);
  }

  return ids;
}

function createVersion(): void {
  if (!inspectorNodeId) return;

  createUserVersion(inspectorNodeId);
}

function createUserVersion(referenceId: string): boolean {
  const reference = tree.getValue(referenceId);
  const parentId = tree.getNode(referenceId)?.parentId ?? null;
  if (!canCreateUserVersion(reference, parentId)) return false;

  const started = performance.now();
  const nextQuestion = createDraftQuestion(reference.turn);
  tree.addSibling(referenceId, nextQuestion, { select: true });
  refreshView(nextQuestion.id, true);
  focusNode(nextQuestion.id, { scrollIntoView: true });
  explorationStore.actionTime = formatMs(performance.now() - started);
  return true;
}

function canCreateUserVersion(
  value: ExplorationItem | undefined,
  parentId: string | null,
): value is ExplorationItem {
  return value?.kind === "query" && value.status === "complete" && parentId !== null;
}

function ensureDraftQuestionAfterAnswer(id: string): string | null {
  const value = tree.getValue(id);
  if (!value || value.kind !== "answer" || value.status !== "complete") return null;

  const existingQuestion = tree.getChildEntries(id).find((entry) => entry.value.kind === "query");
  if (existingQuestion) return existingQuestion.nodeId;

  const draft = createDraftQuestion(value.turn + 1);
  tree.appendChild(id, draft, { select: false });
  return draft.id;
}

function deleteNode(): void {
  if (!inspectorNodeId) return;

  deleteNodeById(inspectorNodeId);
}

function deleteNodeById(id: string): void {
  const parentId = tree.getNode(id)?.parentId ?? null;
  if (parentId === null) return;

  if (parentId === ROOT_NODE_ID && tree.getSiblingEntries(id).length === 1) {
    resetExploration();
    const headId = tree.head?.id ?? null;
    if (headId) focusNode(headId, { scrollIntoView: true });
    return;
  }

  const fallbackId = getDeleteFallbackId(id, parentId);
  const started = performance.now();
  abortGenerationsForSubtree(id);
  if (!tree.deleteBranch(id)) return;

  if (fallbackId && tree.hasNode(fallbackId)) tree.selectPathTo(fallbackId);
  const nextInspectorId = refreshView(fallbackId, true);
  if (nextInspectorId) focusNode(nextInspectorId, { scrollIntoView: true });
  explorationStore.actionTime = formatMs(performance.now() - started);
}

function getDeleteFallbackId(id: string, parentId: string): string | null {
  const siblings = tree.getSiblingEntries(id);
  const current = siblings.find((entry) => entry.nodeId === id);
  if (current && siblings.length > 1) {
    const fallbackIndex = current.siblingIndex === 0 ? 1 : current.siblingIndex - 1;
    return siblings[fallbackIndex]?.nodeId ?? null;
  }

  return parentId;
}

function selectNodeAndFocus(id: string, options: { scrollIntoView?: boolean } = {}): void {
  selectNode(id);
  focusNode(id, options);
}

function selectNode(id: string, measure = true): void {
  if (!tree.hasNode(id)) return;

  const started = performance.now();
  tree.selectPathTo(id);
  const draftId = ensureDraftQuestionAfterAnswer(id);
  if (draftId) tree.selectPathTo(draftId);
  const keepDraftIds = draftId ? [id, draftId] : [id];
  const removedEmptyDrafts = deleteEmptyAnswerDrafts(keepDraftIds);
  refreshView(id, removedEmptyDrafts || draftId !== null);
  if (measure) explorationStore.actionTime = formatMs(performance.now() - started);
}

function deleteEmptyAnswerDrafts(keepIds: readonly string[]): boolean {
  const retainedIds = new Set(keepIds);
  const draftIds = tree
    .getFullTopology()
    .nodes.filter(
      (node) => !retainedIds.has(node.nodeId) && isEmptyAnswerDraft(node.nodeId, node.value),
    )
    .map((node) => node.nodeId);

  for (const draftId of draftIds) {
    tree.deleteBranch(draftId);
  }

  return draftIds.length > 0;
}

function isEmptyAnswerDraft(id: string, value: ExplorationItem): boolean {
  if (value.kind !== "query" || value.status !== "draft" || value.title.trim() !== "") {
    return false;
  }

  const parentId = tree.getNode(id)?.parentId ?? null;
  const parentValue = parentId ? tree.getValue(parentId) : undefined;
  return parentValue?.kind === "answer";
}

function refreshView(preferredInspectorId: string | null, structureChanged = false): string | null {
  if (structureChanged) {
    positionCache = new Map(positionCache);
  }

  layout = createVisibleLayout();
  contentBounds = getLayoutContentBounds();
  syncMap(layout);

  const nextInspectorId = getInspectableId(preferredInspectorId);
  applySelectionClasses(nextInspectorId);
  if (nextInspectorId) {
    renderInspector(nextInspectorId);
  } else {
    renderEmptyInspector();
  }
  updateMetrics();
  syncMinimap(nextInspectorId, structureChanged);
  persistExploration(nextInspectorId);
  return nextInspectorId;
}

function getInspectableId(preferredId: string | null): string | null {
  if (preferredId && layout.nodeById.has(preferredId)) return preferredId;

  const headId = tree.head?.id ?? null;
  if (headId && layout.nodeById.has(headId)) return headId;

  return layout.nodes[0]?.id ?? null;
}

function createVisibleLayout(): LayoutModel {
  const neighborhood = tree.getSelectedPathNeighborhood();
  const stats = tree.getStats();
  const nodes: PositionedNode[] = [];
  const edges: PositionedEdge[] = [];
  const nodeById = new Map<string, PositionedNode>();
  const edgeIds = new Set<string>();
  const nodesByDepth = new Map<number, BranchingTreePathNeighborhoodNode<ExplorationItem>[]>();

  for (const node of neighborhood.nodes) {
    const siblings = nodesByDepth.get(node.depth);
    if (siblings) {
      siblings.push(node);
    } else {
      nodesByDepth.set(node.depth, [node]);
    }
  }

  let rowTop = MAP_PADDING;
  const rows = [...nodesByDepth.entries()].sort(
    ([leftDepth], [rightDepth]) => leftDepth - rightDepth,
  );

  for (const [depth, siblings] of rows) {
    const selected = siblings.find((node) => node.selected) ?? siblings[0];
    if (!selected) continue;

    const positions = getSiblingPositions(siblings, rowTop);
    for (const sibling of siblings) {
      const position = positions.get(sibling.nodeId);
      if (!position) continue;

      const hiddenChildCount = sibling.hiddenChildCount;
      const node: PositionedNode = {
        id: sibling.nodeId,
        parentId: sibling.parentId,
        value: sibling.value,
        x: position.x,
        y: position.y,
        depth,
        siblingIndex: sibling.siblingIndex,
        siblingCount: sibling.siblingCount,
        selected: sibling.selected && !isEmptyAnswerDraft(sibling.nodeId, sibling.value),
        hiddenChildCount,
      };

      nodes.push(node);
      nodeById.set(node.id, node);
    }

    rowTop += getRowHeight(siblings) + ROW_GAP;
  }

  for (const neighborhoodEdge of neighborhood.edges) {
    const parent = nodeById.get(neighborhoodEdge.parentId);
    const child = nodeById.get(neighborhoodEdge.childId);
    if (!parent || !child) continue;

    const edge: PositionedEdge = {
      ...neighborhoodEdge,
      selected: neighborhoodEdge.selected && !isEmptyAnswerDraft(child.id, child.value),
      className: createEdgeClass(child),
      d: createEdgePath(
        parent,
        child,
        neighborhoodEdge.selected && !isEmptyAnswerDraft(child.id, child.value),
      ),
    };
    edges.push(edge);
    edgeIds.add(edge.id);
  }

  const rootSiblingEdge = createRootSiblingEdge(nodes);
  if (rootSiblingEdge) {
    edges.push(rootSiblingEdge);
    edgeIds.add(rootSiblingEdge.id);
  }

  return {
    nodes,
    edges,
    nodeById,
    edgeIds,
    maxDepth: stats.maxDepth,
    branchCount: stats.branchPoints,
    nodeCount: Math.max(0, stats.totalNodes - 1),
    edgeCount: Math.max(0, stats.totalNodes - 2),
    openCount: tree.getFullTopology().nodes.filter((node) => node.value.status === "generating")
      .length,
  };
}

function createRootSiblingEdge(nodes: readonly PositionedNode[]): PositionedEdge | null {
  const rootSiblings = nodes
    .filter((node) => node.parentId === ROOT_NODE_ID)
    .sort((left, right) => left.siblingIndex - right.siblingIndex);
  if (rootSiblings.length < 2) return null;

  const first = rootSiblings[0]!;
  const segments: string[] = [];

  for (let index = 0; index < rootSiblings.length - 1; index++) {
    const left = rootSiblings[index]!;
    const right = rootSiblings[index + 1]!;
    const startX = left.x + getNodeWidth(left) / 2;
    const endX = right.x - getNodeWidth(right) / 2;
    const controlOffset = Math.min(32, Math.max(0, endX - startX) / 2);

    segments.push(
      `M ${startX} ${left.y}`,
      `C ${startX + controlOffset} ${left.y} ${endX - controlOffset} ${right.y} ${endX} ${right.y}`,
    );
  }

  return {
    id: "root-sibling-edge",
    parentId: ROOT_NODE_ID,
    childId: first.id,
    selected: false,
    className: "tree-edge",
    d: segments.join(" "),
  };
}

function getSiblingPositions(
  siblings: readonly BranchingTreePathNeighborhoodNode<ExplorationItem>[],
  rowTop: number,
): Map<string, CachedPosition> {
  const positions = new Map<string, CachedPosition>();
  const firstSibling = siblings[0];
  if (!firstSibling) return positions;

  const cachedAnchor = siblings
    .map((sibling) => ({ sibling, position: positionCache.get(sibling.nodeId) }))
    .find((entry) => entry.position !== undefined);
  const parentPosition = firstSibling.parentId
    ? positionCache.get(firstSibling.parentId)
    : undefined;
  const anchorIndex = cachedAnchor?.sibling.siblingIndex ?? 0;
  const anchorX = cachedAnchor?.position?.x ?? parentPosition?.x ?? ROOT_X;

  for (const sibling of siblings) {
    const cached = positionCache.get(sibling.nodeId);
    const position = {
      x: cached?.x ?? anchorX + (sibling.siblingIndex - anchorIndex) * COLUMN_WIDTH,
      y: rowTop + getNodeValueHeight(sibling.value) / 2,
    };
    positionCache.set(sibling.nodeId, position);
    positions.set(sibling.nodeId, position);
  }

  return positions;
}

function getRowHeight(
  siblings: readonly BranchingTreePathNeighborhoodNode<ExplorationItem>[],
): number {
  return Math.max(0, ...siblings.map((sibling) => getNodeValueHeight(sibling.value)));
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
      element.setAttribute("class", edge.className);
      element.setAttribute("d", edge.d);
    } else {
      appendEdgeElement(edge);
    }
  }

  for (const node of model.nodes) {
    const element = nodeElements.get(node.id);
    if (element && element.dataset.renderMode === getNodeRenderMode(node)) {
      element.setAttribute("transform", `translate(${node.x} ${node.y})`);
      updateNodeElement(element, node);
    } else {
      element?.remove();
      nodeElements.delete(node.id);
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
  path.setAttribute("class", edge.className);
  path.setAttribute("d", edge.d);
  path.dataset.id = edge.id;
  edgeElements.set(edge.id, path);
  edgeLayer.append(path);
}

function appendNodeElement(node: PositionedNode): void {
  if (!nodeLayer) return;

  const width = getNodeWidth(node);
  const height = getNodeHeight(node);
  const query = isQueryNode(node);
  const draftQuery = isDraftQueryNode(node);
  const group = svgElement("g");
  const clipPath = svgElement("clipPath");
  const clipRect = svgElement("rect");
  const textGroup = svgElement("g");
  const selectionRing = query ? svgElement("path") : svgElement("rect");
  const quoteShadow = query ? svgElement("path") : null;
  const card = query ? svgElement("path") : svgElement("rect");
  const editor = draftQuery ? createQueryEditor(node) : null;
  const shimmer = !query && node.value.status === "generating" ? createAnswerShimmer(node) : null;
  const label = svgElement("text");
  const meta = svgElement("text");
  const clipId = createNodeTextClipId(node.id);

  group.setAttribute("class", createNodeClass(node));
  group.setAttribute("transform", `translate(${node.x} ${node.y})`);
  group.setAttribute("tabindex", "0");
  group.setAttribute("role", "treeitem");
  group.setAttribute("aria-label", createNodeAriaLabel(node));
  group.dataset.renderMode = getNodeRenderMode(node);
  group.dataset.id = node.id;
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }

    selectNodeAndFocus(node.id);
  });

  if (quoteShadow) {
    quoteShadow.setAttribute("class", "node-quote-shadow");
    quoteShadow.setAttribute("d", createQuoteFramePath(width, height));
    quoteShadow.setAttribute("transform", "translate(5 6)");
  }

  setNodeFrameAttributes(card, node, "node-card");

  clipPath.setAttribute("id", clipId);
  clipRect.setAttribute("x", String(-width / 2 + (query ? 8 : 10)));
  clipRect.setAttribute("y", String(-height / 2 + (query ? 4 : 6)));
  clipRect.setAttribute("width", String(width - (query ? 16 : 20)));
  clipRect.setAttribute("height", String(height - (query ? 8 : 12)));
  clipPath.append(clipRect);
  textGroup.setAttribute("clip-path", `url(#${clipId})`);

  setNodeFrameAttributes(selectionRing, node, "node-selection-ring");

  label.setAttribute("class", query ? "node-label node-quote-label" : "node-label");
  label.setAttribute("x", String(query ? 0 : -width / 2 + 14));
  label.setAttribute("y", query ? "2" : "-2");
  if (query) label.setAttribute("text-anchor", "middle");
  renderNodeLabel(label, node);

  meta.setAttribute("class", "node-meta");
  meta.setAttribute("x", String(-width / 2 + 12));
  meta.setAttribute("y", String(height / 2 - 13));
  meta.textContent = createNodeMetaText(node);

  if (query) {
    if (editor) {
      if (quoteShadow) group.append(quoteShadow);
      group.append(selectionRing, card, editor);
    } else {
      textGroup.append(label);
      group.append(clipPath);
      if (quoteShadow) group.append(quoteShadow);
      group.append(selectionRing, card, textGroup);
    }
  } else {
    if (shimmer) {
      group.append(selectionRing, card, shimmer);
    } else {
      textGroup.append(label, meta);
      group.append(clipPath, selectionRing, card, textGroup);
    }
  }

  nodeElements.set(node.id, group);
  nodeLayer.append(group);
}

function updateNodeElement(element: SVGGElement, node: PositionedNode): void {
  element.classList.remove(
    "role-assistant",
    "role-user",
    "is-query",
    "is-draft",
    "is-temporary-draft",
    "is-generating",
    "is-expanded-answer",
  );
  element.classList.add(`role-${node.value.role}`);
  if (isQueryNode(node)) element.classList.add("is-query");
  if (isDraftQueryNode(node)) element.classList.add("is-draft");
  if (isTemporaryDraftNode(node)) element.classList.add("is-temporary-draft");
  if (node.value.status === "generating") element.classList.add("is-generating");
  if (node.value.kind === "answer" && node.value.expanded)
    element.classList.add("is-expanded-answer");
  element.setAttribute("aria-label", createNodeAriaLabel(node));

  const quoteShadow = element.querySelector<SVGPathElement>(".node-quote-shadow");
  if (quoteShadow)
    quoteShadow.setAttribute("d", createQuoteFramePath(getNodeWidth(node), getNodeHeight(node)));

  const card = element.querySelector<SVGGraphicsElement>(".node-card");
  if (card) setNodeFrameAttributes(card, node, card.getAttribute("class") ?? "node-card");

  const selectionRing = element.querySelector<SVGGraphicsElement>(".node-selection-ring");
  if (selectionRing)
    setNodeFrameAttributes(
      selectionRing,
      node,
      selectionRing.getAttribute("class") ?? "node-selection-ring",
    );

  const label = element.querySelector<SVGTextElement>(".node-label");
  if (label) renderNodeLabel(label, node);

  const meta = element.querySelector<SVGTextElement>(".node-meta");
  if (meta) {
    meta.setAttribute("x", String(-getNodeWidth(node) / 2 + 12));
    meta.setAttribute("y", String(getNodeHeight(node) / 2 - 13));
    meta.textContent = createNodeMetaText(node);
  }
}

function createNodeClass(node: PositionedNode): string {
  const query = isQueryNode(node) ? " is-query" : "";
  const draft = isDraftQueryNode(node) ? " is-draft" : "";
  const temporaryDraft = isTemporaryDraftNode(node) ? " is-temporary-draft" : "";
  const generating = node.value.status === "generating" ? " is-generating" : "";
  const expanded = node.value.kind === "answer" && node.value.expanded ? " is-expanded-answer" : "";
  return `tree-node role-${node.value.role}${query}${draft}${temporaryDraft}${generating}${expanded}`;
}

function createEdgeClass(child: PositionedNode): string {
  return isDraftQueryNode(child) ? "tree-edge is-draft-link" : "tree-edge";
}

function createAnswerShimmer(node: PositionedNode): SVGForeignObjectElement {
  const width = getNodeWidth(node);
  const height = getNodeHeight(node);
  const shimmer = svgElement("foreignObject");
  const surface = document.createElement("div");

  shimmer.setAttribute("class", "answer-shimmer");
  shimmer.setAttribute("x", String(-width / 2 + ANSWER_TEXT_HORIZONTAL_PADDING));
  shimmer.setAttribute("y", String(-height / 2 + 18));
  shimmer.setAttribute("width", String(width - ANSWER_TEXT_HORIZONTAL_PADDING * 2));
  shimmer.setAttribute("height", String(height - 36));
  surface.className = "answer-shimmer-surface";

  for (const widthClass of ["is-wide", "is-mid", "is-full", "is-short"]) {
    const line = document.createElement("span");
    line.className = `answer-shimmer-line ${widthClass}`;
    surface.append(line);
  }

  shimmer.append(surface);
  return shimmer;
}

function isQueryNode(node: PositionedNode): boolean {
  return node.value.kind === "query";
}

function isDraftQueryNode(node: PositionedNode): boolean {
  return node.value.kind === "query" && node.value.status === "draft";
}

function isTemporaryDraftNode(node: PositionedNode): boolean {
  return isEmptyAnswerDraft(node.id, node.value);
}

function getNodeWidth(node: PositionedNode): number {
  return getNodeValueWidth(node.value);
}

function getNodeHeight(node: PositionedNode): number {
  return getNodeValueHeight(node.value);
}

function getNodeValueWidth(value: ExplorationItem): number {
  if (value.kind === "query") return getQueryTextMetrics(getNodeDisplayText(value)).width;
  return ANSWER_NODE_WIDTH;
}

function getNodeValueHeight(value: ExplorationItem): number {
  if (value.kind === "query") return getQueryTextMetrics(getNodeDisplayText(value)).height;
  return getAnswerTextMetrics(value).height;
}

function setNodeFrameAttributes(
  element: SVGGraphicsElement,
  node: PositionedNode,
  className: string,
): void {
  const width = getNodeWidth(node);
  const height = getNodeHeight(node);
  element.setAttribute("class", className);

  if (isQueryNode(node) && element instanceof SVGPathElement) {
    element.setAttribute("d", createQuoteFramePath(width, height));
    return;
  }

  if (element instanceof SVGRectElement) {
    element.setAttribute("x", String(-width / 2));
    element.setAttribute("y", String(-height / 2));
    element.setAttribute("width", String(width));
    element.setAttribute("height", String(height));
    element.setAttribute("rx", "8");
  }
}

function createQuoteFramePath(width: number, height: number): string {
  const left = -width / 2;
  const top = -height / 2;
  const right = width / 2;
  const bottom = height / 2;
  const radius = Math.min(height / 2, 30);
  const control = radius * 0.5522847498;

  return [
    `M ${left + radius} ${top}`,
    `L ${right - radius} ${top}`,
    `C ${right - radius + control} ${top} ${right} ${top + radius - control} ${right} ${top + radius}`,
    `L ${right} ${bottom - radius}`,
    `C ${right} ${bottom - radius + control} ${right - radius + control} ${bottom} ${right - radius} ${bottom}`,
    `L ${left + radius} ${bottom}`,
    `C ${left + radius - control} ${bottom} ${left} ${bottom - radius + control} ${left} ${bottom - radius}`,
    `L ${left} ${top + radius}`,
    `C ${left} ${top + radius - control} ${left + radius - control} ${top} ${left + radius} ${top}`,
    "Z",
  ].join(" ");
}

function createNodeMetaText(node: PositionedNode): string {
  if (node.value.status === "draft") return "Press Enter to ask";
  if (node.value.status === "generating") return "AI is thinking";
  if (node.value.kind === "answer") return "";

  return "Question";
}

function getNodeDisplayText(value: ExplorationItem): string {
  if (value.kind === "query" && value.status === "draft") return value.title || "Ask something...";
  if (value.kind === "answer") return value.content;
  return value.title || value.content;
}

function getAnswerTextMetrics(value: ExplorationItem): TextLayout {
  const maxLines = ANSWER_TEXT_MAX_LINES;
  const cacheKey = `${value.id}:${value.title}:${value.content}:${value.expanded}:${value.status}`;
  const cached = answerTextMetricsCache.get(cacheKey);
  if (cached) return cached;

  const textWidth = ANSWER_NODE_WIDTH - ANSWER_TEXT_HORIZONTAL_PADDING * 2;
  const title = ellipsizeMeasuredText(
    getAnswerDisplayTitle(value),
    textWidth,
    ANSWER_TITLE_FONT,
    ANSWER_TITLE_FONT_SIZE,
  );
  const bodyLines = getMeasuredLines(
    getNodeDisplayText(value),
    textWidth,
    ANSWER_TEXT_FONT,
    ANSWER_TEXT_FONT_SIZE,
    maxLines,
  );
  const measuredWidth = Math.max(
    0,
    measureText(title, ANSWER_TITLE_FONT, ANSWER_TITLE_FONT_SIZE),
    ...bodyLines.map((line) => measureText(line, ANSWER_TEXT_FONT, ANSWER_TEXT_FONT_SIZE)),
  );
  const titleToBodyDy = ANSWER_TITLE_LINE_HEIGHT + ANSWER_TITLE_BODY_GAP;
  const height = Math.max(
    ANSWER_NODE_MIN_HEIGHT,
    Math.ceil(
      ANSWER_TEXT_TOP_PADDING +
        ANSWER_TITLE_LINE_HEIGHT +
        ANSWER_TITLE_BODY_GAP +
        bodyLines.length * ANSWER_TEXT_LINE_HEIGHT +
        ANSWER_TEXT_BOTTOM_PADDING,
    ),
  );
  const metrics = {
    bodyLines,
    title,
    titleToBodyDy,
    width: Math.ceil(measuredWidth),
    height,
    firstTitleY: -height / 2 + ANSWER_TEXT_TOP_PADDING + ANSWER_TITLE_FONT_SIZE,
  };

  answerTextMetricsCache.set(cacheKey, metrics);
  return metrics;
}

function getAnswerDisplayTitle(value: ExplorationItem): string {
  const title = value.title.replace(/^v\d+\/\d+:\s*/i, "").replace(/^main:\s*/i, "");
  return title || (value.status === "generating" ? "Generating answer" : "Answer");
}

function createQueryEditor(node: PositionedNode): SVGForeignObjectElement {
  const width = getNodeWidth(node);
  const height = getNodeHeight(node);
  const editor = svgElement("foreignObject");
  const input = document.createElement("input");

  editor.setAttribute("class", "query-editor");
  editor.setAttribute("x", String(-width / 2 + 24));
  editor.setAttribute("y", String(-height / 2));
  editor.setAttribute("width", String(width - 48));
  editor.setAttribute("height", String(height));
  input.className = "query-input";
  input.type = "text";
  input.placeholder = "Ask something...";
  input.value = node.value.title;
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("pointerdown", (event) => event.stopPropagation());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      input.blur();
      focusNode(node.id);
      return;
    }

    if (event.key !== "Enter") return;

    event.preventDefault();
    submitQuestion(node.id, input.value);
  });
  input.addEventListener("input", () => {
    updateDraftQueryFromInput(node.id, input.value);
  });

  editor.append(input);
  return editor;
}

function handleDraftQueryKeyboardInput(id: string, event: KeyboardEvent): boolean {
  const value = tree.getValue(id);
  if (!value || value.kind !== "query" || value.status !== "draft") return false;

  if (event.key === "Enter") {
    event.preventDefault();
    focusDraftInput(id);
    return true;
  }

  if (!isTextEntryKey(event) || value.title.trim() !== "") return false;

  event.preventDefault();
  focusDraftInput(id, event.key);
  return true;
}

function isTextEntryKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

function focusDraftInput(id: string, initialText?: string): void {
  const input = nodeElements.get(id)?.querySelector<HTMLInputElement>(".query-input");
  if (!input) return;

  if (initialText !== undefined) {
    input.value = initialText;
    updateDraftQueryFromInput(id, input.value);
  }

  input.focus({ preventScroll: true });
  input.setSelectionRange(input.value.length, input.value.length);
}

function updateDraftQueryFromInput(id: string, inputValue: string): void {
  const value = tree.getValue(id);
  if (!value || value.status !== "draft") return;

  tree.update({ ...value, title: inputValue, content: inputValue || "Ask something..." });
  queryTextMetricsCache.clear();
  persistExploration(id);
}

function renderNodeLabel(label: SVGTextElement, node: PositionedNode): void {
  label.textContent = "";

  if (!isQueryNode(node)) {
    const metrics = getAnswerTextMetrics(node.value);
    const x = String(-getNodeWidth(node) / 2 + 14);
    label.setAttribute("y", String(metrics.firstTitleY));

    const title = svgElement("tspan");
    title.setAttribute("class", "node-answer-title");
    title.setAttribute("x", x);
    title.textContent = metrics.title;
    label.append(title);

    for (const [index, line] of metrics.bodyLines.entries()) {
      const bodyLine = svgElement("tspan");
      bodyLine.setAttribute("class", "node-answer-body");
      bodyLine.setAttribute("x", x);
      bodyLine.setAttribute(
        "dy",
        String(index === 0 ? metrics.titleToBodyDy : ANSWER_TEXT_LINE_HEIGHT),
      );
      bodyLine.textContent = line;
      label.append(bodyLine);
    }
    return;
  }

  const metrics = getQueryTextMetrics(getNodeDisplayText(node.value));
  label.setAttribute("y", String(metrics.firstLineY));

  for (const [index, line] of metrics.lines.entries()) {
    const tspan = svgElement("tspan");
    tspan.setAttribute("x", "0");
    if (index > 0) tspan.setAttribute("dy", String(QUERY_TEXT_LINE_HEIGHT));
    tspan.textContent = line;
    label.append(tspan);
  }
}

function getQueryTextMetrics(value: string): QueryTextMetrics {
  const normalized = value.trim();
  const cached = queryTextMetricsCache.get(normalized);
  if (cached) return cached;

  const wrappedLines = wrapQueryText(normalized);
  const lines =
    wrappedLines.length > QUERY_TEXT_MAX_LINES
      ? wrappedLines.slice(0, QUERY_TEXT_MAX_LINES)
      : wrappedLines;
  if (wrappedLines.length > QUERY_TEXT_MAX_LINES) {
    lines[lines.length - 1] = ellipsizeToWidth(
      lines[lines.length - 1] ?? "",
      QUERY_NODE_MAX_TEXT_WIDTH,
    );
  }

  const textWidth = Math.max(0, ...lines.map((line) => measureQueryText(line)));
  const width = Math.max(
    QUERY_NODE_MIN_WIDTH,
    Math.ceil(textWidth + QUERY_TEXT_HORIZONTAL_PADDING * 2),
  );
  const height = Math.max(
    QUERY_NODE_MIN_HEIGHT,
    Math.ceil(
      lines.length * QUERY_TEXT_LINE_HEIGHT + QUERY_TEXT_TOP_PADDING + QUERY_TEXT_BOTTOM_PADDING,
    ),
  );
  const fontMetrics = getQueryFontMetrics();
  const metrics = {
    lines,
    width,
    height,
    firstLineY:
      (fontMetrics.ascent - fontMetrics.descent - (lines.length - 1) * QUERY_TEXT_LINE_HEIGHT) / 2,
  };

  queryTextMetricsCache.set(normalized, metrics);
  return metrics;
}

function wrapQueryText(value: string): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (measureQueryText(word) > QUERY_NODE_MAX_TEXT_WIDTH) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }
      lines.push(...splitLongQueryWord(word));
      continue;
    }

    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (measureQueryText(candidate) <= QUERY_NODE_MAX_TEXT_WIDTH) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function splitLongQueryWord(word: string): string[] {
  const chunks: string[] = [];
  let chunk = "";

  for (const character of word) {
    const candidate = `${chunk}${character}`;
    if (!chunk || measureQueryText(candidate) <= QUERY_NODE_MAX_TEXT_WIDTH) {
      chunk = candidate;
      continue;
    }

    chunks.push(chunk);
    chunk = character;
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}

function ellipsizeToWidth(value: string, maxWidth: number): string {
  const ellipsis = "...";
  if (measureQueryText(value) <= maxWidth) return value;

  let clipped = value.trimEnd();
  while (clipped.length > 0 && measureQueryText(`${clipped}${ellipsis}`) > maxWidth) {
    clipped = clipped.slice(0, -1).trimEnd();
  }

  return clipped.length > 0 ? `${clipped}${ellipsis}` : ellipsis;
}

function measureQueryText(value: string): number {
  return measureText(value, QUERY_TEXT_FONT, QUERY_TEXT_FONT_SIZE);
}

function getQueryFontMetrics(): QueryFontMetrics {
  if (queryFontMetrics) return queryFontMetrics;

  const context = getTextMeasureContext();
  if (!context) {
    queryFontMetrics = {
      ascent: QUERY_TEXT_FONT_SIZE * 0.78,
      descent: QUERY_TEXT_FONT_SIZE * 0.22,
    };
    return queryFontMetrics;
  }

  context.font = QUERY_TEXT_FONT;
  const metrics = context.measureText("Mg");
  queryFontMetrics = {
    ascent: metrics.actualBoundingBoxAscent || QUERY_TEXT_FONT_SIZE * 0.78,
    descent: metrics.actualBoundingBoxDescent || QUERY_TEXT_FONT_SIZE * 0.22,
  };
  return queryFontMetrics;
}

function getTextMeasureContext(): CanvasRenderingContext2D | null {
  if (textMeasureContext) return textMeasureContext;
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  textMeasureContext = canvas.getContext("2d");
  return textMeasureContext;
}

function getMeasuredLines(
  value: string,
  maxWidth: number,
  font: string,
  fallbackSize: number,
  maxLines: number,
): string[] {
  const lines = wrapMeasuredText(value.trim() || " ", maxWidth, font, fallbackSize);
  if (lines.length <= maxLines) return lines;

  const visibleLines = lines.slice(0, maxLines);
  visibleLines[visibleLines.length - 1] = ellipsizeMeasuredText(
    visibleLines[visibleLines.length - 1] ?? "",
    maxWidth,
    font,
    fallbackSize,
    true,
  );
  return visibleLines;
}

function wrapMeasuredText(
  value: string,
  maxWidth: number,
  font: string,
  fallbackSize: number,
): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (measureText(word, font, fallbackSize) > maxWidth) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }
      lines.push(...splitMeasuredWord(word, maxWidth, font, fallbackSize));
      continue;
    }

    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (measureText(candidate, font, fallbackSize) <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function splitMeasuredWord(
  word: string,
  maxWidth: number,
  font: string,
  fallbackSize: number,
): string[] {
  const chunks: string[] = [];
  let chunk = "";

  for (const character of word) {
    const candidate = `${chunk}${character}`;
    if (!chunk || measureText(candidate, font, fallbackSize) <= maxWidth) {
      chunk = candidate;
      continue;
    }

    chunks.push(chunk);
    chunk = character;
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}

function ellipsizeMeasuredText(
  value: string,
  maxWidth: number,
  font: string,
  fallbackSize: number,
  force = false,
): string {
  const ellipsis = "...";
  if (!force && measureText(value, font, fallbackSize) <= maxWidth) return value;

  let clipped = value.trimEnd();
  while (
    clipped.length > 0 &&
    measureText(`${clipped}${ellipsis}`, font, fallbackSize) > maxWidth
  ) {
    clipped = clipped.slice(0, -1).trimEnd();
  }

  return clipped.length > 0 ? `${clipped}${ellipsis}` : ellipsis;
}

function measureText(value: string, font: string, fallbackSize: number): number {
  const context = getTextMeasureContext();
  if (!context) return value.length * fallbackSize * 0.55;

  context.font = font;
  return context.measureText(value).width;
}

function getInspectorTitle(value: ExplorationItem): string {
  if (value.kind === "query" && value.status === "draft") return "Ask something...";
  return value.title || value.content;
}

function createNodeAriaLabel(node: PositionedNode): string {
  return `${node.value.kind} ${node.value.title}, ${node.value.status}`;
}

function createNodeTextClipId(nodeId: string): string {
  return `exploration-node-text-clip-${nodeId.replaceAll(/[^A-Za-z0-9_-]/g, "-")}`;
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
  const startY = node.y + getNodeHeight(node) / 2;
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
  const y = node.y + getNodeHeight(node) / 2 + CHILD_INDICATOR_STEM + CHILD_INDICATOR_RADIUS;

  badge.setAttribute("class", `node-child-badge role-${node.value.role}`);
  badge.setAttribute("transform", `translate(${node.x} ${y})`);

  const count = badge.querySelector<SVGTextElement>(".node-child-count");
  if (count) count.textContent = formatCount(node.hiddenChildCount);
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

function scrollNodeIntoViewAfterRender(id: string): void {
  requestAnimationFrame(() => {
    if (!demoStarted) return;

    const element = nodeElements.get(id);
    if (element) smoothScrollNodeIntoView(element);
  });
}

function smoothScrollNodeIntoView(element: SVGGElement): void {
  const nodeBounds = getNodeVisualBounds(element);
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
      scheduleViewportPersistence();
    }
  };

  cameraAnimationId = requestAnimationFrame(tick);
}

function applySelectionClasses(nextHighlightedNodeId: string | null): void {
  const visualHighlightedNodeId = getVisualHighlightedNodeId(nextHighlightedNodeId);
  const nextNodeIds = new Set(layout.nodes.filter((node) => node.selected).map((node) => node.id));
  const nextEdgeIds = new Set(layout.edges.filter((edge) => edge.selected).map((edge) => edge.id));
  toggleClasses(nodeElements, selectedNodeIds, nextNodeIds, "is-selected");
  toggleClasses(edgeElements, selectedEdgeIds, nextEdgeIds, "is-selected");
  bringEdgesToFront(nextEdgeIds);

  if (highlightedNodeId && highlightedNodeId !== visualHighlightedNodeId) {
    nodeElements.get(highlightedNodeId)?.classList.remove("is-head");
  }
  if (visualHighlightedNodeId) nodeElements.get(visualHighlightedNodeId)?.classList.add("is-head");

  selectedNodeIds = nextNodeIds;
  selectedEdgeIds = nextEdgeIds;
  highlightedNodeId = visualHighlightedNodeId;
}

function getVisualHighlightedNodeId(id: string | null): string | null {
  return id;
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
  explorationStore.nodeTitle = getInspectorTitle(node.value);
  explorationStore.nodeKind = node.value.kind;
  explorationStore.nodeStatus = node.value.status;
  explorationStore.nodeScore = node.value.status === "generating" ? "-" : `${node.value.score}%`;
  explorationStore.nodeContent = node.value.content;

  updateActionButtons(id);
}

function renderEmptyInspector(): void {
  inspectorNodeId = null;
  explorationStore.nodeTitle = "No topic";
  explorationStore.nodeKind = "-";
  explorationStore.nodeStatus = "-";
  explorationStore.nodeScore = "-";
  explorationStore.nodeContent = "";
  updateActionButtons(null);
}

function updateActionButtons(id: string | null): void {
  const value = id ? tree.getValue(id) : undefined;
  const parentId = id ? (tree.getNode(id)?.parentId ?? null) : null;
  const hasSelection = value !== undefined;

  explorationStore.canCreateVersion = canCreateUserVersion(value, parentId);
  explorationStore.canDelete = hasSelection && parentId !== null;
}

function updateMetrics(): void {
  explorationStore.nodeCount = String(layout.nodeCount);
  explorationStore.edgeCount = String(layout.edgeCount);
  explorationStore.pathCount = String(tree.selectedPath.length);
  explorationStore.openCount = String(layout.openCount);
  explorationStore.summary = `${layout.nodeCount} nodes · ${layout.openCount} generating · depth ${layout.maxDepth}`;
  setShellSummary(explorationStore.summary);
}

function syncMinimap(headId: string | null, structureChanged = false): void {
  const topology = getMinimapTopology();
  const selectedPathEntries = getMinimapSelectedPathEntries();
  minimapController?.sync(
    topology,
    selectedPathEntries,
    getMinimapHeadId(headId, selectedPathEntries),
    structureChanged,
  );
}

function getMinimapTopology(): BranchingTreeTopology<ExplorationItem> {
  const topology = tree.getFullTopology();
  const temporaryDraftIds = new Set(
    topology.nodes
      .filter((node) => isEmptyAnswerDraft(node.nodeId, node.value))
      .map((node) => node.nodeId),
  );

  if (temporaryDraftIds.size === 0) return topology;

  return {
    nodes: topology.nodes.filter((node) => !temporaryDraftIds.has(node.nodeId)),
    edges: topology.edges.filter(
      (edge) => !temporaryDraftIds.has(edge.parentId) && !temporaryDraftIds.has(edge.childId),
    ),
  };
}

function getMinimapSelectedPathEntries(): readonly BranchingTreePathEntry<ExplorationItem>[] {
  return tree.selectedPathEntries.filter((entry) => !isEmptyAnswerDraft(entry.nodeId, entry.value));
}

function getMinimapHeadId(
  headId: string | null,
  selectedPathEntries: readonly BranchingTreePathEntry<ExplorationItem>[],
): string | null {
  if (!headId) return null;

  const value = tree.getValue(headId);
  if (!value || !isEmptyAnswerDraft(headId, value)) return headId;

  return selectedPathEntries.at(-1)?.nodeId ?? null;
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
  scheduleViewportPersistence();
}

function centerMapAtScale(scale: number): void {
  const bounds = mapPanel.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) return;

  cancelCameraAnimation();
  mapPanel.scrollLeft = 0;
  mapPanel.scrollTop = 0;
  camera = { x: 0, y: 0, scale: clamp(scale, MIN_ZOOM, MAX_ZOOM) };
  centerCamera(getContentBounds(), bounds);
  applyCamera();
  scheduleViewportPersistence();
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

function cancelCameraAnimation(): void {
  if (cameraAnimationId === null) return;

  cancelAnimationFrame(cameraAnimationId);
  cameraAnimationId = null;
}

function getContentBounds(): ContentBounds {
  return contentBounds;
}

function getLayoutContentBounds(): ContentBounds {
  if (layout.nodes.length === 0) return createEmptyContentBounds();

  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const node of layout.nodes) {
    left = Math.min(left, node.x - getNodeWidth(node) / 2);
    right = Math.max(right, node.x + getNodeWidth(node) / 2);
    top = Math.min(top, node.y - getNodeHeight(node) / 2);
    bottom = Math.max(bottom, node.y + getNodeHeight(node) / 2 + getChildIndicatorDepth(node));
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
  scheduleViewportPersistence();
}

function applyCamera(minimumVisibleArea?: { right: number; bottom: number }): void {
  const canvas = getCanvasSize(minimumVisibleArea);
  svg.setAttribute("width", String(Math.ceil(canvas.width)));
  svg.setAttribute("height", String(Math.ceil(canvas.height)));
  svg.setAttribute("viewBox", `0 0 ${canvas.width} ${canvas.height}`);
  viewportGroup?.setAttribute(
    "transform",
    `translate(${CANVAS_PADDING + camera.x} ${CANVAS_PADDING + camera.y}) scale(${camera.scale})`,
  );
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

function handleMapScroll(): void {
  minimapController?.updatePosition();
  scheduleViewportPersistence();
}

function scheduleViewportPersistence(): void {
  if (persistenceSuspended) return;

  if (viewportPersistTimeoutId !== null) {
    window.clearTimeout(viewportPersistTimeoutId);
  }

  viewportPersistTimeoutId = window.setTimeout(() => {
    viewportPersistTimeoutId = null;
    if (demoStarted) persistViewport();
  }, VIEWPORT_PERSIST_DELAY);
}

function flushViewportPersistence(): void {
  if (viewportPersistTimeoutId === null) return;

  window.clearTimeout(viewportPersistTimeoutId);
  viewportPersistTimeoutId = null;
  persistViewport();
}

function getCanvasSize(minimumVisibleArea?: { right: number; bottom: number }): {
  width: number;
  height: number;
} {
  const bounds = mapPanel.getBoundingClientRect();
  const content = getContentBounds();
  const transformedRight =
    CANVAS_PADDING + camera.x + (content.left + content.width) * camera.scale + CANVAS_PADDING;
  const transformedBottom =
    CANVAS_PADDING + camera.y + (content.top + content.height) * camera.scale + CANVAS_PADDING;
  const visibleRight = mapPanel.scrollLeft + bounds.width;
  const visibleBottom = mapPanel.scrollTop + bounds.height;

  return {
    width: Math.max(bounds.width, visibleRight, minimumVisibleArea?.right ?? 0, transformedRight),
    height: Math.max(
      bounds.height,
      visibleBottom,
      minimumVisibleArea?.bottom ?? 0,
      transformedBottom,
    ),
  };
}

function handleWheel(event: WheelEvent): void {
  event.preventDefault();
  zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED));
}

function handleDoubleClickZoom(event: MouseEvent): void {
  event.preventDefault();
  zoomAt(event.clientX, event.clientY, event.altKey ? 0.75 : 1.35);
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
  } else if (moved) {
    scheduleViewportPersistence();
  }
}

function createEdgePath(parent: PositionedNode, child: PositionedNode, selected = false): string {
  const startX = parent.x;
  const startY = parent.y + getNodeHeight(parent) / 2;
  const endX = child.x;
  const endY = child.y - getNodeHeight(child) / 2;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  if (deltaX === 0) return `M ${startX} ${startY} L ${endX} ${endY}`;

  const railY = getEdgeRailY(parent, startY, endY);
  if (!selected && child.siblingIndex > 0 && child.siblingIndex < child.siblingCount - 1) {
    return [
      `M ${startX} ${startY}`,
      `L ${startX} ${railY}`,
      `L ${endX} ${railY}`,
      `L ${endX} ${endY}`,
    ].join(" ");
  }

  const radius = Math.min(10, Math.abs(deltaX) / 2, Math.abs(endY - railY) / 3);
  const directionX = Math.sign(deltaX);
  const directionY = Math.sign(deltaY) || 1;
  const firstCornerStartY = selected ? railY - radius * directionY : railY;
  const firstCornerEndX = selected ? startX + radius * directionX : startX;
  const secondCornerStartX = endX - radius * directionX;
  const secondCornerEndY = railY + radius * directionY;

  return [
    `M ${startX} ${startY}`,
    `L ${startX} ${firstCornerStartY}`,
    ...(selected ? [`Q ${startX} ${railY} ${firstCornerEndX} ${railY}`] : []),
    `L ${secondCornerStartX} ${railY}`,
    `Q ${endX} ${railY} ${endX} ${secondCornerEndY}`,
    `L ${endX} ${endY}`,
  ].join(" ");
}

function getEdgeRailY(_parent: PositionedNode, startY: number, endY: number): number {
  const centeredY = startY + (endY - startY) * 0.5;
  const belowBadgeY = startY + CHILD_INDICATOR_DEPTH + EDGE_BADGE_CLEARANCE;
  return Math.min(Math.max(centeredY, belowBadgeY), endY - EDGE_BADGE_CLEARANCE);
}

function getChildIndicatorDepth(node: PositionedNode): number {
  return node.hiddenChildCount > 0 ? CHILD_INDICATOR_DEPTH : 0;
}

function createEmptyLayout(): LayoutModel {
  return {
    nodes: [],
    edges: [],
    nodeById: new Map(),
    edgeIds: new Set(),
    maxDepth: 0,
    branchCount: 0,
    nodeCount: 0,
    edgeCount: 0,
    openCount: 0,
  };
}

function createEmptyContentBounds(): ContentBounds {
  return { left: 0, top: 0, width: 1, height: 1 };
}

function enableKeyboardHoverSuppression(): void {
  mapPanel.classList.add("is-keyboard-mode");
}

function disableKeyboardHoverSuppression(): void {
  mapPanel.classList.remove("is-keyboard-mode");
}

function createId(prefix: string): string {
  const id = `${prefix}-${String(nextSerial).padStart(4, "0")}`;
  nextSerial++;
  return id;
}

function getVersionLabel(siblingIndex: number, siblingCount: number): string {
  return siblingCount === 1 ? "main" : `v${siblingIndex + 1}/${siblingCount}`;
}

function formatCount(count: number): string {
  return count > 99 ? "99+" : String(count);
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
    elements.get(id)?.classList.add(className);
  }
}

function getNodeElement(target: EventTarget | null): SVGGElement | null {
  return target instanceof Element ? target.closest<SVGGElement>(".tree-node") : null;
}

function getNodeRenderMode(node: PositionedNode): string {
  if (isDraftQueryNode(node)) return "query-draft";
  if (isQueryNode(node)) return "query";
  if (node.value.status === "generating") return "answer-generating";
  return node.value.expanded ? "answer-expanded" : "answer";
}

function getNodeVisualBounds(element: SVGGElement): DOMRect {
  return (
    element.querySelector<SVGGraphicsElement>(".node-card")?.getBoundingClientRect() ??
    element.getBoundingClientRect()
  );
}

function svgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

function mustElement<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing exploration demo element #${id}.`);
  return element as unknown as T;
}

function formatMs(value: number): string {
  return `${value.toFixed(value < 10 ? 2 : 1)} ms`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
