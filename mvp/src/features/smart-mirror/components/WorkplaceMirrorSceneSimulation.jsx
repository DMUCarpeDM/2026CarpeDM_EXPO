import { MirrorCaptureStatus } from "./MirrorCaptureStatus";
import { CounterpartVideo } from "../../../components/practice/CounterpartVideo";
import { MirrorSubtitles } from "./MirrorSubtitles";
import "../styles/workplace-mirror-overview.css";
import "../styles/workplace-mirror-simulation.css";


export function WorkplaceMirrorSceneSimulation({ category = "morning", characterId, name, videoState, paused, dialogueHidden = false, onReactionComplete, captureStatus, waveRef, userPreview, dialogue, speechPlayback, children }) {
  return <section className="mirror-scene-simulation" aria-label="직장 대화 시뮬레이션">
    <div className="simulation-actor"><CounterpartVideo category={category} characterId={characterId} name={name} state={videoState} paused={paused} onReactionComplete={onReactionComplete} /></div>
    {userPreview}
    <MirrorCaptureStatus capture={captureStatus} waveRef={waveRef} />
    {!dialogueHidden && <div className="simulation-card-slot">
      {speechPlayback?.status === "waiting" && speechPlayback.text === dialogue && <p className="simulation-dialogue-status" role="status" aria-live="polite">음성을 준비하고 있어요. 잠시만 기다려 주세요.</p>}
      {dialogue && <MirrorSubtitles text={dialogue} playback={speechPlayback} />}{children}
    </div>}
  </section>;
}
