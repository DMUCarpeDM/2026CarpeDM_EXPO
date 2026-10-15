from app.services.interaction_scoring import calculate
from app.services.judgments import event


def rows(rule, count, outcome):
    return [{'measured': ['response'], 'events': [event(i, 'response', rule, outcome, {'quote':'가상 답변', **({'goal_id':str(i)} if rule == 'goal_met' else {})}, '근거')]} for i in range(count)]


def test_clear_answers_gain_more_than_before_without_inventing_missing_scores():
    result = calculate(rows('goal_met',5,'positive'))
    assert result['scores']['response'] == 85
    assert result['scores']['voice'] is None
    assert sum(e['points'] for e in result['changes']['response']) == 10


def test_repeated_off_topic_has_wider_range_with_upper_penalty_limit():
    assert calculate(rows('off_topic',5,'negative'))['scores']['response'] == 57
    result = calculate(rows('off_topic',20,'negative'))
    assert result['scores']['response'] == 55
    assert result['limits']['penalty'] == 30


def test_missing_evidence_stays_unscored():
    assert calculate([])['total'] is None


def test_high_scores_stop_at_89_and_total_respects_range():
    result = calculate(rows('goal_met',20,'positive'))
    assert result['scores']['response'] == 89
    assert result['total'] == 89
