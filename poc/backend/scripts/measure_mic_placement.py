r"""마이크 배치 실측 하니스 — 위치별 Voice-Fit 지표 성립 여부 + 떨림 임계 보정 (S-QRGESM).

미러 리그 마이크 배치(입 근접 / 측면 레일 80cm / 하단 등)를 감이 아니라 실측으로
판정하고, demo-checklist §2.5의 떨림 임계값 육성 보정을 같은 데이터로 끝낸다.

사용 (전시 PC PowerShell, backend 루트에서):
    $env:PYTHONUTF8='1'
    .venv\Scripts\python.exe scripts\measure_mic_placement.py devices
    .venv\Scripts\python.exe scripts\measure_mic_placement.py record --position 입근접 --device UFO
    .venv\Scripts\python.exe scripts\measure_mic_placement.py record --position 측면레일80cm --device UFO
    .venv\Scripts\python.exe scripts\measure_mic_placement.py analyze
    .venv\Scripts\python.exe scripts\measure_mic_placement.py analyze --stt   # 전사 CER까지

record는 위치마다 표준 문장 3개 × N회(기본 2) + 부스 소음 5초를 담는다. 같은 사람이
같은 톤으로 모든 위치를 읽어야 위치 간 비교가 성립한다. 마이크는 실물 지오메트리
그대로(거리·각도·타공 유무) 대는 것이 핵심이다.

분석 출력:
- 위치별 SNR(dB)·지표 성립률(jitter/shimmer/F0가 측정되는 비율)·주요 지표 평균
- 배치 확정 위치 기준 MIRROR_TING_TREMOR_*_FLOOR 제안값 (backend/.env에 그대로 붙여넣기)
- (--stt) 서버 STT 전사 CER — 자음 명료도의 대리 지표

녹음은 실제 파이프라인 조건과 동일한 48kHz 모노 16-bit WAV로 저장한다
(브라우저 opus 디코드 → blobToWav 결과가 48kHz — voice_fit은 무리샘플 그대로 분석).
녹음 기능은 sounddevice가 필요하다: .venv\Scripts\pip install sounddevice
"""
import argparse
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.voice_fit import analyze_audio  # noqa: E402
from app.core.config import settings  # noqa: E402

SR = 48000
DATA_DIR = Path(__file__).parent / "mic_placement_data"

# 코칭 프레임워크(PREP 결론 우선·4단계 사과·DESC 거절)에 정렬된 표준 문장 —
# 억양·쉼·말끝 패턴이 서로 달라 지표가 골고루 자극된다.
SENTENCES = [
    "결론부터 말씀드리면, 이번 주 목표는 초과 달성했습니다.",
    "죄송합니다. 제가 일정 공유를 놓쳐서 혼선이 생겼습니다.",
    "지금은 어렵고, 내일 오전까지 정리해서 보고드리겠습니다.",
]

# 지표 성립의 핵심 축 — 이 셋이 None이면 해당 위치는 떨림·긴장 분석을 포기해야 한다
TREMOR_KEYS = ("f0_jitter_pct", "shimmer_pct", "periodicity")
REPORT_KEYS = (
    "f0_mean_hz", "f0_cv", "f0_jitter_pct", "shimmer_pct", "periodicity",
    "energy_cv", "final_fade_pct", "speech_rate_sps", "pause_ratio", "lead_in_sec",
)


def _frame_rms_db(samples: np.ndarray, percentile: float) -> float:
    """프레임 RMS 분포의 백분위(dBFS) — 발화 레벨(p90)·소음 바닥(p50) 추정용."""
    frame, hop = 2048, 512
    n = max(1, (len(samples) - frame) // hop + 1)
    rms = np.array([
        float(np.sqrt(np.mean(samples[i * hop: i * hop + frame] ** 2))) for i in range(n)
    ])
    return float(20 * np.log10(max(np.percentile(rms, percentile), 1e-9)))


# ---------------------------------------------------------------- devices ----

def cmd_devices(_: argparse.Namespace) -> None:
    sd = _sounddevice()
    default_in = sd.default.device[0]
    print("입력 장치 (녹음은 --device <번호|이름 일부>로 선택):")
    for i, dev in enumerate(sd.query_devices()):
        if dev["max_input_channels"] <= 0:
            continue
        mark = " ← 기본" if i == default_in else ""
        print(f"  [{i:2d}] {dev['name']}  (ch {dev['max_input_channels']}){mark}")


def _sounddevice():
    try:
        import sounddevice as sd
        return sd
    except ImportError:
        sys.exit("sounddevice가 없습니다. 설치: .venv\\Scripts\\pip install sounddevice")


def _pick_device(sd, spec: str | None) -> int | None:
    if spec is None:
        return None  # 시스템 기본
    if spec.isdigit():
        return int(spec)
    for i, dev in enumerate(sd.query_devices()):
        if dev["max_input_channels"] > 0 and spec.lower() in dev["name"].lower():
            return i
    sys.exit(f"입력 장치에서 '{spec}'을(를) 찾지 못했습니다. devices 명령으로 확인하세요.")


# ----------------------------------------------------------------- record ----

def _capture(sd, seconds: float, device: int | None) -> np.ndarray:
    buf = sd.rec(int(seconds * SR), samplerate=SR, channels=1,
                 dtype="float32", device=device)
    sd.wait()
    return buf[:, 0]


def cmd_record(args: argparse.Namespace) -> None:
    sd = _sounddevice()
    device = _pick_device(sd, args.device)
    dev_name = sd.query_devices()[device]["name"] if device is not None \
        else sd.query_devices()[sd.default.device[0]]["name"]
    pos_dir = Path(args.dir) / args.position
    pos_dir.mkdir(parents=True, exist_ok=True)

    print(f"위치: {args.position} · 장치: {dev_name}")
    print("마이크를 실물 지오메트리대로 고정하세요 (거리·각도·타공 유무까지 재현).")
    print(f"문장 {len(SENTENCES)}개 × {args.takes}회 + 소음 {args.noise_seconds:.0f}초를 녹음합니다.")
    print("각 문장은 카운트다운 직후 바로, 평소 보고하듯 안정된 톤으로 읽습니다.\n")

    meta = {"position": args.position, "device": dev_name, "sr": SR,
            "recorded_at": datetime.now().isoformat(timespec="seconds"), "files": []}

    for take in range(1, args.takes + 1):
        for si, text in enumerate(SENTENCES, start=1):
            print(f"[{take}회차 · 문장 {si}] {text}")
            input("  준비되면 Enter → 3초 카운트다운 후 녹음")
            for n in (3, 2, 1):
                print(f"  {n}...", flush=True)
                time.sleep(0.7)
            print(f"  ● 녹음 중 ({args.seconds:.0f}초)")
            samples = _capture(sd, args.seconds, device)
            path = pos_dir / f"take{take}_s{si}.wav"
            sf.write(path, samples, SR, subtype="PCM_16")
            speech_db = _frame_rms_db(samples, 90)
            peak = float(np.abs(samples).max())
            note = ""
            if peak >= 0.99:
                note = " ⚠ 클리핑 — 게인을 내리고 이 테이크를 다시 녹음하세요"
            elif speech_db < -45:
                note = " ⚠ 레벨 낮음 — 게인을 올리거나 거리를 확인하세요"
            print(f"  저장 {path.name} · 발화 레벨 {speech_db:.1f} dBFS · 피크 {peak:.2f}{note}\n")
            meta["files"].append({"path": path.name, "text": text})

    input(f"[소음 캡처] 아무도 말하지 않는 상태로 Enter → {args.noise_seconds:.0f}초 녹음")
    noise = _capture(sd, args.noise_seconds, device)
    sf.write(pos_dir / "noise.wav", noise, SR, subtype="PCM_16")
    meta["noise"] = "noise.wav"
    (pos_dir / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"완료 — {pos_dir}. 다음 위치를 녹음하거나 analyze를 실행하세요.")


# ---------------------------------------------------------------- analyze ----

def _cer(ref: str, hyp: str) -> float:
    """문자 오류율 — 공백·문장부호 제거 후 레벤슈타인/참조 길이."""
    norm = lambda s: re.sub(r"[^0-9A-Za-z가-힣]", "", s)  # noqa: E731
    r, h = norm(ref), norm(hyp)
    if not r:
        return 0.0
    prev = list(range(len(h) + 1))
    for i, rc in enumerate(r, 1):
        cur = [i]
        for j, hc in enumerate(h, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rc != hc)))
        prev = cur
    return prev[-1] / len(r)


def _load_position(pos_dir: Path) -> dict | None:
    meta_path = pos_dir / "meta.json"
    if not meta_path.exists():
        return None
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    rows = []
    for item in meta["files"]:
        path = pos_dir / item["path"]
        if not path.exists():
            continue
        metrics = analyze_audio(str(path), item["text"])
        samples, _ = sf.read(path, dtype="float32", always_2d=False)
        rows.append({"path": path, "text": item["text"], "metrics": metrics,
                     "speech_db": _frame_rms_db(samples, 90)})
    snr = None
    noise_path = pos_dir / meta.get("noise", "noise.wav")
    if rows and noise_path.exists():
        noise, _ = sf.read(noise_path, dtype="float32", always_2d=False)
        noise_db = _frame_rms_db(noise, 50)
        snr = float(np.mean([r["speech_db"] for r in rows]) - noise_db)
    return {"name": pos_dir.name, "rows": rows, "snr": snr, "device": meta.get("device", "?")}


def _mean(values: list) -> float | None:
    vals = [v for v in values if v is not None]
    return float(np.mean(vals)) if vals else None


def cmd_analyze(args: argparse.Namespace) -> None:
    base = Path(args.dir)
    positions = [p for d in sorted(base.iterdir()) if d.is_dir()
                 and (p := _load_position(d)) and p["rows"]] if base.exists() else []
    if not positions:
        sys.exit(f"{base}에 분석할 위치가 없습니다. 먼저 record를 실행하세요.")

    stt = None
    if args.stt:
        from app.ai.stt.base import get_stt_provider
        stt = get_stt_provider()
        print(f"서버 STT: {stt.name if stt else '없음(건너뜀)'}\n")

    for pos in positions:
        n = len(pos["rows"])
        alive = {k: sum(1 for r in pos["rows"] if r["metrics"].get(k) is not None)
                 for k in TREMOR_KEYS}
        snr_txt = f"{pos['snr']:.1f} dB" if pos["snr"] is not None else "소음 파일 없음"
        print(f"── {pos['name']}  (n={n} · 장치 {pos['device']} · SNR {snr_txt})")
        print("   지표 성립률: " + " · ".join(f"{k} {alive[k]}/{n}" for k in TREMOR_KEYS))
        for key in REPORT_KEYS:
            m = _mean([r["metrics"].get(key) for r in pos["rows"]])
            print(f"   {key:18s} {'—' if m is None else f'{m:8.2f}'}")
        if stt is not None:
            cers = []
            for r in pos["rows"]:
                hyp = stt.transcribe(str(r["path"]))
                cers.append(_cer(r["text"], hyp))
            print(f"   stt_cer            {np.mean(cers) * 100:8.1f} %  (낮을수록 명료)")
        print()

    # 판정 — SNR 최고 위치를 기준으로 나머지의 손실을 요약한다
    ranked = sorted([p for p in positions if p["snr"] is not None],
                    key=lambda p: p["snr"], reverse=True)
    if len(ranked) >= 2:
        ref = ranked[0]
        print(f"기준 위치(최고 SNR): {ref['name']}")
        for pos in ranked[1:]:
            d_snr = pos["snr"] - ref["snr"]
            n = len(pos["rows"])
            tremor_ok = sum(
                1 for r in pos["rows"]
                if all(r["metrics"].get(k) is not None for k in ("f0_jitter_pct", "shimmer_pct"))
            )
            verdict = "성립" if tremor_ok == n and d_snr > -10 else \
                "조건부(흡음·게인 보강 필요)" if tremor_ok >= n // 2 else "탈락 권고"
            print(f"  {pos['name']}: SNR {d_snr:+.1f} dB · 떨림축 {tremor_ok}/{n} → {verdict}")
        print()

    # 떨림 임계 제안 — 안정 육성의 관측 최대치 × 1.3 (오탐 여유), 기본값 미만이면 유지.
    # 배치를 확정한 위치의 값을 backend/.env에 넣는다 (demo-checklist §2.5).
    print("떨림 임계 제안 (안정 육성 기준 — 확정 배치 위치의 값을 사용):")
    for pos in positions:
        jit = [r["metrics"].get("f0_jitter_pct") for r in pos["rows"]]
        shm = [r["metrics"].get("shimmer_pct") for r in pos["rows"]]
        jit = [v for v in jit if v is not None]
        shm = [v for v in shm if v is not None]
        if not jit or not shm:
            print(f"  {pos['name']}: 표본 부족 — 떨림축 미성립")
            continue
        j_floor = max(settings.tremor_jitter_floor, round(max(jit) * 1.3, 1))
        s_floor = max(settings.tremor_shimmer_floor, round(max(shm) * 1.3, 1))
        keep_j = " (기본값 유지)" if j_floor == settings.tremor_jitter_floor else ""
        keep_s = " (기본값 유지)" if s_floor == settings.tremor_shimmer_floor else ""
        print(f"  {pos['name']}: 관측 jitter 최대 {max(jit):.1f}% · shimmer 최대 {max(shm):.1f}%")
        print(f"    MIRROR_TING_TREMOR_JITTER_FLOOR={j_floor}{keep_j}")
        print(f"    MIRROR_TING_TREMOR_SHIMMER_FLOOR={s_floor}{keep_s}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("devices", help="입력 장치 나열")

    rec = sub.add_parser("record", help="위치 하나를 녹음 (문장 3 × N회 + 소음)")
    rec.add_argument("--position", required=True, help="위치 라벨 (예: 입근접, 측면레일80cm)")
    rec.add_argument("--device", default=None, help="장치 번호 또는 이름 일부 (기본: 시스템 기본)")
    rec.add_argument("--takes", type=int, default=2, help="문장당 반복 횟수 (기본 2)")
    rec.add_argument("--seconds", type=float, default=8.0, help="문장당 녹음 길이 (기본 8초)")
    rec.add_argument("--noise-seconds", type=float, default=5.0, help="소음 캡처 길이")
    rec.add_argument("--dir", default=str(DATA_DIR), help="저장 루트")

    ana = sub.add_parser("analyze", help="녹음된 위치 전체 비교 분석")
    ana.add_argument("--dir", default=str(DATA_DIR), help="데이터 루트")
    ana.add_argument("--stt", action="store_true", help="서버 STT 전사 CER 포함 (모델 로드 수십 초)")

    args = parser.parse_args()
    {"devices": cmd_devices, "record": cmd_record, "analyze": cmd_analyze}[args.cmd](args)


if __name__ == "__main__":
    main()
