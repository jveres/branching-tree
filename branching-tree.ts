export type Identified = {
  id: string;
};

export type BranchingTreeNode<T extends Identified> = {
  id: string;
  value?: T;
  parentId: string | null;
  childrenIds: string[];
  selectedChildIndex: number;
};

export type BranchingTreeState<T extends Identified> = {
  rootId: string;
  nodes: Record<string, BranchingTreeNode<T>>;
};

export type BranchingTreeStats = {
  totalNodes: number;
  selectedPathLength: number;
  orphanedNodes: number;
  maxDepth: number;
  leafCount: number;
  branchPoints: number;
};

export type SiblingPosition = {
  current: number;
  total: number;
};

export type BranchingTreePathEntry<T extends Identified> = {
  value: T;
  nodeId: string;
  parentId: string | null;
  siblingIndex: number;
  siblingCount: number;
  hasPreviousSibling: boolean;
  hasNextSibling: boolean;
};

export type BranchingTreeSiblingEntry<T extends Identified> = BranchingTreePathEntry<T> & {
  selected: boolean;
};

export type BranchingTreeChildEntry<T extends Identified> = BranchingTreeSiblingEntry<T>;

export type BranchingTreePathNeighborhoodNode<T extends Identified> =
  BranchingTreeSiblingEntry<T> & {
    depth: number;
    childCount: number;
    hiddenChildCount: number;
  };

export type BranchingTreeTopologyNode<T extends Identified> = BranchingTreeSiblingEntry<T> & {
  depth: number;
  childCount: number;
};

export type BranchingTreePathNeighborhoodEdge = {
  id: string;
  parentId: string;
  childId: string;
  selected: boolean;
};

export type BranchingTreeTopologyEdge = BranchingTreePathNeighborhoodEdge;

export type BranchingTreePathNeighborhood<T extends Identified> = {
  nodes: readonly BranchingTreePathNeighborhoodNode<T>[];
  edges: readonly BranchingTreePathNeighborhoodEdge[];
};

export type BranchingTreeTopology<T extends Identified> = {
  nodes: readonly BranchingTreeTopologyNode<T>[];
  edges: readonly BranchingTreeTopologyEdge[];
};

export type BranchingTreePathNeighborhoodOptions = {
  maxDepth?: number;
  siblingWindow?: number;
};

export type BranchingTreeBranchSummary = {
  nodeId: string;
  descendantCount: number;
  leafCount: number;
  maxDepth: number;
  branchPoints: number;
};

export type Reidentified<T extends Identified> = Omit<T, "id"> & {
  id: string;
};

export type IdFactory = () => string;

export type IdOptions = {
  idFactory?: IdFactory;
  idPrefix?: string;
  rootId?: string;
};

export type DeleteSiblingsOptions = {
  keepTarget?: boolean;
};

export type InsertOptions = {
  select?: boolean;
};

export const ROOT_NODE_ID = "branching-tree-root";

const DEFAULT_ID_PREFIX = "node";

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

const clampIndex = (index: number, maxIndex: number): number =>
  Math.min(Math.max(0, index), maxIndex);

const createRootNode = <T extends Identified>(rootId: string): BranchingTreeNode<T> => ({
  id: rootId,
  parentId: null,
  childrenIds: [],
  selectedChildIndex: 0,
});

const cloneNode = <T extends Identified>(node: BranchingTreeNode<T>): BranchingTreeNode<T> => ({
  ...node,
  childrenIds: [...node.childrenIds],
});

const cloneNodes = <T extends Identified>(
  nodes: Record<string, BranchingTreeNode<T>>,
): Record<string, BranchingTreeNode<T>> => {
  const copy: Record<string, BranchingTreeNode<T>> = {};

  for (const [id, node] of Object.entries(nodes)) {
    copy[id] = cloneNode(node);
  }

  return copy;
};

const createRandomId = (): string => Math.random().toString(36).slice(2);

export class BranchingTree<T extends Identified> {
  private nodes: Record<string, BranchingTreeNode<T>> = {};
  private rootId = ROOT_NODE_ID;
  private selectedPathCache: readonly T[] = [];
  private selectedPathEntriesCache: readonly BranchingTreePathEntry<T>[] = [];

  constructor(initialState?: BranchingTreeState<T>) {
    if (initialState) {
      this.loadState(initialState);
      return;
    }

    this.reset();
  }

  public get rootNodeId(): string {
    return this.rootId;
  }

  public get selectedPath(): readonly T[] {
    return this.selectedPathCache;
  }

  public get selectedPathEntries(): readonly BranchingTreePathEntry<T>[] {
    return this.selectedPathEntriesCache;
  }

  public get head(): T | null {
    return this.selectedPathCache.at(-1) ?? null;
  }

  public getState(): BranchingTreeState<T> {
    return {
      rootId: this.rootId,
      nodes: cloneNodes(this.nodes),
    };
  }

  public getNode(id: string): BranchingTreeNode<T> | undefined {
    const node = this.nodes[id];
    return node ? cloneNode(node) : undefined;
  }

  public getValue(id: string): T | undefined {
    return this.nodes[id]?.value;
  }

  public getSelectedPathState(): BranchingTreeState<T> {
    const nodes: Record<string, BranchingTreeNode<T>> = {
      [this.rootId]: createRootNode(this.rootId),
    };

    let parentId = this.rootId;
    for (const entry of this.selectedPathEntriesCache) {
      nodes[parentId]!.childrenIds = [entry.nodeId];
      nodes[entry.nodeId] = {
        id: entry.nodeId,
        value: entry.value,
        parentId,
        childrenIds: [],
        selectedChildIndex: 0,
      };
      parentId = entry.nodeId;
    }

    return { rootId: this.rootId, nodes };
  }

  public loadState(state: BranchingTreeState<T>): void {
    const rootId = state.rootId || ROOT_NODE_ID;
    const nodes = cloneNodes(state.nodes);

    if (!nodes[rootId] && rootId === ROOT_NODE_ID) {
      nodes[rootId] = createRootNode(rootId);
    }

    this.validateState(rootId, nodes);
    this.rootId = rootId;
    this.nodes = nodes;
    this.rebuildSelectedPath();
  }

  public reset(rootId = ROOT_NODE_ID): void {
    this.rootId = rootId;
    this.nodes = {
      [rootId]: createRootNode(rootId),
    };
    this.rebuildSelectedPath();
  }

  public hasNode(id: string): boolean {
    return this.nodes[id] !== undefined;
  }

  public hasParent(id: string): boolean {
    const parentId = this.nodes[id]?.parentId;
    return parentId !== null && parentId !== undefined && this.nodes[parentId] !== undefined;
  }

  public hasChildren(id: string): boolean {
    return (this.nodes[id]?.childrenIds.length ?? 0) > 0;
  }

  public getSiblingPosition(id: string): SiblingPosition {
    const parent = this.getParent(id);
    if (!parent) return { current: 1, total: 1 };

    const index = parent.childrenIds.indexOf(id);
    return {
      current: index + 1,
      total: parent.childrenIds.length,
    };
  }

  public getSiblings(id: string): BranchingTreeNode<T>[] {
    const parent = this.getParent(id);
    if (!parent) return [];

    return parent.childrenIds
      .map((childId) => this.nodes[childId])
      .filter(isDefined)
      .map(cloneNode);
  }

  public getChildren(id: string): BranchingTreeNode<T>[] {
    const node = this.nodes[id];
    if (!node) return [];

    return node.childrenIds
      .map((childId) => this.nodes[childId])
      .filter(isDefined)
      .map(cloneNode);
  }

  public getSiblingValues(id: string): readonly T[] {
    const parent = this.getParent(id);
    if (!parent) return [];

    return Object.freeze(parent.childrenIds.map((childId) => this.nodes[childId]!.value!));
  }

  public getChildValues(id: string): readonly T[] {
    const node = this.nodes[id];
    if (!node) return [];

    return Object.freeze(
      node.childrenIds.map((childId) => this.nodes[childId]?.value).filter(isDefined),
    );
  }

  public getSiblingEntries(id: string): readonly BranchingTreeSiblingEntry<T>[] {
    const parent = this.getParent(id);
    if (!parent) return [];

    return Object.freeze(
      parent.childrenIds.map((childId, index) =>
        this.createSiblingEntry(this.nodes[childId]!, parent, index),
      ),
    );
  }

  public getChildEntries(id: string): readonly BranchingTreeChildEntry<T>[] {
    const parent = this.nodes[id];
    if (!parent) return [];

    return Object.freeze(
      parent.childrenIds.map((childId, index) =>
        this.createSiblingEntry(this.nodes[childId]!, parent, index),
      ),
    );
  }

  public getPathEntriesTo(id: string): readonly BranchingTreePathEntry<T>[] {
    const path = this.getNodePathTo(id);
    if (!path) return [];

    return Object.freeze(
      path.filter((node) => node.value !== undefined).map((node) => this.createPathEntry(node)),
    );
  }

  public getFullTopology(): BranchingTreeTopology<T> {
    const selectedIds = new Set(this.selectedPathEntriesCache.map((entry) => entry.nodeId));
    const topologyNodes: BranchingTreeTopologyNode<T>[] = [];
    const stack = [{ id: this.rootId, depth: this.nodes[this.rootId]?.value ? 0 : -1 }];

    while (stack.length > 0) {
      const { id, depth } = stack.pop()!;
      const node = this.nodes[id]!;

      if (node.value !== undefined) {
        topologyNodes.push({
          ...this.createTopologyEntry(node),
          depth,
          childCount: node.childrenIds.length,
          selected: selectedIds.has(id),
        });
      }

      for (let index = node.childrenIds.length - 1; index >= 0; index--) {
        stack.push({ id: node.childrenIds[index]!, depth: depth + 1 });
      }
    }

    const visibleIds = new Set(topologyNodes.map((node) => node.nodeId));
    const nodes = Object.freeze(topologyNodes.map((node) => Object.freeze(node)));
    const edges = Object.freeze(
      nodes
        .filter((node) => node.parentId !== null && visibleIds.has(node.parentId))
        .map((node) =>
          Object.freeze({
            id: BranchingTree.createEdgeId(node.parentId!, node.nodeId),
            parentId: node.parentId!,
            childId: node.nodeId,
            selected: selectedIds.has(node.parentId!) && selectedIds.has(node.nodeId),
          }),
        ),
    );

    return Object.freeze({ nodes, edges });
  }

  public getBranchSummary(id: string): BranchingTreeBranchSummary | null {
    const startNode = this.nodes[id];
    if (!startNode) return null;

    const visitedIds = new Set<string>();
    const stack: Array<{ id: string; depth: number }> = [{ id, depth: 0 }];
    let nodeCount = 0;
    let leafCount = 0;
    let maxDepth = 0;
    let branchPoints = 0;

    while (stack.length > 0) {
      const { id: nodeId, depth } = stack.pop()!;
      if (visitedIds.has(nodeId)) continue;
      visitedIds.add(nodeId);

      const node = this.nodes[nodeId]!;

      nodeCount++;
      maxDepth = Math.max(maxDepth, depth);
      if (node.childrenIds.length === 0) leafCount++;
      if (node.childrenIds.length > 1) branchPoints++;

      for (const childId of node.childrenIds) {
        stack.push({ id: childId, depth: depth + 1 });
      }
    }

    return Object.freeze({
      nodeId: id,
      descendantCount: Math.max(0, nodeCount - 1),
      leafCount,
      maxDepth,
      branchPoints,
    });
  }

  public getSelectedPathNeighborhood(
    options: BranchingTreePathNeighborhoodOptions = {},
  ): BranchingTreePathNeighborhood<T> {
    const selectedIds = new Set(this.selectedPathEntriesCache.map((entry) => entry.nodeId));
    const visibleNodes: Array<Omit<BranchingTreePathNeighborhoodNode<T>, "hiddenChildCount">> = [];
    const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;

    for (let depth = 0; depth < this.selectedPathEntriesCache.length; depth++) {
      if (depth > maxDepth) break;

      const entry = this.selectedPathEntriesCache[depth]!;
      const entries =
        entry.parentId === null
          ? [this.createRootNeighborhoodEntry(entry)]
          : this.getChildEntries(entry.parentId);

      for (const childEntry of this.filterNeighborhoodEntries(
        entries,
        entry.nodeId,
        options.siblingWindow,
      )) {
        const node = this.nodes[childEntry.nodeId]!;
        visibleNodes.push({
          ...childEntry,
          depth,
          childCount: node.childrenIds.length,
        });
      }
    }

    const visibleIds = new Set(visibleNodes.map((node) => node.nodeId));
    const nodes = Object.freeze(
      visibleNodes.map((node) =>
        Object.freeze({
          ...node,
          hiddenChildCount: this.nodes[node.nodeId]!.childrenIds.filter(
            (childId) => !visibleIds.has(childId),
          ).length,
        }),
      ),
    );
    const edges = Object.freeze(
      nodes
        .filter((node) => node.parentId !== null && visibleIds.has(node.parentId))
        .map((node) =>
          Object.freeze({
            id: BranchingTree.createEdgeId(node.parentId!, node.nodeId),
            parentId: node.parentId!,
            childId: node.nodeId,
            selected: selectedIds.has(node.parentId!) && selectedIds.has(node.nodeId),
          }),
        ),
    );

    return Object.freeze({ nodes, edges });
  }

  public append(value: T, options: InsertOptions = {}): void {
    this.insert(value, this.head?.id ?? this.rootId, options);
  }

  public appendChild(parentId: string, value: T, options: InsertOptions = {}): void {
    this.insert(value, parentId, options);
  }

  public update(value: T): boolean {
    const node = this.nodes[value.id];
    if (!node || node.value === undefined) return false;

    node.value = value;
    this.replaceCachedValue(value);
    return true;
  }

  public updateHead(value: T): boolean {
    const headIndex = this.selectedPathCache.length - 1;
    if (headIndex < 0) return false;
    if (this.selectedPathCache[headIndex]!.id !== value.id) return false;

    this.nodes[value.id]!.value = value;
    this.replaceCachedValueAt(headIndex, value);
    return true;
  }

  public upsert(value: T, options: InsertOptions = {}): void {
    if (this.update(value)) return;

    this.append(value, options);
  }

  public addSibling(referenceId: string, value: T, options: InsertOptions = {}): void {
    if (this.hasNode(value.id)) {
      throw new Error(`Node ${value.id} already exists.`);
    }

    const reference = this.nodes[referenceId];
    if (!reference) throw new Error(`Node ${referenceId} not found.`);
    if (!reference.parentId) throw new Error("Cannot add a sibling to the root node.");

    this.insert(value, reference.parentId, options);
  }

  public selectSibling(id: string, offset: number): boolean {
    const parent = this.getParent(id);
    if (!parent) return false;

    const currentIndex = parent.childrenIds.indexOf(id);
    const nextIndex = currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= parent.childrenIds.length) return false;

    parent.selectedChildIndex = nextIndex;
    this.rebuildSelectedPath();
    return true;
  }

  public selectSiblingAt(id: string, index: number): boolean {
    const parent = this.getParent(id);
    if (!parent || index < 0 || index >= parent.childrenIds.length) return false;

    parent.selectedChildIndex = index;
    this.rebuildSelectedPath();
    return true;
  }

  public selectSiblingById(id: string): boolean {
    const node = this.nodes[id];
    if (!node?.parentId) return false;

    this.selectPathTo(id);
    return true;
  }

  public selectPathTo(id: string): void {
    const pathFromRoot = this.getNodePathTo(id);
    if (!pathFromRoot) throw new Error(`Node ${id} not found.`);

    for (let index = 0; index < pathFromRoot.length - 1; index++) {
      const parent = pathFromRoot[index]!;
      const child = pathFromRoot[index + 1]!;
      parent.selectedChildIndex = parent.childrenIds.indexOf(child.id);
    }
    this.rebuildSelectedPath();
  }

  public deleteNode(id: string): boolean {
    const parent = this.getParent(id);
    if (!parent) return false;

    const index = parent.childrenIds.indexOf(id);
    parent.childrenIds.splice(index, 1);

    if (parent.selectedChildIndex >= index) {
      parent.selectedChildIndex = Math.max(0, parent.selectedChildIndex - 1);
    }

    this.deleteSubtree(id);
    this.rebuildSelectedPath();
    return true;
  }

  public deleteBranch(id: string): boolean {
    return this.deleteNode(id);
  }

  public deleteDescendants(id: string): boolean {
    const node = this.nodes[id];
    if (!node || node.childrenIds.length === 0) return false;

    const childIds = [...node.childrenIds];
    node.childrenIds = [];
    node.selectedChildIndex = 0;

    for (const childId of childIds) {
      this.deleteSubtree(childId);
    }

    this.rebuildSelectedPath();
    return true;
  }

  public truncateAfter(id: string): boolean {
    if (!this.hasNode(id)) return false;

    this.selectPathTo(id);
    return this.deleteDescendants(id);
  }

  public deleteSiblings(id: string, options: DeleteSiblingsOptions = {}): boolean {
    const parent = this.getParent(id);
    if (!parent) return false;

    const keepId = options.keepTarget ? id : undefined;
    const idsToDelete = parent.childrenIds.filter((siblingId) => siblingId !== keepId);
    if (idsToDelete.length === 0) return false;

    parent.childrenIds = keepId ? [keepId] : [];
    parent.selectedChildIndex = 0;

    for (const siblingId of idsToDelete) {
      this.deleteSubtree(siblingId);
    }

    this.rebuildSelectedPath();
    return true;
  }

  public getStats(): BranchingTreeStats {
    const totalNodes = Object.keys(this.nodes).length;
    const stack: Array<{ id: string; depth: number }> = [{ id: this.rootId, depth: 0 }];
    let reachableNodes = 0;
    let maxDepth = 0;
    let leafCount = 0;
    let branchPoints = 0;

    while (stack.length > 0) {
      const { id, depth } = stack.pop()!;
      reachableNodes++;
      const node = this.nodes[id]!;
      maxDepth = Math.max(maxDepth, depth);

      if (node.childrenIds.length === 0) {
        leafCount++;
        continue;
      }

      if (node.childrenIds.length > 1) branchPoints++;

      for (const childId of node.childrenIds) {
        stack.push({ id: childId, depth: depth + 1 });
      }
    }

    return {
      totalNodes,
      selectedPathLength: this.selectedPathCache.length,
      orphanedNodes: totalNodes - reachableNodes,
      maxDepth,
      leafCount,
      branchPoints,
    };
  }

  private getParent(id: string): BranchingTreeNode<T> | undefined {
    const parentId = this.nodes[id]?.parentId;
    return parentId ? this.nodes[parentId] : undefined;
  }

  private getNodePathTo(id: string): BranchingTreeNode<T>[] | undefined {
    let current: BranchingTreeNode<T> | undefined = this.nodes[id];
    if (!current) return undefined;

    const path: BranchingTreeNode<T>[] = [];
    while (current) {
      path.push(current);
      current = current.parentId ? this.nodes[current.parentId] : undefined;
    }

    return path.reverse();
  }

  private insert(value: T, parentId: string, options: InsertOptions = {}): void {
    if (this.hasNode(value.id)) {
      throw new Error(`Node ${value.id} already exists.`);
    }

    const parent = this.nodes[parentId];
    if (!parent) throw new Error(`Parent node ${parentId} not found.`);

    this.nodes[value.id] = {
      id: value.id,
      value,
      parentId,
      childrenIds: [],
      selectedChildIndex: 0,
    };
    parent.childrenIds.push(value.id);
    if (options.select !== false || parent.childrenIds.length === 1) {
      parent.selectedChildIndex = parent.childrenIds.length - 1;
    }
    this.rebuildSelectedPath();
  }

  private rebuildSelectedPath(): void {
    const path: T[] = [];
    const entries: BranchingTreePathEntry<T>[] = [];
    let current = this.nodes[this.rootId];

    while (current) {
      if (current.value !== undefined) {
        path.push(current.value);
        entries.push(this.createPathEntry(current));
      }

      const childId = this.getSelectedChildId(current);
      current = childId ? this.nodes[childId] : undefined;
    }

    this.selectedPathCache = Object.freeze(path);
    this.selectedPathEntriesCache = Object.freeze(entries);
  }

  private getSelectedChildId(node: BranchingTreeNode<T>): string | undefined {
    if (node.childrenIds.length === 0) return undefined;

    const selectedIndex = clampIndex(node.selectedChildIndex, node.childrenIds.length - 1);
    return node.childrenIds[selectedIndex];
  }

  private createPathEntry(node: BranchingTreeNode<T>): BranchingTreePathEntry<T> {
    const parent = node.parentId ? this.nodes[node.parentId] : undefined;
    const siblingIndex = parent ? parent.childrenIds.indexOf(node.id) : 0;
    const siblingCount = parent ? parent.childrenIds.length : 1;

    return Object.freeze({
      value: node.value!,
      nodeId: node.id,
      parentId: node.parentId,
      siblingIndex,
      siblingCount,
      hasPreviousSibling: siblingIndex > 0,
      hasNextSibling: siblingIndex < siblingCount - 1,
    });
  }

  private createSiblingEntry(
    node: BranchingTreeNode<T>,
    parent: BranchingTreeNode<T>,
    siblingIndex: number,
  ): BranchingTreeSiblingEntry<T> {
    const siblingCount = parent.childrenIds.length;

    const selectedIndex = clampIndex(parent.selectedChildIndex, siblingCount - 1);

    return Object.freeze({
      value: node.value!,
      nodeId: node.id,
      parentId: node.parentId,
      siblingIndex,
      siblingCount,
      hasPreviousSibling: siblingIndex > 0,
      hasNextSibling: siblingIndex < siblingCount - 1,
      selected: selectedIndex === siblingIndex,
    });
  }

  private createTopologyEntry(node: BranchingTreeNode<T>): BranchingTreeSiblingEntry<T> {
    const parent = node.parentId ? this.nodes[node.parentId] : undefined;
    if (!parent) return this.createRootNeighborhoodEntry(this.createPathEntry(node));

    return this.createSiblingEntry(node, parent, parent.childrenIds.indexOf(node.id));
  }

  private createRootNeighborhoodEntry(
    entry: BranchingTreePathEntry<T>,
  ): BranchingTreeChildEntry<T> {
    return Object.freeze({
      ...entry,
      selected: true,
    });
  }

  private filterNeighborhoodEntries(
    entries: readonly BranchingTreeChildEntry<T>[],
    selectedNodeId: string,
    siblingWindow: number | undefined,
  ): readonly BranchingTreeChildEntry<T>[] {
    if (siblingWindow === undefined) return entries;

    const selectedEntry = entries.find((entry) => entry.nodeId === selectedNodeId)!;
    const windowSize = Math.max(0, Math.floor(siblingWindow));
    return entries.filter(
      (entry) => Math.abs(entry.siblingIndex - selectedEntry.siblingIndex) <= windowSize,
    );
  }

  private replaceCachedValue(value: T): void {
    const pathIndex = this.selectedPathCache.findIndex((pathValue) => pathValue.id === value.id);
    if (pathIndex !== -1) this.replaceCachedValueAt(pathIndex, value);
  }

  private replaceCachedValueAt(pathIndex: number, value: T): void {
    const path = [...this.selectedPathCache];
    const entries = [...this.selectedPathEntriesCache];
    const entry = entries[pathIndex]!;

    path[pathIndex] = value;
    entries[pathIndex] = Object.freeze({ ...entry, value });

    this.selectedPathCache = Object.freeze(path);
    this.selectedPathEntriesCache = Object.freeze(entries);
  }

  private deleteSubtree(startId: string): void {
    const stack = [startId];

    for (const id of stack) {
      const node = this.nodes[id]!;
      stack.push(...node.childrenIds);
      delete this.nodes[id];
    }
  }

  private validateState(rootId: string, nodes: Record<string, BranchingTreeNode<T>>): void {
    const root = nodes[rootId];
    if (!root) throw new Error(`Root node ${rootId} missing from state.`);
    if (root.parentId !== null) throw new Error(`Root node ${rootId} cannot have a parent.`);

    for (const [id, node] of Object.entries(nodes)) {
      if (node.id !== id) throw new Error(`Node key ${id} does not match node id ${node.id}.`);

      if (id !== rootId && node.value === undefined) {
        throw new Error(`Node ${id} is missing its value.`);
      }

      if (id !== rootId && node.parentId === null) {
        throw new Error(`Node ${id} is missing its parent.`);
      }

      if (node.parentId && !nodes[node.parentId]) {
        throw new Error(`Node ${id} has missing parent ${node.parentId}.`);
      }

      if (node.parentId && !nodes[node.parentId]!.childrenIds.includes(id)) {
        throw new Error(`Parent ${node.parentId} does not include child ${id}.`);
      }

      const childIds = new Set(node.childrenIds);
      if (childIds.size !== node.childrenIds.length) {
        throw new Error(`Node ${id} has duplicate children.`);
      }

      for (const childId of node.childrenIds) {
        const child = nodes[childId];
        if (!child) throw new Error(`Node ${id} has missing child ${childId}.`);
        if (child.parentId !== id) {
          throw new Error(`Child ${childId} does not point back to parent ${id}.`);
        }
      }
    }
  }

  public static createNodeId(prefix = DEFAULT_ID_PREFIX): string {
    return `${prefix}-${createRandomId()}`;
  }

  public static createEdgeId(parentId: string, childId: string): string {
    return `${parentId}->${childId}`;
  }

  public static createLinearState<T extends Identified>(
    values: readonly T[],
    options: IdOptions = {},
  ): BranchingTreeState<Reidentified<T>> {
    const rootId = options.rootId ?? ROOT_NODE_ID;
    const createId = options.idFactory ?? (() => BranchingTree.createNodeId(options.idPrefix));
    const nodes: Record<string, BranchingTreeNode<Reidentified<T>>> = {
      [rootId]: createRootNode(rootId),
    };

    let parentId = rootId;
    for (const value of values) {
      const id = createId();
      if (nodes[id]) throw new Error(`Generated node id ${id} already exists.`);

      nodes[id] = {
        id,
        value: { ...value, id },
        parentId,
        childrenIds: [],
        selectedChildIndex: 0,
      };
      nodes[parentId]!.childrenIds.push(id);
      parentId = id;
    }

    return { rootId, nodes };
  }

  public static cloneStateWithNewIds<T extends Identified>(
    state: BranchingTreeState<T>,
    options: IdOptions = {},
  ): BranchingTreeState<Reidentified<T>> {
    const rootId = options.rootId ?? state.rootId;
    const createId = options.idFactory ?? (() => BranchingTree.createNodeId(options.idPrefix));
    const idMap = new Map<string, string>([[state.rootId, rootId]]);
    const usedIds = new Set<string>([rootId]);

    for (const nodeId of Object.keys(state.nodes)) {
      if (nodeId === state.rootId) continue;

      const id = createId();
      if (usedIds.has(id)) throw new Error(`Generated node id ${id} already exists.`);

      usedIds.add(id);
      idMap.set(nodeId, id);
    }

    const getMappedId = (id: string): string => {
      const mappedId = idMap.get(id);
      if (!mappedId) throw new Error(`Missing cloned id for node ${id}.`);
      return mappedId;
    };

    const nodes: Record<string, BranchingTreeNode<Reidentified<T>>> = {};

    for (const [oldId, node] of Object.entries(state.nodes)) {
      const id = getMappedId(oldId);
      const parentId = node.parentId ? getMappedId(node.parentId) : null;

      nodes[id] = {
        id,
        parentId,
        childrenIds: node.childrenIds.map(getMappedId),
        selectedChildIndex: node.selectedChildIndex,
        ...(node.value !== undefined ? { value: { ...node.value, id } } : {}),
      };
    }

    return { rootId, nodes };
  }
}
