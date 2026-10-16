// One audible source per document and across same-origin tabs.
export function claimAudio(stop) {
  const scope = window;
  if (scope.document?.hidden) return () => {};
  scope.__mirrorAudioOwner?.();
  let released = false;
  const channel = typeof scope.BroadcastChannel === 'function' ? new scope.BroadcastChannel('mirror-ting-audio') : null;
  const release = () => {
    if (released) return;
    released = true;
    if (scope.__mirrorAudioOwner === interrupt) delete scope.__mirrorAudioOwner;
    scope.document?.removeEventListener?.('visibilitychange', hidden);
    channel?.close();
  };
  const interrupt = () => { release(); stop(); };
  const hidden = () => { if (scope.document?.hidden) interrupt(); };
  scope.__mirrorAudioOwner = interrupt;
  scope.document?.addEventListener?.('visibilitychange', hidden);
  if (channel) { channel.onmessage = interrupt; channel.postMessage('claim'); }
  return release;
}
