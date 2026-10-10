import { useEffect, useRef } from "react";
import { WorkplaceOverviewCard } from "./WorkplaceOverviewCard";
import "../styles/workplace-mirror-briefing.css";

export function MirrorGlassModal({ labelledBy, describedBy, onClose, className = "", children }) {
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    element.focus();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} tabIndex={-1} className={`mirror-scenario-briefing mirror-glass-modal ${className}`} aria-labelledby={labelledBy} aria-describedby={describedBy} onCancel={event => { event.preventDefault(); close.current?.(); }}>
    <WorkplaceOverviewCard labelledBy={labelledBy}>{children}</WorkplaceOverviewCard>
  </dialog>;
}
