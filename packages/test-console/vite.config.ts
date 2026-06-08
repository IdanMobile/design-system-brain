import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TEST_CONSOLE_SERVER_VERSION } from "../../scripts/test-console-version.mjs";

const API = "http://127.0.0.1:6111";

export default defineConfig({
  plugins: [react()],
  define: {
    __TEST_CONSOLE_SERVER_VERSION__: JSON.stringify(TEST_CONSOLE_SERVER_VERSION)
  },
  server: {
    host: "127.0.0.1",
    port: 6110,
    proxy: {
      "/api": API,
      "/repo": API,
      "/downloads": API
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
