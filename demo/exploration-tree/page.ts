import { html, type ArrowTemplate } from "@arrow-js/core";
import {
  aiSettingsStore,
  getAiSettingsStatus,
  refreshAiModelList,
  setAiModel,
} from "../shared/ai-settings";
import type { DemoCleanup, DemoMountRoots } from "../shared/page";
import { explorationActions } from "./actions";
import { startExplorationDemo } from "./controller";
import explorationStore from "./store";

export function mountDemo({ pageRoot, toolbarRoot }: DemoMountRoots): DemoCleanup {
  pageRoot.classList.add("is-exploration-demo");
  void refreshAiModelList();
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
          <h2>AI</h2>
          <label class="model-field">
            <span>Model</span>
            <select
              disabled="${() =>
                aiSettingsStore.modelListLoading || aiSettingsStore.modelOptions.length === 0}"
              @change="${handleModelSelect}"
            >
              ${() =>
                aiSettingsStore.modelOptions.map((model) =>
                  html`
                  <option value="${model}" selected="${() => aiSettingsStore.model === model}">
                    ${model}
                  </option>
                `.key(model),
                )}
            </select>
          </label>
          <button
            type="button"
            class="action-button"
            disabled="${() => aiSettingsStore.modelListLoading}"
            @click="${handleRefreshModels}"
          >
            ${() => (aiSettingsStore.modelListLoading ? "Loading models" : "Refresh models")}
          </button>
          <p class="ai-status">
            ${() =>
              explorationStore.aiStatus || aiSettingsStore.modelListStatus || getAiSettingsStatus()}
          </p>
        </section>

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

function handleModelSelect(event: Event): void {
  const target = event.currentTarget;
  if (target instanceof HTMLSelectElement) {
    setAiModel(target.value);
    explorationStore.aiStatus = "";
  }
}

function handleRefreshModels(): void {
  void refreshAiModelList();
}

function Metric(label: string, value: () => string): ArrowTemplate {
  return html`
    <div class="metric">
      <strong>${value}</strong>
      <span>${label}</span>
    </div>
  `;
}
