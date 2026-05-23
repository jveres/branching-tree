import { html, type ArrowTemplate } from "@arrow-js/core";
import {
  aiSettingsStore,
  closeAiSettings,
  openAiSettings,
  setAiApiKey,
  setAiBaseUrl,
} from "./shared/ai-settings";
import type { DemoCleanup, DemoPageModule } from "./shared/page";
import shellStore, { type DemoId, demoOptions, setShellSummary } from "./shared/shell-store";

let cleanupCurrentDemo: DemoCleanup | null = null;
let loadSequence = 0;

export function startDemoShell(root: HTMLElement): void {
  DemoShell()(root);
  void loadDemo(getDemoIdFromUrl());
  window.addEventListener("popstate", () => {
    void loadDemo(getDemoIdFromUrl());
  });
}

function DemoShell(): ArrowTemplate {
  return html`
    <main class="app-shell">
      <header class="topbar">
        <div class="topbar-left">
          <label class="demo-picker" for="demo-select">
            <span>Demo</span>
            <select id="demo-select" @change="${handleDemoSelect}">
              ${demoOptions.map((option) =>
                html`<option value="${option.id}">${option.label}</option>`.key(option.id),
              )}
            </select>
          </label>
          <p class="demo-summary">${() => shellStore.summary}</p>
        </div>
        <div class="topbar-right">
          <button
            type="button"
            class="icon-button"
            title="AI settings"
            aria-label="AI settings"
            @click="${openAiSettings}"
          >
            ⚙
          </button>
          <div class="toolbar" id="demo-toolbar" aria-label="Demo controls"></div>
        </div>
      </header>
      ${AiSettingsDialog()}
      <div id="demo-page" class="demo-page"></div>
    </main>
  `;
}

function AiSettingsDialog(): ArrowTemplate {
  return html`
    <div
      class="${() =>
        aiSettingsStore.settingsOpen ? "settings-backdrop is-open" : "settings-backdrop"}"
      aria-hidden="${() => String(!aiSettingsStore.settingsOpen)}"
      @click="${handleSettingsBackdropClick}"
    >
      <section
        class="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
      >
        <div class="settings-header">
          <h2 id="ai-settings-title">AI settings</h2>
          <button
            type="button"
            class="settings-close"
            title="Close settings"
            aria-label="Close settings"
            @click="${closeAiSettings}"
          >
            ×
          </button>
        </div>
        <label class="settings-field">
          <span>Base URL</span>
          <input
            type="url"
            autocomplete="off"
            spellcheck="false"
            value="${() => aiSettingsStore.baseUrl}"
            @input="${handleBaseUrlInput}"
          />
        </label>
        <label class="settings-field">
          <span>API key</span>
          <input
            type="password"
            autocomplete="off"
            spellcheck="false"
            value="${() => aiSettingsStore.apiKey}"
            @input="${handleApiKeyInput}"
          />
        </label>
        <label class="settings-field">
          <span>System instruction</span>
          <textarea
            rows="6"
            readonly
            spellcheck="true"
          >${() => aiSettingsStore.systemInstruction}</textarea>
        </label>
        <p class="settings-note">
          Base URL and API key are stored only in this browser's localStorage. The system
          instruction is built into the demo and is shown read-only.
        </p>
        <button type="button" class="action-button" @click="${closeAiSettings}">Done</button>
      </section>
    </div>
  `;
}

function handleSettingsBackdropClick(event: Event): void {
  if (event.target === event.currentTarget) closeAiSettings();
}

function handleBaseUrlInput(event: Event): void {
  const target = event.currentTarget;
  if (target instanceof HTMLInputElement) setAiBaseUrl(target.value);
}

function handleApiKeyInput(event: Event): void {
  const target = event.currentTarget;
  if (target instanceof HTMLInputElement) setAiApiKey(target.value);
}

function handleDemoSelect(event: Event): void {
  const target = event.currentTarget;
  if (!(target instanceof HTMLSelectElement)) return;
  if (!isDemoId(target.value)) return;

  selectDemo(target.value);
}

function selectDemo(id: DemoId): void {
  if (shellStore.currentDemo === id) return;

  const url = new URL(window.location.href);
  url.searchParams.set("demo", id);
  window.history.pushState(null, "", url);
  void loadDemo(id);
}

async function loadDemo(id: DemoId): Promise<void> {
  const sequence = ++loadSequence;
  shellStore.currentDemo = id;
  syncDemoSelect(id);
  setShellSummary("Loading demo");

  cleanupCurrentDemo?.();
  cleanupCurrentDemo = null;

  const pageRoot = mustElement<HTMLElement>("demo-page");
  const toolbarRoot = mustElement<HTMLElement>("demo-toolbar");
  pageRoot.replaceChildren();
  toolbarRoot.replaceChildren();

  const module = await importDemo(id);
  if (sequence !== loadSequence) return;

  cleanupCurrentDemo = module.mountDemo({ pageRoot, toolbarRoot });
}

function importDemo(id: DemoId): Promise<DemoPageModule> {
  switch (id) {
    case "exploration-tree":
      return import("./exploration-tree/page");
    case "version-history":
      return import("./version-history/page");
  }
}

function getDemoIdFromUrl(): DemoId {
  const value = new URL(window.location.href).searchParams.get("demo");
  return isDemoId(value) ? value : "version-history";
}

function isDemoId(value: string | null): value is DemoId {
  return demoOptions.some((option) => option.id === value);
}

function syncDemoSelect(id: DemoId): void {
  const select = document.getElementById("demo-select");
  if (select instanceof HTMLSelectElement) select.value = id;
}

function mustElement<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing demo element #${id}.`);
  return element as unknown as T;
}
