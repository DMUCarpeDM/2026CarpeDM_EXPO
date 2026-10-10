"""상황별 톤 분류 — 녹음 라벨 파싱과 합성 텍스트 라우팅을 한 곳에서 관리한다.

녹음 파일명은 대본이 아니라 감정/상황 라벨이다.
  예) "A. 긴문장/3. 단호 · 확인 — 위험한 요청 재확인.m4a"
이 라벨을 정규 톤(TONES)으로 접어서 톤별 참조 음성을 만들고,
합성할 때는 텍스트를 같은 톤 체계로 분류해 맞는 참조를 고른다.
"""

from __future__ import annotations

import re
from pathlib import Path

# 정규 톤. 프로필 파일과 런타임이 공유하는 키이므로 함부로 바꾸면 프로필이 깨진다.
TONE_NEUTRAL = "neutral"
TONE_QUESTION = "question"
TONE_BRIEFING = "briefing"
TONE_CAUTION = "caution"
TONE_NUMERIC = "numeric"
TONE_NARRATION = "narration"

TONES: tuple[str, ...] = (
    TONE_NEUTRAL,
    TONE_QUESTION,
    TONE_BRIEFING,
    TONE_CAUTION,
    TONE_NUMERIC,
    TONE_NARRATION,
)

TONE_DESCRIPTIONS: dict[str, str] = {
    TONE_NEUTRAL: "담담한 보고·안내",
    TONE_QUESTION: "확인·선택 질문",
    TONE_BRIEFING: "나열·요약 브리핑",
    TONE_CAUTION: "경고·거절·오류",
    TONE_NUMERIC: "숫자·시간·경로 낭독",
    TONE_NARRATION: "중길이 설명 낭독",
}

# 연기된 부정 감정. 비서 기본 음성으로 쓰면 어색하고,
# 화자 평균에 섞이면 음색이 흐려져서 기본 프로필에서 제외한다.
EXPRESSIVE_LABELS: tuple[str, ...] = ("빈정거림", "짜증", "한탄", "화남", "머뭇거림")

# 폴더명 첫 글자 → 톤. 파일명 감정 라벨이 없을 때의 기본값.
_CATEGORY_TONES: dict[str, str] = {
    "A": TONE_NARRATION,
    "B": TONE_NUMERIC,
    "C": TONE_QUESTION,
    "D": TONE_BRIEFING,
    "E": TONE_NEUTRAL,
    "F": TONE_NEUTRAL,
    "G": TONE_CAUTION,
    "H": TONE_NARRATION,
}

# A 카테고리 감정 라벨 → 톤.
_EMOTION_TONES: tuple[tuple[str, str], ...] = (
    ("단호", TONE_CAUTION),
    ("놀람", TONE_CAUTION),
    ("경쾌", TONE_BRIEFING),
    ("설득", TONE_BRIEFING),
    ("요약", TONE_BRIEFING),
    ("차분", TONE_NEUTRAL),
    ("공감", TONE_NEUTRAL),
    ("위로", TONE_NEUTRAL),
    ("정중", TONE_NEUTRAL),
    ("사과", TONE_NEUTRAL),
    ("긴장 완화", TONE_NEUTRAL),
    ("리마인드", TONE_NEUTRAL),
    ("기쁨", TONE_BRIEFING),
    ("축하", TONE_BRIEFING),
)

_CATEGORY_PREFIX = re.compile(r"^\s*([A-H])\s*[.\-]")
# "1. 단호 · 확인 — 위험한 요청 재확인" 에서 앞의 번호와 뒤의 설명을 떼어낸다.
_LEADING_INDEX = re.compile(r"^\s*\d+\s*[.)]\s*")
_LABEL_SPLIT = re.compile(r"\s*[—–\-]\s*")


def category_letter(folder_name: str) -> str:
    match = _CATEGORY_PREFIX.match(folder_name or "")
    return match.group(1).upper() if match else ""


def parse_emotion_label(file_stem: str) -> str:
    """파일명에서 감정/상황 라벨 부분만 뽑는다. 없으면 빈 문자열."""
    stem = _LEADING_INDEX.sub("", file_stem or "").strip()
    head = _LABEL_SPLIT.split(stem, maxsplit=1)[0].strip()
    return head


def is_expressive(label: str) -> bool:
    """기본 프로필에서 제외할 연기 감정인지."""
    text = label or ""
    return any(keyword in text for keyword in EXPRESSIVE_LABELS)


def tone_for_recording(audio_path: Path, *, root: Path | None = None) -> str:
    """녹음 파일 경로 → 정규 톤."""
    folder = audio_path.parent.name
    letter = category_letter(folder)
    tone = _CATEGORY_TONES.get(letter, TONE_NEUTRAL)

    if letter == "A":
        label = parse_emotion_label(audio_path.stem)
        for keyword, mapped in _EMOTION_TONES:
            if keyword in label:
                return mapped
    return tone


# ---- 합성 텍스트 → 톤 -------------------------------------------------------

_QUESTION_TAIL = re.compile(r"(까요|나요|은가요|던가요|습니까|입니까|겠어요|드릴까요)\s*[?？]?\s*$")
_CAUTION_WORDS = (
    "위험", "경고", "주의", "실패", "오류", "에러", "중단", "거절",
    "불가", "삭제", "되돌릴 수 없", "권한", "보안", "민감", "차단",
    "지원하지 않", "할 수 없습니다", "확인이 필요",
)
_BRIEFING_WORDS = ("첫째", "둘째", "셋째", "다음과 같", "정리하면", "요약하면", "순서대로", "항목은")
_BRIEFING_PATTERNS = (
    re.compile(r"(세|네|다섯|두|여섯)\s*(가지|건|개)"),
    re.compile(r"^\s*[-•*]\s+", re.MULTILINE),
    re.compile(r"^\s*\d+[.)]\s+", re.MULTILINE),
)
_PATH_OR_ADDR = re.compile(r"[A-Za-z]:\\|https?://|@[\w.]+\.\w+|\d+\.\d+\.\d+")

# 숫자 판정은 아라비아 숫자만 세면 안 된다. 아이리스는 "오전 아홉 시 십이 분"처럼
# 한글 수사로 읽는 문장이 많고, 그게 B 카테고리 녹음이 겨냥한 발음이다.
_COUNTER = (
    r"시|분|초|밀리초|원|퍼센트|프로|개|명|통|건|번|번째|가지|층|호|년|월|일|주|달|"
    r"바이트|기가바이트|메가바이트|킬로|미터|보|권|장|줄|배|도"
)
_SINO_NUMERAL = r"[일이삼사오육칠팔구십백천만억공영]"
_NATIVE_NUMERAL = r"하나|한|둘|두|셋|세|넷|네|다섯|여섯|일곱|여덟|아홉|열|스물|서른|마흔|쉰"

_NUMBER_HITS = (
    re.compile(rf"\d+\s*(?:{_COUNTER}|%|GB|MB|KB|TB)"),
    re.compile(rf"(?:{_SINO_NUMERAL})+\s*(?:{_COUNTER})"),
    re.compile(rf"(?:{_NATIVE_NUMERAL})\s*(?:{_COUNTER})"),
    re.compile(r"\d+\s*[:시]\s*\d+"),
    re.compile(r"\d{3,}"),
)

# 이만큼 이상 숫자 표현이 나오면 숫자 낭독 톤으로 본다.
NUMERIC_MIN_HITS = 2


def _numeric_hits(text: str) -> int:
    return sum(len(pattern.findall(text)) for pattern in _NUMBER_HITS)

# 긴 문장은 낭독 톤이 자연스럽다. 짧은 보고는 담담한 톤.
NARRATION_MIN_CHARS = 120


def classify_text_tone(text: str) -> str:
    """합성할 텍스트를 정규 톤으로 분류. 우선순위: 경고 > 질문 > 나열 > 숫자 > 길이."""
    body = (text or "").strip()
    if not body:
        return TONE_NEUTRAL

    if any(word in body for word in _CAUTION_WORDS):
        return TONE_CAUTION

    if body.endswith("?") or body.endswith("？") or _QUESTION_TAIL.search(body):
        return TONE_QUESTION

    if any(word in body for word in _BRIEFING_WORDS):
        return TONE_BRIEFING
    if any(pattern.search(body) for pattern in _BRIEFING_PATTERNS):
        return TONE_BRIEFING

    if _PATH_OR_ADDR.search(body) or _numeric_hits(body) >= NUMERIC_MIN_HITS:
        return TONE_NUMERIC

    if len(body) >= NARRATION_MIN_CHARS:
        return TONE_NARRATION
    return TONE_NEUTRAL
