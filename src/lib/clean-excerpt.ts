/**
 * Crawled evidence excerpts arrive as raw page markdown — navigation link
 * soup like "[Skip to main content](https://…) [Skip to footer](…)" reads as
 * junk next to a canvas item (owner live finding 2026-07-06). Reduce an
 * excerpt to readable prose for display. The stored evidence row keeps the
 * original text; this is presentation-only.
 */
export function cleanExcerpt(raw: string): string {
  return raw
    // images: ![alt](url) → drop entirely
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    // links: [text](url) → text
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1")
    // leftover skip-nav artifacts and bare urls
    .replace(/\b(Skip to (main content|footer|navigation))\b/gi, " ")
    .replace(/https?:\/\/\S+/g, " ")
    // markdown emphasis/heading markers
    .replace(/[#*_`>]{1,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
