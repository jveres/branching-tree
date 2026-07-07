import { props } from "loom";

export type ShellStore = {
  summary: string;
};

// One reactive cell per key (read `shellStore.summary()`, write `shellStore.summary(value)`).
const shellStore = props<ShellStore>({
  summary: "Loading demo",
});

export default shellStore;

export function setShellSummary(summary: string): void {
  shellStore.summary(summary);
}
