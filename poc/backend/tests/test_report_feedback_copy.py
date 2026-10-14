from app.services.interaction_report import feedback_items


def test_positive_only_gets_non_penalizing_next_practice_suggestion():
    strengths, improvements = feedback_items([{'outcome': 'positive', 'message': '의사를 분명히 전달했어요.'}])
    assert strengths == ['의사를 분명히 전달했어요.']
    assert len(improvements) == 1
    assert '감점 사유가 아니에요' in improvements[0]


def test_negative_evidence_is_preserved_without_generic_replacement():
    strengths, improvements = feedback_items([{'outcome': 'positive', 'message': '직접 답했어요.'}, {'outcome': 'negative', 'message': '앞선 답변과 다른 내용을 확인해 보세요.'}])
    assert strengths == ['직접 답했어요.']
    assert improvements == ['앞선 답변과 다른 내용을 확인해 보세요.']


def test_no_evidence_does_not_invent_feedback():
    assert feedback_items([]) == ([], [])
