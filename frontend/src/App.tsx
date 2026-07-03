import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import AdminPage from './features/admin/AdminPage';
import { LoginPage, SignupPage } from './features/auth/AuthPages';
import OnboardingPage from './features/onboarding/OnboardingPage';
import ReportPage from './features/report/ReportPage';
import RoleplayPage from './features/roleplay/RoleplayPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<OnboardingPage />} />
          <Route path="/roleplay/:sessionId" element={<RoleplayPage />} />
          <Route path="/report/:sessionId" element={<ReportPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
        <footer className="app-footer">
          <span>4-Fit 미러팅 · CarpeDM · 2026 동양미래EXPO</span>
          <nav>
            <Link to="/">체험</Link>
            <Link to="/login">로그인</Link>
            <Link to="/admin">운영</Link>
          </nav>
        </footer>
      </div>
    </BrowserRouter>
  );
}
