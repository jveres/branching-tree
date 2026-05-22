import { reactive } from "@arrow-js/core";

export type ExplorationStore = {
  summary: string;
  nodeCount: string;
  edgeCount: string;
  pathCount: string;
  openCount: string;
  actionTime: string;

  nodeTitle: string;
  nodeKind: string;
  nodeStatus: string;
  nodeScore: string;
  nodeContent: string;

  canCreateVersion: boolean;
  canToggleResponse: boolean;
  responseExpanded: boolean;
  canPrune: boolean;
};

const explorationStore = reactive<ExplorationStore>({
  summary: "Loading exploration",
  nodeCount: "0",
  edgeCount: "0",
  pathCount: "0",
  openCount: "0",
  actionTime: "0 ms",

  nodeTitle: "Topic",
  nodeKind: "-",
  nodeStatus: "-",
  nodeScore: "-",
  nodeContent: "",

  canCreateVersion: false,
  canToggleResponse: false,
  responseExpanded: false,
  canPrune: false,
});

export default explorationStore;
