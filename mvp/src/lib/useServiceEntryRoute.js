import { useEffect, useRef, useState } from "react";
import {
  DEMO_HISTORY,
  DEMO_REPORT,
  DEMO_SESSION,
  DEMO_TURN,
  DEMO_TURN_HISTORY,
  DEMO_TURN_SIGNALS,
} from "../data/serviceEntryDemo";
import { clearActiveSession, isReportFlowView, resolveReportIdleTimeoutMs } from "./exhibitionSession";
import { getSession, loadActiveSession, resolveNfcCard } from "./pocApi";
import {
  ENTRY_LOOKUP_TIMEOUT_MS,
  SERVICE_ENTRY_FLOW,
  demoDestination,
  isKnownView,
  normalizeDestination,
  savedSessionDestination,
} from "./serviceEntryRoute";
import { useNfcTap } from "./useNfcTap";

export function useServiceEntryRoute({ kioskIssueMode, requestExerciseMedia }) {
  const [active, setActive] = useState("boot");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedServiceModeId, setSelectedServiceModeId] = useState(null);
  const [counterpartProfile, setCounterpartProfile] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [session, setSession] = useState(null);
  const [turn, setTurn] = useState(null);
  const [turnHistory, setTurnHistory] = useState([]);
  const [turnSignals, setTurnSignals] = useState(null);
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [pocScenarioSlug, setPocScenarioSlug] = useState("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState(null);
  const [nfcCard, setNfcCard] = useState(null);
  const [nfcFallback, setNfcFallback] = useState(false);
  const [consented, setConsented] = useState(false);
  const [apiError, setApiError] = useState("");
  const nfcResolvingRef = useRef(false);

  const showView = (target) => {
    if (["home", "role"].includes(target)) {
      setNfcCard(null);
      setNfcFallback(false);
    }
    setActive(target);
    setMenuOpen(false);
  };

  const replaceView = (target) => {
    window.history.replaceState({ mirrorTingView: target }, "");
    showView(target);
  };

  const navigate = (target, serviceModeId = selectedServiceModeId) => {
    const destination = normalizeDestination(target, serviceModeId);
    if (destination === "service") {
      clearActiveSession(localStorage);
      setSelectedServiceModeId(null);
      setCounterpartProfile(null);
      setPocScenarioSlug("");
      setSelectedEpisodeId(null);
      setDifficulty(null);
      setConsented(false);
      setNfcCard(null);
      setNfcFallback(false);
    }
    window.history.pushState({ mirrorTingView: destination }, "");
    showView(destination);
  };

  useEffect(() => { window.scrollTo(0, 0); }, [active]);
  useEffect(() => {
    const handlePopState = (event) => {
      const savedTarget = event.state?.mirrorTingView;
      if (!isKnownView(savedTarget)) return;
      const destination = normalizeDestination(savedTarget, selectedServiceModeId);
      if (destination !== savedTarget) window.history.replaceState({ mirrorTingView: destination }, "");
      showView(destination);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectedServiceModeId]);

  useEffect(() => {
    if (kioskIssueMode) return undefined;
    let cancelled = false;
    let lookupTimer = 0;
    const enter = (target) => { if (!cancelled) replaceView(target); };
    const enterPractice = () => requestExerciseMedia().catch(() => {});
    const resolveEntry = async () => {
      const directDestination = demoDestination();
      if (directDestination === "practice") {
        setReport(DEMO_REPORT); setHistory(DEMO_HISTORY);
        setSession(DEMO_SESSION); setTurn(DEMO_TURN); setTurnHistory(DEMO_TURN_HISTORY); setTurnSignals(DEMO_TURN_SIGNALS);
        enter("practice");
        enterPractice();
        return;
      }
      if (directDestination) {
        setReport(DEMO_REPORT); setHistory(DEMO_HISTORY); enter(directDestination);
        return;
      }

      const saved = loadActiveSession();
      if (!saved) {
        clearActiveSession(localStorage);
        enter("service");
        return;
      }
      try {
        const resumed = await Promise.race([
          getSession(saved),
          new Promise((_, reject) => {
            lookupTimer = window.setTimeout(() => reject(new Error("saved session lookup timed out")), ENTRY_LOOKUP_TIMEOUT_MS);
          }),
        ]);
        if (cancelled) return;
        const destination = savedSessionDestination(resumed.status);
        if (!destination) {
          clearActiveSession(localStorage);
          enter("service");
          return;
        }
        const resumedSession = { ...resumed, access_token: saved.access_token };
        setSession(resumedSession); setTurn(resumed.current_turn); setTurnHistory(resumed.history || []);
        enter(destination);
        if (destination === "practice") enterPractice();
      } catch {
        if (!cancelled) {
          clearActiveSession(localStorage);
          enter("service");
        }
      } finally {
        window.clearTimeout(lookupTimer);
      }
    };
    resolveEntry();
    return () => { cancelled = true; window.clearTimeout(lookupTimer); };
  }, []);

  useEffect(() => {
    if (!isReportFlowView(active)) return undefined;
    const idleMs = resolveReportIdleTimeoutMs(window.location.search);
    if (idleMs === null) return undefined;
    let timer = 0;
    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => navigate("service"), idleMs);
    };
    resetTimer();
    const events = ["pointerdown", "keydown", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [active]);

  const handleMirrorTap = async (tap) => {
    if (nfcResolvingRef.current) return;
    nfcResolvingRef.current = true;
    try {
      const card = await resolveNfcCard(tap.uid);
      setNfcCard({ uid: card.uid, jobRole: card.job_role, scenarioSlug: card.scenario_slug, jobRoleLabel: card.job_role_label });
      setNfcFallback(false);
      setApiError("");
      navigate("preview");
    } catch {
      setNfcFallback(true);
    } finally {
      nfcResolvingRef.current = false;
    }
  };

  useNfcTap({
    reader: "mirror",
    enabled: active === "home" && Boolean(selectedServiceModeId) && !kioskIssueMode,
    onTap: handleMirrorTap,
  });

  const startFromJobRole = (role) => {
    setNfcCard({ uid: "", jobRole: role.id, scenarioSlug: role.scenarioSlug, jobRoleLabel: role.label });
    setNfcFallback(false);
    setApiError("");
    navigate("preview");
  };
  const go = (offset) => {
    const currentIndex = SERVICE_ENTRY_FLOW.findIndex((item) => item.id === active);
    navigate(SERVICE_ENTRY_FLOW[Math.min(Math.max(currentIndex + offset, 0), SERVICE_ENTRY_FLOW.length - 1)].id);
  };
  const chooseServiceMode = (serviceModeId) => {
    setSelectedServiceModeId(serviceModeId);
    navigate("home", serviceModeId);
  };
  const chooseCounterpartProfile = (profileId) => {
    setCounterpartProfile(profileId);
    setSelectedEpisodeId(null);
  };
  const chooseScenario = (option) => {
    setPocScenarioSlug(option.scenarioSlug);
    setSelectedEpisodeId(option.episodeId);
  };

  return {
    state: {
      active, menuOpen, selectedServiceModeId, counterpartProfile, difficulty, session, turn,
      turnHistory, turnSignals, report, history, pocScenarioSlug, selectedEpisodeId, nfcCard,
      nfcFallback, consented, apiError,
    },
    setters: {
      setMenuOpen, setCounterpartProfile, setDifficulty, setSession, setTurn, setTurnHistory,
      setTurnSignals, setReport, setHistory, setPocScenarioSlug, setSelectedEpisodeId,
      setNfcFallback, setConsented, setApiError,
    },
    actions: {
      navigate, go, chooseServiceMode, chooseCounterpartProfile, chooseScenario, startFromJobRole,
    },
  };
}
