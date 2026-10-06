export function WorkplaceSpeechBubble({ variant = "glass", speaker, name, text, style }) {
  return <div className="mirror-pixel-bubble" aria-hidden="true" data-style={variant} data-speaker={speaker} style={variant === "caption" ? {...style, left: "50%"} : style}><strong>{name}</strong><span>{text}</span></div>;
}
