import { reactive } from "@arrow-js/core";

export type ShellStore = {
  summary: string;
};

const shellStore = reactive<ShellStore>({
  summary: "Loading demo",
});

export default shellStore;

export function setShellSummary(summary: string): void {
  shellStore.summary = summary;
}
