import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@lab/contract": resolve(__dirname, "../contract/src/index.ts"),
      "@lab/ui/styles.css": resolve(__dirname, "../ui/src/styles.css"),
      "@lab/ui": resolve(__dirname, "../ui/src/index.ts")
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
