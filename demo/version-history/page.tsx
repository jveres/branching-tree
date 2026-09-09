import { each, replaceChildren, when } from "loom/dom";
import type { DemoCleanup, DemoMountRoots } from "../shared/page";
import { demoActions } from "./actions";
import { startDemo } from "./controller";
import demoStore, { type DemoPathView, type DemoSiblingView, type DemoSize } from "./store";

const sizes: DemoSize[] = [128, 256, 512];

export function mountDemo({ pageRoot, toolbarRoot }: DemoMountRoots): DemoCleanup {
  let stopController: DemoCleanup | undefined;
  let stopped = false;
  const cleanup = (): void => {
    if (stopped) return;
    stopped = true;
    stopController?.();
    // DOM-owned Loom bindings outlive reactive scopes; dispose both mounted subtrees.
    replaceChildren(pageRoot);
    replaceChildren(toolbarRoot);
  };

  try {
    toolbarRoot.append(...VersionHistoryToolbar());
    pageRoot.append(...VersionHistoryPage());
    stopController = startDemo();
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}

function VersionHistoryToolbar(): Element[] {
  return [
    // biome-ignore lint/a11y/useSemanticElements: a styled segmented control; <fieldset> would fight the layout CSS
    <div class="segmented" role="group" aria-label="Tree size">
      {sizes.map(SizeButton)}
    </div>,
    <button
      type="button"
      class="icon-button"
      title="Fit map"
      aria-label="Fit map"
      onclick={demoActions.fitMap}
    >
      ⌖
    </button>,
    <button
      type="button"
      class="icon-button"
      title="Zoom out"
      aria-label="Zoom out"
      onclick={demoActions.zoomOut}
    >
      −
    </button>,
    <button
      type="button"
      class="icon-button"
      title="Zoom in"
      aria-label="Zoom in"
      onclick={demoActions.zoomIn}
    >
      +
    </button>,
  ];
}

function VersionHistoryPage(): Element[] {
  return [
    <section class="metrics" aria-label="Tree metrics">
      {Metric("messages", () => demoStore.nodeCount())}
      {Metric("links", () => demoStore.edgeCount())}
      {Metric("active", () => demoStore.pathCount())}
      {Metric("layout", () => demoStore.renderTime())}
      {Metric("action", () => demoStore.selectTime())}
    </section>,
    <section class="workspace">
      <section class="map-panel" id="map-panel" aria-label="Conversation version map">
        {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the map renders an interactive tree of selectable nodes */}
        <svg id="tree-map" role="tree" aria-label="Conversation version map" />
        <div class="minimap" id="minimap">
          <div class="minimap-header">
            <span class="minimap-title">Minimap</span>
            <span class="minimap-count" id="minimap-count" />
            <button
              type="button"
              class="minimap-toggle"
              id="minimap-toggle"
              title="Collapse minimap"
              aria-label="Collapse minimap"
              aria-expanded="true"
            />
          </div>
          <svg id="minimap-svg" aria-label="Whole tree overview" />
        </div>
      </section>

      <aside class="inspector" aria-label="Selection details">
        <section class="inspect-section">
          <h2>{() => demoStore.messageTitle()}</h2>
          <dl class="message-meta">
            <div>
              <dt>Role</dt>
              <dd>{() => demoStore.messageRole()}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{() => demoStore.messageVersion()}</dd>
            </div>
            <div>
              <dt>Tokens</dt>
              <dd>{() => demoStore.messageTokens()}</dd>
            </div>
          </dl>
          <p class="message-content">{() => demoStore.messageContent()}</p>
        </section>

        <section class="inspect-section">
          <h2>Versions</h2>
          <div class="sibling-list">
            {each(() => demoStore.siblings(), SiblingButton, siblingKey, {
              update: updateSiblingButton,
            })}
            {when(
              () => demoStore.siblings().length === 0,
              () => (
                <p class="empty-state">No versions</p>
              ),
            )}
          </div>
        </section>

        <section class="inspect-section">
          <h2>Actions</h2>
          {/* biome-ignore lint/a11y/useSemanticElements: a styled action grid; <fieldset> would fight the layout CSS */}
          <div class="action-grid" role="group" aria-label="Branch actions">
            <button
              type="button"
              class="action-button"
              disabled={() => !demoStore.canPreviousVersion()}
              onclick={demoActions.previousVersion}
            >
              Previous
            </button>
            <button
              type="button"
              class="action-button"
              disabled={() => !demoStore.canNextVersion()}
              onclick={demoActions.nextVersion}
            >
              Next
            </button>
            <button
              type="button"
              class="action-button"
              disabled={() => !demoStore.canAddVersion()}
              onclick={demoActions.addVersion}
            >
              Add version
            </button>
            <button
              type="button"
              class="action-button"
              disabled={() => !demoStore.canAddChild()}
              onclick={demoActions.addChild}
            >
              Add child
            </button>
            <button
              type="button"
              class="action-button"
              disabled={() => !demoStore.canTruncate()}
              onclick={demoActions.truncateAfterSelection}
            >
              Truncate after
            </button>
            <button
              type="button"
              class="action-button"
              disabled={() => !demoStore.canKeepOnlyVersion()}
              onclick={demoActions.keepOnlyVersion}
            >
              Keep only
            </button>
            <button
              type="button"
              class="action-button is-danger"
              disabled={() => !demoStore.canDelete()}
              onclick={demoActions.deleteBranch}
            >
              Delete
            </button>
            <button
              type="button"
              class="action-button is-danger"
              disabled={() => !demoStore.canDeleteVersions()}
              onclick={demoActions.deleteSiblingGroup}
            >
              Delete versions
            </button>
            <button type="button" class="action-button" onclick={demoActions.createLinearPath}>
              Create linear
            </button>
            <button type="button" class="action-button" onclick={demoActions.resetTree}>
              Reset sample
            </button>
          </div>
        </section>

        <section class="inspect-section path-section">
          <h2>Active path</h2>
          <ol class="path-list">
            {each(() => demoStore.pathEntries(), PathEntryButton, pathKey, {
              update: updatePathEntryButton,
            })}
          </ol>
        </section>
      </aside>
    </section>,
  ];
}

function Metric(label: string, value: () => string): HTMLElement {
  return (
    <div class="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SizeButton(size: DemoSize): HTMLElement {
  return (
    <button
      type="button"
      class={{
        "segment-button": true,
        "is-active": () => demoStore.currentSize() === size,
      }}
      onclick={() => demoActions.loadSize(size)}
    >
      {size}
    </button>
  );
}

// Stable IDs retain buttons and focus while Loom updates changed row fields in place.
const siblingKey = (entry: DemoSiblingView): string => entry.nodeId;

function updateSiblingButton(
  node: Element,
  entry: DemoSiblingView,
  previous: DemoSiblingView,
): void {
  if (entry.selected !== previous.selected) node.classList.toggle("is-selected", entry.selected);
  if (entry.index !== previous.index) node.children[0]!.firstChild!.nodeValue = entry.index;
  if (entry.label !== previous.label) node.children[1]!.firstChild!.nodeValue = entry.label;
  if (entry.role !== previous.role) node.children[2]!.firstChild!.nodeValue = entry.role;
}

function SiblingButton(entry: DemoSiblingView): HTMLElement {
  return (
    <button
      type="button"
      class={`version-button${entry.selected ? " is-selected" : ""}`}
      onclick={() => demoActions.selectSiblingVersion(entry.nodeId)}
    >
      <span class="version-index">{entry.index}</span>
      <span class="version-label">{entry.label}</span>
      <span class="version-role">{entry.role}</span>
    </button>
  );
}

const pathKey = (entry: DemoPathView): string => entry.nodeId;

function updatePathEntryButton(node: Element, entry: DemoPathView, previous: DemoPathView): void {
  const button = node.firstElementChild!;
  if (entry.head !== previous.head) button.classList.toggle("is-head", entry.head);
  if (entry.label !== previous.label) button.firstElementChild!.firstChild!.nodeValue = entry.label;
}

function PathEntryButton(entry: DemoPathView): HTMLElement {
  return (
    <li>
      <button
        type="button"
        class={`path-button${entry.head ? " is-head" : ""}`}
        onclick={() => demoActions.selectNode(entry.nodeId)}
      >
        <span class="path-label">{entry.label}</span>
      </button>
    </li>
  );
}
