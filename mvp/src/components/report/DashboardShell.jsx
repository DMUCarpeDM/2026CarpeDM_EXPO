import { ChartTrend } from "reicon-react/icons/ChartTrend";
import { ChevronRight } from "reicon-react/icons/ChevronRight";
import { DocumentText2 } from "reicon-react/icons/DocumentText2";
import { Download } from "reicon-react/icons/Download";
import { GraphUp } from "reicon-react/icons/GraphUp";
import { Share3 } from "reicon-react/icons/Share3";
import { Target } from "reicon-react/icons/Target";
import { Widget } from "reicon-react/icons/Widget";

// 좌측 사이드바 대시보드 골격. 성과 리포트/비교 분석 화면을 감싸는 공용 셸이에요.
// 모든 항목은 실제로 이동 가능한 화면만 담아요 — 눌러도 반응 없는 장식 메뉴는 전시 신뢰를 깎습니다.
const NAV_GROUPS = [
  {
    label: "연습",
    items: [
      { id: "home", label: "홈", Icon: Widget },
      { id: "role", label: "새 연습 설정", Icon: Target },
    ],
  },
  {
    label: "분석",
    items: [
      { id: "result", label: "성과 리포트", Icon: DocumentText2 },
      { id: "feedback", label: "상세 분석", Icon: GraphUp },
      { id: "compare", label: "비교 분석", Icon: ChartTrend },
      { id: "share", label: "저장·공유", Icon: Share3 },
    ],
  },
];

function isActive(item, active) {
  return item.id === active;
}

export function DashboardSidebar({ active, onNavigate }) {
  return (
    <aside className="dashboard-sidebar">
      <button className="sidebar-brand" type="button" onClick={() => onNavigate("home")}>
        <span className="brand-mark" aria-hidden="true">M</span>
        <span>Mirrorting</span>
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
                <item.Icon size={20} className="mirrorting-icon" weight="Outline" strokeWidth={1.5} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <p className="sidebar-footnote">4-Fit Mirrorting<br />동양미래EXPO 2026 · CarpeDM</p>
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
