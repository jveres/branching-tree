import { geaPlugin } from "@geajs/vite-plugin";
import { defineConfig, type Plugin } from "vite";

const GEA_COMPILER_RUNTIME_ID = "virtual:gea-compiler-runtime";
const RESOLVED_GEA_COMPILER_RUNTIME_ID = `\0${GEA_COMPILER_RUNTIME_ID}`;

function geaCompilerRuntimeShim(): Plugin {
  return {
    name: "gea-compiler-runtime-shim",
    enforce: "pre",
    resolveId(id) {
      if (id === GEA_COMPILER_RUNTIME_ID) return RESOLVED_GEA_COMPILER_RUNTIME_ID;
    },
    load(id) {
      if (id === RESOLVED_GEA_COMPILER_RUNTIME_ID) {
        return 'export * from "@geajs/core/compiler-runtime";';
      }
    },
  };
}

export default defineConfig({
  optimizeDeps: {
    exclude: ["@geajs/core"],
  },
  plugins: [geaCompilerRuntimeShim(), geaPlugin()],
});
