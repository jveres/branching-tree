export type ExplorationActions = {
  createVersion: () => void;
  deleteNode: () => void;
  fitMap: () => void;
  resetExploration: () => void;
  selectNode: (id: string) => void;
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
  zoomIn: noop,
  zoomOut: noop,
};

export const explorationActions: ExplorationActions = {
  createVersion: () => currentActions.createVersion(),
  deleteNode: () => currentActions.deleteNode(),
  fitMap: () => currentActions.fitMap(),
  resetExploration: () => currentActions.resetExploration(),
  selectNode: (id) => currentActions.selectNode(id),
  zoomIn: () => currentActions.zoomIn(),
  zoomOut: () => currentActions.zoomOut(),
};

export function setExplorationActions(actions: ExplorationActions): void {
  Object.assign(currentActions, actions);
}
