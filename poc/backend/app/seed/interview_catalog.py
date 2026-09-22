"""신입 일반면접의 고정 기준·사전 예시. 실시간으로 예시를 생성하지 않는다.

기준은 2026-09-16 인터뷰 합의, 예시는 구현 초안이다. 문구를 수정하면 VERSION도
올린다. 예시는 참고 자료일 뿐, 목록에 없는 타당한 답을 거부하는 정답 사전이 아니다.
"""
from copy import deepcopy

# 읽기 1/5: 질문과 인정 기준이 모인 파일입니다. 먼저 COMMON의 weakness를 보세요.
# 현재 acceptance는 '약점과 보완 방법'을 한 문장으로 적어 둡니다.
# 예정 작업: 약점 설명과 보완 방법에 서로 다른 item_id를 붙여 각각 확인합니다.
# 아래 주석은 작업 안내이며, 항목별 판정 기능을 추가한 것은 아닙니다.

VERSION = "interview-2026-09-16-v1"
ROLES = {
    "fullstack": ("풀스택 개발자", "웹 서비스를 만드는 가상 회사입니다. 신입 풀스택 개발자는 화면·서버 기능, 데이터 저장·조회, 오류 수정에 참여하며 팀원과 협력해 배웁니다."),
    "marketing": ("마케팅", "생활용품을 온라인으로 판매하는 가상 회사입니다. 신입은 고객 조사, 홍보 콘텐츠 제작, 캠페인 결과 확인에 참여합니다."),
    "sales": ("영업관리 / 세일즈", "기업 고객에게 업무용 서비스를 제공하는 가상 회사입니다. 신입은 고객 요구 파악, 서비스 소개, 거래처 관리에 참여합니다."),
}


def question(key, text, acceptance, fulfilled, insufficient, followup, bonuses=(),items=None):
    # 예시 세 문장은 비교 자료입니다. examples_status가 초안이어도 현재는 사용됩니다.
    # 예정 작업: 예시별 승인 상태와 기준 버전을 확인한 뒤 승인된 것만 전달합니다.
    # bonuses는 선택 가산 항목입니다. 빠졌다고 기본 답변을 누락으로 처리하면 안 됩니다.
    return {"id": key, "text": text, "kind": "job" if bonuses else "common",
            "acceptance": acceptance, "max_followups": 1 if bonuses else 2,
            "followup": followup, "bonuses": [
                {"id": f"{key}-bonus-{i+1}", "acceptance": rule}
                for i, rule in enumerate(bonuses)],
            "items": items or [],  # 항목 정보를 담을 수 있게 합니다.
            "examples": [
                {"status": "fulfilled", "answer": fulfilled, "reason": acceptance},
                {"status": "insufficient", "answer": insufficient, "reason": "기본 기준 중 설명이 빠져 있음"},
                {"status": "irrelevant", "answer": "오늘 점심에는 김밥을 먹었습니다.", "reason": "질문에서 요구한 내용을 설명하지 않음"}],
            "examples_status": "implementation_draft"}


COMMON = [
    question("intro", "자기소개를 해 주세요.", "관심·강점·경험 중 하나로 자신을 설명. 이름·학교만 있으면 부족. 길이·성과·STAR 형식 불필요.",
             "저는 팀 과제에서 빠진 일을 찾아 챙기는 것을 좋아합니다.", "저는 김민수이고 대학생입니다.", "관심이나 강점, 경험 중 하나를 더 소개해 주세요."),
    question("motivation", "우리 회사의 이 직무에 지원한 이유는 무엇인가요?", "제공된 채용 안내의 회사·업무 특징과 자신의 관심·강점·경험을 연결.",
             "사람들이 쓰기 편한 화면을 만드는 데 관심이 있어 웹 서비스를 만드는 업무에 지원했습니다.", "관심이 있어서 지원했습니다.", "안내된 업무 중 어떤 부분이 본인의 관심이나 경험과 연결되나요?"),
    question("strength", "본인의 강점을 알려 주세요.", "강점과 이를 보여 주는 평소 행동. 회사 경험이나 성공 결과 불필요.",
             "꼼꼼해서 제출 전에 빠진 내용을 다시 확인합니다.", "저는 성실합니다.", "그 강점을 보여 주는 평소 행동을 설명해 주세요."),
    question("weakness", "본인의 약점과 보완 방법을 알려 주세요.", "어려운 점과 보완하려는 방법. 이미 극복한 결과 불필요.",
             "발표할 때 긴장해서 미리 소리 내어 연습합니다.", "발표가 어렵습니다.", "그 어려움을 보완하기 위해 무엇을 해 볼 수 있나요?",
             items=[
                 {"item_id": "weakness_description", "acceptance": "어려운 점(약점) 설명"},
                 {"item_id": "improvement_method", "acceptance": "보완하려는 방법 설명"}
             ]),
    question("teamwork", "다른 사람과 함께한 활동에서 어떤 역할을 했나요?", "함께한 활동과 본인이 맡거나 도운 일. 수업·동아리·아르바이트 인정. 경험 없음은 감점하지 않고 대체 질문.",
             "팀 과제에서 친구들이 모은 자료를 발표 순서에 맞게 정리했습니다.", "팀 과제를 했습니다.", "함께한 활동에서 직접 맡거나 도운 일을 설명해 주세요."),
    question("plans", "입사하면 어떤 업무를 배우거나 해 보고 싶나요?", "채용 안내와 연결되는 업무·학습 관심 하나. 거창한 장기 목표 불필요.",
             "서버에서 데이터를 저장하고 조회하는 기능을 배워 보고 싶습니다.", "열심히 하겠습니다.", "안내된 업무 중 배우거나 해 보고 싶은 일을 구체적으로 말해 주세요."),
]
COMMON = [
    # 1. intro (자기소개) 질문 수정 부분
    question("intro", "자기소개를 해 주세요.", "관심·강점·경험 중 하나로 자신을 설명. 이름·학교만 있으면 부족. 길이·성과·STAR 형식 불필요.",
             "저는 팀 과제에서 빠진 일을 찾아 챙기는 것을 좋아합니다.", "저는 김민수이고 대학생입니다.", "관심이나 강점, 경험 중 하나를 더 소개해 주세요.",
             items=[
                 {"item_id": "self_introduction_focus", "acceptance": "관심·강점·경험 중 하나로 자신을 설명"}
             ]),

    # 2. motivation (지원 동기) 질문 수정 부분
    question("motivation", "우리 회사의 이 직무에 지원한 이유는 무엇인가요?", "제공된 채용 안내의 회사·업무 특징과 자신의 관심·강점·경험을 연결.",
             "사람들이 쓰기 편한 화면을 만드는 데 관심이 있어 웹 서비스를 만드는 업무에 지원했습니다.", "관심이 있어서 지원했습니다.", "안내된 업무 중 어떤 부분이 본인의 관심이나 경험과 연결되나요?",
             items=[
                 {"item_id": "company_feature_connection", "acceptance": "회사의 업무 특징 언급"},
                 {"item_id": "personal_experience_connection", "acceptance": "본인의 관심·강점·경험과 연결"}
             ]),

    # 3. strength (강점) 질문 수정 부분
    question("strength", "본인의 강점을 알려 주세요.", "강점과 이를 보여 주는 평소 행동. 회사 경험이나 성공 결과 불필요.",
             "꼼꼼해서 제출 전에 빠진 내용을 다시 확인합니다.", "저는 성실합니다.", "그 강점을 보여 주는 평소 행동을 설명해 주세요.",
             items=[
                 {"item_id": "strength_description", "acceptance": "본인의 강점 설명"},
                 {"item_id": "daily_behavior_evidence", "acceptance": "강점을 보여주는 평소 행동 설명"}
             ]),

    # # 4. weakness (약점) 질문 수정 부분 
    question("weakness", "본인의 약점과 보완 방법을 알려 주세요.", "어려운 점과 보완하려는 방법. 이미 극복한 결과 불필요.",
                 "발표할 때 긴장해서 미리 소리 내어 연습합니다.", "발표가 어렵습니다.", "그 어려움을 보완하기 위해 무엇을 해 볼 수 있나요?",
                 items=[
                     {"item_id": "weakness_description", "acceptance": "어려운 점(약점) 설명"},
                     {"item_id": "improvement_method", "acceptance": "보완하려는 방법 설명"}
                 ]),

    # 5. teamwork (협업) 질문 수정 부분
    question("teamwork", "다른 사람과 함께한 활동에서 어떤 역할을 했나요?", "함께한 활동과 본인이 맡거나 도운 일. 수업·동아리·아르바이트 인정. 경험 없음은 감점하지 않고 대체 질문.",
             "팀 과제에서 친구들이 모은 자료를 발표 순서에 맞게 정리했습니다.", "팀 과제를 했습니다.", "함께한 활동에서 직접 맡거나 도운 일을 설명해 주세요.",
             items=[
                 {"item_id": "activity_description", "acceptance": "함께한 활동 설명"},
                 {"item_id": "personal_role", "acceptance": "본인이 맡거나 도운 일 설명"}
             ]),

    # 6. plans (입사 후 포부) 질문 수정 부분
    question("plans", "입사하면 어떤 업무를 배우거나 해 보고 싶나요?", "채용 안내와 연결되는 업무·학습 관심 하나. 거창한 장기 목표 불필요.",
             "서버에서 데이터를 저장하고 조회하는 기능을 배워 보고 싶습니다.", "열심히 하겠습니다.", "안내된 업무 중 배우거나 해 보고 싶은 일을 구체적으로 말해 주세요.",
             items=[
                 {"item_id": "desired_task", "acceptance": "채용 안내와 연결되는 업무나 학습 관심 설명"}
             ]),
]
JOBS = {
    "fullstack": [
        question("fs-roles", "프론트엔드와 백엔드는 각각 어떤 역할을 하나요?", "사용자 화면·조작과 서버 요청 처리·데이터 관리의 역할을 구분. 같은 뜻의 쉬운 표현 인정.",
                 "프론트는 사용자가 보는 화면이고 백엔드는 서버에서 요청을 처리하고 데이터를 관리합니다.", "프론트엔드는 화면을 만듭니다.", "화면 쪽과 서버 쪽의 역할을 각각 설명해 주세요.",
                 ("API를 통해 요청과 응답을 주고받는다고 올바르게 설명", "서버가 입력값이나 요청의 유효성을 검증한다고 올바르게 설명")),
        question("fs-login", "사용자가 로그인 버튼을 누르면 서버와 어떤 과정을 거쳐 로그인되나요?", "화면에서 로그인 정보를 서버로 전송 → 서버 확인 → 성공·실패 결과 반환. 잘못된 보안 설명은 부족으로 보고 한 번 보완 기회.",
                 "입력 정보를 서버로 보내면 서버가 맞는 정보인지 확인해서 성공이나 실패 결과를 돌려줍니다.", "버튼을 누르면 로그인 화면이 사라집니다.", "정보를 보낸 뒤 서버가 확인하고 결과를 돌려주는 과정을 설명해 주세요.",
                 ("평문 비밀번호 저장이 아니라 저장된 해시를 이용해 검증한다고 설명", "세션 또는 토큰으로 이후 요청의 로그인 상태를 확인한다고 설명")),
    ],
    "marketing": [
        question("mk-target", "새 상품을 홍보할 때 대상 고객과 홍보 채널을 어떻게 정하나요?", "상품이 필요한 고객과 그 고객에게 맞는 홍보 채널을 모두 설명.",
                 "상품이 필요한 사람을 생각하고 그 사람들이 자주 보는 곳에서 홍보하겠습니다.", "SNS에서 홍보하겠습니다.", "누구에게 홍보하며 그 사람에게 어떤 채널이 맞을까요?",
                 ("관심사·구매 목적 등으로 고객을 구체적으로 구분", "그 고객이 채널을 이용한다는 근거 또는 채널을 시험할 방법 설명")),
        question("mk-results", "홍보가 효과 있었는지 무엇을 보고 판단하나요?", "홍보 목적에 맞는 지표 하나 이상 설명. 판매 목적이면 구매, 인지도 목적이면 도달·조회 등 인정.",
                 "판매가 목적이면 구매가 얼마나 늘었는지 보겠습니다.", "조회 수만 많으면 무조건 성공입니다.", "홍보 목적을 하나 정하고 그 목적에 맞는 확인 방법을 설명해 주세요.",
                 ("방문·광고 노출 등 명시한 대상 중 구매·가입 비율인 전환율 설명", "광고비 대비 매출이나 고객 확보 비용 등 비용 대비 성과 설명")),
    ],
    "sales": [
        question("sales-needs", "처음 만난 고객에게 상품을 제안하기 전에 무엇을 확인하나요?", "고객의 어려움과 필요한 것을 먼저 확인한다고 설명.",
                 "고객이 어떤 어려움이 있고 무엇이 필요한지 먼저 물어보겠습니다.", "가장 비싼 상품부터 소개합니다.", "상품을 소개하기 전에 고객에게 어떤 내용을 물어볼까요?",
                 ("현재 방법과 불편함을 구체적으로 확인하고 가장 중요한 요구를 파악", "예산·도입 시기·구매 결정 과정 중 하나 이상 확인")),
        question("sales-price", "고객이 가격이 비싸다고 하면 어떻게 대응하나요?", "부담 이유를 확인하고 설명 또는 대안이라는 대응 방향 제시. 무조건 압박·할인만 하면 부족.",
                 "가격이 부담되는 이유를 물어본 뒤 설명하거나 대안을 제안하겠습니다.", "무조건 할인해 주겠습니다.", "비싸다고 느끼는 이유를 어떻게 확인하고 대응할지 설명해 주세요.",
                 ("예산 부족인지 다른 상품과의 비교인지 등 이유를 구체적으로 구분", "고객에게 필요한 이점을 설명하거나 필요·예산에 맞는 다른 구성 제안")),
    ],
}


def rubric(role):
    title, brief = ROLES[role]
    questions = deepcopy([q for q in COMMON if role != "fullstack" or q["id"] not in {"strength", "weakness"}])
    for q in questions:
        if role != "fullstack" and q["id"] in {"motivation", "plans"}:
            task = "고객 조사와 홍보 콘텐츠 제작" if role == "marketing" else "고객 요구 파악과 서비스 소개"
            q["examples"][0]["answer"] = f"{task}에 관심이 있어 해당 업무를 배우고 싶습니다."
    questions.extend(deepcopy(JOBS[role]))
    return {"version": VERSION, "role": role, "title": title, "brief": brief, "questions": questions}


def packs():
    output = []
    for role in ROLES:
        data = rubric(role)
        output.append({"slug": f"interview-{role}", "title": f"신입 {data['title']} 일반면접",
            "description": data["brief"], "job_role": role, "domain": "interview",
            "rubric_weights": {"response": .25, "voice": .25, "expression": .25, "posture": .25},
            "world_setting": {"service_modes": ["interview"], "user_role": f"신입 {data['title']} 지원자",
                "interaction": {"interview_rubric": data, "interview_questions": [q["text"] for q in data["questions"]]}},
            "characters": [{"id": "interviewer", "name": "면접관", "role": "면접관", "role_key": "interviewer",
                "personality": "경력 없는 신입에게 차분하게 질문하며 수업·동아리 경험도 인정한다."}],
            "episodes": [{"order": 1, "title": f"일반면접 · {len(data['questions'])}개 질문", "character_id": "interviewer",
                "initial_question": data["questions"][0]["text"], "situation": data["brief"],
                "question_intent": "기본 질문과 직무 지식 확인", "checklist": [], "modes": [5, 10]}]})
    return output
