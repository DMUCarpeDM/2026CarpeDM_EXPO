# Mirror-Ting 별도 웹앱

React·TypeScript·Vite 기반의 기관·운영자·키오스크·결과 열람용 웹앱입니다. 관람객용 스마트 미러 개발 위치는 `../../mvp/`입니다. 이 앱의 로그인·기관 대시보드·결과 연결 경로는 현재도 사용하므로 유지합니다.

## 실행과 검증

```bash
npm ci
npm run dev
npm test
npm run lint
npm run build
```

백엔드는 `../backend/`의 FastAPI입니다. 개발 서버 연결 설정은 `vite.config.ts`, HTTP 요청은 `src/api/client.ts`, 라우팅은 `src/App.tsx`에서 확인합니다.

MediaPipe의 로컬 모델·wasm이 필요하면 `npm run setup-offline`을 실행합니다. 생성 모델·node_modules·dist는 Git에서 제외합니다. `src/lib/localTranscript.test.ts`도 `npm test`에서 함께 실행합니다.
