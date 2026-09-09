import { remove } from "loom/dom";
import type { DemoCleanup } from "./shared/page";
import shellStore, { setShellSummary } from "./shared/shell-store";

export function startDemoShell(root: HTMLElement): DemoCleanup {
  const shell = DemoShell();
  root.append(shell);
  let cleanupCurrentDemo: DemoCleanup | undefined;
  let stopped = false;

  const loadDemo = async (): Promise<void> => {
    try {
      setShellSummary("Loading demo");
      const pageRoot = mustElement(shell, "demo-page", HTMLElement);
      const toolbarRoot = mustElement(shell, "demo-toolbar", HTMLElement);
      const module = await import("./version-history/page");
      if (stopped) return;
      cleanupCurrentDemo = module.mountDemo({ pageRoot, toolbarRoot });
    } catch (error) {
      if (stopped) return;
      setShellSummary("Unable to load demo. Reload to try again.");
      console.error("Failed to load demo", error);
    }
  };

  void loadDemo();
  return () => {
    if (stopped) return;
    stopped = true;
    cleanupCurrentDemo?.();
    remove(shell);
  };
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

function mustElement<T extends Element>(root: Element, id: string, ElementType: new () => T): T {
  const element = root.querySelector(`#${id}`);
  if (!(element instanceof ElementType)) {
    throw new Error(`Missing or invalid demo element #${id}; expected ${ElementType.name}.`);
  }
  return element;
}
