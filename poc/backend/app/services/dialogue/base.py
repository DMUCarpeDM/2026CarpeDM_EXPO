"""대화 화면에 전달하는 상대 발화 형식."""
from dataclasses import dataclass


@dataclass
class QuestionSpec:
    episode_id: int
    question_type: str  # initial | followup | pressure
    question_text: str
    character_id: str
    virtual_time: str = ""  # 에피소드 가상 시각 "09:04" — 하루 프레이밍
