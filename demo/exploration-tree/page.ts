import { html, type ArrowTemplate } from "@arrow-js/core";
import type { DemoCleanup, DemoMountRoots } from "../shared/page";
import { explorationActions } from "./actions";
import { startExplorationDemo } from "./controller";
import explorationStore from "./store";

export function mountDemo({ pageRoot, toolbarRoot }: DemoMountRoots): DemoCleanup {
  pageRoot.classList.add("is-exploration-demo");
  ExplorationToolbar()(toolbarRoot);
  ExplorationPage()(pageRoot);
  const cleanup = startExplorationDemo();
  return () => {
    cleanup();
    pageRoot.classList.remove("is-exploration-demo");
  };
}

function ExplorationToolbar(): ArrowTemplate {
  return html`
    <button
      type="button"
      class="icon-button"
      title="Fit map"
      aria-label="Fit map"
      @click="${explorationActions.fitMap}"
    >
      ⌖
    </button>
    <button
      type="button"
      class="icon-button"
      title="Zoom out"
      aria-label="Zoom out"
      @click="${explorationActions.zoomOut}"
    >
      −
    </button>
    <button
      type="button"
      class="icon-button"
      title="Zoom in"
      aria-label="Zoom in"
      @click="${explorationActions.zoomIn}"
    >
      +
    </button>
  `;
}

function ExplorationPage(): ArrowTemplate {
  return html`
    <section class="metrics" aria-label="Exploration metrics">
      ${Metric("nodes", () => explorationStore.nodeCount)}
      ${Metric("links", () => explorationStore.edgeCount)}
      ${Metric("active", () => explorationStore.pathCount)}
      ${Metric("working", () => explorationStore.openCount)}
      ${Metric("action", () => explorationStore.actionTime)}
    </section>

    <section class="workspace">
      <section class="map-panel" id="map-panel" aria-label="Exploration tree map">
        <svg id="tree-map" role="tree" aria-label="Exploration tree map"></svg>
        <div class="minimap" id="minimap">
          <div class="minimap-header">
            <span class="minimap-title">Minimap</span>
            <span class="minimap-count" id="minimap-count"></span>
            <button
              type="button"
              class="minimap-toggle"
              id="minimap-toggle"
              title="Collapse minimap"
              aria-label="Collapse minimap"
              aria-expanded="true"
            ></button>
          </div>
          <svg id="minimap-svg" aria-label="Whole exploration tree overview"></svg>
        </div>
      </section>

      <aside class="inspector" aria-label="Exploration details">
        <section class="inspect-section">
          <h2>${() => explorationStore.nodeTitle}</h2>
          <dl class="message-meta">
            <div>
              <dt>Kind</dt>
              <dd>${() => explorationStore.nodeKind}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>${() => explorationStore.nodeStatus}</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>${() => explorationStore.nodeScore}</dd>
            </div>
          </dl>
          <p class="message-content">${() => explorationStore.nodeContent}</p>
        </section>

        <section class="inspect-section">
          <h2>Actions</h2>
          <div class="action-grid" aria-label="Exploration actions">
            <button
              type="button"
              class="action-button"
              disabled="${() => !explorationStore.canCreateVersion}"
              @click="${explorationActions.createVersion}"
            >
              New version
            </button>
            <button
              type="button"
              class="action-button"
              disabled="${() => !explorationStore.canToggleResponse}"
              @click="${explorationActions.toggleResponse}"
            >
              ${() => (explorationStore.responseExpanded ? "Collapse response" : "Expand response")}
            </button>
            <button
              type="button"
              class="action-button is-danger"
              disabled="${() => !explorationStore.canDelete}"
              @click="${explorationActions.deleteNode}"
            >
              Delete
            </button>
            <button type="button" class="action-button" @click="${explorationActions.resetExploration}">
              Reset
            </button>
          </div>
        </section>
      </aside>
    </section>
  `;
}

function Metric(label: string, value: () => string): ArrowTemplate {
  return html`
    <div class="metric">
      <strong>${value}</strong>
      <span>${label}</span>
    </div>
  `;
}
