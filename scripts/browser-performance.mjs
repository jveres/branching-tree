// Import this module through Vite's /@fs/ URL in the demo browser (see audit.md).
export async function measureSizeButton() {
  const button = [...document.querySelectorAll("button")].find((el) => el.textContent === "512");
  const samples = [];
  for (let index = 0; index < 25; index++) {
    await new Promise(requestAnimationFrame);
    const start = performance.now();
    button.click();
    const elapsed = performance.now() - start;
    if (index >= 5) samples.push(elapsed);
  }
  samples.sort((a, b) => a - b);
  return { medianMs: (samples[9] + samples[10]) / 2, samples };
}

export async function measureInspector(store) {
  const original = store.siblings();
  const rows = Array.from({ length: 512 }, (_, index) => ({
    nodeId: `bench-${index}`,
    selected: index === 0,
    index: String(index + 1),
    label: `bench-${index} v${index + 1}/512`,
    role: "assistant",
  }));
  const host = document.querySelector(".sibling-list");
  const observer = new MutationObserver(() => {});
  try {
    store.siblings(rows);
    observer.observe(host, { childList: true, subtree: true });
    const samples = [];
    for (let index = 0; index < 25; index++) {
      await new Promise(requestAnimationFrame);
      const start = performance.now();
      store.siblings(
        rows.map((row) => ({
          ...row,
          label: row.label.replace(/\/\d+$/, `/${512 + (index % 2)}`),
        })),
      );
      const ms = performance.now() - start;
      const records = observer.takeRecords();
      if (index >= 5)
        samples.push({
          ms,
          added: records.reduce((count, record) => count + record.addedNodes.length, 0),
          removed: records.reduce((count, record) => count + record.removedNodes.length, 0),
        });
    }
    samples.sort((a, b) => a.ms - b.ms);
    return { medianMs: (samples[9].ms + samples[10].ms) / 2, samples };
  } finally {
    observer.disconnect();
    store.siblings(original);
  }
}

export function verifyInspector(store, actions) {
  const originalSiblings = store.siblings();
  const originalPath = store.pathEntries();
  const originalSelect = actions.selectSiblingVersion;
  const originalSelectNode = actions.selectNode;
  const check = (value, message) => {
    if (!value) throw new Error(message);
  };
  try {
    const row = { nodeId: "audit-a", selected: false, index: "1", label: "First", role: "user" };
    store.siblings([row]);
    const host = document.querySelector(".sibling-list");
    const button = host.querySelector("button");
    button.focus();
    store.siblings([{ ...row, selected: true, index: "2", label: "Revised", role: "assistant" }]);
    check(host.querySelector("button") === button, "Sibling button was replaced");
    check(document.activeElement === button, "Sibling focus was lost");
    check(button.classList.contains("is-selected"), "Selection class did not update");
    check(button.textContent === "2Revisedassistant", "Sibling fields did not update");
    let clicked;
    actions.selectSiblingVersion = (id) => {
      clicked = id;
    };
    button.click();
    check(clicked === row.nodeId, "Updated sibling handler selected the wrong ID");
    store.siblings([{ ...row, nodeId: "audit-b" }, row]);
    check(host.querySelectorAll("button")[1] === button, "Reorder lost sibling identity");
    check(!button.classList.contains("is-selected"), "Selection class was not removed");
    store.siblings([]);
    check(host.textContent.trim() === "No versions", "Empty state did not render");
    store.siblings([row]);
    check(host.querySelectorAll("button").length === 1, "Rows did not recover from empty state");

    store.pathEntries([{ nodeId: "audit-a", head: false, label: "Before" }]);
    const path = document.querySelector(".path-list");
    const pathButton = path.querySelector("button");
    pathButton.focus();
    store.pathEntries([{ nodeId: "audit-a", head: true, label: "After" }]);
    check(path.querySelector("button") === pathButton, "Path button was replaced");
    check(document.activeElement === pathButton, "Path focus was lost");
    check(
      pathButton.classList.contains("is-head") && pathButton.textContent === "After",
      "Path fields did not update",
    );
    actions.selectNode = (id) => {
      clicked = id;
    };
    pathButton.click();
    check(clicked === "audit-a", "Updated path handler selected the wrong ID");
    store.pathEntries([{ nodeId: "audit-a", head: false, label: "Again" }]);
    check(!pathButton.classList.contains("is-head"), "Head class was not removed");
    return "Passed: fields, classes, identity, focus, handlers, reorder, removal, empty state";
  } finally {
    actions.selectSiblingVersion = originalSelect;
    actions.selectNode = originalSelectNode;
    store.siblings(originalSiblings);
    store.pathEntries(originalPath);
  }
}
