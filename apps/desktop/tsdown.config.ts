import { defineConfig } from "tsdown";

const shared = {
  format: "cjs" as const,
  outDir: "dist-electron",
  sourcemap: true,
  ignoreWatch: [
    "../../.git/**",
    "../../.turbo/**",
    "../../node_modules/**",
    "node_modules/**",
    "dist-electron/**",
    "**/*.tsbuildinfo",
  ],
  outExtensions: () => ({ js: ".cjs" }),
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/main.ts"],
    clean: true,
    noExternal: (id) => id.startsWith("@t3tools/"),
  },
  {
    ...shared,
    entry: ["src/preload.ts"],
  },
]);
