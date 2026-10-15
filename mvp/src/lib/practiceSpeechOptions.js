const normalize = text => (text || "").trim().replace(/\s+/g, " ");

// All simulation characters use the configured ElevenLabs voice, including men.
// A missing/failed health poll must never select the browser's unrelated voice.
export function practiceSpeechOptions(text, prepared = []) {
  return {
    voice: "female",
    serverTtsReady: true,
    allowBrowserFallback: false,
    expectedServerProvider: "elevenlabs",
    preparedAudioUrl: prepared.find(item => item.provider === "elevenlabs" && normalize(item.text) === normalize(text))?.url,
  };
}
