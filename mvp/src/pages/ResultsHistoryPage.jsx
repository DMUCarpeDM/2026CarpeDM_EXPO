import { ArrowRight } from "reicon-react/icons/ArrowRight";
import { CalendarDate } from "reicon-react/icons/CalendarDate";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { Button, Card, CardContent } from "../components/ui/shadcn";
import { IconGlyph } from "../components/ui/IconGlyph";
import { ResultPage } from "./ResultPage";

function formatScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? `${Math.round(score)}점` : "분석 대기";
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
        <p className="public-eyebrow">Results</p>
        <h1>결과 및 기록</h1>
        <p>연습을 마치면 현재 리포트를 확인할 수 있어요. 최근 기록은 서버에서 불러온 내역이 있을 때 표시해요.</p>
        <Button size="lg" type="button" onClick={onPractice}>AI 연습하러 가기 <ArrowRight size={18} /></Button>
      </header>

      <section className="records-summary" aria-label="결과 및 기록 안내">
        <Card className="public-feature-card records-current-card">
          <CardContent>
            <span className="public-icon public-icon--blue"><IconGlyph icon="report" size={28} /></span>
            <h2>현재 결과</h2>
            <p>아직 표시할 완료 리포트가 없어요. 연습을 마치면 4-Fit 점수와 AI 코칭 카드가 이곳에 연결됩니다.</p>
          </CardContent>
        </Card>
        <Card className="public-feature-card records-current-card">
          <CardContent>
            <span className="public-icon public-icon--accent"><Refresh3 size={24} /></span>
            <h2>재연습</h2>
            <p>리포트에서 다음에 바꿀 행동을 확인하고 다시 연습해 보세요. 이전 기록이 제공되면 점수 변화도 확인할 수 있어요.</p>
          </CardContent>
        </Card>
      </section>

      <section className="public-section" aria-labelledby="records-list-title">
        <div className="public-section__copy">
          <p className="public-eyebrow">History</p>
          <h2 id="records-list-title">최근 기록</h2>
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
                <h3>현재 불러온 기록이 없어요</h3>
                <p>아직 연습을 마치지 않았거나 기록을 불러오지 못했을 수 있어요. 저장된 기록이 없다는 뜻은 아니에요.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </section>
  );
}
