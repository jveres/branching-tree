import { html, type ArrowTemplate } from "@arrow-js/core";
import { demoActions } from "./actions";
import demoStore, { type DemoPathView, type DemoSiblingView, type DemoSize } from "./store";

const sizes: DemoSize[] = [128, 256, 512];

export default function DemoApp(): ArrowTemplate {
  return html`
    <main class="app-shell">
      <header class="topbar">
        <div class="brand-block">
          <h1>Branching tree</h1>
          <p>${() => demoStore.summary}</p>
        </div>
        <div class="toolbar" aria-label="Map controls">
          <div class="segmented" aria-label="Tree size">
            ${sizes.map((size) => SizeButton(size).key(size))}
          </div>
          <button
            type="button"
            class="icon-button"
            title="Fit map"
            aria-label="Fit map"
            @click="${demoActions.fitMap}"
          >
            ⌖
          </button>
          <button
            type="button"
            class="icon-button"
            title="Zoom out"
            aria-label="Zoom out"
            @click="${demoActions.zoomOut}"
          >
            −
          </button>
          <button
            type="button"
            class="icon-button"
            title="Zoom in"
            aria-label="Zoom in"
            @click="${demoActions.zoomIn}"
          >
            +
          </button>
        </div>
      </header>

      <section class="metrics" aria-label="Tree metrics">
        ${Metric("messages", () => demoStore.nodeCount)}
        ${Metric("links", () => demoStore.edgeCount)} ${Metric("active", () => demoStore.pathCount)}
        ${Metric("layout", () => demoStore.renderTime)}
        ${Metric("action", () => demoStore.selectTime)}
      </section>

      <section class="workspace">
        <section class="map-panel" id="map-panel" aria-label="Conversation version map">
          <svg id="tree-map" role="tree" aria-label="Conversation version map"></svg>
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
            <svg id="minimap-svg" aria-label="Whole tree overview"></svg>
          </div>
        </section>

        <aside class="inspector" aria-label="Selection details">
          <section class="inspect-section">
            <h2>${() => demoStore.messageTitle}</h2>
            <dl class="message-meta">
              <div>
                <dt>Role</dt>
                <dd>${() => demoStore.messageRole}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>${() => demoStore.messageVersion}</dd>
              </div>
              <div>
                <dt>Tokens</dt>
                <dd>${() => demoStore.messageTokens}</dd>
              </div>
            </dl>
            <p class="message-content">${() => demoStore.messageContent}</p>
          </section>

          <section class="inspect-section">
            <h2>Versions</h2>
            <div class="sibling-list">
              ${() =>
                demoStore.siblings.length > 0
                  ? demoStore.siblings.map((entry) => SiblingButton(entry).key(entry.nodeId))
                  : html`<p class="empty-state">No versions</p>`}
            </div>
          </section>

          <section class="inspect-section">
            <h2>Actions</h2>
            <div class="action-grid" aria-label="Branch actions">
              <button
                type="button"
                class="action-button"
                disabled="${() => !demoStore.canPreviousVersion}"
                @click="${demoActions.previousVersion}"
              >
                Previous
              </button>
              <button
                type="button"
                class="action-button"
                disabled="${() => !demoStore.canNextVersion}"
                @click="${demoActions.nextVersion}"
              >
                Next
              </button>
              <button
                type="button"
                class="action-button"
                disabled="${() => !demoStore.canAddVersion}"
                @click="${demoActions.addVersion}"
              >
                Add version
              </button>
              <button
                type="button"
                class="action-button"
                disabled="${() => !demoStore.canAddChild}"
                @click="${demoActions.addChild}"
              >
                Add child
              </button>
              <button
                type="button"
                class="action-button"
                disabled="${() => !demoStore.canTruncate}"
                @click="${demoActions.truncateAfterSelection}"
              >
                Truncate after
              </button>
              <button
                type="button"
                class="action-button"
                disabled="${() => !demoStore.canKeepOnlyVersion}"
                @click="${demoActions.keepOnlyVersion}"
              >
                Keep only
              </button>
              <button
                type="button"
                class="action-button is-danger"
                disabled="${() => !demoStore.canDelete}"
                @click="${demoActions.deleteBranch}"
              >
                Delete
              </button>
              <button
                type="button"
                class="action-button is-danger"
                disabled="${() => !demoStore.canDeleteVersions}"
                @click="${demoActions.deleteSiblingGroup}"
              >
                Delete versions
              </button>
              <button type="button" class="action-button" @click="${demoActions.createLinearPath}">
                Create linear
              </button>
              <button type="button" class="action-button" @click="${demoActions.resetTree}">
                Reset sample
              </button>
            </div>
          </section>

          <section class="inspect-section path-section">
            <h2>Active path</h2>
            <ol class="path-list">
              ${() =>
                demoStore.pathEntries.map((entry) => PathEntryButton(entry).key(entry.nodeId))}
            </ol>
          </section>
        </aside>
      </section>
    </main>
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

function SizeButton(size: DemoSize): ArrowTemplate {
  return html`
    <button
      type="button"
      class="${() => `segment-button${demoStore.currentSize === size ? " is-active" : ""}`}"
      @click="${() => demoActions.loadSize(size)}"
    >
      ${size}
    </button>
  `;
}

function SiblingButton(entry: DemoSiblingView): ArrowTemplate {
  return html`
    <button
      type="button"
      class="${() => `version-button${entry.selected ? " is-selected" : ""}`}"
      @click="${() => demoActions.selectSiblingVersion(entry.nodeId)}"
    >
      <span class="version-index">${() => entry.index}</span>
      <span class="version-label">${() => entry.label}</span>
      <span class="version-role">${() => entry.role}</span>
    </button>
  `;
}

function PathEntryButton(entry: DemoPathView): ArrowTemplate {
  return html`
    <li>
      <button
        type="button"
        class="${() => `path-button${entry.head ? " is-head" : ""}`}"
        @click="${() => demoActions.selectNode(entry.nodeId)}"
      >
        <span class="path-label">${() => entry.label}</span>
      </button>
    </li>
  `;
}
