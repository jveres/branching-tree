export type DemoMountRoots = {
  pageRoot: HTMLElement;
  toolbarRoot: HTMLElement;
};

export type DemoCleanup = () => void;

export type DemoPageModule = {
  mountDemo: (roots: DemoMountRoots) => DemoCleanup;
};
