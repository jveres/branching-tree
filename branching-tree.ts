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

  public get head(): T | null {
    return this.selectedPathCache.at(-1) ?? null;
  }

  public getState(): BranchingTreeState<T> {
    return {
      rootId: this.rootId,
      nodes: cloneNodes(this.nodes),
    };
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

    return parent.childrenIds.map((childId) => this.nodes[childId]).filter(isDefined);
  }

  public append(value: T): void {
    this.insert(value, this.head?.id ?? this.rootId);
  }

  public update(value: T): boolean {
    const node = this.nodes[value.id];
    if (!node || node.value === undefined) return false;

    node.value = value;
    this.rebuildSelectedPath();
    return true;
  }

  public upsert(value: T): void {
    if (this.update(value)) return;

    this.append(value);
  }

  public addSibling(referenceId: string, value: T): void {
    if (this.hasNode(value.id)) {
      throw new Error(`Node ${value.id} already exists.`);
    }

    const reference = this.nodes[referenceId];
    if (!reference) throw new Error(`Node ${referenceId} not found.`);
    if (!reference.parentId) throw new Error("Cannot add a sibling to the root node.");

    this.insert(value, reference.parentId);
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

  public selectPathTo(id: string): void {
    let current: BranchingTreeNode<T> | undefined = this.nodes[id];
    if (!current) throw new Error(`Node ${id} not found.`);

    const pathToRoot: BranchingTreeNode<T>[] = [];
    while (current) {
      pathToRoot.push(current);
      current = current.parentId ? this.nodes[current.parentId] : undefined;
    }

    for (let index = pathToRoot.length - 1; index > 0; index--) {
      const parent = pathToRoot[index]!;
      const child = pathToRoot[index - 1]!;
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
      selectedPathLength: this.selectedPath.length,
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

  private insert(value: T, parentId: string): void {
    if (this.hasNode(value.id)) {
      throw new Error(`Node ${value.id} already exists.`);
    }

    const parent = this.nodes[parentId]!;

    this.nodes[value.id] = {
      id: value.id,
      value,
      parentId,
      childrenIds: [],
      selectedChildIndex: 0,
    };
    parent.childrenIds.push(value.id);
    parent.selectedChildIndex = parent.childrenIds.length - 1;
    this.rebuildSelectedPath();
  }

  private rebuildSelectedPath(): void {
    const path: T[] = [];
    let current = this.nodes[this.rootId];

    while (current) {
      if (current.value !== undefined) path.push(current.value);

      const childId = this.getSelectedChildId(current);
      current = childId ? this.nodes[childId] : undefined;
    }

    this.selectedPathCache = Object.freeze(path);
  }

  private getSelectedChildId(node: BranchingTreeNode<T>): string | undefined {
    if (node.childrenIds.length === 0) return undefined;

    const selectedIndex = clampIndex(node.selectedChildIndex, node.childrenIds.length - 1);
    return node.childrenIds[selectedIndex];
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

    for (const nodeId of Object.keys(state.nodes)) {
      if (nodeId !== state.rootId) idMap.set(nodeId, createId());
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
