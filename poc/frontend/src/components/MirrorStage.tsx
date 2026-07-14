/** 미러 무대 — 세로 1080×1920 하프미러의 존 레이아웃 (기획서 §2 원칙 2).
 *
 * 상대 밴드(~18%) / 반사 존(~47%, 비움 — 체험자의 얼굴이 맺히는 자리) /
 * 자막 밴드(~15%) / 컨트롤 밴드(~20%). 반사 존에는 상시 UI를 두지 않는다 —
 * 순간 오버레이(코칭 토스트, 가이드 링)만 reflection 슬롯으로 허용.
 */
import type { ReactNode } from 'react';

interface MirrorStageProps {
  presence?: ReactNode; // 상대 밴드 — 캐릭터의 존재
  reflection?: ReactNode; // 반사 존 오버레이 — 평소엔 비운다
  subtitle?: ReactNode; // 자막 밴드 — 질문/인식 자막
  controls?: ReactNode; // 컨트롤 밴드 — 손 닿는 높이의 터치 UI
  className?: string;
}

export default function MirrorStage({
  presence,
  reflection,
  subtitle,
  controls,
  className = '',
}: MirrorStageProps) {
  return (
    <div className={`mirror-stage ${className}`}>
      <div className="mirror-zone-presence">{presence}</div>
      <div className="mirror-zone-reflection">{reflection}</div>
      <div className="mirror-zone-subtitle">{subtitle}</div>
      <div className="mirror-zone-controls">{controls}</div>
    </div>
  );
}
