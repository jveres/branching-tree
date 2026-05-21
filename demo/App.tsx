import { Component } from "@geajs/core";
import { demoActions } from "./actions";
import demoStore, { type DemoSize } from "./store";

const sizes: DemoSize[] = [128, 256, 512];

export default class DemoApp extends Component {
  template() {
    return (
      <main class="app-shell">
        <header class="topbar">
          <div class="brand-block">
            <h1>Branching tree</h1>
            <p>{demoStore.summary}</p>
          </div>
          <div class="toolbar" aria-label="Map controls">
            <div class="segmented" aria-label="Tree size">
              {sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  class={`segment-button${demoStore.currentSize === size ? " is-active" : ""}`}
                  click={() => demoActions.loadSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
            <button
              type="button"
              class="icon-button"
              title="Fit map"
              aria-label="Fit map"
              click={demoActions.fitMap}
            >
              ⌖
            </button>
            <button
              type="button"
              class="icon-button"
              title="Zoom out"
              aria-label="Zoom out"
              click={demoActions.zoomOut}
            >
              −
            </button>
            <button
              type="button"
              class="icon-button"
              title="Zoom in"
              aria-label="Zoom in"
              click={demoActions.zoomIn}
            >
              +
            </button>
          </div>
        </header>

        <section class="metrics" aria-label="Tree metrics">
          <div class="metric">
            <strong>{demoStore.nodeCount}</strong>
            <span>messages</span>
          </div>
          <div class="metric">
            <strong>{demoStore.edgeCount}</strong>
            <span>links</span>
          </div>
          <div class="metric">
            <strong>{demoStore.pathCount}</strong>
            <span>active</span>
          </div>
          <div class="metric">
            <strong>{demoStore.renderTime}</strong>
            <span>layout</span>
          </div>
          <div class="metric">
            <strong>{demoStore.selectTime}</strong>
            <span>action</span>
          </div>
        </section>

        <section class="workspace">
          <section class="map-panel" id="map-panel" aria-label="Conversation version map">
            <svg id="tree-map" role="tree" aria-label="Conversation version map"></svg>
          </section>

          <aside class="inspector" aria-label="Selection details">
            <section class="inspect-section">
              <h2>{demoStore.messageTitle}</h2>
              <dl class="message-meta">
                <div>
                  <dt>Role</dt>
                  <dd>{demoStore.messageRole}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{demoStore.messageVersion}</dd>
                </div>
                <div>
                  <dt>Tokens</dt>
                  <dd>{demoStore.messageTokens}</dd>
                </div>
              </dl>
              <p class="message-content">{demoStore.messageContent}</p>
            </section>

            <section class="inspect-section">
              <h2>Versions</h2>
              <div class="sibling-list">
                {demoStore.siblings.length === 0 ? (
                  <p class="empty-state">No versions</p>
                ) : (
                  demoStore.siblings.map((entry) => (
                    <button
                      key={entry.nodeId}
                      type="button"
                      class={`version-button${entry.selected ? " is-selected" : ""}`}
                      click={() => demoActions.selectSiblingVersion(entry.nodeId)}
                    >
                      <span class="version-index">{entry.index}</span>
                      <span class="version-label">{entry.label}</span>
                      <span class="version-role">{entry.role}</span>
                    </button>
                  ))
                )}
              </div>
            </section>

            <section class="inspect-section">
              <h2>Actions</h2>
              <div class="action-grid" aria-label="Branch actions">
                <button
                  type="button"
                  class="action-button"
                  disabled={!demoStore.canPreviousVersion}
                  click={demoActions.previousVersion}
                >
                  Previous
                </button>
                <button
                  type="button"
                  class="action-button"
                  disabled={!demoStore.canNextVersion}
                  click={demoActions.nextVersion}
                >
                  Next
                </button>
                <button
                  type="button"
                  class="action-button"
                  disabled={!demoStore.canAddVersion}
                  click={demoActions.addVersion}
                >
                  Add version
                </button>
                <button
                  type="button"
                  class="action-button"
                  disabled={!demoStore.canAddChild}
                  click={demoActions.addChild}
                >
                  Add child
                </button>
                <button
                  type="button"
                  class="action-button"
                  disabled={!demoStore.canTruncate}
                  click={demoActions.truncateAfterSelection}
                >
                  Truncate after
                </button>
                <button
                  type="button"
                  class="action-button"
                  disabled={!demoStore.canKeepOnlyVersion}
                  click={demoActions.keepOnlyVersion}
                >
                  Keep only
                </button>
                <button
                  type="button"
                  class="action-button is-danger"
                  disabled={!demoStore.canDelete}
                  click={demoActions.deleteBranch}
                >
                  Delete
                </button>
                <button
                  type="button"
                  class="action-button is-danger"
                  disabled={!demoStore.canDeleteVersions}
                  click={demoActions.deleteSiblingGroup}
                >
                  Delete versions
                </button>
                <button
                  type="button"
                  class="action-button"
                  click={demoActions.loadLinearTranscript}
                >
                  Load linear
                </button>
                <button type="button" class="action-button" click={demoActions.resetTree}>
                  Reset sample
                </button>
              </div>
            </section>

            <section class="inspect-section path-section">
              <h2>Active path</h2>
              <ol class="path-list">
                {demoStore.pathEntries.map((entry) => (
                  <li key={entry.nodeId}>
                    <button
                      type="button"
                      class={`path-button${entry.head ? " is-head" : ""}`}
                      click={() => demoActions.selectNode(entry.nodeId)}
                    >
                      <span class="path-label">{entry.label}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </section>
      </main>
    );
  }
}
