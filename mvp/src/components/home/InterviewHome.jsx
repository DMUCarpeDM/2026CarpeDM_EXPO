import { StudioIntro } from "./StudioIntro";
import { FitOverview } from "./FitOverview";
import { Sparkles } from "reicon-react/icons/Sparkles";
import { Badge, Progress } from "../ui/shadcn";
import { fitMetrics, SectionIntro, FooterCta } from "./HomeSections";

export function InterviewHome({ onNext }) {
  return (
    <>
      <StudioIntro mode="interview" onNext={onNext} />
      <section className="mode-section mode-section--canvas interview-report-showcase" id="interview-report">
        <SectionIntro eyebrow="4-Fit 코칭 리포트" title={<>한 번의 답변에서도<br />다음 행동을 찾아요</>} text="응답, 목소리, 표정, 자세를 함께 살펴보고 다음 답변에서 바꿀 행동을 알려드려요." align="center" />
        <FitOverview />
        <div className="product-stage" aria-label="면접 코칭 리포트 예시">
          <div className="product-stage__label"><span>면접 코칭 리포트 미리보기</span><Badge variant="neutral">예시 점수 · 실제 결과 아님</Badge></div>
          <div className="product-stage__body"><InterviewReportPreview /></div>
        </div>
      </section>
      <FooterCta title="다음 답변을 더 또렷하게 말해보세요" text="직무를 고르면 면접 연습을 바로 시작할 수 있어요." button="연습할 직무 고르기" onNext={onNext} />
    </>
  );
}

function InterviewReportPreview() {
  return (
    <div className="interview-report-preview">
      <div className="report-preview-summary">
        <Badge variant="outline">연습 결과 예시</Badge>
        <small>개발자 직무 · 실무 면접</small>
        <strong>82</strong>
        <span>/ 100</span>
        <h3>핵심부터 답한 점이 좋았어요</h3>
        <p>이제 경험을 한 가지 덧붙이면 답변의 근거가 더 또렷해져요.</p>
      </div>
      <div className="report-preview-fits">
        {fitMetrics.map(({ icon: Icon, ...metric }) => (
          <div className="report-preview-fit" key={metric.label}>
            <div><span className="report-preview-fit__label"><Icon size={19} aria-hidden="true" />{metric.label}</span><b>{metric.value}</b></div>
            <Progress value={metric.value} aria-label={metric.label + " 예시 점수"} />
            <small>{metric.detail}</small>
          </div>
        ))}
      </div>
      <div className="report-preview-action" id="interview-feedback">
        <span><Sparkles size={16} /> 다음 답변에서 바꿀 한 가지</span>
        <h3>결론 뒤에 구체적인 경험을 한 문장으로 붙여보세요</h3>
        <p>“프로젝트 일정이 늦어졌을 때 우선순위를 다시 정해 마감일을 지킨 경험이 있습니다.”</p>
      </div>
    </div>
  );
}
