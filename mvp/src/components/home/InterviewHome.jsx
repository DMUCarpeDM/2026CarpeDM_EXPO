import { ServiceIntroduction } from "./ServiceIntroduction";
import { FooterCta } from "./HomeSections";

export function InterviewHome({ onNext, composer }) {
  return (
    <>
      <ServiceIntroduction mode="interview" onNext={onNext} />
      <FooterCta composer={composer} title="연습할 면접 상황을 적어보세요" text="지원할 직무와 연습할 질문을 적으면 AI가 면접관 역할을 맡아요." button="면접 연습하기" onNext={onNext} />
    </>
  );
}
