export const overviewCategories = [
  { id: "morning", name: "출근" },
  { id: "work", name: "업무" },
  { id: "leaving", name: "퇴근" },
];

export function sessionOverview(session) {
  const rows = session?.interaction?.overview || [];
  const selected = session?.interaction?.exhibition
    ? rows.map(row => ({ ...row, name: overviewCategories.find(c => c.id === row.category_id)?.name || "대화" }))
    : overviewCategories.map(({ id, name }) => ({ ...rows.find(item => item.category_id === id), name }));
  if (!selected.length) throw new Error("시나리오 요약을 불러오지 못했어요.");
  return selected.map(row => {
    const { name } = row;
    if (!row.category_id) throw new Error("시나리오 요약을 불러오지 못했어요. 서버 버전을 확인해 주세요.");
    const person = session.scenario?.characters?.find((item) => item.id === row.character_id);
    return { name, categoryId: row.category_id, exhibition: Boolean(session?.interaction?.exhibition), time: row.virtual_time, title: row.title, situation: row.situation,
      person: person?.name || "대화 상대", line: row.opening_line, tip: row.goal || row.tip };
  });
}
