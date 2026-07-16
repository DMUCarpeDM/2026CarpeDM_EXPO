import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { ShieldCheck } from "reicon-react/icons/ShieldCheck";
import { Clock3 } from "reicon-react/icons/Clock3";
import { motion } from "framer-motion";
import { IconGlyph } from "../components/ui/IconGlyph";
import { PageTitle } from "../components/report/ResultPrimitives";

// 이용 방법 안내 화면. 상단 네비의 '이용 방법'에서 진입해요.
// 관람객이 연습을 시작하기 전에 전체 흐름(설정 → 연습 → 리포트)을 한눈에 볼 수 있어요.
const GUIDE_STEPS = [
  { icon: "role", step: "STEP 1", title: "기본 설정", text: "대화할 상대 역할과 난이도를 골라요.", detail: "동료·상사·임원·고객 중 선택" },
  { icon: "briefcase", step: "STEP 2", title: "상황·목표 선택", text: "연습할 업무 상황과 이번 목표를 정해요.", detail: "보고·회고·조율·피드백 등" },
  { icon: "chat", step: "STEP 3", title: "AI와 연습하기", text: "카메라와 마이크를 켜고 AI와 실제처럼 대화해요.", detail: "약 5분, 텍스트 입력도 가능" },
  { icon: "report", step: "STEP 4", title: "리포트 확인", text: "4-Fit 분석과 코칭을 확인하고 다시 연습하며 비교해요.", detail: "결과 보기 · 내 기록에서 확인" },
];

const GUIDE_FITS = [
  { icon: "response", tone: "response", title: "응답", text: "핵심을 먼저 말했는지 살펴봐요." },
  { icon: "voice", tone: "voice", title: "목소리", text: "속도와 또렷함을 살펴봐요." },
  { icon: "eye", tone: "eye", title: "시선", text: "상대와 시선을 맞췄는지 살펴봐요." },
  { icon: "posture", tone: "posture", title: "자세", text: "안정적인 자세를 유지했는지 살펴봐요." },
];

export function GuidePage({ onStart }) {
  return (
    <motion.section className="page guide-page" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
      <PageTitle eyebrow="이용 방법" title="4단계로 대화를 연습해요" subtitle="설정부터 리포트까지, 한 번의 연습은 약 5분이면 충분해요." />

      <ol className="guide-steps">
        {GUIDE_STEPS.map((item, index) => (
          <li className="guide-step-card card" key={item.title}>
            <span className="guide-step-num">{item.step}</span>
            <span className="guide-step-icon"><IconGlyph icon={item.icon} size={30} /></span>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
            <small>{item.detail}</small>
            {index < GUIDE_STEPS.length - 1 && <ArrowRight size={20} className="guide-step-arrow" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <section className="guide-fit-section card" aria-label="4-Fit 분석 소개">
        <div className="guide-fit-head">
          <h2>연습이 끝나면 4-Fit로 분석해요</h2>
          <p>응답·목소리·시선·자세 네 가지 신호를 함께 살펴보고, 다음 연습에서 바로 써볼 팁을 알려드려요.</p>
        </div>
        <div className="guide-fit-grid">
          {GUIDE_FITS.map((fit) => (
            <div className={`guide-fit-item ${fit.tone}`} key={fit.title}>
              <IconGlyph icon={fit.icon} size={26} />
              <strong>{fit.title}</strong>
              <p>{fit.text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="guide-notes">
        <p><Clock3 size={18} aria-hidden="true" /> 한 번의 연습은 약 5분이에요. 마친 뒤 같은 상황을 다시 연습하면 기록을 비교할 수 있어요.</p>
        <p><ShieldCheck size={18} aria-hidden="true" /> 카메라·음성은 분석에만 사용하고 계정에 저장하지 않아요. 기록은 이 기기에 익명으로 남아요.</p>
      </div>

      <div className="guide-cta">
        <button type="button" className="primary-button wide" onClick={onStart}>연습 시작하기 <ArrowRight size={21} /></button>
      </div>
    </motion.section>
  );
}
