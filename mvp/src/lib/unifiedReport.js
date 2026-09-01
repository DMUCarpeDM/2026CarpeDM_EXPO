export function fitAriaLabel(fit, label) {
  if (fit?.measured === false) return `${label} 측정 안 됨`;
  return `${label} ${Math.round(Number(fit?.score) || 0)}점`;
}

export async function saveAndShareReport({
  onIssueCode,
  total,
  navigatorObject = globalThis.navigator,
  locationHref = globalThis.location?.href || "",
  printPage = () => globalThis.print?.(),
}) {
  let code = null;

  if (onIssueCode) {
    try {
      code = (await onIssueCode())?.code || null;
    } catch {
      // 저장 서버가 잠시 응답하지 않더라도 기본 공유·PDF 저장은 계속 제공해요.
    }
  }

  if (typeof navigatorObject?.share === "function") {
    try {
      const codeText = code ? ` 체험 코드: ${code}` : "";
      await navigatorObject.share({
        title: "Mirror-Ting 연습 결과",
        text: `이번 연습 점수는 ${total}점이에요.${codeText}`,
        url: locationHref,
      });
      return { code, method: "share", notice: code ? "연습 기록을 저장하고 공유했어요." : "연습 결과를 공유했어요." };
    } catch (error) {
      if (error?.name === "AbortError") {
        return { code, method: code ? "saved" : "cancelled", notice: code ? `연습 기록을 저장했어요. 체험 코드: ${code}` : "" };
      }
    }
  }

  if (code) {
    if (typeof navigatorObject?.clipboard?.writeText === "function") {
      try {
        await navigatorObject.clipboard.writeText(code);
        return { code, method: "clipboard", notice: `체험 코드 ${code}를 복사했어요.` };
      } catch {
        // 복사가 막힌 환경에서는 코드를 화면에 남겨 직접 저장할 수 있게 해요.
      }
    }
    return { code, method: "saved", notice: `연습 기록을 저장했어요. 체험 코드: ${code}` };
  }

  if (typeof printPage === "function") {
    printPage();
    return { code: null, method: "print", notice: "인쇄 창에서 PDF로 저장할 수 있어요." };
  }

  throw new Error("저장하거나 공유할 수 없어요. 잠시 후 다시 시도해 주세요.");
}
