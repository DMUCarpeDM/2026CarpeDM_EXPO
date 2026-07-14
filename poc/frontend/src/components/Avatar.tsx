/** 캐릭터 이니셜 아바타 — 캐릭터 id별로 고정된 무채색 계열 색상을 사용한다. */

const COLOR_BY_ID: Record<string, string> = {
  kim_teamlead: '#3d5a99',
  park_senior: '#3f7d6e',
  lee_peer: '#8a6d3b',
  han_cs: '#8a4f5f',
};

export default function Avatar({
  characterId,
  name,
  size = 40,
}: {
  characterId: string;
  name: string;
  size?: number;
}) {
  const initial = name.trim().charAt(0);
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: COLOR_BY_ID[characterId] ?? '#44506b',
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
