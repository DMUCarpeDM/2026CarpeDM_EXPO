import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const localPocProxy = { target: "http://127.0.0.1:8000", changeOrigin: true };

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": localPocProxy,
    },
  },
  preview: {
    proxy: {
      "/api": localPocProxy,
    },
  },
});
