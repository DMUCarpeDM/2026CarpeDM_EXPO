import { MirrorCaptureStatus } from "./MirrorCaptureStatus";
import { CounterpartVideo } from "../../../components/practice/CounterpartVideo";
import { MirrorSubtitles } from "./MirrorSubtitles";
import "../styles/workplace-mirror-overview.css";
import "../styles/workplace-mirror-simulation.css";


export function WorkplaceMirrorSceneSimulation({ characterId, name, videoState, paused, dialogueHidden = false, onReactionComplete, captureStatus, waveRef, userPreview, dialogue, speechPlayback, children }) {
  return <section className="mirror-scene-simulation" aria-label="직장 대화 시뮬레이션">
    <div className="simulation-actor"><CounterpartVideo category="leaving" characterId={characterId} name={name} state={videoState} paused={paused} onReactionComplete={onReactionComplete} /></div>
    {userPreview}
    <MirrorCaptureStatus capture={captureStatus} waveRef={waveRef} />
    {!dialogueHidden && <div className="simulation-card-slot">{dialogue && <MirrorSubtitles text={dialogue} playback={speechPlayback} />}{children}</div>}
  </section>;
}
