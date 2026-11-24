/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths: works at a domain root and under a subpath such as GitHub Pages /Kiroween/.
  base: "./",
  test: {
    setupFiles: ["./tests/setup.ts"],
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // Libraries ship React Server Component "use client" markers; they are irrelevant for this SPA.
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        warn(warning);
      },
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]@phosphor-icons[\\/]/.test(id)) return "icons";
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          if (/[\\/](cmdk|@radix-ui)[\\/]/.test(id)) return "palette";
        },
      },
    },
  },
});
