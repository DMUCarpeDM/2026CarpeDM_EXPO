import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import AdminPage from './features/admin/AdminPage';
import { LoginPage, SignupPage } from './features/auth/AuthPages';
import KioskPage from './features/kiosk/KioskPage';
import OnboardingPage from './features/onboarding/OnboardingPage';
import ReportPage from './features/report/ReportPage';
import RoleplayPage from './features/roleplay/RoleplayPage';

function Shell() {
  const location = useLocation();
  const isKiosk = location.pathname === '/kiosk';
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
      </Routes>
      {!isKiosk && (
        <footer className="app-footer">
          <span>4-Fit 미러팅 · CarpeDM · 2026 동양미래EXPO</span>
          <nav>
            <Link to="/">체험</Link>
            <Link to="/kiosk">전시</Link>
            <Link to="/login">로그인</Link>
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
