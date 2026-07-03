# Design Taste — House Rules

> Distilled from the taste-skill checklist (tasteskill.dev), adapted to Super BMC and
> applied to the landing page on 2026-07-03. **Binding for all new UI** (Phases 5–6
> workspaces, War Room, framework boards). When a rule conflicts with a spec, the spec
> wins — but note the deviation in the PR.

## Hard rules (pre-flight — check every screen before shipping)

**Hierarchy & layout**
- Hero/page-header stack: max 4 text elements (eyebrow OR badge, headline, subtext, CTA).
  No trust micro-strips, taglines under CTAs, or version labels in the header.
- Headlines max 2 lines desktop; intro subtext ≤ 20 words.
- Eyebrow labels: max 1 per 3 sections. Headlines carry the weight.
- **Never three equal feature cards.** Vary the layout family: step flows, divided rows,
  wide+narrow grids, side-by-side splits. ≥ 3 distinct layout families per long page.
- Bento/card grids: exactly as many cells as content items; at least one cell visually
  different (wide, tinted, or taller). No dangling single-card rows if avoidable.
- Zigzag image+text splits: max 2 consecutive.

**Color, type, shape**
- One accent color per page (our orange), used identically everywhere. Agent accent
  colors are semantic identity, not decoration — deliberate exception.
- One corner-radius system (ours: 8px, `--radius: 0.5rem`). No mixing.
- One theme per page: public pages (Landing, Auth) pin light via
  `src/lib/light-theme.ts`; app pages follow the user's theme, both modes tested.
- Button/text contrast: WCAG AA (4.5:1) minimum. CTA labels never wrap at desktop.
- One label per conversion intent ("Start free analysis" — everywhere).

**Copy**
- No em-dashes in UI copy (use periods, commas, colons).
- No filler verbs: Elevate, Seamless, Unleash, Revolutionize, Supercharge.
- No fake-precise numbers, invented testimonials, generic names, or fabricated logos —
  this is also a standing product-honesty rule (BUILD_PLAN).
- Body sub-paragraphs ≤ 25 words. Quotes ≤ 3 lines.

**Banned AI tells**
- Neon glows, automatic purple gradients, pure-black backgrounds.
- Section-number eyebrows (001 · Capabilities), scroll cues (↓ scroll), locale/time
  strips, decorative status dots, "quietly in use at" poetic headers, photo-credit
  captions as decoration, version footers.
- Decorative status dots are banned; **semantic** dots (agent status, feed health,
  confidence) are core product language — deliberate exception.

**Motion**
- Every animation must answer "what does this communicate?" (hierarchy, feedback,
  state). Subtle by default: hover elevation, focus rings, small transitions.
- Respect `prefers-reduced-motion` for anything beyond hover.
- No `window.addEventListener('scroll')` — IntersectionObserver or CSS scroll-driven.

**States & structure**
- Every data view ships empty/loading/error states (honest empties — "no data yet,
  runs on <cadence>" — never fake charts; also spec 08 rule).
- `min-h-[100dvh]` over `h-screen`. Explicit mobile collapse. Zero horizontal overflow
  at 390px (Playwright-check it).

## Deliberate deviations (documented, don't "fix")
- The landing BMC mock is a stylized rendering of the actual product surface — not a
  fake screenshot; keep it.
- Montserrat stays as the brand font (skill prefers Geist/Outfit; changing fonts is a
  brand decision, not a polish task).
- The subtle grid page background is our signature texture (specs 02/03).

## How to use
Before shipping any new screen: run the Hard rules as a checklist, screenshot at
1440px and 390px, check overflow and console errors. The reviewer audits against this
file during phase reviews.
