import { reactive } from "@arrow-js/core";

export type DemoId = "version-history" | "exploration-tree";

export type DemoOption = {
  id: DemoId;
  label: string;
};

export const demoOptions: DemoOption[] = [
  { id: "version-history", label: "Version history" },
  { id: "exploration-tree", label: "Exploration tree" },
];

export type ShellStore = {
  currentDemo: DemoId;
  summary: string;
};

const shellStore = reactive<ShellStore>({
  currentDemo: "version-history",
  summary: "Loading demo",
});

export default shellStore;

export function setShellSummary(summary: string): void {
  shellStore.summary = summary;
}
