import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'reicon-react/icons/ArrowUp';
import { simulationChatRequest } from '../lib/simulationChatApi';
import '../styles/simulation-chat.css';

const fields = [['job_role', '직무·직종'], ['situation', '상황'], ['context', '사건의 맥락'], ['goal', '연습 목적'], ['turns', '턴 수'], ['target', '대화 상대'], ['difficulty', '난이도'], ['personality', '상대의 성격'], ['persona', '상대 페르소나']];
const emptyDraft = { job_role: '', context: '', goal: '', turns: null, situation: '', target: '', difficulty: '', personality: '', persona: '' };

export function SimulationChatPage({ prompt, serviceMode }) {
  const [mobilePanel, setMobilePanel] = useState('chat');
  const [previewWidth, setPreviewWidth] = useState('desktop');
  const [draft, setDraft] = useState(emptyDraft);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([{ role: 'user', content: prompt }]);
  const [simulation, setSimulation] = useState([]);
  const [confirmed, setConfirmed] = useState(null);
  const [phase, setPhase] = useState('prepare');
  const [input, setInput] = useState('');
  const consent = true;
  const [begun, setBegun] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [answered, setAnswered] = useState(0);
  const inFlight = useRef(false);
  const controller = useRef(null);
  const transcript = useRef(null);
  const inputRef = useRef(null);
  const missing = fields.filter(([key]) => key === "turns" ? !Number.isInteger(draft.turns) || draft.turns < 1 || draft.turns > 20 : !draft[key]?.trim());
  const preparing = phase === 'prepare';
  const visibleMessages = preparing ? messages : simulation;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { document.title = `${phase === 'prepare' ? 'AI와 연습 준비' : phase === 'done' ? '연습 완료' : 'AI 시뮬레이션'} · Mirror-Ting`; }, [phase]);
  useEffect(() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }, [messages, simulation, busy, phase]);

  const request = async (action) => {
    if (inFlight.current || !consent) return;
    const content = input.trim();
    if (action === 'answer' && !content) { inputRef.current?.focus(); return; }
    if (action === 'start' && (missing.length || question)) return;
    inFlight.current = true; setBusy(true); setError('');
    controller.current = new AbortController();
    try {
      if (action === 'prepare') {
        const next = content || begun ? [...messages, { role: 'user', content }] : messages;
        const result = await simulationChatRequest('prepare', { prompt, service_mode: serviceMode, messages: next.slice(-20), draft, answer_field: question?.field ?? null, consent }, controller.current.signal);
        setMessages([...next, { role: 'assistant', content: result.message }]);
        setDraft(result.draft); setQuestion(result.question); setSelected(null); setBegun(true); setInput('');
      } else {
        const settings = action === 'start' ? { ...draft } : confirmed;
        const next = action === 'start' ? [] : [...simulation, { role: 'user', content }];
        const result = await simulationChatRequest('reply', { prompt, draft: settings, service_mode: serviceMode, messages: next, consent }, controller.current.signal);
        setSimulation([...next, { role: 'assistant', content: result.message }]);
        setConfirmed(settings); setPhase(result.done ? 'done' : 'simulation'); setAnswered(result.answered_turns); setInput('');
      }
    } catch (failure) { if (failure.name !== 'AbortError') setError(failure.message); }
    finally { inFlight.current = false; setBusy(false); }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => request('prepare'), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <section className={`simulation-chat-page lovable-editor panel-${mobilePanel}`} aria-labelledby="simulation-chat-title">
    <header className="editor-toolbar"><div className="editor-project"><img src="/icons/mirror-ting-mark-slim.png" alt="" width="24" height="24" /><h1 id="simulation-chat-title">{preparing ? 'AI와 연습 준비' : 'AI 시뮬레이션'}</h1></div><div className="editor-panel-tabs" role="group" aria-label="화면 전환"><button type="button" aria-pressed={mobilePanel === 'chat'} onClick={() => setMobilePanel('chat')}>대화</button><button type="button" aria-pressed={mobilePanel === 'preview'} onClick={() => setMobilePanel('preview')}>미리보기</button></div><span className="editor-toolbar-status">{preparing ? '연습 준비 중' : phase === 'done' ? '연습 완료' : '연습 진행 중'}</span></header>
    <div className="simulation-workbench">
    <div className="simulation-chat-conversation">
      <div className="simulation-chat-transcript" ref={transcript} role="log" aria-label={preparing ? '연습 준비 대화' : '시뮬레이션 대화'} aria-busy={busy}>
        {visibleMessages.map((message, index) => <article key={`${phase}-${index}`} className={`simulation-message simulation-message--${message.role}`}><span>{message.role === 'user' ? '나' : preparing ? '준비 도우미' : 'AI 상대'}</span><p>{message.content}</p></article>)}
        {preparing && !begun && <div className="simulation-chat-intro"><p>직무와 구체적으로 있었던 일을 살펴보고, 더 필요한 내용만 물어볼게요.</p><p>예시를 고르거나 원하는 답을 직접 적을 수 있어요. 1턴은 내 답변 한 번을 뜻해요.</p></div>}
        {busy && <p className="simulation-chat-status" role="status">{preparing ? 'AI가 연습할 내용을 살펴보고 있어요' : 'AI가 답변하고 있어요'}</p>}
        {phase === 'done' && <p className="simulation-chat-status" role="status">{answered >= confirmed.turns ? `정한 ${confirmed.turns}턴을 마쳤어요.` : '직접 연습을 종료했어요.'} 대화는 이 화면에서 다시 읽을 수 있어요.</p>}
      </div>
      <div className="simulation-chat-input-area">
        {error && <p className="simulation-chat-error" role="alert">{error}</p>}
        {preparing && begun && question && <section className="simulation-question" aria-labelledby="simulation-question-title">
          <div className="simulation-question-heading"><h2 id="simulation-question-title">{question.title}</h2><span>확인한 항목 {fields.length-missing.length} / {fields.length}</span></div>
          <div className="simulation-question-choices" role="group" aria-label="예시 답변">
            {question.choices.map((choice,index)=><button type="button" key={choice} aria-pressed={selected===index} disabled={busy} onClick={()=>{setSelected(index);setInput(choice);inputRef.current?.focus();}}><span aria-hidden="true">{index+1}</span>{choice}</button>)}
          </div>
          <p>원하는 답이 없다면 아래에 직접 적어주세요.</p>
        </section>}
        {preparing && begun && !question && !missing.length && <section className="simulation-question simulation-question--ready" aria-label="최종 설정 확인">
          <h2>이 설정으로 연습할까요?</h2>
          <details><summary>확인한 설정 보기</summary><dl>{fields.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{key==='turns'?`${draft[key]}턴`:key==='difficulty'?{basic:'기본',pressure:'심화',ultra_pressure:'압박'}[draft[key]]:key==='context'?(draft.context_source || draft.context):draft[key]}</dd></div>)}</dl></details>
          <button type="button" className="simulation-chat-start" disabled={busy || !consent} onClick={()=>request('start')}>설정 확정하고 시작하기</button>
        </section>}
        {phase !== 'done' && <form onSubmit={event => { event.preventDefault(); request(preparing ? 'prepare' : 'answer'); }}>
          <label htmlFor="simulation-chat-input" className="screen-reader-note">{preparing ? '준비 도우미에게 답하기' : 'AI 상대에게 답하기'}</label>
          <textarea ref={inputRef} id="simulation-chat-input" rows={2} value={input} onChange={event => {setInput(event.target.value);setSelected(null);}} disabled={busy || !consent} placeholder={preparing ? begun && !missing.length ? '바꾸고 싶은 설정이 있다면 적어주세요.' : '예시 답변을 고르거나 원하는 내용을 직접 적어주세요.' : '상대에게 할 말을 적어주세요.'}/>
          <div className="simulation-chat-toolbar"><span>{preparing ? question ? fields.find(([key])=>key===question.field)?.[1] : '설정을 확인한 뒤 연습을 시작해요' : `${answered} / ${confirmed?.turns}턴`}</span><button type="submit" disabled={busy || !consent || (!preparing && !input.trim())} aria-label={preparing ? begun ? '준비 답변 보내기' : '동의하고 AI와 준비하기' : '시뮬레이션 답변 보내기'}>{preparing ? begun ? '다음' : 'AI와 준비하기' : <ArrowUp size={18} aria-hidden="true"/>}</button></div>
        </form>}
        {!preparing && phase !== 'done' && <button type="button" className="simulation-chat-end" disabled={busy} onClick={()=>setPhase('done')}>연습 종료하기</button>}
      </div>
    </div>
    <aside className={`simulation-context editor-preview preview-${previewWidth}`} aria-label="연습 미리보기">
      <div className="editor-preview-toolbar"><span>◉ 미리보기</span><div role="group" aria-label="미리보기 크기"><button type="button" aria-pressed={previewWidth === 'desktop'} onClick={() => setPreviewWidth('desktop')}>데스크톱</button><button type="button" aria-pressed={previewWidth === 'mobile'} onClick={() => setPreviewWidth('mobile')}>모바일</button></div></div>
      <div className="editor-preview-canvas"><div className="editor-scenario-card"><span className="editor-preview-badge">{preparing ? '나의 연습 시나리오' : 'AI와 대화 연습'}</span><h2>{draft.situation || '대화를 미리 준비해요'}</h2><p className="simulation-context-prompt">{prompt}</p><div className="editor-preview-persona"><span aria-hidden="true">✦</span><div><strong>{draft.target || 'AI 대화 상대'}</strong><p>{draft.persona || '대화를 통해 상황에 맞는 상대를 준비해요.'}</p></div></div>

      <details open><summary>연습 상황과 설정</summary>
        <div className="simulation-context-status">{preparing ? `확인한 설정 ${fields.length - missing.length} / ${fields.length}` : phase === 'done' ? '연습 완료' : `진행 ${answered} / ${confirmed?.turns}턴`}</div>
        <dl>{fields.map(([key,label]) => { const value=(confirmed || draft)[key]; return <div key={key}><dt>{label}</dt><dd>{key==='difficulty' ? ({basic:'기본',pressure:'심화',ultra_pressure:'압박'}[value] || '확인 중') : value ? `${value}${key==='turns'?'턴':''}` : '확인 중'}</dd></div>; })}</dl>
      </details>
      </div></div>
    </aside>
    </div>
  </section>;
}
