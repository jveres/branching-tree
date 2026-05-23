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

  aiStatus: string;
  canCreateVersion: boolean;
  canDelete: boolean;
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

  aiStatus: "",
  canCreateVersion: false,
  canDelete: false,
});

export default explorationStore;
