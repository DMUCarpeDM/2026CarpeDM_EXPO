"""템플릿 기반 대화 엔진 (S-VMSURA 대화 턴 카운팅/종료, S-WOTZZX 모드별 에피소드).

규칙:
- 에피소드는 order 순으로 진행하고, 모드(5/10분)에 해당하는 것만 사용한다.
- 응답에서 체크리스트 누락 항목이 있으면 가중치가 가장 높은 누락 항목의 후속 질문을 던진다(개인화).
- 압박 난이도에서는 누락이 없어도 에피소드당 1회 압박 질문을 던진다.
- 에피소드별 max_turns와 세션 전체 턴 예산을 지키며, 남은 에피소드가 최소 1턴씩
  진행될 수 있도록 후속 질문을 아낀다.
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
            if session.difficulty == "pressure" and current_ep.pressure_questions:
                pressure_used = any(t.question_type == "pressure" for t in ep_turns)
                if not pressure_used:
                    pq = current_ep.pressure_questions[0]
                    return QuestionSpec(
                        episode_id=current_ep.id,
                        question_type="pressure",
                        question_text=pq["text"],
                        character_id=current_ep.character_id,
                        intent="압박 상황 대응 확인",
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
