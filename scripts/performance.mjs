import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "vite";

// Run with: node scripts/performance.mjs [output.json]
// Module loading and fixtures are outside timed regions. No coverage instrumentation.
const server = await createServer({
  cacheDir: "node_modules/.vite-performance",
  server: { middlewareMode: true, ws: false },
  appType: "custom",
});
try {
  const { BranchingTree, ROOT_NODE_ID } = await server.ssrLoadModule("/branching-tree.ts");
  const { createDemoState } = await server.ssrLoadModule("/demo/version-history/messages.ts");
  const results = [];
  let sink;
  const measure = (name, operation, iterations = 20) => {
    for (let index = 0; index < 10; index++) sink = operation();
    const samples = [];
    for (let sample = 0; sample < 15; sample++) {
      const start = performance.now();
      for (let index = 0; index < iterations; index++) sink = operation();
      samples.push((performance.now() - start) / iterations);
    }
    samples.sort((a, b) => a - b);
    results.push({ name, medianMs: samples[7], minMs: samples[0], maxMs: samples[14], iterations });
  };
  const fingerprints = {};
  for (const size of [128, 256, 512, 4096]) {
    const state = createDemoState(size);
    fingerprints[size] = createHash("sha256").update(JSON.stringify(state)).digest("hex");
    measure(`generate-${size}`, () => createDemoState(size), size > 512 ? 2 : 20);
    const tree = new BranchingTree(state);
    measure(`load-${size}`, () => new BranchingTree(state));
    measure(`topology-${size}`, () => tree.getFullTopology());
    measure(`neighborhood-${size}`, () => tree.getSelectedPathNeighborhood({ siblingWindow: 1 }));
    measure(`stats-${size}`, () => tree.getStats());
  }
  // A wide branch hidden by a depth limit or sibling window must stay cheap to inspect.
  const wide = new BranchingTree();
  wide.append({ id: "parent" });
  for (let index = 0; index < 10000; index++) {
    wide.appendChild("parent", { id: `child-${index}` });
  }
  wide.selectPathTo("child-5000");
  void wide.selectedPath;
  measure(
    "wide-neighborhood-window-1",
    () => wide.getSelectedPathNeighborhood({ siblingWindow: 1 }),
    100,
  );
  measure(
    "wide-neighborhood-depth-0",
    () => wide.getSelectedPathNeighborhood({ maxDepth: 0 }),
    100,
  );
  const linear = new BranchingTree();
  for (let index = 0; index < 10000; index++) linear.append({ id: `linear-${index}` });
  measure("linear-select-and-read", () => {
    linear.selectPathTo("linear-9999");
    return linear.selectedPathEntries;
  });
  const report = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    samples: 15,
    warmups: 10,
    fingerprints,
    results,
  };
  console.table(results);
  if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify(report, null, 2)}\n`);
  if (!sink || !ROOT_NODE_ID) throw new Error("Benchmark did not run");
} finally {
  await server.close();
}
