import { useEffect } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import OperatorPanel from './components/OperatorPanel';
import AdminPage from './features/admin/AdminPage';
import { LoginPage, SignupPage } from './features/auth/AuthPages';
import ClaimPage from './features/claim/ClaimPage';
import KioskPage from './features/kiosk/KioskPage';
import MyResultsPage from './features/me/MyResultsPage';
import OnboardingPage from './features/onboarding/OnboardingPage';
import OrgDashboardPage from './features/org/OrgDashboardPage';
import ReportPage from './features/report/ReportPage';
import RoleplayPage from './features/roleplay/RoleplayPage';
import { restoreGlassesMode, useGlassesMode } from './lib/glassesMode';
import { useKioskIdleReturn } from './lib/kioskIdle';
import { restoreMirrorMode, useMirrorMode } from './lib/mirrorMode';
import { useAuthStore } from './stores/authStore';

restoreMirrorMode(); // 부팅 시 저장된 모드를 <html> 클래스에 복원
restoreGlassesMode();

function Shell() {
  const location = useLocation();
  const isKiosk = location.pathname === '/kiosk';
  const mirror = useMirrorMode();
  const glasses = useGlassesMode();
  const me = useAuthStore((s) => s.me);
  const loadMe = useAuthStore((s) => s.load);
  useKioskIdleReturn(); // 미러 모드 전 화면 무조작 복귀 — 어디서 방치돼도 대기 화면으로
  useEffect(() => {
    loadMe(); // 로그인 상태에 따라 내 결과·기관 링크 노출 (S-B2B-118)
  }, [loadMe]);
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<OnboardingPage />} />
        <Route path="/kiosk" element={<KioskPage />} />
        <Route path="/roleplay/:sessionId" element={<RoleplayPage />} />
        <Route path="/report/:sessionId" element={<ReportPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/org" element={<OrgDashboardPage />} />
        <Route path="/me/results" element={<MyResultsPage />} />
        <Route path="/claim" element={<ClaimPage />} />
      </Routes>
      {(mirror || glasses) && <OperatorPanel />}
      {!isKiosk && !mirror && !glasses && (
        <footer className="app-footer">
          <span>4-Fit 미러팅 · CarpeDM · 2026 동양미래EXPO</span>
          <nav>
            <Link to="/">체험</Link>
            <Link to="/kiosk">전시</Link>
            {me ? (
              <>
                <Link to="/me/results">내 결과</Link>
                {me.org_role === 'manager' && <Link to="/org">기관</Link>}
              </>
            ) : (
              <Link to="/login">로그인</Link>
            )}
            <Link to="/admin">운영</Link>
          </nav>
        </footer>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
