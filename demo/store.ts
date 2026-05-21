import { Store } from "@geajs/core";

export type DemoSize = 128 | 256 | 512;

export type DemoSiblingView = {
  index: string;
  label: string;
  nodeId: string;
  role: string;
  selected: boolean;
};

export type DemoPathView = {
  head: boolean;
  label: string;
  nodeId: string;
};

class DemoStore extends Store {
  currentSize: DemoSize | null = 128;
  summary = "Loading map";
  nodeCount = "0";
  edgeCount = "0";
  pathCount = "0";
  renderTime = "0 ms";
  selectTime = "0 ms";

  messageTitle = "Message";
  messageRole = "-";
  messageVersion = "-";
  messageTokens = "-";
  messageContent = "";

  siblings: DemoSiblingView[] = [];
  pathEntries: DemoPathView[] = [];

  canPreviousVersion = false;
  canNextVersion = false;
  canAddVersion = false;
  canAddChild = false;
  canTruncate = false;
  canKeepOnlyVersion = false;
  canDelete = false;
  canDeleteVersions = false;
}

export default new DemoStore();
