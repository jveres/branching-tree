import type { DemoCleanup } from "./shared/page";
import shellStore, { setShellSummary } from "./shared/shell-store";

let cleanupCurrentDemo: DemoCleanup | null = null;
let loadSequence = 0;

export function startDemoShell(root: HTMLElement): void {
  root.append(DemoShell());
  void loadDemo();
}

function DemoShell(): HTMLElement {
  return (
    <main class="app-shell">
      <header class="topbar">
        <div class="topbar-left">
          <p class="demo-summary">{() => shellStore.summary()}</p>
        </div>
        <div class="topbar-right">
          <div class="toolbar" id="demo-toolbar" role="toolbar" aria-label="Demo controls" />
        </div>
      </header>
      <div id="demo-page" class="demo-page" />
    </main>
  );
}

async function loadDemo(): Promise<void> {
  const sequence = ++loadSequence;
  setShellSummary("Loading demo");

  cleanupCurrentDemo?.();
  cleanupCurrentDemo = null;

  const pageRoot = mustElement<HTMLElement>("demo-page");
  const toolbarRoot = mustElement<HTMLElement>("demo-toolbar");
  pageRoot.replaceChildren();
  toolbarRoot.replaceChildren();

  const module = await import("./version-history/page");
  if (sequence !== loadSequence) return;

  cleanupCurrentDemo = module.mountDemo({ pageRoot, toolbarRoot });
}

function mustElement<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing demo element #${id}.`);
  return element as unknown as T;
}
