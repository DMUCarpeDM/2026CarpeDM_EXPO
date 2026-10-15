import { useEffect, useRef } from "react";

// 미러 화면에서는 입력창에 포커스가 없어도 Enter로 답변을 보낸다.
export function usePracticeSubmitKey({ enabled, onSubmit }) {
  const callback = useRef(onSubmit);
  callback.current = onSubmit;
  useEffect(() => {
    if (!enabled) return undefined;
    const handleKey = (event) => {
      if (event.defaultPrevented || event.key !== "Enter" || event.repeat || event.isComposing || event.keyCode === 229
        || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target;
      if (target?.closest?.("button, a, [role=button], dialog, [contenteditable=true], input, select")) return;
      if (target?.tagName === "TEXTAREA" && target.id !== "practice-answer") return;
      event.preventDefault();
      callback.current?.();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [enabled]);
}
