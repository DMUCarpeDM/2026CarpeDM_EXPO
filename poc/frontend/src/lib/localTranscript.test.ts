/** localTranscript 유닛 테스트 — 손상된 localStorage 사본이 리포트를 깨지 않는다.
 *
 * 실행: npm test (frontend/) — node --test, 의존성 없음.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLocalAnswers } from './localTranscript.ts';

test('parseLocalAnswers — 정상 사본을 order→답변 맵으로 복원한다', () => {
  const raw = JSON.stringify({
    v: 1,
    answers: { 1: '결론부터 말씀드리면 일정 연기가 낫습니다', 3: '기한은 금요일까지입니다' },
  });
  assert.deepEqual(parseLocalAnswers(raw), {
    1: '결론부터 말씀드리면 일정 연기가 낫습니다',
    3: '기한은 금요일까지입니다',
  });
});

test('parseLocalAnswers — 빈 값·손상 JSON은 빈 맵 (리포트는 서버 파기 안내로 폴백)', () => {
  assert.deepEqual(parseLocalAnswers(null), {});
  assert.deepEqual(parseLocalAnswers(''), {});
  assert.deepEqual(parseLocalAnswers('not-json{'), {});
  assert.deepEqual(parseLocalAnswers(JSON.stringify({ answers: 'oops' })), {});
  assert.deepEqual(parseLocalAnswers(JSON.stringify({ v: 1 })), {});
});

test('parseLocalAnswers — 무효 순번·비문자열·공백 답변은 걸러낸다', () => {
  const raw = JSON.stringify({
    v: 1,
    answers: { 0: '순번 0은 무효', '-1': 'x', 1.5: 'y', 2: 42, 4: '   ', 5: '유효한 답변' },
  });
  assert.deepEqual(parseLocalAnswers(raw), { 5: '유효한 답변' });
});
