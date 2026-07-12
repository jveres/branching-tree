import type { DemoSize } from "./store";

export type DemoActions = {
  addChild: () => void;
  addVersion: () => void;
  deleteBranch: () => void;
  deleteSiblingGroup: () => void;
  fitMap: () => void;
  keepOnlyVersion: () => void;
  createLinearPath: () => void;
  loadSize: (size: DemoSize) => void;
  nextVersion: () => void;
  previousVersion: () => void;
  resetTree: () => void;
  selectNode: (id: string) => void;
  selectSiblingVersion: (id: string) => void;
  truncateAfterSelection: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

const noop = (): void => {};

const noopActions: DemoActions = {
  addChild: noop,
  addVersion: noop,
  deleteBranch: noop,
  deleteSiblingGroup: noop,
  fitMap: noop,
  keepOnlyVersion: noop,
  createLinearPath: noop,
  loadSize: noop,
  nextVersion: noop,
  previousVersion: noop,
  resetTree: noop,
  selectNode: noop,
  selectSiblingVersion: noop,
  truncateAfterSelection: noop,
  zoomIn: noop,
  zoomOut: noop,
};

const currentActions: DemoActions = { ...noopActions };

export const demoActions: DemoActions = {
  addChild: () => currentActions.addChild(),
  addVersion: () => currentActions.addVersion(),
  deleteBranch: () => currentActions.deleteBranch(),
  deleteSiblingGroup: () => currentActions.deleteSiblingGroup(),
  fitMap: () => currentActions.fitMap(),
  keepOnlyVersion: () => currentActions.keepOnlyVersion(),
  createLinearPath: () => currentActions.createLinearPath(),
  loadSize: (size) => currentActions.loadSize(size),
  nextVersion: () => currentActions.nextVersion(),
  previousVersion: () => currentActions.previousVersion(),
  resetTree: () => currentActions.resetTree(),
  selectNode: (id) => currentActions.selectNode(id),
  selectSiblingVersion: (id) => currentActions.selectSiblingVersion(id),
  truncateAfterSelection: () => currentActions.truncateAfterSelection(),
  zoomIn: () => currentActions.zoomIn(),
  zoomOut: () => currentActions.zoomOut(),
};

export function setDemoActions(actions: DemoActions): void {
  Object.assign(currentActions, actions);
}

export function resetDemoActions(): void {
  Object.assign(currentActions, noopActions);
}
