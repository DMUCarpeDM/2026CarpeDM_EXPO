import React from "react";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { Bolt } from "reicon-react/icons/Bolt";
import { Coins } from "reicon-react/icons/Coins";
import { LockKeyhole } from "reicon-react/icons/LockKeyhole";
import { ShieldCheck } from "reicon-react/icons/ShieldCheck";
import { Sparkles } from "reicon-react/icons/Sparkles";
import { homeAdvantages, homeFitSnapshot } from "../data/homeContent";

// 로컬 AI 서사 — 제약이 아니라 대표 강점: 프라이버시·비용·오프라인
const trustBadges = [
  { icon: ShieldCheck, label: "100% 온디바이스 AI 분석" },
  { icon: LockKeyhole, label: "영상·음성 서버 미전송" },
  { icon: Coins, label: "API 비용 0원" },
  { icon: Bolt, label: "인터넷 없이도 동작" },
];

export function HomePage({ onNext }) {
  return (
    <section className="page home-page">
      <div className="home-hero">
        <div className="hero-copy">
          <span className="hero-pill"><Sparkles size={17} /> AI와 대화를 연습해요</span>
          <h1>AI와 함께<br /><em>실제 직장 대화를</em> 연습해요</h1>
          <p>실제 업무 상황을 AI와 연습해요. 대화가 끝나면 잘한 점과 다음에 바꿔볼 점을 바로 알려드려요.</p>
          <div className="hero-actions">
            <PrimaryButton icon={ArrowRight} label="연습 시작하기" onClick={onNext} wide leadingIcon={false} />
          </div>
          <div className="hero-social-proof" aria-label="이용자 사회적 증거">
            <ProfileAvatar initials="JH" tone="blue" />
            <ProfileAvatar initials="SK" tone="violet" />
            <ProfileAvatar initials="YR" tone="mint" />
            <span><b>20,000+</b>명이<br />대화를 연습하고 있어요.</span>
          </div>
          <div className="home-trust-strip" aria-label="프라이버시와 접근성 약속">
            {trustBadges.map(({ icon: Icon, label }) => (
              <span className="trust-badge" key={label}><Icon size={15} /> {label}</span>
            ))}
          </div>
        </div>
      </div>

      <section className="home-fit-section" aria-label="4-Fit 코칭 분석 소개">
        <div className="home-section-head"><span>4-FIT 코칭 분석</span><h2>4가지 신호로<br />말하는 방식을 살펴봐요</h2><p>응답·목소리·시선·자세를 함께 살펴보고, 다음 연습에 바로 쓸 수 있는 팁을 알려드려요.</p></div>
        <div className="home-fit-board">
          <div className="home-fit-grid">{homeFitSnapshot.map((fit) => <HomeFitCard key={fit.label} {...fit} />)}</div>
          <div className="home-radar-card"><span>4-Fit 종합 점수</span><HomeRadarChart fits={homeFitSnapshot} /><p><i /> 내 점수&nbsp;&nbsp; <b /> 평균</p></div>
        </div>
      </section>

      <section className="home-advantages" aria-label="Mirror-Ting 서비스 장점">
        <div className="home-advantages-head">
          <span>매일의 대화를 위한 AI 코칭</span>
          <h2>대화를 더 편하게 만드는<br />5가지 연습 방법</h2>
          <p>연습하고, 돌아보고, 다음 대화를 준비해요.</p>
        </div>
        <div className="home-advantages-grid">
          {homeAdvantages.map((item) => (
            <article className="home-advantage-card" key={item.title}>
              <img src={item.image} alt="" aria-hidden="true" />
              <h3>{item.title.split("\n").map((line) => <React.Fragment key={line}>{line}<br /></React.Fragment>)}</h3>
              <p>{item.text}</p>
              <small>{item.detail}</small>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function ProfileAvatar({ initials, tone = "blue" }) {
  return <span className={`profile-avatar ${tone} md`} aria-hidden="true">{initials}</span>;
}

function PrimaryButton({ icon: Icon, label, onClick, wide = false, leadingIcon = true }) {
  return (
    <button className={`primary-button ${wide ? "wide" : ""}`} type="button" onClick={onClick}>
      {leadingIcon && <Icon size={22} />}
      {label}
      <ArrowRight size={21} />
    </button>
  );
}

function HomeFitCard({ image, label, short, score, tone, text }) {
  return <article className={`home-fit-card ${tone}`}><span aria-label={label}><img src={image} alt="" aria-hidden="true" /><b>{short}</b><small>({label.split("(")[1]}</small></span><strong>{score}<small>/100</small></strong><b>{score >= 80 ? "좋아요" : "보통이에요"}</b><MiniLineChart tone={tone} /><p>{text}</p></article>;
}

function MiniLineChart({ tone }) {
  const paths = {
    response: "M3 42 L20 36 L36 24 L55 31 L73 26 L91 13 L111 13 L128 5",
    voice: "M3 43 L19 35 L35 25 L52 32 L70 30 L88 20 L108 20 L128 7",
    eye: "M3 42 L18 36 L35 24 L52 31 L69 26 L86 12 L107 12 L128 4",
    posture: "M3 44 L20 34 L36 23 L52 31 L69 25 L87 18 L106 6 L128 4",
  };
  const colors = { response: "#0969f7", voice: "#6a4df5", eye: "#0ea5e9", posture: "#ff8a00" };
  const endY = tone === "voice" ? 7 : tone === "response" ? 5 : 4;
  return <svg className="mini-line-chart" viewBox="0 0 132 52" role="img" aria-label={`${tone} 점수 추이`}><defs><linearGradient id={`mini-line-fill-${tone}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={colors[tone]} stopOpacity=".36" /><stop offset="100%" stopColor={colors[tone]} stopOpacity="0" /></linearGradient></defs><path d="M3 48H129" className="mini-line-baseline" /><path d={`${paths[tone]} L128 48 L3 48 Z`} className="mini-line-area" fill={`url(#mini-line-fill-${tone})`} /><path d={paths[tone]} className="mini-line-path" /><circle cx="128" cy={endY} r="2.7" /></svg>;
}

function HomeRadarChart({ fits }) {
  const axes = [[100, 22], [178, 100], [100, 178], [22, 100]];
  const labels = [[100, 12, "응답"], [190, 104, "목소리"], [100, 195, "시선"], [10, 104, "자세"]];
  const pointAt = (index, score) => {
    const [x, y] = axes[index];
    const scale = score / 100;
    return `${100 + (x - 100) * scale},${100 + (y - 100) * scale}`;
  };
  const scorePoints = fits.map((fit, index) => pointAt(index, fit.score)).join(" ");
  const averagePoints = [72, 74, 76, 72].map((score, index) => pointAt(index, score)).join(" ");

  return <svg className="home-radar-chart" viewBox="0 0 200 200" role="img" aria-label="응답 82점, 목소리 76점, 시선 88점, 자세 71점의 4-Fit 종합 점수">
    {[100, 75, 50, 25].map((scale) => <polygon className="radar-grid" key={scale} points={axes.map(([x, y]) => `${100 + (x - 100) * scale / 100},${100 + (y - 100) * scale / 100}`).join(" ")} />)}
    {axes.map(([x, y], index) => <line className="radar-axis" key={index} x1="100" y1="100" x2={x} y2={y} />)}
    <polygon className="radar-average" points={averagePoints} />
    <polygon className="radar-score" points={scorePoints} />
    {fits.map((fit, index) => { const [x, y] = pointAt(index, fit.score).split(","); return <circle className="radar-point" key={fit.label} cx={x} cy={y} r="3.4" />; })}
    {labels.map(([x, y, label]) => <text className="radar-label" key={label} x={x} y={y} textAnchor={x === 100 ? "middle" : x < 100 ? "end" : "start"}>{label}</text>)}
  </svg>;
}
