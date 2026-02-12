import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    external: ["next", "react"],
  },
  {
    entry: { bin: "src/bin.ts" },
    format: ["esm"],
    dts: false,
    clean: false,
    splitting: false,
    sourcemap: true,
    external: ["indxel-cli"],
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
