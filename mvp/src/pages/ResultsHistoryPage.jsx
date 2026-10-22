import { useState } from "react";
import { ResultPage } from "./ResultPage";

const titleOf = item => item.scenario_title || item.title || '대화 연습';
const idOf = (item, index) => String(item.session_id || item.attempt_id || `${item.started_at || item.finished_at || titleOf(item)}-${index}`);
const statusOf = item => ['in_progress', 'prepare', 'simulation'].includes(item.status) ? '진행 중' : item.status === 'completed' || item.finished_at || item.total_score != null ? '완료' : '기록';
const dateOf = item => String(item.finished_at || item.started_at || '').slice(0, 10);

export function ResultsHistoryPage(props) {
  if (props.report || props.progress) return <ResultPage {...props} onPrev={props.onResultBack} />;
  return <PracticeLibrary {...props} />;
}

function PracticeLibrary({ history = [], onPractice, onRepeat }) {
  const [tab, setTab] = useState('전체');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('전체');
  const [sort, setSort] = useState('newest');
  const [selected, setSelected] = useState(null);
  const [detailTab, setDetailTab] = useState('상황');
  const [favorites, setFavorites] = useState(() => { try { return JSON.parse(localStorage.getItem('mirror-record-favorites') || '[]'); } catch { return []; } });
  const items = (Array.isArray(history) ? history : []).map((item,index) => ({ ...item, recordId: idOf(item,index) }));
  const star = id => { const next = favorites.includes(id) ? favorites.filter(value => value !== id) : [...favorites,id]; setFavorites(next); localStorage.setItem('mirror-record-favorites',JSON.stringify(next)); };
  const visible = items.filter(item => (!query || titleOf(item).toLowerCase().includes(query.toLowerCase())) && (kind === '전체' || (item.service_mode || item.service_mode_id) === kind) && (tab !== '즐겨찾기' || favorites.includes(item.recordId)) && (!['진행 중','완료'].includes(tab) || statusOf(item) === tab)).sort((a,b) => sort === 'title' ? titleOf(a).localeCompare(titleOf(b),'ko') : sort === 'oldest' ? dateOf(a).localeCompare(dateOf(b)) : dateOf(b).localeCompare(dateOf(a)));
  const rows = tab === '최근' ? visible.slice(0,10) : visible;
  const open = item => { setSelected(item); setDetailTab('상황'); window.scrollTo(0,0); };
  if (selected) {
    const messages = selected.messages || selected.transcript || [];
    return <section className="page practice-library record-detail"><button type="button" className="library-back" onClick={() => setSelected(null)}>← 연습 기록으로</button><header className="library-heading"><div><p>연습 상세 · {statusOf(selected)}</p><h1>{titleOf(selected)}</h1><p>{dateOf(selected) || '날짜 정보 없음'}</p></div><button type="button" className="library-primary" onClick={() => onRepeat ? onRepeat(selected.prompt || titleOf(selected)) : onPractice()}>같은 상황 다시 연습</button></header><div className="library-tabs" role="group" aria-label="기록 상세">{['상황','대화 내역','피드백'].map(value => <button type="button" key={value} aria-pressed={detailTab === value} onClick={() => setDetailTab(value)}>{value}</button>)}</div>
      {detailTab === '상황' && <section className="record-detail-card"><h2>연습한 상황</h2><p>{selected.prompt || titleOf(selected)}</p><dl>{[['대화 상대',selected.target || selected.character_name],['연습 목표',selected.goal],['난이도',({basic:'기본',pressure:'심화',ultra_pressure:'압박'})[selected.difficulty]],['연습 종류',({interview:'면접',workplace:'직장대화'})[selected.service_mode || selected.service_mode_id]]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || '저장된 정보 없음'}</dd></div>)}</dl></section>}
      {detailTab === '대화 내역' && <section className="record-detail-card"><h2>대화 내역</h2>{Array.isArray(messages) && messages.length ? messages.map((message,index) => <article className="record-message" key={index}><strong>{message.role === 'user' ? '나' : 'AI 상대'}</strong><p>{message.content || message.text}</p></article>) : <p>이 기록에 저장된 대화 내역이 없어요.</p>}</section>}
      {detailTab === '피드백' && <section className="record-detail-card"><h2>피드백</h2>{selected.total_score != null ? <p>종합 점수 <strong>{selected.total_score}점</strong></p> : <p>이 기록에 저장된 피드백이 없어요.</p>}{Object.entries(selected.fit_scores || {}).map(([name,fit]) => <article className="record-message" key={name}><h3>{name} · {fit.score}점</h3><p>{fit.summary}</p></article>)}</section>}
    </section>;
  }
  return <section className="page practice-library" aria-labelledby="library-title"><header className="library-heading"><div><h1 id="library-title">연습 기록</h1><p>지난 대화를 찾고 다음 연습을 준비해보세요.</p></div><button type="button" className="library-primary" onClick={onPractice}>＋ 새 연습</button></header>
    <div className="library-search"><label htmlFor="record-search" className="screen-reader-note">연습 제목 검색</label><input id="record-search" type="search" placeholder="연습 제목 검색" value={query} onChange={event => setQuery(event.target.value)} /></div>
    <div className="library-controls"><div className="library-tabs" role="group" aria-label="기록 분류">{['전체','최근','즐겨찾기','진행 중','완료'].map(value => <button type="button" key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{value}</button>)}</div><div className="library-filters"><label>종류<select value={kind} onChange={event=>setKind(event.target.value)}><option value="전체">전체</option><option value="interview">면접</option><option value="workplace">직장대화</option></select></label><label>정렬<select value={sort} onChange={event=>setSort(event.target.value)}><option value="newest">최신순</option><option value="oldest">오래된순</option><option value="title">제목순</option></select></label></div></div>
    <p className="library-count" role="status">{rows.length}개의 기록</p><div className="record-table"><div className="record-table-head" aria-hidden="true"><span>연습 제목</span><span>종류</span><span>상태</span><span>날짜</span><span>즐겨찾기</span></div>{rows.map(item => <article className="record-row" key={item.recordId}><button type="button" className="record-title" onClick={() => open(item)}>{titleOf(item)}</button><span>{({interview:'면접',workplace:'직장대화'})[item.service_mode || item.service_mode_id] || '대화 연습'}</span><span className="record-status">{statusOf(item)}</span><time>{dateOf(item) || '날짜 없음'}</time><button type="button" className="record-star" aria-label={`${titleOf(item)} 즐겨찾기`} aria-pressed={favorites.includes(item.recordId)} onClick={() => star(item.recordId)}>{favorites.includes(item.recordId) ? '★' : '☆'}</button></article>)}</div>
    {!rows.length && <div className="library-empty"><h2>{items.length ? '조건에 맞는 기록이 없어요' : '아직 저장된 연습이 없어요'}</h2><p>{items.length ? '검색어나 필터를 바꿔보세요.' : '저장된 연습 기록이 생기면 이곳에서 확인할 수 있어요.'}</p><button type="button" onClick={items.length ? () => { setQuery('');setTab('전체');setKind('전체'); } : onPractice}>{items.length ? '검색·필터 초기화' : '첫 연습 시작하기'}</button></div>}
  </section>;
}
