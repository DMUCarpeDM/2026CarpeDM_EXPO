// 캐릭터별 스타일 아바타 — 실제 인물 사진 대신 캐릭터 색 + 이니셜로 6명을 구분한다.
// (시드에는 team-lead-portrait 하나뿐이라 전원 같은 얼굴로 표시되던 문제를 대체)
// 색은 시드 캐릭터 id에 고정 매핑하고, 미지의 id는 이름 해시로 팔레트에서 고른다.

const CHARACTER_COLORS = {
  kim_teamlead: "#357ef3",   // 팀장 — 브랜드 블루
  park_senior: "#0f9d78",    // 선임 — 그린
  lee_peer: "#f2a03d",       // 동료 — 앰버
  han_cs: "#e2555f",         // CS 매니저 — 코럴
  kang_executive: "#7b5bd6", // 임원 — 퍼플
  choi_client: "#3b4a63",    // 외부 고객 — 다크 슬레이트
};

const PALETTE = ["#357ef3", "#0f9d78", "#f2a03d", "#e2555f", "#7b5bd6", "#2f9bb3"];

function colorFor(character) {
  if (character?.id && CHARACTER_COLORS[character.id]) return CHARACTER_COLORS[character.id];
  const name = character?.name || "AI";
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

// 한글 이름은 성을 뗀 첫 글자가 더 잘 구분됨(김태호→태, 강수진→수). 공백 뒤 토큰을 우선.
function initialFor(character) {
  const name = (character?.name || "AI").trim();
  const given = name.includes(" ") ? name.split(" ")[0] : name;
  return given.slice(0, 1) || "A";
}

export function CharacterAvatar({ character, size = 40, className = "" }) {
  const bg = colorFor(character);
  const fontSize = Math.round(size * 0.44);
  return (
    <span
      className={`character-avatar ${className}`}
      style={{ width: size, height: size, background: bg, fontSize }}
      role="img"
      aria-label={character?.name || "AI 상대"}
    >
      {initialFor(character)}
    </span>
  );
}

export { colorFor as characterColor };
