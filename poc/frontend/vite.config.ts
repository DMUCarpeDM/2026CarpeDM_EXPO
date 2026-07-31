import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 전시 mvp(5173)와 동시 구동용 고정 포트 — 자동 승격(5174→5175…)을 막아
    // 안내 문서·백엔드 CORS 구성과 어긋나지 않게 한다.
    port: 5174,
    strictPort: true,
    // /api는 dev 서버가 대리 호출(동일 출처) — 브라우저 CORS를 원천 제거.
    // 5173이 아닌 포트에서 백엔드를 직접 호출하면 CORS에 막혀 시나리오 목록·
    // 직무 탭이 통째로 사라지던 문제의 근본 수정.
    proxy: {
      '/api': 'http://127.0.0.1:8001',
    },
  },
})
