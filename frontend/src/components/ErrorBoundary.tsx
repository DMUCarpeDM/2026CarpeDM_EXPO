/** 렌더 예외 최후 방어선 — 백화면 대신 안내를 띄우고 처음 화면으로 자동 복귀한다.
 *
 * 전시 중 예상 밖 페이로드 등으로 React 트리가 죽으면 아무도 지켜보지 않는
 * 키오스크가 하루 종일 백화면으로 방치된다. 트리가 죽은 뒤에는 라우터
 * 내비게이션이 불가능하므로 전체 리로드로 상태까지 함께 초기화한다.
 */
import { Component, type ReactNode } from 'react';
import { isMirrorMode } from '../lib/mirrorMode';

const RELOAD_DELAY_MS = 5_000;

export default class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[boundary] 렌더 예외 — 처음 화면으로 복귀 예약', error);
    setTimeout(() => {
      window.location.replace(isMirrorMode() ? '/kiosk' : '/');
    }, RELOAD_DELAY_MS);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            textAlign: 'center',
            padding: '24px',
          }}
        >
          <p style={{ fontSize: '1.4rem', fontWeight: 600 }}>잠시 문제가 발생했어요</p>
          <p>곧 처음 화면으로 돌아갑니다.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
