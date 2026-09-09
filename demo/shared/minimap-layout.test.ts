import { describe, expect, it } from "vitest";
import { placeMinimapNodes } from "./minimap-layout";

describe("minimap layout", () => {
  it("should place roots and center branches over their children in traversal order", () => {
    const placement = placeMinimapNodes(
      [
        { nodeId: "a", depth: 0 },
        { nodeId: "b", depth: 1 },
        { nodeId: "c", depth: 1 },
        { nodeId: "d", depth: 2 },
        { nodeId: "e", depth: 2 },
        { nodeId: "other-root", depth: 3 },
      ],
      [
        { parentId: "a", childId: "b" },
        { parentId: "a", childId: "c" },
        { parentId: "c", childId: "d" },
        { parentId: "c", childId: "e" },
      ],
    );
    expect(Object.fromEntries(placement.xById)).toEqual({
      a: 0.75,
      b: 0,
      c: 1.5,
      d: 1,
      e: 2,
      "other-root": 3,
    });
    expect(Object.fromEntries(placement.depthById)).toEqual({
      a: 0,
      b: 1,
      c: 1,
      d: 2,
      e: 2,
      "other-root": 3,
    });
    expect(placement.maxX).toBe(3);
    expect(placement.maxDepth).toBe(3);
  });

  it("should support paths deeper than the JavaScript call stack", () => {
    const nodes = Array.from({ length: 20000 }, (_, depth) => ({ nodeId: `n-${depth}`, depth }));
    const edges = nodes
      .slice(1)
      .map((node, index) => ({ parentId: `n-${index}`, childId: node.nodeId }));

    const placement = placeMinimapNodes(nodes, edges);

    expect(placement.xById.size).toBe(20000);
    expect(placement.xById.get("n-0")).toBe(0);
    expect(placement.xById.get("n-19999")).toBe(0);
    expect(placement.depthById.get("n-19999")).toBe(19999);
    expect(placement.maxDepth).toBe(19999);
    expect(placement.maxX).toBe(0);
  });

  it("should return empty placement for an empty topology", () => {
    expect(placeMinimapNodes([], [])).toEqual({
      xById: new Map(),
      depthById: new Map(),
      maxDepth: 0,
      maxX: 0,
    });
  });
});
