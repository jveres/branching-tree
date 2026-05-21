import { describe, expect, it, vi } from "vitest";
import {
  BranchingTree,
  ROOT_NODE_ID,
  type BranchingTreeNode,
  type BranchingTreeState,
  type Identified,
} from "./branching-tree";
import { createDemoState } from "./demo/controller";

type Item = Identified & {
  text: string;
};

const item = (id: string): Item => ({ id, text: id.toUpperCase() });

const rootNode = (childrenIds: string[] = [], selectedChildIndex = 0): BranchingTreeNode<Item> => ({
  id: ROOT_NODE_ID,
  parentId: null,
  childrenIds,
  selectedChildIndex,
});

const treeNode = (
  id: string,
  parentId: string,
  childrenIds: string[] = [],
  selectedChildIndex = 0,
): BranchingTreeNode<Item> => ({
  id,
  value: item(id),
  parentId,
  childrenIds,
  selectedChildIndex,
});

const ids = (values: readonly Item[]): string[] => values.map((value) => value.id);

describe("BranchingTree", () => {
  it("should start with an empty selected path and a root node", () => {
    const tree = new BranchingTree<Item>();

    expect(tree.rootNodeId).toBe(ROOT_NODE_ID);
    expect(tree.selectedPath).toEqual([]);
    expect(tree.head).toBeNull();
    expect(tree.hasNode(ROOT_NODE_ID)).toBe(true);
    expect(tree.hasParent(ROOT_NODE_ID)).toBe(false);
    expect(tree.hasChildren(ROOT_NODE_ID)).toBe(false);
    expect(tree.getSiblingPosition(ROOT_NODE_ID)).toEqual({ current: 1, total: 1 });
    expect(tree.getSiblings(ROOT_NODE_ID)).toEqual([]);
    expect(tree.getSiblingValues(ROOT_NODE_ID)).toEqual([]);
    expect(tree.getSiblingEntries(ROOT_NODE_ID)).toEqual([]);
    expect(tree.selectedPathEntries).toEqual([]);
    expect(tree.getSelectedPathNeighborhood()).toEqual({ nodes: [], edges: [] });
  });

  it("should append values to the selected path", () => {
    const tree = new BranchingTree<Item>();

    tree.append(item("a"));
    tree.append(item("b"));

    expect(ids(tree.selectedPath)).toEqual(["a", "b"]);
    expect(tree.head).toEqual(item("b"));
    expect(tree.hasNode("a")).toBe(true);
    expect(tree.hasNode("missing")).toBe(false);
    expect(tree.hasParent("b")).toBe(true);
    expect(tree.hasParent("missing")).toBe(false);
    expect(tree.hasChildren("a")).toBe(true);
    expect(tree.hasChildren("missing")).toBe(false);
  });

  it("should return the cached selected path until the tree changes", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));

    const selectedPath = tree.selectedPath;
    tree.append(item("b"));

    expect(tree.selectedPath).not.toBe(selectedPath);
    expect(selectedPath).toEqual([item("a")]);
    expect(tree.selectedPath).toBe(tree.selectedPath);
    expect(Object.isFrozen(tree.selectedPath)).toBe(true);
  });

  it("should expose cached selected path entries with sibling metadata", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));
    tree.addSibling("b2", item("b3"));

    tree.selectPathTo("b2");

    const entries = tree.selectedPathEntries;
    expect(entries).toEqual([
      {
        value: item("a"),
        nodeId: "a",
        parentId: ROOT_NODE_ID,
        siblingIndex: 0,
        siblingCount: 1,
        hasPreviousSibling: false,
        hasNextSibling: false,
      },
      {
        value: item("b2"),
        nodeId: "b2",
        parentId: "a",
        siblingIndex: 1,
        siblingCount: 3,
        hasPreviousSibling: true,
        hasNextSibling: true,
      },
    ]);
    expect(tree.selectedPathEntries).toBe(entries);
    expect(Object.isFrozen(entries)).toBe(true);
    expect(Object.isFrozen(entries[0])).toBe(true);
  });

  it("should reject duplicate node ids when appending", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));

    expect(() => tree.append(item("a"))).toThrow("Node a already exists.");
  });

  it("should update and upsert values", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));

    const updated = tree.update({ id: "a", text: "updated" });
    const missingUpdated = tree.update(item("missing"));
    tree.upsert({ id: "a", text: "upserted" });
    tree.upsert(item("b"));

    expect(updated).toBe(true);
    expect(missingUpdated).toBe(false);
    expect(ids(tree.selectedPath)).toEqual(["a", "b"]);
    expect(tree.selectedPath[0]).toEqual({ id: "a", text: "upserted" });
    expect(tree.update({ id: ROOT_NODE_ID, text: "root" })).toBe(false);
  });

  it("should update inactive nodes without replacing the selected path cache", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));
    tree.selectPathTo("b");

    const selectedPath = tree.selectedPath;
    const selectedPathEntries = tree.selectedPathEntries;

    expect(tree.update({ id: "b2", text: "inactive update" })).toBe(true);
    expect(tree.selectedPath).toBe(selectedPath);
    expect(tree.selectedPathEntries).toBe(selectedPathEntries);

    expect(tree.selectSiblingById("b2")).toBe(true);
    expect(tree.head).toEqual({ id: "b2", text: "inactive update" });
  });

  it("should update the selected head directly", () => {
    const emptyTree = new BranchingTree<Item>();
    expect(emptyTree.updateHead(item("missing"))).toBe(false);

    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));

    const selectedPath = tree.selectedPath;
    const selectedPathEntries = tree.selectedPathEntries;

    expect(tree.updateHead({ id: "a", text: "not the head" })).toBe(false);
    expect(tree.selectedPath).toBe(selectedPath);
    expect(tree.selectedPathEntries).toBe(selectedPathEntries);

    expect(tree.updateHead({ id: "b", text: "streamed" })).toBe(true);
    expect(tree.head).toEqual({ id: "b", text: "streamed" });
    expect(tree.getState().nodes.b?.value).toEqual({ id: "b", text: "streamed" });
    expect(tree.selectedPath).not.toBe(selectedPath);
    expect(tree.selectedPathEntries).not.toBe(selectedPathEntries);
    expect(tree.selectedPathEntries[1]?.value).toEqual({ id: "b", text: "streamed" });
  });

  it("should add siblings and select the newest sibling", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));

    tree.addSibling("b", item("b2"));

    expect(ids(tree.selectedPath)).toEqual(["a", "b2"]);
    expect(tree.getSiblingPosition("b")).toEqual({ current: 1, total: 2 });
    expect(tree.getSiblingPosition("b2")).toEqual({ current: 2, total: 2 });
    expect(tree.getSiblings("b2").map((node) => node.id)).toEqual(["b", "b2"]);
  });

  it("should return sibling values and entries without exposing node internals", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));
    tree.addSibling("b2", item("b3"));

    const values = tree.getSiblingValues("b2");
    const entries = tree.getSiblingEntries("b2");
    const siblings = tree.getSiblings("b2");
    const firstSibling = siblings[0];
    firstSibling?.childrenIds.push("external");

    expect(ids(values)).toEqual(["b", "b2", "b3"]);
    expect(Object.isFrozen(values)).toBe(true);
    expect(entries).toEqual([
      {
        value: item("b"),
        nodeId: "b",
        parentId: "a",
        siblingIndex: 0,
        siblingCount: 3,
        hasPreviousSibling: false,
        hasNextSibling: true,
        selected: false,
      },
      {
        value: item("b2"),
        nodeId: "b2",
        parentId: "a",
        siblingIndex: 1,
        siblingCount: 3,
        hasPreviousSibling: true,
        hasNextSibling: true,
        selected: false,
      },
      {
        value: item("b3"),
        nodeId: "b3",
        parentId: "a",
        siblingIndex: 2,
        siblingCount: 3,
        hasPreviousSibling: true,
        hasNextSibling: false,
        selected: true,
      },
    ]);
    expect(Object.isFrozen(entries)).toBe(true);
    expect(Object.isFrozen(entries[0])).toBe(true);
    expect(tree.getSiblings("b2")[0]?.childrenIds).toEqual([]);
    expect(tree.getSiblingValues("missing")).toEqual([]);
    expect(tree.getSiblingEntries(ROOT_NODE_ID)).toEqual([]);
  });

  it("should return node, value, child, and path read models without exposing node internals", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));
    tree.appendChild("a", item("b3"), { select: false });

    const root = tree.getNode(ROOT_NODE_ID);
    const children = tree.getChildren("a");
    const firstChild = children[0];
    firstChild?.childrenIds.push("external");

    expect(root).toEqual({
      id: ROOT_NODE_ID,
      parentId: null,
      childrenIds: ["a"],
      selectedChildIndex: 0,
    });
    expect(tree.getNode("missing")).toBeUndefined();
    expect(tree.getValue("b2")).toEqual(item("b2"));
    expect(tree.getValue("missing")).toBeUndefined();
    expect(children.map((node) => node.id)).toEqual(["b", "b2", "b3"]);
    expect(tree.getChildren("missing")).toEqual([]);
    expect(tree.getChildren("a")[0]?.childrenIds).toEqual([]);
    expect(ids(tree.getChildValues("a"))).toEqual(["b", "b2", "b3"]);
    expect(Object.isFrozen(tree.getChildValues("a"))).toBe(true);
    expect(tree.getChildValues("missing")).toEqual([]);
    expect(tree.getChildEntries("a")).toEqual([
      {
        value: item("b"),
        nodeId: "b",
        parentId: "a",
        siblingIndex: 0,
        siblingCount: 3,
        hasPreviousSibling: false,
        hasNextSibling: true,
        selected: false,
      },
      {
        value: item("b2"),
        nodeId: "b2",
        parentId: "a",
        siblingIndex: 1,
        siblingCount: 3,
        hasPreviousSibling: true,
        hasNextSibling: true,
        selected: true,
      },
      {
        value: item("b3"),
        nodeId: "b3",
        parentId: "a",
        siblingIndex: 2,
        siblingCount: 3,
        hasPreviousSibling: true,
        hasNextSibling: false,
        selected: false,
      },
    ]);
    expect(Object.isFrozen(tree.getChildEntries("a"))).toBe(true);
    expect(Object.isFrozen(tree.getChildEntries("a")[0])).toBe(true);
    expect(tree.getChildEntries("b")).toEqual([]);
    expect(tree.getChildEntries("missing")).toEqual([]);
    expect(tree.getPathEntriesTo("b")).toEqual([
      {
        value: item("a"),
        nodeId: "a",
        parentId: ROOT_NODE_ID,
        siblingIndex: 0,
        siblingCount: 1,
        hasPreviousSibling: false,
        hasNextSibling: false,
      },
      {
        value: item("b"),
        nodeId: "b",
        parentId: "a",
        siblingIndex: 0,
        siblingCount: 3,
        hasPreviousSibling: false,
        hasNextSibling: true,
      },
    ]);
    expect(Object.isFrozen(tree.getPathEntriesTo("b"))).toBe(true);
    expect(Object.isFrozen(tree.getPathEntriesTo("b")[0])).toBe(true);
    expect(tree.getPathEntriesTo("missing")).toEqual([]);
    expect(ids(tree.selectedPath)).toEqual(["a", "b2"]);
  });

  it("should return a selected path neighborhood for tree map rendering", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));
    tree.append(item("c"));
    tree.appendChild("b", item("hidden-under-b"));
    tree.appendChild("b2", item("c2"), { select: false });

    const neighborhood = tree.getSelectedPathNeighborhood();

    expect(neighborhood.nodes.map((node) => node.nodeId)).toEqual(["a", "b", "b2", "c", "c2"]);
    expect(
      neighborhood.nodes.map((node) => ({
        id: node.nodeId,
        depth: node.depth,
        selected: node.selected,
        childCount: node.childCount,
        hiddenChildCount: node.hiddenChildCount,
      })),
    ).toEqual([
      { id: "a", depth: 0, selected: true, childCount: 2, hiddenChildCount: 0 },
      { id: "b", depth: 1, selected: false, childCount: 1, hiddenChildCount: 1 },
      { id: "b2", depth: 1, selected: true, childCount: 2, hiddenChildCount: 0 },
      { id: "c", depth: 2, selected: true, childCount: 0, hiddenChildCount: 0 },
      { id: "c2", depth: 2, selected: false, childCount: 0, hiddenChildCount: 0 },
    ]);
    expect(neighborhood.edges).toEqual([
      { id: "a->b", parentId: "a", childId: "b", selected: false },
      { id: "a->b2", parentId: "a", childId: "b2", selected: true },
      { id: "b2->c", parentId: "b2", childId: "c", selected: true },
      { id: "b2->c2", parentId: "b2", childId: "c2", selected: false },
    ]);
    expect(Object.isFrozen(neighborhood)).toBe(true);
    expect(Object.isFrozen(neighborhood.nodes)).toBe(true);
    expect(Object.isFrozen(neighborhood.nodes[0])).toBe(true);
    expect(Object.isFrozen(neighborhood.edges)).toBe(true);
    expect(Object.isFrozen(neighborhood.edges[0])).toBe(true);
  });

  it("should insert without selecting when requested", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));

    tree.addSibling("b", item("b2"), { select: false });
    tree.appendChild("a", item("b3"), { select: false });

    expect(ids(tree.selectedPath)).toEqual(["a", "b"]);
    expect(ids(tree.getSiblingValues("b"))).toEqual(["b", "b2", "b3"]);

    tree.appendChild("b", item("c"), { select: false });

    expect(ids(tree.selectedPath)).toEqual(["a", "b", "c"]);
    expect(() => tree.appendChild("missing", item("orphan"))).toThrow(
      "Parent node missing not found.",
    );
  });

  it("should reject invalid sibling additions", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));

    expect(() => tree.addSibling("a", item("a"))).toThrow("Node a already exists.");
    expect(() => tree.addSibling("missing", item("b"))).toThrow("Node missing not found.");
    expect(() => tree.addSibling(ROOT_NODE_ID, item("root-sibling"))).toThrow(
      "Cannot add a sibling to the root node.",
    );
  });

  it("should select siblings by offset", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));

    const selectedPrevious = tree.selectSibling("b2", -1);
    const selectedNext = tree.selectSibling("b", 1);

    expect(selectedPrevious).toBe(true);
    expect(ids(tree.selectedPath)).toEqual(["a", "b2"]);
    expect(selectedNext).toBe(true);
    expect(tree.selectSibling("b", -1)).toBe(false);
    expect(tree.selectSibling("b2", 1)).toBe(false);
    expect(tree.selectSibling("missing", 1)).toBe(false);
    expect(tree.selectSibling(ROOT_NODE_ID, 1)).toBe(false);
  });

  it("should select siblings by index and id", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));
    tree.addSibling("b2", item("b3"));

    expect(tree.selectSiblingAt("b", 0)).toBe(true);
    expect(ids(tree.selectedPath)).toEqual(["a", "b"]);
    expect(tree.selectSiblingAt("b", 2)).toBe(true);
    expect(ids(tree.selectedPath)).toEqual(["a", "b3"]);
    expect(tree.selectSiblingAt("b", -1)).toBe(false);
    expect(tree.selectSiblingAt("b", 3)).toBe(false);
    expect(tree.selectSiblingAt("missing", 0)).toBe(false);
    expect(tree.selectSiblingAt(ROOT_NODE_ID, 0)).toBe(false);
    expect(tree.selectSiblingById("b2")).toBe(true);
    expect(ids(tree.selectedPath)).toEqual(["a", "b2"]);
    expect(tree.selectSiblingById("missing")).toBe(false);
    expect(tree.selectSiblingById(ROOT_NODE_ID)).toBe(false);
  });

  it("should select the path to any existing node", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));
    tree.append(item("c"));

    tree.selectPathTo("b");

    expect(ids(tree.selectedPath)).toEqual(["a", "b"]);
    expect(() => tree.selectPathTo("missing")).toThrow("Node missing not found.");
  });

  it("should update inactive sibling groups without selecting their ancestors", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("a", item("x"));
    tree.append(item("y"));
    tree.appendChild("x", item("z"));
    tree.selectPathTo("b");

    expect(tree.selectSiblingAt("y", 1)).toBe(true);
    expect(ids(tree.selectedPath)).toEqual(["a", "b"]);

    expect(tree.selectSiblingById("x")).toBe(true);
    expect(ids(tree.selectedPath)).toEqual(["x", "z"]);
  });

  it("should delete a node and its subtree", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));
    tree.selectPathTo("b");
    tree.append(item("c"));

    const deleted = tree.deleteNode("b");
    const state = tree.getState();

    expect(deleted).toBe(true);
    expect(ids(tree.selectedPath)).toEqual(["a", "b2"]);
    expect(state.nodes.b).toBeUndefined();
    expect(state.nodes.c).toBeUndefined();
    expect(tree.deleteNode("missing")).toBe(false);
    expect(tree.deleteNode(ROOT_NODE_ID)).toBe(false);
  });

  it("should keep the current child selected when deleting a later sibling", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));
    tree.selectPathTo("b");

    const deleted = tree.deleteNode("b2");

    expect(deleted).toBe(true);
    expect(ids(tree.selectedPath)).toEqual(["a", "b"]);
  });

  it("should preserve selection when deleting an earlier sibling", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));
    tree.addSibling("b2", item("b3"));

    expect(tree.deleteNode("b")).toBe(true);

    expect(ids(tree.selectedPath)).toEqual(["a", "b3"]);
    expect(tree.getState().nodes.a?.childrenIds).toEqual(["b2", "b3"]);
  });

  it("should select the previous sibling when deleting the selected last sibling", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));
    tree.addSibling("b2", item("b3"));

    expect(tree.deleteNode("b3")).toBe(true);

    expect(ids(tree.selectedPath)).toEqual(["a", "b2"]);
    expect(tree.getSiblingPosition("b2")).toEqual({ current: 2, total: 2 });
  });

  it("should delete all siblings", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));
    tree.addSibling("b2", item("b3"));

    const deleted = tree.deleteSiblings("b2");

    expect(deleted).toBe(true);
    expect(ids(tree.selectedPath)).toEqual(["a"]);
    expect(tree.getState().nodes.a?.childrenIds).toEqual([]);
    expect(tree.deleteSiblings(ROOT_NODE_ID)).toBe(false);
  });

  it("should delete all siblings except the target node", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));
    tree.addSibling("b2", item("b3"));

    const deleted = tree.deleteSiblings("b2", { keepTarget: true });
    const deletedAgain = tree.deleteSiblings("b2", { keepTarget: true });

    expect(deleted).toBe(true);
    expect(deletedAgain).toBe(false);
    expect(ids(tree.selectedPath)).toEqual(["a", "b2"]);
    expect(tree.getState().nodes.a?.childrenIds).toEqual(["b2"]);
    expect(tree.deleteSiblings("missing", { keepTarget: true })).toBe(false);
  });

  it("should delete branches and descendants", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.append(item("c"));
    tree.selectPathTo("b");
    tree.addSibling("b", item("b2"));

    expect(tree.deleteBranch("b2")).toBe(true);
    expect(tree.deleteBranch("missing")).toBe(false);
    expect(ids(tree.selectedPath)).toEqual(["a", "b", "c"]);

    expect(tree.deleteDescendants("b")).toBe(true);
    expect(tree.getState().nodes.c).toBeUndefined();
    expect(ids(tree.selectedPath)).toEqual(["a", "b"]);
    expect(tree.deleteDescendants("b")).toBe(false);
    expect(tree.deleteDescendants("missing")).toBe(false);
  });

  it("should truncate the selected path after a node", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.append(item("c"));
    tree.addSibling("c", item("c2"));

    expect(tree.truncateAfter("b")).toBe(true);
    expect(ids(tree.selectedPath)).toEqual(["a", "b"]);
    expect(tree.getState().nodes.c).toBeUndefined();
    expect(tree.getState().nodes.c2).toBeUndefined();
    expect(tree.truncateAfter("missing")).toBe(false);
    expect(tree.truncateAfter("b")).toBe(false);
  });

  it("should support root-level path selection and pruning", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));

    tree.selectPathTo(ROOT_NODE_ID);

    expect(ids(tree.selectedPath)).toEqual(["a", "b"]);
    expect(tree.deleteDescendants(ROOT_NODE_ID)).toBe(true);
    expect(tree.getState()).toEqual({
      rootId: ROOT_NODE_ID,
      nodes: {
        [ROOT_NODE_ID]: rootNode(),
      },
    });
    expect(tree.truncateAfter(ROOT_NODE_ID)).toBe(false);
  });

  it("should load state and clamp selected child indexes", () => {
    const state: BranchingTreeState<Item> = {
      rootId: ROOT_NODE_ID,
      nodes: {
        [ROOT_NODE_ID]: rootNode(["a", "d"], -10),
        a: treeNode("a", ROOT_NODE_ID, ["b", "c"], 99),
        b: treeNode("b", "a"),
        c: treeNode("c", "a"),
        d: treeNode("d", ROOT_NODE_ID),
      },
    };

    const tree = new BranchingTree(state);

    expect(ids(tree.selectedPath)).toEqual(["a", "c"]);
    expect(tree.getSiblingEntries("a").map((entry) => entry.selected)).toEqual([true, false]);
    expect(tree.getSiblingEntries("c").map((entry) => entry.selected)).toEqual([false, true]);
    expect(tree.selectedPathEntries[1]).toMatchObject({
      nodeId: "c",
      siblingIndex: 1,
      siblingCount: 2,
    });
  });

  it("should clone loaded state and leave current state unchanged after a failed load", () => {
    const state: BranchingTreeState<Item> = {
      rootId: ROOT_NODE_ID,
      nodes: {
        [ROOT_NODE_ID]: rootNode(["a"]),
        a: treeNode("a", ROOT_NODE_ID),
      },
    };
    const tree = new BranchingTree(state);

    state.nodes[ROOT_NODE_ID]?.childrenIds.push("external");

    expect(tree.getState().nodes[ROOT_NODE_ID]?.childrenIds).toEqual(["a"]);
    expect(() =>
      tree.loadState({
        rootId: ROOT_NODE_ID,
        nodes: {
          [ROOT_NODE_ID]: rootNode(["missing"]),
        },
      } as BranchingTreeState<Item>),
    ).toThrow("Node branching-tree-root has missing child missing.");
    expect(ids(tree.selectedPath)).toEqual(["a"]);
  });

  it("should insert a missing default root when loading an empty default-root state", () => {
    const tree = new BranchingTree<Item>({
      rootId: ROOT_NODE_ID,
      nodes: {},
    });

    expect(tree.getState()).toEqual({
      rootId: ROOT_NODE_ID,
      nodes: {
        [ROOT_NODE_ID]: rootNode(),
      },
    });
  });

  it("should use the default root id when loaded state has an empty root id", () => {
    const tree = new BranchingTree<Item>({
      rootId: "",
      nodes: {
        [ROOT_NODE_ID]: rootNode(),
      },
    });

    expect(tree.rootNodeId).toBe(ROOT_NODE_ID);
    expect(tree.selectedPath).toEqual([]);
  });

  it("should expose selected path metadata for a valued root state", () => {
    const tree = new BranchingTree<Item>({
      rootId: ROOT_NODE_ID,
      nodes: {
        [ROOT_NODE_ID]: { ...rootNode(), value: item(ROOT_NODE_ID) },
      },
    });

    expect(ids(tree.selectedPath)).toEqual([ROOT_NODE_ID]);
    expect(tree.selectedPathEntries).toEqual([
      {
        value: item(ROOT_NODE_ID),
        nodeId: ROOT_NODE_ID,
        parentId: null,
        siblingIndex: 0,
        siblingCount: 1,
        hasPreviousSibling: false,
        hasNextSibling: false,
      },
    ]);
    expect(tree.getPathEntriesTo(ROOT_NODE_ID)).toEqual(tree.selectedPathEntries);
    expect(tree.getSelectedPathNeighborhood()).toEqual({
      nodes: [
        {
          value: item(ROOT_NODE_ID),
          nodeId: ROOT_NODE_ID,
          parentId: null,
          siblingIndex: 0,
          siblingCount: 1,
          hasPreviousSibling: false,
          hasNextSibling: false,
          selected: true,
          depth: 0,
          childCount: 0,
          hiddenChildCount: 0,
        },
      ],
      edges: [],
    });
  });

  it("should reset to a custom root id", () => {
    const tree = new BranchingTree<Item>();

    tree.append(item("a"));
    tree.reset("custom-root");

    expect(tree.rootNodeId).toBe("custom-root");
    expect(tree.selectedPath).toEqual([]);
    expect(tree.getState().nodes["custom-root"]).toEqual({
      id: "custom-root",
      parentId: null,
      childrenIds: [],
      selectedChildIndex: 0,
    });
  });

  it("should return cloned state arrays", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));

    const state = tree.getState();
    state.nodes[ROOT_NODE_ID]?.childrenIds.push("external");

    expect(tree.getState().nodes[ROOT_NODE_ID]?.childrenIds).toEqual(["a"]);
  });

  it("should create a linear state from the selected path without changing ids", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));
    tree.addSibling("b", item("b2"));
    tree.append(item("c"));
    tree.appendChild("b", item("inactive"));

    tree.selectPathTo("c");
    const state = tree.getSelectedPathState();
    const linearTree = new BranchingTree(state);

    expect(Object.keys(state.nodes).sort()).toEqual([ROOT_NODE_ID, "a", "b2", "c"].sort());
    expect(state.nodes[ROOT_NODE_ID]?.childrenIds).toEqual(["a"]);
    expect(state.nodes.a?.childrenIds).toEqual(["b2"]);
    expect(state.nodes.b2?.childrenIds).toEqual(["c"]);
    expect(state.nodes.c?.childrenIds).toEqual([]);
    expect(ids(linearTree.selectedPath)).toEqual(["a", "b2", "c"]);
  });

  it("should create an empty selected path state for an empty tree", () => {
    const tree = new BranchingTree<Item>();

    expect(tree.getSelectedPathState()).toEqual({
      rootId: ROOT_NODE_ID,
      nodes: {
        [ROOT_NODE_ID]: rootNode(),
      },
    });
  });

  it("should report tree statistics including unreachable nodes", () => {
    const state: BranchingTreeState<Item> = {
      rootId: ROOT_NODE_ID,
      nodes: {
        [ROOT_NODE_ID]: rootNode(["a", "b"], 1),
        a: treeNode("a", ROOT_NODE_ID),
        b: treeNode("b", ROOT_NODE_ID),
        x: treeNode("x", "y", ["y"]),
        y: treeNode("y", "x", ["x"]),
      },
    };
    const tree = new BranchingTree(state);

    expect(tree.getStats()).toEqual({
      totalNodes: 5,
      selectedPathLength: 1,
      orphanedNodes: 2,
      maxDepth: 1,
      leafCount: 2,
      branchPoints: 1,
    });
  });

  it("should report empty tree statistics", () => {
    const tree = new BranchingTree<Item>();

    expect(tree.getStats()).toEqual({
      totalNodes: 1,
      selectedPathLength: 0,
      orphanedNodes: 0,
      maxDepth: 0,
      leafCount: 1,
      branchPoints: 0,
    });
  });

  it("should report linear tree statistics without branch points", () => {
    const tree = new BranchingTree<Item>();
    tree.append(item("a"));
    tree.append(item("b"));

    expect(tree.getStats()).toEqual({
      totalNodes: 3,
      selectedPathLength: 2,
      orphanedNodes: 0,
      maxDepth: 2,
      leafCount: 1,
      branchPoints: 0,
    });
  });

  it.each([
    {
      name: "missing root",
      state: {
        rootId: "custom-root",
        nodes: {},
      } as BranchingTreeState<Item>,
      error: "Root node custom-root missing from state.",
    },
    {
      name: "root with parent",
      state: {
        rootId: ROOT_NODE_ID,
        nodes: {
          [ROOT_NODE_ID]: { ...rootNode(), parentId: "a" },
        },
      } as BranchingTreeState<Item>,
      error: "Root node branching-tree-root cannot have a parent.",
    },
    {
      name: "key mismatch",
      state: {
        rootId: ROOT_NODE_ID,
        nodes: {
          [ROOT_NODE_ID]: rootNode(),
          a: treeNode("b", ROOT_NODE_ID),
        },
      },
      error: "Node key a does not match node id b.",
    },
    {
      name: "missing value",
      state: {
        rootId: ROOT_NODE_ID,
        nodes: {
          [ROOT_NODE_ID]: rootNode(),
          a: {
            id: "a",
            parentId: ROOT_NODE_ID,
            childrenIds: [],
            selectedChildIndex: 0,
          },
        },
      } as BranchingTreeState<Item>,
      error: "Node a is missing its value.",
    },
    {
      name: "missing parent id",
      state: {
        rootId: ROOT_NODE_ID,
        nodes: {
          [ROOT_NODE_ID]: rootNode(),
          a: { ...treeNode("a", ROOT_NODE_ID), parentId: null },
        },
      } as BranchingTreeState<Item>,
      error: "Node a is missing its parent.",
    },
    {
      name: "missing parent node",
      state: {
        rootId: ROOT_NODE_ID,
        nodes: {
          [ROOT_NODE_ID]: rootNode(),
          a: treeNode("a", "missing"),
        },
      },
      error: "Node a has missing parent missing.",
    },
    {
      name: "parent missing child reference",
      state: {
        rootId: ROOT_NODE_ID,
        nodes: {
          [ROOT_NODE_ID]: rootNode(),
          a: treeNode("a", ROOT_NODE_ID),
        },
      },
      error: "Parent branching-tree-root does not include child a.",
    },
    {
      name: "duplicate child ids",
      state: {
        rootId: ROOT_NODE_ID,
        nodes: {
          [ROOT_NODE_ID]: rootNode(["a", "a"]),
          a: treeNode("a", ROOT_NODE_ID),
        },
      },
      error: "Node branching-tree-root has duplicate children.",
    },
    {
      name: "missing child node",
      state: {
        rootId: ROOT_NODE_ID,
        nodes: {
          [ROOT_NODE_ID]: rootNode(["a"]),
        },
      } as BranchingTreeState<Item>,
      error: "Node branching-tree-root has missing child a.",
    },
    {
      name: "child parent mismatch",
      state: {
        rootId: ROOT_NODE_ID,
        nodes: {
          [ROOT_NODE_ID]: rootNode(["a"]),
          a: treeNode("a", "b"),
          b: treeNode("b", ROOT_NODE_ID),
        },
      },
      error: "Child a does not point back to parent branching-tree-root.",
    },
  ])("should reject invalid state with $name", ({ state, error }) => {
    expect(() => new BranchingTree(state)).toThrow(error);
  });

  it("should create prefixed node ids", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    expect(BranchingTree.createNodeId("branch")).toBe("branch-i");
    expect(BranchingTree.createNodeId()).toBe("node-i");
  });

  it("should create stable edge ids", () => {
    expect(BranchingTree.createEdgeId("parent", "child")).toBe("parent->child");
  });

  it("should create an empty linear state", () => {
    expect(BranchingTree.createLinearState([], { rootId: "root" })).toEqual({
      rootId: "root",
      nodes: {
        root: {
          id: "root",
          parentId: null,
          childrenIds: [],
          selectedChildIndex: 0,
        },
      },
    });
  });

  it("should create linear state with generated ids", () => {
    const state = BranchingTree.createLinearState([item("old-a"), item("old-b")], {
      idFactory: (() => {
        const generatedIds = ["a", "b"];
        return () => generatedIds.shift() ?? "unused";
      })(),
      rootId: "root",
    });

    expect(state).toEqual({
      rootId: "root",
      nodes: {
        root: {
          id: "root",
          parentId: null,
          childrenIds: ["a"],
          selectedChildIndex: 0,
        },
        a: {
          id: "a",
          value: { id: "a", text: "OLD-A" },
          parentId: "root",
          childrenIds: ["b"],
          selectedChildIndex: 0,
        },
        b: {
          id: "b",
          value: { id: "b", text: "OLD-B" },
          parentId: "a",
          childrenIds: [],
          selectedChildIndex: 0,
        },
      },
    });
  });

  it("should select every imported value from a generated linear state", () => {
    const state = BranchingTree.createLinearState(
      [item("old-a"), item("old-b"), item("old-c"), item("old-d")],
      {
        idFactory: (() => {
          const generatedIds = ["a", "b", "c", "d"];
          return () => generatedIds.shift() ?? "unused";
        })(),
        rootId: "root",
      },
    );
    const tree = new BranchingTree(state);

    expect(ids(tree.selectedPath)).toEqual(["a", "b", "c", "d"]);
    expect(tree.selectedPathEntries.map((entry) => entry.nodeId)).toEqual(["a", "b", "c", "d"]);
    expect(tree.head?.id).toBe("d");
  });

  it("should create linear state with the default id factory", () => {
    const createNodeId = vi.spyOn(BranchingTree, "createNodeId");
    createNodeId.mockReturnValueOnce("generated");

    const state = BranchingTree.createLinearState([item("old")]);

    expect(createNodeId).toHaveBeenCalledWith(undefined);
    expect(state.nodes.generated?.value).toEqual({ id: "generated", text: "OLD" });
  });

  it("should create linear state with an id prefix", () => {
    const createNodeId = vi.spyOn(BranchingTree, "createNodeId");
    createNodeId.mockReturnValueOnce("message-1");

    const state = BranchingTree.createLinearState([item("old")], { idPrefix: "message" });

    expect(createNodeId).toHaveBeenCalledWith("message");
    expect(state.nodes["message-1"]?.value).toEqual({ id: "message-1", text: "OLD" });
  });

  it("should reject duplicate generated ids for linear state", () => {
    expect(() =>
      BranchingTree.createLinearState([item("old-a"), item("old-b")], {
        idFactory: () => "duplicate",
      }),
    ).toThrow("Generated node id duplicate already exists.");
  });

  it("should reject linear state ids that collide with the root id", () => {
    expect(() =>
      BranchingTree.createLinearState([item("old")], {
        idFactory: () => "root",
        rootId: "root",
      }),
    ).toThrow("Generated node id root already exists.");
  });

  it("should clone state with new ids", () => {
    const source = BranchingTree.createLinearState([item("old-a"), item("old-b")], {
      idFactory: (() => {
        const generatedIds = ["a", "b"];
        return () => generatedIds.shift() ?? "unused";
      })(),
    });

    const cloned = BranchingTree.cloneStateWithNewIds(source, {
      idFactory: (() => {
        const generatedIds = ["x", "y"];
        return () => generatedIds.shift() ?? "unused";
      })(),
      rootId: "new-root",
    });

    expect(cloned).toEqual({
      rootId: "new-root",
      nodes: {
        "new-root": {
          id: "new-root",
          parentId: null,
          childrenIds: ["x"],
          selectedChildIndex: 0,
        },
        x: {
          id: "x",
          value: { id: "x", text: "OLD-A" },
          parentId: "new-root",
          childrenIds: ["y"],
          selectedChildIndex: 0,
        },
        y: {
          id: "y",
          value: { id: "y", text: "OLD-B" },
          parentId: "x",
          childrenIds: [],
          selectedChildIndex: 0,
        },
      },
    });
  });

  it("should clone state with the default id factory", () => {
    const createNodeId = vi.spyOn(BranchingTree, "createNodeId");
    createNodeId.mockReturnValueOnce("generated");
    const source = BranchingTree.createLinearState([item("old")], {
      idFactory: () => "source",
    });

    const cloned = BranchingTree.cloneStateWithNewIds(source);

    expect(createNodeId).toHaveBeenCalledWith(undefined);
    expect(cloned.rootId).toBe(ROOT_NODE_ID);
    expect(cloned.nodes.generated?.value).toEqual({ id: "generated", text: "OLD" });
  });

  it("should clone state with an id prefix", () => {
    const createNodeId = vi.spyOn(BranchingTree, "createNodeId");
    createNodeId.mockReturnValueOnce("copy-1");
    const source = BranchingTree.createLinearState([item("old")], {
      idFactory: () => "source",
    });

    const cloned = BranchingTree.cloneStateWithNewIds(source, { idPrefix: "copy" });

    expect(createNodeId).toHaveBeenCalledWith("copy");
    expect(cloned.nodes["copy-1"]?.value).toEqual({ id: "copy-1", text: "OLD" });
  });

  it("should reject duplicate generated ids when cloning state", () => {
    const source = BranchingTree.createLinearState([item("old-a"), item("old-b")], {
      idFactory: (() => {
        const generatedIds = ["a", "b"];
        return () => generatedIds.shift() ?? "unused";
      })(),
    });

    expect(() =>
      BranchingTree.cloneStateWithNewIds(source, { idFactory: () => "duplicate" }),
    ).toThrow("Generated node id duplicate already exists.");
  });

  it("should reject cloned ids that collide with the cloned root id", () => {
    const source = BranchingTree.createLinearState([item("old")], {
      idFactory: () => "source",
    });

    expect(() =>
      BranchingTree.cloneStateWithNewIds(source, {
        idFactory: () => "root",
        rootId: "root",
      }),
    ).toThrow("Generated node id root already exists.");
  });

  it.each([
    {
      name: "missing parent id",
      state: {
        rootId: ROOT_NODE_ID,
        nodes: {
          [ROOT_NODE_ID]: rootNode(),
          a: treeNode("a", "missing"),
        },
      },
      error: "Missing cloned id for node missing.",
    },
    {
      name: "missing child id",
      state: {
        rootId: ROOT_NODE_ID,
        nodes: {
          [ROOT_NODE_ID]: rootNode(["missing"]),
        },
      } as BranchingTreeState<Item>,
      error: "Missing cloned id for node missing.",
    },
  ])("should reject cloning state with $name", ({ state, error }) => {
    expect(() => BranchingTree.cloneStateWithNewIds(state)).toThrow(error);
  });
});

describe("demo sample data", () => {
  it.each([2, 3, 128, 256, 512])(
    "should start with a user message and only end paths on assistant messages for %i nodes",
    (nodeCount) => {
      const state = createDemoState(nodeCount);
      const root = state.nodes[state.rootId];

      expect(root?.childrenIds).toHaveLength(1);

      const firstMessage = state.nodes[root?.childrenIds[0] ?? ""];
      expect(firstMessage?.value?.role).toBe("user");

      const messages = Object.values(state.nodes).filter((node) => node.value !== undefined);
      const leaves = messages.filter((node) => node.childrenIds.length === 0);
      const userMessages = messages.filter((node) => node.value?.role === "user");

      expect(messages).toHaveLength(nodeCount);
      expect(leaves.length).toBeGreaterThan(0);
      expect(leaves.every((node) => node.value?.role === "assistant")).toBe(true);
      expect(userMessages.every((node) => node.childrenIds.length > 0)).toBe(true);
    },
  );
});
