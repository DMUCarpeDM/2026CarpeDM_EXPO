import { ServiceIntroduction } from "./ServiceIntroduction";
import { FooterCta } from "./HomeSections";

export function WorkplaceHome({ onNext, composer }) {
  return (
    <>
      <ServiceIntroduction mode="workplace" onNext={onNext} />
      <FooterCta composer={composer} title="어떤 대화를 연습하고 싶나요?" text="누구와 어떤 이야기를 나눌지 적으면 AI가 대화 상대가 돼요." button="연습 시작하기" onNext={onNext} />
    </>
  );
}
