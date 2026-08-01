import { Briefcase4 } from "reicon-react/icons/Briefcase4";
import { ChartTrend } from "reicon-react/icons/ChartTrend";
import { ChevronRight } from "reicon-react/icons/ChevronRight";
import { DocumentText2 } from "reicon-react/icons/DocumentText2";
import { Download } from "reicon-react/icons/Download";
import { GraphUp } from "reicon-react/icons/GraphUp";
import { InfoCircle } from "reicon-react/icons/InfoCircle";
import { Settings } from "reicon-react/icons/Settings";
import { Target } from "reicon-react/icons/Target";
import { User } from "reicon-react/icons/User";
import { UserCircle } from "reicon-react/icons/UserCircle";
import { Widget } from "reicon-react/icons/Widget";

// 좌측 사이드바 대시보드 골격. 성과 리포트/비교 분석 화면을 감싸는 공용 셸이에요.
// 피그마의 대시보드 레이아웃(사이드바 + 상단 브레드크럼)을 그대로 옮겼습니다.
const NAV_GROUPS = [
  {
    label: "연습",
    items: [
      { id: "home", label: "대시보드", Icon: Widget },
      { id: "role", label: "연습 목표", Icon: Target },
      { id: "role", label: "시나리오", Icon: Briefcase4, key: "scenario" },
      { id: "role", label: "맞춤 캐릭터", Icon: UserCircle, key: "character" },
    ],
  },
  {
    label: "분석",
    items: [
      { id: "result", label: "성과 리포트", Icon: DocumentText2 },
      { id: "compare", label: "비교 분석", Icon: ChartTrend },
      { id: "compare", label: "성장 인사이트", Icon: GraphUp, key: "insight" },
    ],
  },
  {
    label: "일반",
    items: [
      { id: "home", label: "프로필", Icon: User, key: "profile" },
      { id: "home", label: "설정", Icon: Settings, key: "settings" },
    ],
  },
];

// 사이드바에서 어떤 항목이 활성 상태인지 결정해요. feedback(자세히 보기)은 성과 리포트에 속합니다.
function isActive(item, active) {
  if (item.key) return false;
  if (item.id === "result") return active === "result" || active === "feedback";
  return item.id === active;
}

export function DashboardSidebar({ active, onNavigate }) {
  return (
    <aside className="dashboard-sidebar">
      <button className="sidebar-brand" type="button" onClick={() => onNavigate("home")}>
        <span className="brand-mark" aria-hidden="true"><img src="/icons/app-icon-192.png" alt="" /></span>
        <span>Mirror-Ting</span>
      </button>
      <nav className="sidebar-nav" aria-label="대시보드 메뉴">
        {NAV_GROUPS.map((group) => (
          <div className="sidebar-group" key={group.label}>
            <p className="sidebar-group-label">{group.label}</p>
            {group.items.map((item) => (
              <button
                key={item.key || item.id}
                type="button"
                className={`sidebar-link ${isActive(item, active) ? "active" : ""}`}
                onClick={() => onNavigate(item.id)}
                aria-current={isActive(item, active) ? "page" : undefined}
              >
                <item.Icon size={20} className="mirror-ting-icon" weight="Outline" strokeWidth={1.5} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-user">
        <span className="sidebar-avatar" aria-hidden="true">체</span>
        <div>
          <strong>체험자</strong>
          <small>Pro 플랜</small>
        </div>
      </div>
    </aside>
  );
}

function Breadcrumb({ trail }) {
  return (
    <nav className="report-breadcrumb" aria-label="현재 위치">
      {trail.map((label, index) => (
        <span key={label} className={index === trail.length - 1 ? "current" : ""}>
          {label}
          {index < trail.length - 1 && <ChevronRight size={15} aria-hidden="true" />}
        </span>
      ))}
    </nav>
  );
}

export function ReportTopBar({ trail, onNavigate, onDownload, newPracticeLabel = "새로운 연습" }) {
  return (
    <header className="report-topbar">
      <Breadcrumb trail={trail} />
      <div className="report-topbar-actions">
        <button type="button" className="topbar-ghost" onClick={() => onNavigate("home")}>
          <InfoCircle size={18} aria-hidden="true" /> 도움말
        </button>
        <button type="button" className="topbar-ghost" onClick={onDownload}>
          <Download size={18} aria-hidden="true" /> 리포트 다운로드
        </button>
        <button type="button" className="topbar-primary" onClick={() => onNavigate("role")}>
          {newPracticeLabel}
        </button>
      </div>
    </header>
  );
}

// 리포트 계열 화면을 감싸는 공용 셸: 좌측 사이드바 + 상단 브레드크럼 + 콘텐츠 영역.
export function ReportShell({ active, trail, onNavigate, onDownload, newPracticeLabel, children }) {
  return (
    <div className="report-shell">
      <DashboardSidebar active={active} onNavigate={onNavigate} />
      <div className="report-main">
        <ReportTopBar trail={trail} onNavigate={onNavigate} onDownload={onDownload} newPracticeLabel={newPracticeLabel} />
        <div className="report-content">{children}</div>
      </div>
    </div>
  );
}
