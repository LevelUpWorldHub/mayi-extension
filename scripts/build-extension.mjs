import { copyFileSync } from "node:fs";
import { build } from "vite";

await build({
  configFile: "vite.config.ts",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        lab: "index.html",
        sidepanel: "sidepanel.html",
        offscreen: "offscreen.html",
      },
    },
  },
});

await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/content/index.ts",
      formats: ["iife"],
      name: "MayIContent",
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});

await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "es2022",
    rollupOptions: {
      input: "src/background/index.ts",
      output: {
        format: "es",
        entryFileNames: "background.js",
        inlineDynamicImports: true,
      },
    },
  },
});

copyFileSync("manifest.json", "dist/manifest.json");
