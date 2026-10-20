import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { HomePage } from './pages/HomePage';
import { TopNav, MobileMenuSheet } from './components/navigation/AppNavigation';
import './styles.css';
import './styles/brand-mark.css';
import './styles/commerce.css';

function MainOnly() {
  const [mode, setMode] = useState('workplace');
  const [prompt, setPrompt] = useState('');
  const [notice, setNotice] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const jump = id => document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' });
  const focusPrompt = () => { jump('home-scenario-prompt'); document.getElementById('home-scenario-prompt')?.focus(); };
  const navigate = target => {
    setMenuOpen(false);
    if (target === 'intro') jump(`${mode}-overview`);
    else if (target === 'service' || target === 'home') window.scrollTo({ top: 0 });
    else { setNotice(true); window.scrollTo({ top: 0 }); }
  };
  return <MotionConfig reducedMotion="user"><div className={`app-shell home-mode home-mode-${mode}`}>
    <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
    <TopNav active="home" menuOpen={menuOpen} onMenuOpen={setMenuOpen} onNavigate={navigate} />
    <MobileMenuSheet open={menuOpen} active="home" onClose={() => setMenuOpen(false)} onNavigate={navigate} />
    <main className="screen-frame" id="main-content">
      {notice && <p className="demo-mode-notice" role="status">메인 화면 미리보기예요. AI 채팅과 계정 기능은 이 배포본에 포함되지 않아요. <button type="button" onClick={() => setNotice(false)}>닫기</button></p>}
      <HomePage serviceMode={{ id: mode }} prompt={prompt} onPrompt={setPrompt} onModePick={setMode} onModeSelect={focusPrompt} onNext={() => { setNotice(true); window.scrollTo({ top: 0 }); }} />
    </main>
  </div></MotionConfig>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><MainOnly /></React.StrictMode>);
