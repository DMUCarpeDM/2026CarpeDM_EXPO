export const overviewCategories = [
  { id: "morning", name: "출근" },
  { id: "work", name: "업무" },
  { id: "leaving", name: "퇴근" },
];

export function sessionOverview(session) {
  const rows = session?.interaction?.overview || [];
  return overviewCategories.map(({ id, name }) => {
    const row = rows.find((item) => item.category_id === id);
    if (!row) throw new Error("시나리오 요약을 불러오지 못했어요. 서버 버전을 확인해 주세요.");
    const person = session.scenario?.characters?.find((item) => item.id === row.character_id);
    return { name, time: row.virtual_time, title: row.title, situation: row.situation,
      person: person?.name || "대화 상대", line: row.opening_line, tip: row.goal || row.tip };
  });
}
