from app.ai import voice_measurement as engine
from app.services import context_scoring as context, interaction_scoring as scoring

def test_standard_voice_pace_is_scored_without_personal_volume_reference():
    result = {"turn_id":1,"measured":[],"events":[],"voice_measurement":{
        **engine.empty_result(1,1), "duration_sec":5,
        "volume":engine.missing("personal_reference_unavailable"),
        "speed":engine.measured(syllables_per_second=4),
        "pauses":engine.measured(count=0,segments=[])}}
    policy={"kind":"neutral","status":"classified"}
    context.apply_voice(result,policy)
    assert scoring.calculate([result])["scores"]["voice"] == 77
    context.apply_voice(result,policy)
    assert scoring.calculate([result])["scores"]["voice"] == 77
    result["voice_measurement"]=engine.empty_result(1,1)
    context.apply_voice(result,policy)
    assert scoring.calculate([result])["scores"]["voice"] is None
