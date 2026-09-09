import { describe, expect, it } from "vitest";
import { createDemoState } from "./messages";

describe("demo sample data", () => {
  it.each([
    { target: 2, nodeCount: 2 },
    { target: 3, nodeCount: 3 },
    { target: 128, nodeCount: 128 },
    { target: 256, nodeCount: 256 },
    { target: 512, nodeCount: 512 },
    // The seeded generator exhausts its queue before reaching this larger target.
    { target: 4096, nodeCount: 3020 },
  ])(
    "should start with a user message and only end paths on assistant messages for target $target",
    ({ target, nodeCount }) => {
      const state = createDemoState(target);
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
