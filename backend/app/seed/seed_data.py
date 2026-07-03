"""시나리오 시드 데이터.

기획서 근거:
- S-CTNRTB 회사 세계관(B2B SaaS 장애 대응 데모)
- S-OBIBZL 핵심 등장인물(기본 4인) 및 말투 규칙
- S-WOTZZX 모드별 에피소드 템플릿(5분/10분)
- S-PLPIQH 핵심 요소 체크리스트 / S-AHAFOT 위험 표현 탐지

에피소드는 HWP 계획서의 5가지 상황(출근 보고/실수·장애 보고/잔업 대응/회식 대응)을
연속형 흐름으로 재구성한 것. 5분 모드 = EP1~3, 10분 모드 = EP1~5.
"""

WORLD_SETTING = {
    "company": "㈜클라우드밋",
    "service": "B2B 협업 SaaS '밋업(MeetUp)' — 기업용 화상회의·일정 관리 플랫폼",
    "situation": "사용자는 오늘 첫 출근한 플랫폼팀 신입. 오전에 고객사 로그인 장애가 발생하는 하루를 겪는다.",
    "user_role": "플랫폼팀 신입 사원 (개발/운영 지원)",
}

CHARACTERS = [
    {
        "id": "kim_teamlead",
        "name": "김태호 팀장",
        "role": "플랫폼팀 팀장 (상사)",
        "personality": "직설적이고 바쁘다. 결론부터 듣고 싶어 한다.",
        "speech_style": "짧고 단호한 문장. 존댓말이지만 딱딱함.",
        "tts": {"rate": 1.1, "pitch": 0.8},
    },
    {
        "id": "park_senior",
        "name": "박서연 선임",
        "role": "백엔드 선임 개발자 (선배)",
        "personality": "꼼꼼하고 차분하다. 근거와 절차를 중시한다.",
        "speech_style": "친절하지만 정확한 표현을 요구.",
        "tts": {"rate": 1.0, "pitch": 1.1},
    },
    {
        "id": "lee_peer",
        "name": "이준영",
        "role": "같은 팀 동료 (입사 6개월차)",
        "personality": "친근하고 활발하다. 분위기를 풀어준다.",
        "speech_style": "캐주얼한 존댓말, 가벼운 농담.",
        "tts": {"rate": 1.05, "pitch": 1.2},
    },
    {
        "id": "han_cs",
        "name": "한지민 매니저",
        "role": "고객성공(CS)팀 매니저",
        "personality": "고객 입장을 대변하며 급하다. 시간 약속을 원한다.",
        "speech_style": "빠르고 긴박한 어조.",
        "tts": {"rate": 1.15, "pitch": 1.15},
    },
]

# 위험 표현(감점) — S-AHAFOT. severity: high(-15) / medium(-8)
BANNED_PHRASES = [
    {"phrase": "몰라요", "severity": "high", "reason": "책임 회피로 들릴 수 있는 표현"},
    {"phrase": "모르겠", "severity": "medium", "reason": "대안 없이 모른다고만 하면 신뢰를 잃음"},
    {"phrase": "제 잘못이 아니", "severity": "high", "reason": "책임 전가 표현"},
    {"phrase": "제 탓이 아니", "severity": "high", "reason": "책임 전가 표현"},
    {"phrase": "어쩌라고", "severity": "high", "reason": "공격적 표현"},
    {"phrase": "그냥", "severity": "medium", "reason": "근거 없는 모호한 표현"},
    {"phrase": "대충", "severity": "medium", "reason": "성의 없는 인상을 주는 표현"},
    {"phrase": "귀찮", "severity": "high", "reason": "업무 태도 문제로 보이는 표현"},
    {"phrase": "아무거나", "severity": "medium", "reason": "주관 없는 인상을 주는 표현"},
    {"phrase": "안 되는데요", "severity": "medium", "reason": "대안 없는 거절"},
]

# 권장 표현(가점 근거로 리포트에 노출)
RECOMMENDED_PHRASES = [
    "확인해보겠습니다", "확인 후 보고드리겠습니다", "죄송합니다", "감사합니다",
    "까지 공유드리겠습니다", "도움 요청", "먼저 보고드립니다",
]

EPISODES = [
    {
        "order": 1,
        "title": "출근 첫인사와 자기소개",
        "modes": "5,10",
        "character_id": "kim_teamlead",
        "situation": "첫 출근. 팀 스탠드업 직전, 팀장이 짧은 자기소개를 요청한다.",
        "initial_question": "오늘부터 출근이죠? 스탠드업 시작 전에 팀원들에게 짧게 자기소개하고, 오늘 하루 목표 한 가지만 말해주세요.",
        "question_intent": "간결한 자기소개 구조(이름·역할·의지)와 첫인상 커뮤니케이션을 평가",
        "checklist": [
            {
                "id": "intro_name",
                "label": "이름/호칭 소개",
                "keywords": ["입니다", "라고 합니다", "이름은", "신입"],
                "followup": "이름을 못 들었네요. 팀원들이 뭐라고 부르면 될까요?",
                "weight": 1.0,
            },
            {
                "id": "intro_role",
                "label": "담당 업무 파악 의지",
                "keywords": ["맡", "배우", "업무", "역할", "담당", "익히"],
                "followup": "우리 팀에서 어떤 일을 하게 될지는 알고 왔어요?",
                "weight": 1.0,
            },
            {
                "id": "intro_goal",
                "label": "오늘의 구체적 목표",
                "keywords": ["목표", "파악", "온보딩", "셋업", "설정", "익히", "숙지"],
                "followup": "오늘 목표는요? 한 가지만 구체적으로 말해봐요.",
                "weight": 1.2,
            },
        ],
        "pressure_questions": [
            {"text": "짧게 하라고 했는데 요점이 뭐예요? 한 문장으로 다시.", "trigger": "any"},
        ],
        "max_turns": 2,
    },
    {
        "order": 2,
        "title": "장애 문의 전화 — 긴급 상황 파악",
        "modes": "5,10",
        "character_id": "han_cs",
        "situation": "오전 10시. CS팀에서 다급하게 연락이 온다. 고객사 로그인 장애 문의가 몰리고 있다.",
        "initial_question": "플랫폼팀이죠? 지금 고객사 세 곳에서 밋업 로그인이 안 된다는 문의가 5건이나 들어왔어요! 지금 상황이 어떻게 되는 건가요? 고객사에 뭐라고 안내하죠?",
        "question_intent": "신입으로서 아는 것/모르는 것을 구분하고, 확인 후 회신을 약속하며, 선배에게 에스컬레이션하는지 평가",
        "checklist": [
            {
                "id": "incident_ack",
                "label": "상황 인지와 공감 표현",
                "keywords": ["확인", "죄송", "불편", "알겠습니다", "접수"],
                "followup": "지금 고객이 계속 기다리고 있어요. 접수는 된 건가요?",
                "weight": 1.0,
            },
            {
                "id": "incident_escalate",
                "label": "선배/팀장 에스컬레이션",
                "keywords": ["선임", "팀장", "보고", "전달", "공유", "선배", "요청"],
                "followup": "혼자 처리할 수 있는 건가요? 팀에서 누가 보고 있죠?",
                "weight": 1.5,
            },
            {
                "id": "incident_timeline",
                "label": "확인 후 회신 시점 약속",
                "keywords": ["분", "까지", "바로", "회신", "다시 연락", "공유드리"],
                "followup": "그래서 언제까지 답을 줄 수 있어요? 고객사에 전달할 시간을 말해주세요.",
                "weight": 1.5,
            },
        ],
        "pressure_questions": [
            {"text": "10분 뒤에 고객사 임원 미팅이에요. 지금 당장 원인을 말해줄 수 없다는 거예요?", "trigger": "any"},
        ],
        "max_turns": 3,
    },
    {
        "order": 3,
        "title": "장애 수습 후 팀장 보고",
        "modes": "5,10",
        "character_id": "kim_teamlead",
        "situation": "오후. 로그인 장애는 인증 서버 배포 롤백으로 해결됐다. 팀장이 정리 보고를 요청한다.",
        "initial_question": "장애 정리됐다고 들었어요. 오늘 처음 겪었을 텐데 — 무슨 일이었고, 어떻게 처리됐고, 다음에 뭘 다르게 하면 될지 정리해서 보고해봐요.",
        "question_intent": "결론 우선 보고 구조(원인→조치→재발 방지)와 회고 능력을 평가",
        "checklist": [
            {
                "id": "report_cause",
                "label": "원인 요약",
                "keywords": ["원인", "배포", "인증", "롤백", "때문", "장애"],
                "followup": "그래서 원인이 뭐였다는 거예요? 한 줄로.",
                "weight": 1.2,
            },
            {
                "id": "report_action",
                "label": "조치 내용",
                "keywords": ["조치", "롤백", "복구", "해결", "대응", "처리"],
                "followup": "누가 어떤 조치를 했는지는 파악하고 있어요?",
                "weight": 1.0,
            },
            {
                "id": "report_prevention",
                "label": "재발 방지/배운 점",
                "keywords": ["재발", "방지", "다음", "배웠", "개선", "체크", "모니터링", "프로세스"],
                "followup": "같은 일이 또 생기면요? 뭘 다르게 할 건데요?",
                "weight": 1.5,
            },
        ],
        "pressure_questions": [
            {"text": "보고가 길어요. 원인, 조치, 재발 방지 — 세 가지만 각 한 문장으로 다시 해봐요.", "trigger": "any"},
        ],
        "max_turns": 3,
    },
    {
        "order": 4,
        "title": "야간 모니터링 요청 대응",
        "modes": "10",
        "character_id": "park_senior",
        "situation": "퇴근 1시간 전. 선임이 오늘 밤 재배포 모니터링 지원을 요청한다. 사용자에게는 저녁 선약이 있다는 설정.",
        "initial_question": "오늘 밤 9시에 인증 서버 재배포가 잡혔는데, 모니터링을 같이 봐줄 사람이 필요해요. 혹시 오늘 남아서 도와줄 수 있어요? 선약 있으면 편하게 말해줘요.",
        "question_intent": "무리한 수락도 무성의한 거절도 아닌, 명확한 의사표현과 대안 제시를 평가",
        "checklist": [
            {
                "id": "overtime_answer",
                "label": "명확한 가/불가 의사",
                "keywords": ["가능", "어렵", "할 수 있", "힘들", "남을 수", "선약"],
                "followup": "그래서 오늘 가능하다는 거예요, 어렵다는 거예요?",
                "weight": 1.2,
            },
            {
                "id": "overtime_alternative",
                "label": "대안 제시",
                "keywords": ["대신", "내일", "다음", "먼저", "시간", "조정", "원격", "일찍"],
                "followup": "어렵다면, 다른 방법은 없을까요? 어떻게 도와줄 수 있어요?",
                "weight": 1.3,
            },
            {
                "id": "overtime_tone",
                "label": "정중한 어조와 사정 설명",
                "keywords": ["죄송", "감사", "양해", "말씀", "사정"],
                "followup": "알겠어요. 근데 그렇게만 말하면 서운한데요?",
                "weight": 0.8,
            },
        ],
        "pressure_questions": [
            {"text": "신입 때는 다들 남아서 배우던데... 첫날부터 어렵다는 건가요?", "trigger": "any"},
        ],
        "max_turns": 3,
    },
    {
        "order": 5,
        "title": "회식 제안 대응",
        "modes": "10",
        "character_id": "lee_peer",
        "situation": "퇴근 직전. 동료가 장애 수습 기념 팀 회식 참석 여부를 묻는다.",
        "initial_question": "오늘 고생했다고 팀장님이 회식 쏘신대요! 첫날인데 같이 갈 거죠? 부담되면 빠져도 된다고는 하셨어요.",
        "question_intent": "사회적 상황에서 자기 의사를 관계를 해치지 않게 전달하는지 평가",
        "checklist": [
            {
                "id": "dinner_answer",
                "label": "명확한 참석 의사표현",
                "keywords": ["참석", "갈게", "가겠", "어렵", "다음에", "괜찮"],
                "followup": "오, 그래서 가는 거예요 마는 거예요? 예약해야 해서요!",
                "weight": 1.2,
            },
            {
                "id": "dinner_relation",
                "label": "관계를 배려한 표현",
                "keywords": ["감사", "챙겨", "덕분", "즐거", "아쉽", "다음"],
                "followup": "에이, 그렇게 말하면 팀장님 서운해하실걸요?",
                "weight": 1.0,
            },
        ],
        "pressure_questions": [
            {"text": "첫날부터 빠지면 눈치 보일 텐데... 진짜 괜찮겠어요?", "trigger": "any"},
        ],
        "max_turns": 2,
    },
]

SCENARIO = {
    "slug": "cloudmeet-incident-day",
    "title": "클라우드밋 입사 첫날 — 장애 대응의 하루",
    "description": "B2B SaaS 회사에 입사한 첫날, 고객사 로그인 장애가 터진다. "
                   "자기소개부터 긴급 보고, 수습 회고, 잔업·회식 대응까지 하루의 직장 커뮤니케이션을 연속 역할극으로 체험한다.",
}
