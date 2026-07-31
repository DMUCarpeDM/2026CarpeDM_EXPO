import { strict as assert } from "node:assert";
import { test } from "node:test";
import { composeTurnSpeech } from "./turnSpeech.js";

test("리액션과 질문을 같은 화자일 때 한 호흡으로 합친다", () => {
  const speech = composeTurnSpeech({
    character_id: "kim_teamlead",
    reaction_character_id: "kim_teamlead",
    reaction_text: "얼굴에 긴장이 좀 보이네요. 괜찮아요.",
    question_text: "그럼 다음 일정은 어떻게 조정할 건가요?",
  });
  assert.equal(speech, "얼굴에 긴장이 좀 보이네요. 괜찮아요. 그럼 다음 일정은 어떻게 조정할 건가요?");
});

test("화자가 다르면(에피소드 전환) 리액션은 읽지 않는다", () => {
  const speech = composeTurnSpeech({
    character_id: "park_senior",
    reaction_character_id: "kim_teamlead",
    reaction_text: "좋아요. 그 방향으로 갑시다.",
    question_text: "이어서 제가 하나 여쭤볼게요.",
  });
  assert.equal(speech, "이어서 제가 하나 여쭤볼게요.");
});

test("리액션이 없으면 질문만 (첫 턴·풀 소진)", () => {
  assert.equal(
    composeTurnSpeech({ character_id: "kim_teamlead", reaction_character_id: "", reaction_text: "", question_text: "첫 질문입니다." }),
    "첫 질문입니다.",
  );
});

test("턴이 없으면 빈 문자열 (TTS 게이트와 동일 계약)", () => {
  assert.equal(composeTurnSpeech(null), "");
  assert.equal(composeTurnSpeech(undefined), "");
});
