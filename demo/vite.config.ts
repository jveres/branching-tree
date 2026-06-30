import { defineConfig } from "vite";

// Loom is JSX-via-the-automatic-runtime; Vite 8 transforms with oxc. Point it at loom's runtime.
export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "loom",
    },
  },
});
