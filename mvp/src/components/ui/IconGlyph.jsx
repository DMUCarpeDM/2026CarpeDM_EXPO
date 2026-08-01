import { AlertTriangle } from "reicon-react/icons/AlertTriangle";
import { BodyShape2 } from "reicon-react/icons/BodyShape2";
import { Briefcase4 } from "reicon-react/icons/Briefcase4";
import { Bulb2 } from "reicon-react/icons/Bulb2";
import { ChartBarTrendUp } from "reicon-react/icons/ChartBarTrendUp";
import { ChatRound } from "reicon-react/icons/ChatRound";
import { ChatRoundCheck } from "reicon-react/icons/ChatRoundCheck";
import { Eye } from "reicon-react/icons/Eye";
import { CircleGraph } from "reicon-react/icons/CircleGraph";
import { DocumentText2 } from "reicon-react/icons/DocumentText2";
import { EmojiCircle } from "reicon-react/icons/EmojiCircle";
import { FaceSmile } from "reicon-react/icons/FaceSmile";
import { Handshake } from "reicon-react/icons/Handshake";
import { Link2 } from "reicon-react/icons/Link2";
import { Message } from "reicon-react/icons/Message";
import { MessageQuestion2 } from "reicon-react/icons/MessageQuestion2";
import { Pause } from "reicon-react/icons/Pause";
import { Soundwave } from "reicon-react/icons/Soundwave";
import { Mic } from "reicon-react/icons/Mic";
import { Monitor } from "reicon-react/icons/Monitor";
import { Presentation2 } from "reicon-react/icons/Presentation2";
import { Refresh3 } from "reicon-react/icons/Refresh3";
import { Share3 } from "reicon-react/icons/Share3";
import { ShieldCheck } from "reicon-react/icons/ShieldCheck";
import { Star } from "reicon-react/icons/Star";
import { Target } from "reicon-react/icons/Target";
import { User } from "reicon-react/icons/User";
import { User4 } from "reicon-react/icons/User4";
import { Users2 } from "reicon-react/icons/Users2";
import { WindowPointer } from "reicon-react/icons/WindowPointer";

const reiconGlyphs = {
  role: User,
  team: Users2,
  person: User4,
  briefcase: Briefcase4,
  easy: FaceSmile,
  normal: EmojiCircle,
  hard: AlertTriangle,
  negotiation: Handshake,
  coach: Bulb2,
  fit: CircleGraph,
  pause: Pause,
  response: Soundwave,
  voice: Mic,
  expression: FaceSmile,
  eye: Eye,  // 시선 관찰(카메라·라이브 넛지)용 — 점수 축 아님
  posture: BodyShape2,
  roleplay: ChatRound,
  report: DocumentText2,
  retry: Refresh3,
  share: Share3,
  shield: ShieldCheck,
  growth: ChartBarTrendUp,
  chat: ChatRoundCheck,
  interview: MessageQuestion2,
  presentation: Presentation2,
  feedback: Star,
  target: Target,
  meeting: Message,
  screen: Monitor,
  move: WindowPointer,
  transcript: DocumentText2,
  link: Link2,
};

export function IconGlyph({ icon: Icon, size = 24 }) {
  const ResolvedIcon = typeof Icon === "string" ? reiconGlyphs[Icon] || CircleGraph : Icon;
  if (!ResolvedIcon) return null;
  return (
    <ResolvedIcon
      size={size}
      className="mirror-ting-icon mirror-ting-reicon-icon"
      weight="Outline"
      strokeWidth={1.5}
      aria-hidden="true"
      focusable="false"
    />
  );
}
