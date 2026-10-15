"""Keep scoring off the workplace dialogue path; evaluate saved turn context for the report."""
import copy
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from time import monotonic
from types import SimpleNamespace

from app.ai.live_coaching import analyze_live_coaching
from app.models import AiFeedback, CoachingLog
from app.services import context_scoring, feedback, interaction, judgments, response_judgment, voice_analysis


_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix='workplace-review')
_PENDING = OrderedDict()
_LOCK = Lock()


def prime_stored_turn(session_id, turn_id):
    from app.core.database import SessionLocal
    from app.models import RoleplaySession
    # Close the read transaction before making model calls; workers never write dialogue state.
    with SessionLocal() as db:
        session = db.get(RoleplaySession, session_id)
        if not session:
            return
        fields = ('id', 'order', 'episode_id', 'character_id', 'question_text', 'response_text',
                  'nonverbal_metrics', 'response_duration_ms', 'stt_source')
        turns = [SimpleNamespace(**{field: copy.deepcopy(getattr(t, field)) for field in fields}) for t in session.turns]
        snapshot = SimpleNamespace(id=session.id, rapport=copy.deepcopy(session.rapport), turns=turns)
    current = next((t for t in turns if t.id == turn_id), None)
    saved = (snapshot.rapport or {}).get('judgments', {}).get(str(turn_id), {})
    if not current or saved.get('analysis_status') != 'pending':
        return
    key = (session_id, turn_id)
    with _LOCK:
        now = monotonic()
        for old_key, (at, _) in list(_PENDING.items()):
            if now - at > 1800:
                del _PENDING[old_key]
        if key not in _PENDING:
            _PENDING[key] = (now, _POOL.submit(_compute, snapshot, current))
        while len(_PENDING) > 128:
            _PENDING.popitem(last=False)


def pending(turn, flow):
    item = flow['items'][flow['index']]
    return {'version': judgments.VERSION, 'turn_id': turn.id, 'events': [], 'measured': [], 'met_goals': [],
            'analysis_status': 'pending', 'deferred_context': {
                'goals': interaction.assessment_goals(flow), 'situation': item.get('situation', ''),
                'exhibition': bool(flow.get('exhibition'))}}


def _compute(session, turn):
    saved = (session.rapport or {}).get('judgments', {}).get(str(turn.id), {})
    if saved.get('analysis_status') != 'pending' or 'deferred_context' not in saved:
        return
    snapshot = saved['deferred_context']
    goals = snapshot['goals']
    result = judgments.evaluate(turn.id, text=turn.response_text, goals=goals,
        nonverbal=turn.nonverbal_metrics, duration_ms=turn.response_duration_ms,
        voice_text=turn.stt_source == 'webspeech' and not voice_analysis.enabled(session))
    history = [t for t in sorted(session.turns, key=lambda t: t.order) if t.order <= turn.order
               and (not snapshot['exhibition'] or (t.episode_id == turn.episode_id and t.character_id == turn.character_id))]
    events, met, status = response_judgment.analyze(turn, history, goals, [])
    result['events'] = [e for e in result['events'] if e['area'] != 'response'] + events
    result['measured'] = [area for area in result['measured'] if area != 'response']
    result.update(met_goals=met, semantic_status=status, analysis_status='completed')
    if status == 'completed':
        result['measured'].append('response')
    measurement = (session.rapport or {}).get('voice_measurements', {}).get(str(turn.id))
    if measurement:
        result['voice_measurement'] = measurement
    context = context_scoring.classify_turn(session, turn, snapshot['situation'], turn.response_text or '')
    context_scoring.apply(result, context, turn.nonverbal_metrics)
    observation = analyze_live_coaching(turn.nonverbal_metrics, turn.response_text, turn.response_duration_ms)
    return result, observation


def complete(db, session, turn):
    saved = (session.rapport or {}).get('judgments', {}).get(str(turn.id), {})
    if saved.get('analysis_status') != 'pending' or 'deferred_context' not in saved:
        return
    with _LOCK:
        queued = _PENDING.pop((session.id, turn.id), None)
    if queued:
        try:
            result, observation = queued[1].result()
        except Exception:
            result, observation = _compute(session, turn)
    else:
        result, observation = _compute(session, turn)
    selected = feedback.assign(session, result, turn.order)
    if selected:
        db.add(AiFeedback(session_id=session.id, feedback_category=selected.get('rule', 'general'),
            commentary=selected.get('message', ''), sentence_template=(selected.get('evidence') or {}).get('suggestion') or selected.get('message', '')))
    for issue in observation.get('issues', []):
        if voice_analysis.enabled(session) and issue.get('kind') == 'voice':
            continue
        db.add(CoachingLog(session_id=session.id, turn_number=turn.order,
            timestamp_seconds=max(0., (turn.answered_at - session.started_at).total_seconds()),
            log_type=issue.get('kind', 'observation'), message=' / '.join(issue.get('reasons') or [])))
    judgments.persist(session, result)
