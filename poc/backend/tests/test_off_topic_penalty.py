from types import SimpleNamespace as NS
import pytest
from app.services.response_judgment import validate
from app.services.interaction_scoring import calculate


def judged(turn_id=1, **overrides):
    text = '공룡이 춤추면 웃기겠죠?'
    current = NS(id=turn_id, order=turn_id, question_text='자료는 언제 확인할까요?', response_text=text)
    data = {'off_topic_quote': text, 'off_topic_confidence': .95, **overrides}
    events, met = validate(data, current, [], [{'id':'g','label':'일정'}], ['g'])
    return {'turn_id':turn_id, 'measured':['response'], 'events':events}


def test_first_repeat_and_duplicate_penalties():
    first, second = judged(), judged(2)
    assert calculate([first])['scores']['response'] == 74
    result = calculate([first, second, second])
    assert result['scores']['response'] == 72
    assert [e['points'] for e in result['changes']['response']] == [-1, -2]
    assert calculate([judged(i) for i in range(10)])['scores']['response'] == 60


@pytest.mark.parametrize('override', [
    {'off_topic_confidence': .89}, {'off_topic_quote':'공룡'},
    {'off_topic_quote':''}, {'relevant_quote':'공룡'},
    {'met_goals':[{'goal_id':'g','quote':'공룡'}]},
])
def test_uncertain_partial_or_conflicting_evidence_does_not_penalize(override):
    assert not any(e['rule']=='off_topic' for e in judged(**override)['events'])


def test_missing_goal_does_not_stack_with_off_topic():
    result = judged(missing_goal_ids=['g'])
    assert [e['rule'] for e in result['events']] == ['off_topic']
