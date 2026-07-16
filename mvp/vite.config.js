import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Mirrorting PoC 백엔드 주소. 기본 포트는 8001입니다.
// (8000은 같은 PC의 carpedm-kiosk가 사용하므로 충돌을 피하려고 8001로 둡니다.)
// 다른 포트를 쓰려면: MIRRORTING_API_TARGET=http://127.0.0.1:9000 npm run dev
const pocTarget = process.env.MIRRORTING_API_TARGET || "http://127.0.0.1:8001";
const localPocProxy = { target: pocTarget, changeOrigin: true };

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
