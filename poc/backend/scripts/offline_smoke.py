"""오프라인 모드 풀세션 스모크 테스트 — 인터넷 0으로 로컬 STT/TTS 경로를 재현한다.

전시장 네트워크가 끊긴 상태를 가정하고, 세션 생성→턴 응답(오디오 업로드→서버
whisper 전사)→마무리→분석→리포트까지 실제 파이프라인을 한 바퀴 돌려 본다.

  로컬 TTS(macOS `say`, 기본 Yuna)로 한국어 답변 WAV 생성  ─▶  say는 완전 오프라인
  서버 whisper(로컬 STT)가 그 WAV를 전사                    ─▶  오프라인 모드가 타는 경로
  전체 세션 파이프라인(응답·음성·비언어·분석·리포트)          ─▶  결과 리포트 출력

물리 마이크/카메라 없이 돌리는 스모크이므로 비언어 지표는 합성값이다 —
voice/eye/posture 점수의 절대값이 아니라 "오프라인에서 완주하고 리포트가 나온다"를
확인하는 용도. 실제 오프라인 STT(whisper 전사)만은 진짜 로컬 경로 그대로다.

전제:  macOS(`say`) · 백엔드 기동(:8000) · server_stt=whisper(faster-whisper 설치)
실행:  python -m scripts.offline_smoke        (backend/ 에서, 서버가 떠 있는 상태)
       BASE_URL=http://127.0.0.1:8000/api python -m scripts.offline_smoke

client_key를 'demo-'로 시작하게 만들어 실제 코호트·지표에서 제외된다
(정리: python -m app.seed.demo_data --clean).
"""
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx
import soundfile as sf

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8000/api")
VOICE = os.environ.get("SAY_VOICE", "Yuna")

# 신입(클라우드밋 입사) 역할극에 어울리는, 화법 프레임을 갖춘 답변 풀.
# 결론 선행·근거·시점 약속·책임 문형을 의도적으로 담아 Response-Fit이 유의미하게 나오게 함.
ANSWERS = [
    "안녕하세요, 오늘 합류한 신입 김지연입니다. 플랫폼팀에서 운영 지원을 맡게 됐습니다. 잘 부탁드립니다.",
    "결론부터 말씀드리면 오늘 목표는 개발 환경 셋업까지 끝내는 것입니다. 모르는 부분은 바로 여쭤보면서 배우겠습니다.",
    "네, 확인했습니다. 접수된 증상은 파악했고 정확한 원인은 지금 확인 중입니다. 15분 안에 1차 결과를 회신드리겠습니다.",
    "제가 판단하기 어려운 부분이라, 바로 선임님께 공유하고 함께 보겠습니다. 죄송하지만 임의로 처리하지는 않겠습니다.",
    "원인은 오전 배포에 포함된 인증 설정 오류였습니다. 다음부터는 배포 직후 모니터링 알림을 제가 먼저 확인하겠습니다.",
    "지금은 선약이 있어 참석이 어렵습니다. 대신 다음 회식에는 꼭 함께하겠습니다. 챙겨주셔서 감사합니다.",
    "말씀해주신 피드백 감사합니다. 바로 반영해서 오늘 퇴근 전까지 수정본을 공유드리겠습니다.",
    "네, 좋습니다. 첫날인데 불러주셔서 감사합니다. 열심히 배워서 빨리 팀에 보탬이 되겠습니다.",
]


def make_wav(text: str, idx: int, out_dir: Path) -> Path:
    """로컬 음성으로 16kHz mono WAV 생성 (인터넷 불필요)."""
    path = out_dir / f"turn{idx}.wav"
    subprocess.run(
        ["say", "-v", VOICE, "-o", str(path),
         "--file-format=WAVE", "--data-format=LEI16@16000", text],
        check=True,
    )
    return path


def nonverbal(idx: int, duration_ms: int) -> dict:
    """합성 비언어 페이로드 — 카메라 없이 eye/posture 채점이 돌아가게 하는 그럴듯한 값.
    턴마다 살짝 흔들어 압박 턴에서 소폭 악화(composure 교차 분석 재료)를 만든다."""
    frames = max(10, duration_ms // 200)
    wobble = 0.08 if idx % 3 == 2 else 0.0
    return {
        "front_gaze_ratio": round(0.78 - wobble, 2),
        "answering_front_ratio": round(0.80 - wobble, 2),
        "listening_front_ratio": 0.85,
        "gaze_off_count": 2 + (idx % 2),
        "longest_off_sec": round(1.2 + wobble * 5, 1),
        "contact_bout_mean_sec": 4.5,
        "avg_shoulder_tilt_deg": round(2.5 + wobble * 10, 1),
        "head_down_ratio": round(0.10 + wobble, 2),
        "posture_sway": round(0.03 + wobble / 4, 3),
        "tilt_drift_deg": 1.0,
        "blink_per_min": 18 + (10 if idx % 3 == 2 else 0),
        "blink_base_per_min": 16,
        "mouth_press_ratio": round(0.10 + wobble, 2),
        "smile_ratio": 0.08,
        "frames": frames,
        "sample_ms": 200,
        "calibrated": True,
        "gaze_zones": [0, 1, 0, 1, frames - 4, 1, 0, 1, 0],
        "timeline": [
            {"t": 0.0, "front": 0.8, "press": 0.1, "tilt": 2.5},
            {"t": 2.0, "front": round(0.75 - wobble, 2), "press": round(0.1 + wobble, 2), "tilt": 3.0},
        ],
        "nod_count": 2,
        "listen_sec": 6.0,
        "answer_offset_sec": 1.0,
    }


def main() -> int:
    out_dir = Path(tempfile.mkdtemp(prefix="offline_smoke_"))
    c = httpx.Client(timeout=120)
    ck = f"demo-offline-{int(time.time())}"  # demo- 프리픽스 → 실제 코호트에서 제외

    health = c.get(f"{BASE.rstrip('/')}/health").json()
    print(f"server_stt = {health.get('server_stt')} | ollama = {health.get('ollama', {}).get('reachable')}")
    if health.get("server_stt") != "whisper":
        print("!! server_stt가 whisper가 아닙니다 — faster-whisper 설치 후 재시도 (Vosk도 로컬이나 품질↓)")

    # 1) 세션 생성 (pressure 난이도 — 압박 턴으로 composure 교차 분석까지 자극)
    r = c.post(f"{BASE}/sessions", json={
        "mode": 5, "difficulty": "pressure", "client_key": ck,
        "consent": {"agreed": True, "storage_policy": "anonymous"},
    })
    r.raise_for_status()
    s = r.json()
    sid, token = s["id"], s["access_token"]
    hdr = {"X-Session-Token": token}
    turn = s["current_turn"]
    print(f"\n[세션 {sid}] 시나리오='{s['scenario']['title']}' 난이도={s['difficulty']} mode={s['mode']}  ck={ck}\n")

    # 2) 턴 루프 — 오디오 업로드(→서버 whisper 전사) → 응답 제출
    idx, transcripts = 0, []
    while turn is not None and idx < len(ANSWERS):
        tid = turn["id"]
        say_text = ANSWERS[idx]
        wav = make_wav(say_text, idx, out_dir)
        dur_ms = int(len(sf.read(str(wav))[0]) / 16000 * 1000)

        print(f"── 턴 {turn['order']} ({turn['question_type']}) [{turn['character_id']}]")
        print(f"   Q: {turn['question_text'][:70]}")

        with open(wav, "rb") as f:  # 오프라인 STT: 오디오만 올리고 서버 whisper가 텍스트 생성
            up = c.post(f"{BASE}/sessions/{sid}/turns/{tid}/audio",
                        headers=hdr, files={"file": ("turn.wav", f, "audio/wav")})
        up.raise_for_status()
        stt_text = up.json().get("transcript", "")
        transcripts.append((say_text, stt_text))
        print(f"   whisper 전사: {stt_text[:60]}…\n")

        resp = c.post(f"{BASE}/sessions/{sid}/turns/{tid}/response", headers=hdr, json={
            "text": "", "stt_source": "whisper", "duration_ms": dur_ms,  # text="" → 서버 전사 사용
            "nonverbal": nonverbal(idx, dur_ms),
        })
        resp.raise_for_status()
        nxt = resp.json()
        turn = None if nxt["finished"] else nxt["next_turn"]
        idx += 1

    # 3) 마무리 → 분석 백그라운드 태스크
    c.post(f"{BASE}/sessions/{sid}/finish", headers=hdr).raise_for_status()
    print("[분석 시작] 진행률 폴링…")
    stage = ""
    for _ in range(120):
        time.sleep(1)
        pr = c.get(f"{BASE}/sessions/{sid}/progress", headers=hdr).json()
        stage = pr.get("stage", "")
        sys.stdout.write(f"\r  진행: {stage} {pr.get('pct', 0)}%   ")
        sys.stdout.flush()
        if stage in ("done", "error") or pr.get("status") == "completed":
            break
    print()
    if stage == "error":
        print("!! 분석 오류")
        return 1

    # 4) 리포트
    R = c.get(f"{BASE}/sessions/{sid}/report", headers=hdr).json()
    print("\n" + "=" * 60)
    print(f"리포트 — 종합 {R['total_score']}점")
    print("=" * 60)
    for fit, d in R["fit_scores"].items():
        sc = d.get("score")
        metrics = ", ".join(m["label"] + " " + m["value"] for m in d.get("metrics", [])[:3])
        print(f"  {fit:9s}: {sc if sc is not None else '미측정'}" + (f"   ({metrics})" if metrics else ""))
    da = R.get("deep_analysis", {})
    cards = ", ".join(k for k in ("delivery", "composure", "adaptation", "moments", "cohort") if da.get(k))
    print(f"\n  심층 분석 카드: {cards or '없음'}")

    print("\n" + "-" * 60)
    print("오프라인 STT 검증 — whisper 전사 (인터넷 미사용)")
    print("-" * 60)
    ok = sum(1 for _, got in transcripts if got.strip())
    for _, got in transcripts:
        print(f"  [{'OK' if got.strip() else '빈값'}] {got[:55]}")
    print(f"\n  전사 성공 {ok}/{len(transcripts)} 턴")
    print(f"\n  (임시 WAV: {out_dir} — 필요 없으면 삭제)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
