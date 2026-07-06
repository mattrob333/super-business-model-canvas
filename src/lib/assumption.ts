/**
 * Deck-built canvases label market-research inferences with an "Assumption:"
 * text prefix (analyze-company document mode). Repeating that word on every
 * bullet wallpapers the canvas (owner finding 2026-07-06) — display surfaces
 * strip it and show a quiet marker instead; the stored text keeps the prefix
 * so agents and the verifier still see the honest label.
 */
export function splitAssumption(text: string): { text: string; assumed: boolean } {
  const match = /^assumption[:\-–—]\s*/i.exec(text);
  return match ? { text: text.slice(match[0].length), assumed: true } : { text, assumed: false };
}
