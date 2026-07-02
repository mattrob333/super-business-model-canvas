/** Shorten long bullets for compact canvas card previews. */
export function summarizePreviewItem(text: string, maxLength = 72): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;

  const slice = trimmed.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 40 ? slice.slice(0, lastSpace) : slice;

  return `${cut}…`;
}
