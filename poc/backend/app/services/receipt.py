"""퇴근 카드 — 감열 영수증(58mm) 렌더링과 ESC/POS 전송.

체험이 끝나면 4-Fit 결과를 실물 카드로 뽑아 손에 쥐여준다 (전시 테이크아웃).
한글 폰트·코드페이지가 제각각인 저가 감열 모듈 호환성을 위해 텍스트를 찍지 않고
전체를 비트맵(Pretendard)으로 렌더링해 래스터(GS v 0)로 보낸다.

드라이버 2종:
- file   : 프린터 없이 PNG(미리보기)와 .escpos.bin을 media/receipts에 저장 — 개발 기본값
- serial : 감열 프린터 모듈(TTL)을 USB-TTL 어댑터로 연결 (poc/docs/receipt-printer.md)
"""
from __future__ import annotations

import io
import time
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.core.config import settings

# 58mm 감열지의 인쇄폭 48mm × 8dot/mm = 384dot. (80mm 모듈이면 576)
RECEIPT_WIDTH = 384
_MARGIN = 10  # 저가 모듈의 좌우 미세 클리핑 방어

_FONT_DIR = Path(__file__).resolve().parent.parent.parent / "assets" / "fonts"
_FIT_ORDER = ["response", "voice", "eye", "posture"]
_FIT_LABELS = {
    "response": ("응답", "Response"),
    "voice": ("목소리", "Voice"),
    "eye": ("시선", "Eye"),
    "posture": ("자세", "Posture"),
}


@lru_cache(maxsize=16)
def _font(weight: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = _FONT_DIR / f"Pretendard-{weight}.otf"
    try:
        return ImageFont.truetype(str(path), size)
    except OSError:  # 폰트 미동봉 환경(CI 최소 체크아웃 등)에서도 죽지 않게
        return ImageFont.load_default(size)


def _score_grade(score: float) -> str:
    if score >= 80:
        return "GREAT"
    if score >= 60:
        return "GOOD"
    return "KEEP GOING"


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    """한국어 word-wrap — 공백 우선, 넘치는 단어는 음절 단위로 쪼갠다."""
    lines: list[str] = []
    current = ""
    for word in text.split(" "):
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=font) <= max_width:
            current = candidate
            continue
        if current:
            lines.append(current)
        # 단어 하나가 폭을 넘으면 글자 단위 분해
        current = ""
        for ch in word:
            if draw.textlength(current + ch, font=font) <= max_width:
                current += ch
            else:
                lines.append(current)
                current = ch
    if current:
        lines.append(current)
    return lines or [""]


@dataclass
class ReceiptData:
    """렌더러 입력 — ORM에 얽매이지 않는 평평한 구조 (테스트·스크립트에서 직접 구성)."""
    total_score: float
    fit_scores: dict            # {response: {score, summary}, ...}
    headline_sentence: str = ""
    scenario_title: str = ""
    character_name: str = ""
    difficulty: str = "basic"   # basic | pressure
    mode: int = 5
    finished_label: str = ""    # "2026.10.14 14:32"
    percentile_top: int | None = None
    code: str = ""              # 체험 코드 (선택)
    qr_payload: str = ""        # QR 내용 (선택 — 비우면 code로 대체)


class _Canvas:
    """세로로 흘려 쓰는 영수증 캔버스 — 충분히 크게 그리고 마지막에 잘라낸다."""

    def __init__(self, width: int = RECEIPT_WIDTH):
        self.width = width
        self.image = Image.new("L", (width, 2400), 255)
        self.draw = ImageDraw.Draw(self.image)
        self.y = 14

    def space(self, px: int) -> None:
        self.y += px

    def divider(self) -> None:
        self.space(12)
        for x in range(_MARGIN, self.width - _MARGIN, 10):  # 점선
            self.draw.line([(x, self.y), (x + 4, self.y)], fill=0, width=2)
        self.space(14)

    def text(self, s: str, weight: str, size: int, *, align: str = "left",
             wrap: bool = False, line_gap: int = 6) -> None:
        font = _font(weight, size)
        max_w = self.width - _MARGIN * 2
        lines = _wrap(self.draw, s, font, max_w) if wrap else [s]
        for line in lines:
            w = self.draw.textlength(line, font=font)
            x = {"left": _MARGIN, "center": (self.width - w) // 2,
                 "right": self.width - _MARGIN - w}[align]
            self.draw.text((x, self.y), line, font=font, fill=0)
            self.y += size + line_gap

    def bar_row(self, label_ko: str, label_en: str, score: float) -> None:
        """지표 한 줄: 라벨 + 게이지 바 + 점수."""
        font_ko = _font("Bold", 20)
        font_en = _font("Regular", 14)
        font_num = _font("ExtraBold", 22)
        top = self.y
        self.draw.text((_MARGIN, top), label_ko, font=font_ko, fill=0)
        self.draw.text((_MARGIN, top + 24), label_en, font=font_en, fill=0)
        # 게이지: x 110~314, 점수는 오른쪽 정렬
        bar_x, bar_w, bar_h = 110, 200, 14
        bar_y = top + 12
        self.draw.rectangle([bar_x, bar_y, bar_x + bar_w, bar_y + bar_h], outline=0, width=2)
        fill_w = int(bar_w * max(0.0, min(100.0, score)) / 100)
        if fill_w > 4:
            self.draw.rectangle([bar_x + 2, bar_y + 2, bar_x + fill_w - 2, bar_y + bar_h - 2], fill=0)
        num = f"{round(score)}"
        num_w = self.draw.textlength(num, font=font_num)
        self.draw.text((self.width - _MARGIN - num_w, top + 6), num, font=font_num, fill=0)
        self.y = top + 48

    def qr(self, payload: str, box: int = 4) -> tuple[int, int, int]:
        """QR을 왼쪽에 그리고 (x, y, 크기)를 돌려준다 — 오른쪽 텍스트 배치용."""
        import qrcode

        qr = qrcode.QRCode(border=1, box_size=box)
        qr.add_data(payload)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white").convert("L")
        x, y = _MARGIN, self.y
        self.image.paste(img, (x, y))
        return x, y, img.size[0]

    def finish(self) -> Image.Image:
        cropped = self.image.crop((0, 0, self.width, self.y + 18))
        return cropped.point(lambda p: 255 if p > 160 else 0, mode="1")


def render_receipt(data: ReceiptData) -> Image.Image:
    """퇴근 카드 본체 — 1비트(모드 '1') 384px 폭 이미지."""
    c = _Canvas()

    # 헤더 — 브랜드와 카드 이름
    c.text("M I R R O R T I N G", "Bold", 18, align="center")
    c.space(2)
    c.text("퇴근 카드", "ExtraBold", 44, align="center")
    if data.finished_label:
        c.space(2)
        c.text(data.finished_label, "Regular", 18, align="center")
    c.divider()

    # 오늘의 근무 — 시나리오/상대/모드
    meta = data.scenario_title or "직장 대화 연습"
    mode_label = "압박 모드" if data.difficulty == "pressure" else "기본 모드"
    c.text(meta, "Bold", 22, align="center", wrap=True)
    sub = f"{data.character_name} · " if data.character_name else ""
    c.text(f"{sub}{mode_label} · {data.mode}분", "Regular", 18, align="center")
    c.divider()

    # 총점 — 카드의 주인공
    c.text("오늘의 점수", "Regular", 18, align="center")
    c.space(4)
    score_font = _font("ExtraBold", 92)
    unit_font = _font("Bold", 24)
    score_text = f"{round(data.total_score)}"
    sw = c.draw.textlength(score_text, font=score_font)
    uw = c.draw.textlength(" /100", font=unit_font)
    x0 = (c.width - (sw + uw)) // 2
    c.draw.text((x0, c.y), score_text, font=score_font, fill=0)
    c.draw.text((x0 + sw, c.y + 58), " /100", font=unit_font, fill=0)
    c.y += 100
    badge = _score_grade(data.total_score)
    if data.percentile_top:
        badge += f" · 상위 {data.percentile_top}%"
    c.text(badge, "Bold", 22, align="center")
    c.divider()

    # 4-Fit 게이지
    for fit in _FIT_ORDER:
        entry = (data.fit_scores or {}).get(fit) or {}
        score = entry.get("score")
        if score is None:
            continue
        ko, en = _FIT_LABELS[fit]
        c.bar_row(ko, en, float(score))
    c.divider()

    # 오늘의 한 문장 — 코칭 처방
    if data.headline_sentence:
        c.text("오늘의 한 문장", "Regular", 18, align="center")
        c.space(6)
        c.text(f"“{data.headline_sentence}”", "Bold", 24, align="center",
               wrap=True, line_gap=9)
        c.divider()

    # 체험 코드 + QR — 폰으로 이어보기
    if data.code or data.qr_payload:
        payload = data.qr_payload or data.code
        x, y, size = c.qr(payload)
        tx = x + size + 16
        c.draw.text((tx, y + 6), "체험 코드", font=_font("Regular", 18), fill=0)
        c.draw.text((tx, y + 30), data.code or "-", font=_font("ExtraBold", 40), fill=0)
        c.draw.text((tx, y + 82), "폰에서 상세 리포트", font=_font("Regular", 16), fill=0)
        c.y = y + max(size, 104)
        c.divider()

    # 푸터
    c.text("4-Fit Mirrorting · CarpeDM", "Regular", 16, align="center")
    c.text("동양미래EXPO 2026 · 오늘도 좋은 퇴근!", "Regular", 16, align="center")
    return c.finish()


# ---------------- ESC/POS 변환·전송 ----------------

ESC, GS = b"\x1b", b"\x1d"


def image_to_escpos(img: Image.Image, *, feed_lines: int = 4, cut: bool = True) -> bytes:
    """1비트 이미지 → ESC/POS 래스터.

    저가 모듈의 작은 수신 버퍼를 감안해 GS v 0을 128행 밴드로 나눠 보낸다.
    커터 없는 모듈은 GS V를 무시하므로 cut은 켜 둬도 무해하다.
    """
    if img.mode != "1":
        img = img.convert("1")
    width_bytes = (img.width + 7) // 8
    # PIL '1' 모드: 0=검정 → ESC/POS는 1=인쇄점이므로 반전
    raw = img.point(lambda p: 255 - p).convert("1").tobytes()

    out = bytearray()
    out += ESC + b"@"          # 초기화
    out += ESC + b"a\x01"      # 가운데 정렬 (폭이 인쇄폭과 같으면 영향 없음)
    band = 128
    for top in range(0, img.height, band):
        rows = min(band, img.height - top)
        chunk = raw[top * width_bytes:(top + rows) * width_bytes]
        out += GS + b"v0\x00"
        out += bytes((width_bytes & 0xFF, width_bytes >> 8, rows & 0xFF, rows >> 8))
        out += chunk
    out += ESC + b"d" + bytes([feed_lines])   # 찢을 여백
    if cut:
        out += GS + b"V\x42\x10"               # 부분 컷 (미지원 모듈은 무시)
    return bytes(out)


@dataclass
class PrintResult:
    ok: bool
    driver: str
    detail: str = ""
    files: list[str] = field(default_factory=list)


def print_receipt(data: ReceiptData) -> PrintResult:
    """설정된 드라이버로 출력. file 드라이버는 PNG+bin 저장(개발·미리보기)."""
    img = render_receipt(data)
    payload = image_to_escpos(img)
    driver = settings.receipt_driver

    if driver == "serial":
        if not settings.receipt_serial_port:
            return PrintResult(False, driver, "MIRROTING_RECEIPT_SERIAL_PORT가 비어 있어요")
        try:
            import serial  # pyserial — 지연 임포트 (file 드라이버만 쓰는 환경 배려)

            with serial.Serial(settings.receipt_serial_port,
                               settings.receipt_serial_baud, timeout=5) as port:
                port.write(payload)
                port.flush()
                # 저가 모듈은 flush 후에도 내부 버퍼 인쇄 시간이 필요 — 헤드 정지 전 여유
                time.sleep(0.3)
            return PrintResult(True, driver, f"{settings.receipt_serial_port} 전송 완료")
        except Exception as exc:  # 포트 없음/점유/전원 문제 — 부스에서 흔한 실패를 메시지로
            return PrintResult(False, driver, f"시리얼 전송 실패: {exc}")

    # file 드라이버 (기본)
    out_dir = Path(settings.media_dir) / "receipts"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    png_path = out_dir / f"receipt-{stamp}.png"
    bin_path = out_dir / f"receipt-{stamp}.escpos.bin"
    img.save(png_path)
    bin_path.write_bytes(payload)
    return PrintResult(True, "file", "PNG·ESC/POS 저장 완료", [str(png_path), str(bin_path)])


def receipt_png_bytes(data: ReceiptData) -> bytes:
    """미리보기용 PNG 바이트 — API에서 스트리밍."""
    img = render_receipt(data)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
