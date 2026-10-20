import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { CalendarDate } from "reicon-react/icons/CalendarDate";
import { Button, Card, CardContent } from "../components/ui/shadcn";
import { IconGlyph } from "../components/ui/IconGlyph";
import { ResultPage } from "./ResultPage";

function formatScore(value) {
  if (value == null || String(value).trim() === "") return "점수 없음";
  const score = Number(value);
  return Number.isFinite(score) ? `${Math.round(score)}점` : "점수 없음";
}

export function ResultsHistoryPage(props) {
  const { report, history = [], progress, onPractice, onResultBack } = props;
  if (report || progress) {
    return <ResultPage {...props} onPrev={onResultBack} />;
  }

  const recentItems = Array.isArray(history) ? history.slice(-3).reverse() : [];

  return (
    <section className="page public-page records-page">
      <header className="public-hero public-hero--compact">
        <p className="public-eyebrow">MIRROR-TING / 돌아보기</p>
        <h1>연습 기록</h1>
        <p>현재 연습의 피드백과 최근 기록을 확인해요.</p>
      </header>

      <section className="records-summary" aria-label="현재 결과 안내">
        <Card className="public-feature-card records-current-card">
          <CardContent>
            <span className="public-icon public-icon--blue"><IconGlyph icon="report" size={28} /></span>
            <div><h2>아직 확인할 피드백이 없어요</h2>
            <p>연습을 마치면 답변·목소리·표정·자세의 4-Fit 결과와 다음에 바꿀 행동을 확인할 수 있어요.</p></div>
            <Button size="lg" type="button" onClick={onPractice}>연습할 상황 적기 <ArrowRight size={18} aria-hidden="true" /></Button>
          </CardContent>
        </Card>
      </section>

      <section className="public-section" aria-labelledby="records-list-title">
        <div className="public-section__copy">
          <p className="public-eyebrow">연습 기록</p>
          <h2 id="records-list-title">최근 기록</h2>
          <p>최근 기록을 최대 3개까지 보여드려요. 이전 피드백의 상세 화면은 준비 중이에요.</p>
        </div>
        <div className="records-list">
          {recentItems.length ? recentItems.map((item, index) => (
            <Card className="records-item" key={item.session_id || item.attempt_id || index}>
              <CardContent>
                <CalendarDate size={18} aria-hidden="true" />
                <div>
                  <strong>{item.scenario_title || item.title || `${index + 1}번째 연습`}</strong>
                  <p>{String(item.started_at || item.finished_at || "날짜 정보 없음").slice(0, 10)}</p>
                </div>
                <b>{formatScore(item.total_score)}</b>
              </CardContent>
            </Card>
          )) : (
            <Card className="records-empty">
              <CardContent>
                <IconGlyph icon="shield" size={28} />
                <h3>최근 기록을 확인할 수 없어요</h3>
                <p>아직 완료한 연습이 없거나 기록을 불러오지 못했을 수 있어요.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </section>
  );
}
