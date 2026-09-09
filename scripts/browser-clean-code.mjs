// Run in the demo browser with its modules supplied (see clean-code-audit.md).
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function verifyPointerCancellation() {
  const panel = document.querySelector("#map-panel");
  const node = document.querySelector(".tree-node");
  const title = () => document.querySelector(".inspector h2").textContent;
  const before = title();
  // Synthetic pointer events cannot acquire OS pointer capture.
  const originalCapture = panel.setPointerCapture;
  panel.setPointerCapture = () => {};
  try {
    node.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 42, button: 0 }),
    );
    panel.dispatchEvent(
      new PointerEvent("pointercancel", { bubbles: true, pointerId: 42, button: 0 }),
    );
    check(title() === before, "Cancelling a pointer gesture changed selection");
    check(!document.body.classList.contains("is-map-dragging"), "Cancelled drag remained active");
    node.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 43, button: 0 }),
    );
    panel.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 43, button: 0 }));
    check(title() !== before, "Completed click did not select its node");
    return "Passed: pointer cancellation preserves selection; pointerup still selects";
  } finally {
    panel.setPointerCapture = originalCapture;
  }
}

export async function verifyLifecycle({
  mountDemo,
  startDemo,
  startDemoShell,
  store,
  actions,
  replaceChildren,
}) {
  startDemo()();
  replaceChildren(document.body);
  const toolbarRoot = document.createElement("div");
  const pageRoot = document.createElement("div");
  document.body.append(toolbarRoot, pageRoot);

  const stop = mountDemo({ pageRoot, toolbarRoot });
  const label = pageRoot.querySelector(".message-content");
  const before = label.textContent;
  window.dispatchEvent(new Event("resize"));
  stop();
  stop();
  store.messageContent("updated-after-unmount");
  check(label.textContent === before, "Disposed content still responds to state");
  check(!label.isConnected, "Disposed content remains mounted");
  check(
    pageRoot.childElementCount === 0 && toolbarRoot.childElementCount === 0,
    "Mount roots were not cleared",
  );
  await new Promise(requestAnimationFrame);

  const stopNext = mountDemo({ pageRoot, toolbarRoot });
  stop();
  actions.addChild();
  check(
    pageRoot.querySelector(".metric strong").textContent === "129",
    "Stale cleanup stopped the remounted controller",
  );
  stopNext();

  pageRoot.innerHTML = '<svg id="tree-map"></svg><section id="map-panel"></section>';
  let failed = false;
  try {
    startDemo();
  } catch (error) {
    failed = error instanceof Error && error.message.includes("#minimap");
  }
  check(failed, "Incomplete scaffolding did not fail initialization");
  replaceChildren(pageRoot);
  const stopRecovered = mountDemo({ pageRoot, toolbarRoot });
  actions.addChild();
  check(
    pageRoot.querySelector(".metric strong").textContent === "129",
    "Controller failed to recover after initialization error",
  );
  stopRecovered();

  const stopPending = startDemoShell(pageRoot);
  stopPending();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(pageRoot.childElementCount === 0, "Cancelled shell mounted after its import resolved");
  const originalLookup = document.getElementById;
  let stopFailed;
  try {
    document.getElementById = function (id) {
      return id === "minimap-svg" ? null : originalLookup.call(this, id);
    };
    stopFailed = startDemoShell(pageRoot);
    const deadline = performance.now() + 3000;
    while (
      pageRoot.querySelector(".demo-summary").textContent === "Loading demo" &&
      performance.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    check(
      pageRoot.querySelector(".demo-summary").textContent ===
        "Unable to load demo. Reload to try again.",
      "Failed initialization did not show a recoverable error",
    );
  } finally {
    document.getElementById = originalLookup;
    stopFailed?.();
  }
  return "Passed: DOM disposal, idempotence, remount, pending resize, initialization recovery, async cancellation, visible load errors";
}

export async function runCleanCodeAudit() {
  // Use Vite's resolved URLs so HMR and dependency versions share one module instance.
  const source = await (await fetch("/version-history/page.tsx")).text();
  const resolvedUrl = (name) => source.match(new RegExp(`from "([^"\\n]*${name}[^"\\n]*)"`))[1];
  const { mountDemo } = await import("/version-history/page.tsx");
  const { startDemo } = await import(resolvedUrl("controller.ts"));
  const { replaceChildren } = await import(resolvedUrl("loom_dom.js"));
  const { startDemoShell } = await import("/shell.tsx");
  const { default: store } = await import("/version-history/store.ts");
  const { demoActions: actions } = await import("/version-history/actions.ts");
  return {
    pointer: verifyPointerCancellation(),
    lifecycle: await verifyLifecycle({
      mountDemo,
      startDemo,
      startDemoShell,
      store,
      actions,
      replaceChildren,
    }),
  };
}
