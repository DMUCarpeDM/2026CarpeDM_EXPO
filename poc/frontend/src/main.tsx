import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

// 조용히 사라지는 비동기 실패를 부스 현장 진단용으로 콘솔에 남긴다
window.addEventListener('unhandledrejection', (ev) => {
  console.error('[unhandledrejection]', ev.reason)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
