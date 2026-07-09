"""템플릿 기반 대화 엔진 (S-VMSURA 대화 턴 카운팅/종료, S-WOTZZX 모드별 에피소드).

규칙:
- 에피소드는 order 순으로 진행하고, 모드(5/10분)에 해당하는 것만 사용한다.
- 응답에서 체크리스트 누락 항목이 있으면 가중치가 가장 높은 누락 항목의 후속 질문을 던진다(개인화).
- 압박 난이도에서는 누락이 없어도 에피소드당 1회 압박 질문을 던진다.
- **누락이 없어도(=잘한 답에도) 심화 질문(deepening)으로 장면을 이어간다** —
  후속이 누락 '교정'이라면 심화는 장면 '전개'. 상황당 1답변으로 장면이 증발하던
  문제의 해법으로, 예산이 허락하면 에피소드당 2턴이 기본이 된다. 에피소드당 1회,
  재도전 변주를 위해 세션 id로 풀에서 회전 선택.
- 에피소드별 max_turns와 세션 전체 턴 예산을 지키며, 남은 에피소드가 최소 1턴씩
  진행될 수 있도록 후속·심화 질문을 아낀다.
- 새 에피소드 도입은 수행도(rapport) 3단계에 따라 변주된다(intro_variants) —
  체험자의 대답이 하루의 전개를 실제로 바꾸는 분기 장치.
"""
from app.ai.text_match import matched_checklist_ids
from app.models import Episode, RoleplaySession, Turn
from app.services.dialogue.base import QuestionSpec
from app.services.dialogue.reactions import rapport_level

# 세션 전체 턴 예산 (모드별) — 프론트 타이머와 함께 이중 안전장치
TURN_BUDGET = {5: 6, 10: 11}


class TemplateDialogueProvider:
    def episodes_for_mode(self, episodes: list[Episode], mode: int) -> list[Episode]:
        return sorted(
            [ep for ep in episodes if str(mode) in ep.modes.split(",")],
            key=lambda ep: ep.order,
        )

    def first_question(self, session: RoleplaySession, episodes: list[Episode]) -> QuestionSpec:
        eps = self.episodes_for_mode(episodes, session.mode)
        if not eps:
            raise ValueError("시나리오에 해당 모드의 에피소드가 없습니다")
        first = eps[0]
        return QuestionSpec(
            episode_id=first.id,
            question_type="initial",
            question_text=first.initial_question,
            character_id=first.character_id,
            intent=first.question_intent,
            virtual_time=first.virtual_time or "",
        )

    def next_question(
        self, session: RoleplaySession, episodes: list[Episode], turns: list[Turn]
    ) -> QuestionSpec | None:
        eps = self.episodes_for_mode(episodes, session.mode)
        if not turns:
            return self.first_question(session, episodes)

        last_turn = turns[-1]
        current_ep = next((ep for ep in eps if ep.id == last_turn.episode_id), None)
        if current_ep is None:
            return None

        ep_index = eps.index(current_ep)
        remaining_eps = eps[ep_index + 1:]
        budget_left = TURN_BUDGET.get(session.mode, 8) - len(turns)
        if budget_left <= 0:
            return None

        ep_turns = [t for t in turns if t.episode_id == current_ep.id]
        # 남은 에피소드가 각각 최소 1턴(초기 질문)을 가질 수 있을 때만 현 에피소드에서 추가 질문
        can_extend = (
            len(ep_turns) < current_ep.max_turns
            and budget_left > len(remaining_eps)
        )

        # 발전 턴(압박/심화)은 에피소드당 1개 — 교정(followup)이 끝난 뒤 장면을
        # 한 번 더 전개하고 넘어간다. 이미 발전 턴이 있으면 다음 장면으로 진행
        # (한 상황에 압박+심화가 겹쳐 3턴이 되는 것을 막는다).
        ep_has_development = any(
            t.question_type in ("pressure", "deepening") for t in ep_turns
        )

        if can_extend:
            missing = self._missing_items(current_ep, ep_turns)
            if missing:
                item = missing[0]
                return QuestionSpec(
                    episode_id=current_ep.id,
                    question_type="followup",
                    question_text=item["followup"],
                    character_id=current_ep.character_id,
                    intent=f"누락 요소 확인: {item['label']}",
                    virtual_time=current_ep.virtual_time or "",
                )
            # 발전 턴은 에피소드당 1개 (압박 또는 심화 택일). 이미 있으면 다음 장면으로.
            if not ep_has_development:
                # 우선순위: 압박(난이도) → 기본 난이도 세션당 1회 압박 → 심화 전개
                if session.difficulty == "pressure" and current_ep.pressure_questions:
                    pq = current_ep.pressure_questions[0]
                    return QuestionSpec(
                        episode_id=current_ep.id,
                        question_type="pressure",
                        question_text=pq["text"],
                        character_id=current_ep.character_id,
                        intent="압박 상황 대응 확인",
                        virtual_time=current_ep.virtual_time or "",
                    )
                # 기본 난이도 압박 1회 (세션당): 압박 내성 렌즈(composure)는 압박 턴이
                # 있어야 성립하는데, 기본 난이도에는 압박이 없어 심층 분석의 간판
                # 카드가 비어 있었다. 어떤 답 뒤에도 성립하는(basic 플래그) 압박
                # 질문만 골라 세션에서 딱 한 번 던진다 — 잘한 답 뒤의 에스컬레이션.
                if session.difficulty == "basic" \
                        and not any(t.question_type == "pressure" for t in turns):
                    basic_pq = next(
                        (q for q in (current_ep.pressure_questions or []) if q.get("basic")),
                        None,
                    )
                    if basic_pq is not None:
                        return QuestionSpec(
                            episode_id=current_ep.id,
                            question_type="pressure",
                            question_text=basic_pq["text"],
                            character_id=current_ep.character_id,
                            intent="압박 상황 대응 확인 (기본 난이도 세션당 1회)",
                            virtual_time=current_ep.virtual_time or "",
                        )
                # 심화 — 잘한 답에도 장면이 이어진다. 교정할 게 없을 때의 자연스러운
                # 대화 전개이며, 에피소드당 1회. 재도전 시 다른 질문이 나오도록
                # 세션 id로 풀에서 회전 선택한다 (세션 내에서는 결정적).
                pool = current_ep.deepening_questions or []
                if pool:
                    dq = pool[(session.id or 0) % len(pool)]
                    return QuestionSpec(
                        episode_id=current_ep.id,
                        question_type="deepening",
                        question_text=dq["text"],
                        character_id=current_ep.character_id,
                        intent=dq.get("intent", "장면 심화 전개"),
                        virtual_time=current_ep.virtual_time or "",
                    )

        if remaining_eps:
            nxt = remaining_eps[0]
            # 수행도 분기 — 지금까지의 대답이 다음 장면의 첫마디를 바꾼다
            variants = nxt.intro_variants or {}
            intro = variants.get(rapport_level(session)) or nxt.initial_question
            return QuestionSpec(
                episode_id=nxt.id,
                question_type="initial",
                question_text=intro,
                character_id=nxt.character_id,
                intent=nxt.question_intent,
                virtual_time=nxt.virtual_time or "",
            )
        return None

    def plan_next(
        self, session: RoleplaySession, episodes: list[Episode], turns: list[Turn]
    ) -> QuestionSpec | None:
        return self.next_question(session, episodes, turns)

    def personalize_question(
        self, spec: QuestionSpec, situation: str, last_response: str
    ) -> str | None:
        return None  # 템플릿 엔진은 개인화 없음 — 대본 그대로

    @staticmethod
    def _missing_items(episode: Episode, ep_turns: list[Turn]) -> list[dict]:
        """에피소드 내 모든 응답을 합쳐 아직 커버되지 않은 체크리스트 항목(가중치 내림차순)."""
        combined = " ".join(t.response_text for t in ep_turns if t.response_text)
        covered = matched_checklist_ids(combined, episode.checklist)
        # 이미 같은 항목을 후속 질문으로 물었다면 다시 묻지 않는다
        asked_followups = {t.question_text for t in ep_turns if t.question_type == "followup"}
        missing = [
            item for item in episode.checklist
            if item["id"] not in covered and item["followup"] not in asked_followups
        ]
        return sorted(missing, key=lambda i: i.get("weight", 1.0), reverse=True)


provider = TemplateDialogueProvider()
