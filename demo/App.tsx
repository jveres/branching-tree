import { For, Show } from "solid-js";
import { demoActions } from "./actions";
import demoStore, { type DemoPathView, type DemoSiblingView, type DemoSize } from "./store";

const sizes: DemoSize[] = [128, 256, 512];

export default function DemoApp() {
  return (
    <main class="app-shell">
      <header class="topbar">
        <div class="brand-block">
          <h1>Branching tree</h1>
          <p>{demoStore.summary}</p>
        </div>
        <div class="toolbar" aria-label="Map controls">
          <div class="segmented" aria-label="Tree size">
            <For each={sizes}>{(size) => <SizeButton size={size} />}</For>
          </div>
          <button
            type="button"
            class="icon-button"
            title="Fit map"
            aria-label="Fit map"
            onClick={demoActions.fitMap}
          >
            ⌖
          </button>
          <button
            type="button"
            class="icon-button"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={demoActions.zoomOut}
          >
            −
          </button>
          <button
            type="button"
            class="icon-button"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={demoActions.zoomIn}
          >
            +
          </button>
        </div>
      </header>

      <section class="metrics" aria-label="Tree metrics">
        <Metric value={demoStore.nodeCount} label="messages" />
        <Metric value={demoStore.edgeCount} label="links" />
        <Metric value={demoStore.pathCount} label="active" />
        <Metric value={demoStore.renderTime} label="layout" />
        <Metric value={demoStore.selectTime} label="action" />
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
              >
                −
              </button>
            </div>
            <svg id="minimap-svg" aria-label="Whole tree overview"></svg>
          </div>
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
              <Show
                when={demoStore.siblings.length > 0}
                fallback={<p class="empty-state">No versions</p>}
              >
                <For each={demoStore.siblings}>{(entry) => <SiblingButton entry={entry} />}</For>
              </Show>
            </div>
          </section>

          <section class="inspect-section">
            <h2>Actions</h2>
            <div class="action-grid" aria-label="Branch actions">
              <button
                type="button"
                class="action-button"
                disabled={!demoStore.canPreviousVersion}
                onClick={demoActions.previousVersion}
              >
                Previous
              </button>
              <button
                type="button"
                class="action-button"
                disabled={!demoStore.canNextVersion}
                onClick={demoActions.nextVersion}
              >
                Next
              </button>
              <button
                type="button"
                class="action-button"
                disabled={!demoStore.canAddVersion}
                onClick={demoActions.addVersion}
              >
                Add version
              </button>
              <button
                type="button"
                class="action-button"
                disabled={!demoStore.canAddChild}
                onClick={demoActions.addChild}
              >
                Add child
              </button>
              <button
                type="button"
                class="action-button"
                disabled={!demoStore.canTruncate}
                onClick={demoActions.truncateAfterSelection}
              >
                Truncate after
              </button>
              <button
                type="button"
                class="action-button"
                disabled={!demoStore.canKeepOnlyVersion}
                onClick={demoActions.keepOnlyVersion}
              >
                Keep only
              </button>
              <button
                type="button"
                class="action-button is-danger"
                disabled={!demoStore.canDelete}
                onClick={demoActions.deleteBranch}
              >
                Delete
              </button>
              <button
                type="button"
                class="action-button is-danger"
                disabled={!demoStore.canDeleteVersions}
                onClick={demoActions.deleteSiblingGroup}
              >
                Delete versions
              </button>
              <button type="button" class="action-button" onClick={demoActions.createLinearPath}>
                Create linear
              </button>
              <button type="button" class="action-button" onClick={demoActions.resetTree}>
                Reset sample
              </button>
            </div>
          </section>

          <section class="inspect-section path-section">
            <h2>Active path</h2>
            <ol class="path-list">
              <For each={demoStore.pathEntries}>{(entry) => <PathEntryButton entry={entry} />}</For>
            </ol>
          </section>
        </aside>
      </section>
    </main>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div class="metric">
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  );
}

function SizeButton(props: { size: DemoSize }) {
  return (
    <button
      type="button"
      class={`segment-button${demoStore.currentSize === props.size ? " is-active" : ""}`}
      onClick={() => demoActions.loadSize(props.size)}
    >
      {props.size}
    </button>
  );
}

function SiblingButton(props: { entry: DemoSiblingView }) {
  return (
    <button
      type="button"
      class={`version-button${props.entry.selected ? " is-selected" : ""}`}
      onClick={() => demoActions.selectSiblingVersion(props.entry.nodeId)}
    >
      <span class="version-index">{props.entry.index}</span>
      <span class="version-label">{props.entry.label}</span>
      <span class="version-role">{props.entry.role}</span>
    </button>
  );
}

function PathEntryButton(props: { entry: DemoPathView }) {
  return (
    <li>
      <button
        type="button"
        class={`path-button${props.entry.head ? " is-head" : ""}`}
        onClick={() => demoActions.selectNode(props.entry.nodeId)}
      >
        <span class="path-label">{props.entry.label}</span>
      </button>
    </li>
  );
}
