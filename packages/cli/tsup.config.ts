import { defineConfig } from "tsup";
import pkg from "./package.json" with { type: "json" };

const shared = {
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
};

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    ...shared,
  },
  {
    entry: { bin: "src/bin.ts" },
    format: ["esm"],
    dts: false,
    clean: false,
    splitting: false,
    sourcemap: true,
    banner: {
      js: "#!/usr/bin/env node",
    },
    ...shared,
  },
]);
