import { StudioIntro } from "./StudioIntro";
import { FitOverview } from "./FitOverview";
import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { Badge, Button, Card, CardContent } from "../ui/shadcn";
import { SectionIntro, FooterCta } from "./HomeSections";
import { workplaceCategories } from "../../data/workplaceStories";

export function WorkplaceHome({ onNext }) {
  return (
    <>
      <StudioIntro mode="workplace" onNext={onNext} />

      <section className="mode-section" id="workplace-scenarios">
        <SectionIntro highlight eyebrow="상황별 연습" title="출근·업무·퇴근 대화를 이어서 연습해요" text="상황을 미리 고를 필요 없이, 각 단계의 안내를 보고 대화를 이어가요." />
        <div className="workplace-scenario-grid">
          {workplaceCategories.map((category, index) => (
            <Card className="workplace-scenario-card" key={category.id}>
              <CardContent>
                <span className="scenario-number">0{index + 1}</span>
                <h3>{category.label}</h3>
                <p>{category.summary}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="workplace-scenario-action">
          <Button type="button" onClick={onNext}>연습 시작하기 <ArrowRight size={15} /></Button>
        </div>
      </section>

      <section className="mode-section mode-section--canvas workplace-compare-section">
        <SectionIntro eyebrow="표현 비교" title={<>같은 내용도<br />더 편하게 전달할 수 있어요</>} text="대화 전후 표현을 나란히 보며 상대가 이해하기 쉬운 순서와 말투를 익혀요." />
        <DialogueComparison />
      </section>

      <section className="mode-section workplace-feedback">
        <div>
          <SectionIntro eyebrow="4-Fit 피드백" title={<>대화 습관 네 가지를<br />함께 살펴봐요</>} text="응답, 목소리, 표정, 자세를 하나의 대화 맥락으로 설명해요." />
          <FitOverview />
        </div>
        <Card className="coaching-card">
          <CardContent>
            <Badge variant="outline">이번 코칭</Badge>
            <h3>의견이 다를 때는<br />공통 목표부터 확인해보세요</h3>
            <p>“일정을 지키면서 품질도 확보하려면 어떤 선택이 좋을까요?”처럼 함께 풀 문제로 바꾸면 대화가 부드러워져요.</p>
            <Button variant="outline" type="button" onClick={onNext}>연습 시작하기</Button>
          </CardContent>
        </Card>
      </section>

      <FooterCta title="어려운 대화 전에 먼저 연습해보세요" text="출근·업무·퇴근의 세 단계를 따라 대화를 이어가요." button="연습 시작하기" onNext={onNext} />
    </>
  );
}

function DialogueComparison() {
  return (
    <div className="dialogue-comparison">
      <div className="dialogue-version dialogue-version--before">
        <Badge variant="neutral">연습 전</Badge>
        <h3>“일정이 조금 어려울 것 같은데요…”</h3>
        <p>상황과 필요한 결정이 드러나지 않아 상대가 다시 물어봐야 해요.</p>
      </div>
      <ArrowRight className="dialogue-comparison__arrow" size={28} aria-hidden="true" />
      <div className="dialogue-version dialogue-version--after">
        <Badge variant="outline">코칭 반영</Badge>
        <h3>“현재 일정은 이틀 조정이 필요합니다. 오늘 우선순위를 함께 정하고 싶어요.”</h3>
        <p>결론, 이유, 요청을 순서대로 말해 상대가 바로 판단할 수 있어요.</p>
      </div>
    </div>
  );
}
