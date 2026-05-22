export type ExplorationActions = {
  createVersion: () => void;
  deleteNode: () => void;
  fitMap: () => void;
  resetExploration: () => void;
  selectNode: (id: string) => void;
  toggleResponse: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

const noop = (): void => {};

const currentActions: ExplorationActions = {
  createVersion: noop,
  deleteNode: noop,
  fitMap: noop,
  resetExploration: noop,
  selectNode: noop,
  toggleResponse: noop,
  zoomIn: noop,
  zoomOut: noop,
};

export const explorationActions: ExplorationActions = {
  createVersion: () => currentActions.createVersion(),
  deleteNode: () => currentActions.deleteNode(),
  fitMap: () => currentActions.fitMap(),
  resetExploration: () => currentActions.resetExploration(),
  selectNode: (id) => currentActions.selectNode(id),
  toggleResponse: () => currentActions.toggleResponse(),
  zoomIn: () => currentActions.zoomIn(),
  zoomOut: () => currentActions.zoomOut(),
};

export function setExplorationActions(actions: ExplorationActions): void {
  Object.assign(currentActions, actions);
}
