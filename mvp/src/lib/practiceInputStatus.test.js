import assert from "node:assert/strict";
import test from "node:test";
import { practiceInputStatus } from "./practiceInputStatus.js";

const ready = { turn: {}, sttMode: "webspeech", micEnabled: true, hasMicrophone: true };
test("practice instructions reflect state without claiming recording", () => {
  for (const [state, title] of [
    [{}, "음성 인식 대기"], [{ listening: true }, "음성 인식 중"],
    [{ hasMicrophone: false, listening: true }, "직접 입력"], [{ textOnly: true }, "직접 입력"],
    [{ sttMode: "off" }, "직접 입력"], [{ micEnabled: false }, "직접 입력"],
    [{ aiSpeaking: true, listening: true }, "AI 질문 듣는 중"],
    [{ paused: true, listening: true }, "진행 일시정지"],
    [{ entryOverlayOpen: true }, "연습 준비 중"], [{ turn: null }, "질문 대기 중"],
    [{ busy: true, paused: true }, "답변 처리 중"],
  ]) assert.equal(practiceInputStatus({ ...ready, ...state }).title, title);
});
