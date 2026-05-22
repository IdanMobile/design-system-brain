import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = "http://127.0.0.1:6111";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 6110,
    proxy: {
      "/api": API,
      "/repo": API
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
