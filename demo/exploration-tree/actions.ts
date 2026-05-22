export type ExplorationActions = {
  createVersion: () => void;
  fitMap: () => void;
  pruneBranch: () => void;
  resetExploration: () => void;
  selectNode: (id: string) => void;
  toggleResponse: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

const noop = (): void => {};

const currentActions: ExplorationActions = {
  createVersion: noop,
  fitMap: noop,
  pruneBranch: noop,
  resetExploration: noop,
  selectNode: noop,
  toggleResponse: noop,
  zoomIn: noop,
  zoomOut: noop,
};

export const explorationActions: ExplorationActions = {
  createVersion: () => currentActions.createVersion(),
  fitMap: () => currentActions.fitMap(),
  pruneBranch: () => currentActions.pruneBranch(),
  resetExploration: () => currentActions.resetExploration(),
  selectNode: (id) => currentActions.selectNode(id),
  toggleResponse: () => currentActions.toggleResponse(),
  zoomIn: () => currentActions.zoomIn(),
  zoomOut: () => currentActions.zoomOut(),
};

export function setExplorationActions(actions: ExplorationActions): void {
  Object.assign(currentActions, actions);
}
