import { createStore } from "solid-js";

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

export type DemoStore = {
  currentSize: DemoSize | null;
  summary: string;
  nodeCount: string;
  edgeCount: string;
  pathCount: string;
  renderTime: string;
  selectTime: string;

  messageTitle: string;
  messageRole: string;
  messageVersion: string;
  messageTokens: string;
  messageContent: string;

  siblings: DemoSiblingView[];
  pathEntries: DemoPathView[];

  canPreviousVersion: boolean;
  canNextVersion: boolean;
  canAddVersion: boolean;
  canAddChild: boolean;
  canTruncate: boolean;
  canKeepOnlyVersion: boolean;
  canDelete: boolean;
  canDeleteVersions: boolean;
};

const initialDemoStore: DemoStore = {
  currentSize: 128,
  summary: "Loading map",
  nodeCount: "0",
  edgeCount: "0",
  pathCount: "0",
  renderTime: "0 ms",
  selectTime: "0 ms",

  messageTitle: "Message",
  messageRole: "-",
  messageVersion: "-",
  messageTokens: "-",
  messageContent: "",

  siblings: [],
  pathEntries: [],

  canPreviousVersion: false,
  canNextVersion: false,
  canAddVersion: false,
  canAddChild: false,
  canTruncate: false,
  canKeepOnlyVersion: false,
  canDelete: false,
  canDeleteVersions: false,
};

const [store, setStore] = createStore<DemoStore>(initialDemoStore);

const demoStore = new Proxy(initialDemoStore, {
  get(target, property: string | symbol) {
    if (typeof property === "symbol" || !(property in target)) return undefined;

    return store[property as keyof DemoStore];
  },
  set(target, property: string | symbol, value) {
    if (typeof property === "symbol" || !(property in target)) return false;

    setStore((draft) => {
      Object.assign(draft, { [property]: value });
    });
    return true;
  },
});

export default demoStore;
