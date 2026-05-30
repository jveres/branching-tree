import {
  BranchingTree,
  type BranchingTreePathEntry,
  type BranchingTreeTopology,
  type BranchingTreeTopologyEdge,
  type BranchingTreeTopologyNode,
  type Identified,
} from "../../branching-tree";

type MinimapValue = Identified & {
  role: string;
};

type MinimapPlacement = {
  xById: Map<string, number>;
  depthById: Map<string, number>;
  maxX: number;
  maxDepth: number;
};

type MinimapOptions = {
  countLabel: string;
  mapPanel: HTMLElement;
  minimap: HTMLElement;
  minimapCount: HTMLElement;
  minimapSvg: SVGSVGElement;
  minimapToggle: HTMLButtonElement;
  onSelect: (id: string) => void;
};

export type DemoMinimap<T extends MinimapValue> = {
  setCollapsed: (collapsed: boolean) => void;
  sync: (
    topology: BranchingTreeTopology<T> | null,
    selectedPathEntries: readonly BranchingTreePathEntry<T>[],
    headId: string | null,
    structureChanged?: boolean,
  ) => void;
  updatePosition: () => void;
};

const SVG_NS = "http://www.w3.org/2000/svg";
const MINIMAP_WIDTH = 248;
const MINIMAP_HEIGHT = 170;
const MINIMAP_PADDING = 14;
const MINIMAP_MARGIN = 16;
const MINIMAP_DOT = 2.5;
const MINIMAP_DOT_ACTIVE = 3.6;

export function createDemoMinimap<T extends MinimapValue>({
  countLabel,
  mapPanel,
  minimap,
  minimapCount,
  minimapSvg,
  minimapToggle,
  onSelect,
}: MinimapOptions): DemoMinimap<T> {
  let dotElements = new Map<string, SVGCircleElement>();
  let edgeElements = new Map<string, SVGLineElement>();
  let activeNodeIds = new Set<string>();
  let activeEdgeIds = new Set<string>();
  let headId: string | null = null;
  let structureDirty = true;
  let collapsed = false;
  let topology: BranchingTreeTopology<T> = Object.freeze({
    edges: Object.freeze([]),
    nodes: Object.freeze([]),
  });

  const updatePosition = (): void => {
    const left = mapPanel.scrollLeft + mapPanel.clientWidth - minimap.offsetWidth - MINIMAP_MARGIN;
    const top = mapPanel.scrollTop + mapPanel.clientHeight - minimap.offsetHeight - MINIMAP_MARGIN;
    minimap.style.transform = `translate(${Math.max(MINIMAP_MARGIN, left)}px, ${Math.max(MINIMAP_MARGIN, top)}px)`;
  };

  const setCollapsed = (nextCollapsed: boolean): void => {
    collapsed = nextCollapsed;
    minimap.classList.toggle("is-collapsed", collapsed);
    minimapToggle.setAttribute("aria-expanded", String(!collapsed));
    minimapToggle.setAttribute("aria-label", collapsed ? "Expand minimap" : "Collapse minimap");
    minimapToggle.setAttribute("title", collapsed ? "Expand minimap" : "Collapse minimap");
    updatePosition();
  };

  const renderTopology = (): void => {
    dotElements = new Map();
    edgeElements = new Map();
    activeNodeIds = new Set();
    activeEdgeIds = new Set();
    headId = null;

    minimapSvg.setAttribute("width", String(MINIMAP_WIDTH));
    minimapSvg.setAttribute("height", String(MINIMAP_HEIGHT));
    minimapSvg.setAttribute("viewBox", `0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`);
    minimapCount.textContent = `${topology.nodes.length} ${countLabel}`;

    const placement = placeMinimapNodes(topology.nodes, topology.edges);
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

    for (const edge of topology.edges) {
      if (!placement.xById.has(edge.parentId) || !placement.xById.has(edge.childId)) continue;

      const line = svgElement("line");
      line.setAttribute("class", "minimap-edge");
      line.setAttribute("x1", String(px(edge.parentId)));
      line.setAttribute("y1", String(py(edge.parentId)));
      line.setAttribute("x2", String(px(edge.childId)));
      line.setAttribute("y2", String(py(edge.childId)));
      line.dataset.id = edge.id;
      edgeElements.set(edge.id, line);
      edgeLayer.append(line);
    }

    for (const node of topology.nodes) {
      const dot = svgElement("circle");
      dot.setAttribute("class", `minimap-dot role-${node.value.role}`);
      dot.setAttribute("cx", String(px(node.nodeId)));
      dot.setAttribute("cy", String(py(node.nodeId)));
      dot.setAttribute("r", String(MINIMAP_DOT));
      dot.dataset.id = node.nodeId;
      dotElements.set(node.nodeId, dot);
      dotLayer.append(dot);
    }
  };

  const syncSelection = (
    selectedPathEntries: readonly BranchingTreePathEntry<T>[],
    nextHeadId: string | null,
  ): void => {
    const nextNodeIds = new Set(selectedPathEntries.map((entry) => entry.nodeId));
    const nextEdgeIds = new Set<string>();

    for (let index = 1; index < selectedPathEntries.length; index++) {
      const parent = selectedPathEntries[index - 1];
      const child = selectedPathEntries[index];
      if (parent && child) nextEdgeIds.add(BranchingTree.createEdgeId(parent.nodeId, child.nodeId));
    }

    for (const id of activeNodeIds) {
      if (nextNodeIds.has(id)) continue;

      const dot = dotElements.get(id);
      dot?.classList.remove("is-active");
      dot?.setAttribute("r", String(MINIMAP_DOT));
    }

    for (const id of nextNodeIds) {
      if (activeNodeIds.has(id)) continue;

      const dot = dotElements.get(id);
      dot?.classList.add("is-active");
      dot?.setAttribute("r", String(MINIMAP_DOT_ACTIVE));
    }

    toggleClasses(edgeElements, activeEdgeIds, nextEdgeIds, "is-selected");

    if (headId && headId !== nextHeadId) {
      dotElements.get(headId)?.classList.remove("is-head");
    }
    if (nextHeadId) dotElements.get(nextHeadId)?.classList.add("is-head");

    activeNodeIds = nextNodeIds;
    activeEdgeIds = nextEdgeIds;
    headId = nextHeadId;
  };

  minimap.addEventListener("pointerdown", (event) => event.stopPropagation());
  minimap.addEventListener("wheel", (event) => event.stopPropagation());
  minimapToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setCollapsed(!collapsed);
  });
  minimapSvg.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest(".minimap-dot") : null;
    const id = target instanceof SVGCircleElement ? target.dataset.id : null;
    if (id) onSelect(id);
  });

  setCollapsed(false);

  return {
    setCollapsed,
    sync(nextTopology, selectedPathEntries, nextHeadId, structureChanged = false) {
      if (nextTopology) topology = nextTopology;
      if (structureChanged) structureDirty = true;
      if (structureDirty) {
        renderTopology();
        structureDirty = false;
      }

      syncSelection(selectedPathEntries, nextHeadId);
      updatePosition();
    },
    updatePosition,
  };
}

function placeMinimapNodes<T extends MinimapValue>(
  nodes: readonly BranchingTreeTopologyNode<T>[],
  edges: readonly BranchingTreeTopologyEdge[],
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

  const assign = (id: string, depth: number): void => {
    depthById.set(id, depth);
    if (depth > maxDepth) maxDepth = depth;

    const children = childIdsByParent.get(id) ?? [];
    if (children.length === 0) {
      xById.set(id, leafCursor);
      leafCursor += 1;
      return;
    }

    let sum = 0;
    for (const childId of children) {
      assign(childId, depth + 1);
      sum += xById.get(childId) ?? 0;
    }
    xById.set(id, sum / children.length);
  };

  for (const node of nodes) {
    if (!childIds.has(node.nodeId)) assign(node.nodeId, node.depth);
  }

  return { xById, depthById, maxX: Math.max(0, leafCursor - 1), maxDepth };
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

function svgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}
