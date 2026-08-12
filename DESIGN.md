---
name: haere
description: A calm, precise civic data instrument — quiet by default, and it only raises its voice when your own trip actually changed.
colors:
  kotare-navy: "#214d65"
  kotare-blue: "#287DAB"
  kotare-teal: "#2F6B52"
  kotare-brown: "#624B27"
  kotare-grey: "#CACFD0"
  surface-ground: "#f2f2f5"
  surface-card: "#ffffff"
  ink: "#18181b"
  ink-soft: "#71717a"
  ink-faint: "#a1a1aa"
typography:
  display:
    fontFamily: "'Hanken Grotesk', ui-sans-serif, system-ui"
    fontSize: "clamp(20px, 3vw, 32px)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Hanken Grotesk', ui-sans-serif, system-ui"
    fontSize: "15px – 21px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Hanken Grotesk', ui-sans-serif, system-ui"
    fontSize: "12.5px – 14.5px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Hanken Grotesk', ui-sans-serif, system-ui"
    fontSize: "11px – 13.5px"
    fontWeight: 700
    lineHeight: 1
  meta:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "10px – 12px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.kotare-navy}"
    textColor: "{colors.surface-card}"
    rounded: "{rounded.md}"
    padding: "11px 16px"
  button-primary-hover:
    backgroundColor: "{colors.kotare-blue}"
    textColor: "{colors.surface-card}"
    rounded: "{rounded.md}"
    padding: "11px 16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.kotare-blue}"
    rounded: "{rounded.md}"
    padding: "11px 16px"
  badge-navy:
    backgroundColor: "{colors.kotare-navy}"
    textColor: "{colors.surface-card}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-better:
    backgroundColor: "{colors.kotare-teal}"
    textColor: "{colors.surface-card}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  badge-worse:
    backgroundColor: "{colors.kotare-brown}"
    textColor: "{colors.surface-card}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  badge-no-change:
    backgroundColor: "{colors.kotare-grey}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  input:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "44px"
  segmented-track:
    backgroundColor: "{colors.kotare-grey}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.md}"
  segmented-active:
    backgroundColor: "{colors.kotare-navy}"
    textColor: "{colors.surface-card}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
---

# Design System: haere

## Overview

**Creative North Star: "The Quiet Instrument"**

haere reads as an ordinary, well-made data tool, not a marketing surface performing trustworthiness. It runs on a single calm ground (near-white `surface-ground`/`surface-card`) with one committed accent carried through every screen — kōtare-navy — and stays quiet almost everywhere, with two deliberate exceptions where the surface earns a raised voice: the verdict on a visitor's own trip, and the landing hero's live network backdrop (see "Motion, generally" below), which trades some of that quiet for the confidence a Persuade-mode first screen needs to earn attention and action. Every other screen holds the line. This retires the previous "Street Furniture System" (bus-shelter poster case, eink transit sign, laminated map, Anton/Special Elite/Karla type, stamp-red/marker-teal) entirely — no glass cases, no plastic-hardware chassis, no printed-paper conceit survives into this world. haere is a real shadcn/ui app on Tailwind, and its own screens should look like it: `Card`, `Button`, `Badge`, `ToggleGroup`, `Input`, `Alert`, nothing staged as a physical object.

The palette is drawn from R's `manu::kotare()` scale, named for the kōtare (sacred kingfisher) — six related tones instead of a stock Tailwind indigo/violet or red/green pairing, chosen specifically to avoid the hue every AI-generated SaaS demo reaches for. Two of those tones (navy, blue) carry the app's structural chrome — CTAs, selection, links, hover; the other two (sand, brown) are reserved exclusively for the one moment color needs to mean something to a visitor: whether their own trip got better, stayed the same, or got worse.

Shape language is a second deliberate break from the old system: the previous world held all paper content to a flat, "nearly-square" 2px radius on principle. This world does the opposite — soft, generously rounded corners (8–16px on cards and inputs, full pill radius on badges and toggle tracks) read as a calm, modern app surface, not stamped paper.

**Key Characteristics:**
- One main color, everywhere: kōtare-navy carries every primary CTA, every selected/active state, and the wizard's progress — nothing competes with it for that role.
- One color, one step down: kōtare-blue marks options, links, and hover states — never a CTA, never a verdict.
- Verdict color is spent on exactly one screen: sand ("no change") and brown ("worse") never appear as UI chrome, only as the Results screen's trip-outcome badges.
- Soft, rounded, light: generous corner radii and a light ground throughout — no dark-vs-light split between screens, no physical-object staging.

## Colors

A restrained six-tone scale plus paper-white neutrals — no stock Tailwind green/red anywhere in the system.

### Primary
- **Kōtare Navy** (`#214d65`): the one main color in the system — every primary button, every selected/active state (segmented-control active pill, chosen proposal card border, filled wizard progress segments), and the civic-action banner. Never used for a verdict.

### Secondary
- **Kōtare Blue** (`#287DAB`): one step down from navy — options, links, and hover states (primary button hover, outline-button text/border, hyperlinks). No longer carries a verdict meaning; see the Verdict Trio below.
- **Kōtare Teal** (`#2F6B52`): the "better" trip-verdict badge, and only that — a fourth hue introduced specifically so "better" doesn't share a color with the app's link/hover chrome (kōtare-blue). 6.3:1 white-on-fill contrast.
- **Kotare Brown** (`#624B27`): the "worse" trip-verdict badge, and the "newly unreachable" edge-case badge. Does not appear anywhere else in the system. ~8.2:1 white-on-fill contrast.

### Neutral
- **Kotare Grey** (`#CACFD0`): borders, dividers, disabled fills, the segmented-control track, and — with dark ink text — the "no change" trip-verdict badge. Retired an earlier kotare-sand value here: even at its darkest accessible value, sand sat one lightness step from kotare-brown, too close for the "no change" vs. "worse" distinction that matters most to read correctly, and hard for several colour-vision-deficiency types to tell apart. Grey also reads correctly on first principles — no change *is* the neutral outcome. 11.3:1 ink-on-fill contrast.
- **Surface Ground** (`#f2f2f5`): the page background behind every card.
- **Surface Card** (`#ffffff`): the default content surface — cards, inputs, modals — plus the label color for text set on kōtare-navy or kōtare-brown fills.
- **Ink** (`#18181b`): primary text on `surface-card`.
- **Ink Soft** (`#71717a`): secondary/muted text — descriptions, inactive segmented-control labels, placeholder-adjacent copy.
- **Ink Faint** (`#a1a1aa`): tertiary text and icon default state — placeholder text, disabled labels.

### Named Rules
**The One Main Color Rule.** Kōtare navy is the only color carrying a primary-action or selected-state meaning anywhere in the system. A second "brand" color competing with it for that role is not part of this world.

**The Verdict-Only Rule.** Kōtare-teal and kotare-brown are reserved exclusively for the Results screen's "better" and "worse" badges. They never appear as chrome, decoration, or a second alert color elsewhere — the moment they'd mean something is diluted the moment they show up anywhere else. "No change" is the one deliberate exception: it reuses kotare-grey, the system's existing structural neutral, rather than a fourth verdict-exclusive hue — a neutral outcome earns the neutral color, not a new one.

**The No-Verdict-Hue-Doubles-As-Chrome Rule.** No color used for a trip-verdict badge is reused for a structural/navigational meaning (link, hover, selection) anywhere else in the app, and vice versa. This closes a design debt from an earlier pass, where kōtare-blue carried both the "better" verdict and the app's link/hover chrome — a visitor could misread one for the other. The fix was a fourth, verdict-exclusive hue (kōtare-teal), not a legend papering over the collision. The Results screen's Better/No change/Worse color-key legend has since been removed entirely: once "better" had its own verdict-exclusive hue, the badges read correctly without a key, and a legend on the most anxious screen in the product cost more in density than it returned in comprehension. Gate the key back in only if real results data shows genuine ambiguity a verdict-exclusive palette doesn't resolve on its own.

## Typography

**Display Font:** Hanken Grotesk (with `ui-sans-serif, system-ui` fallback)
**Meta/Mono Font:** JetBrains Mono (with `ui-monospace` fallback)

**Character:** A confident, humanist grotesque for everything a visitor reads as prose or a decision, and a monospace only for data/meta — timestamps, step counters, city labels, destination counts — so the system visually distinguishes "content you're deciding on" from "system bookkeeping" without needing a separate color.

### Hierarchy
- **Display** (800 weight, `clamp(20px, 3vw, 32px)`, 1.1 line-height, -0.02em tracking, Hanken Grotesk): the landing headline and the Results screen's plain-language verdict sentence — the two moments the product speaks directly to the visitor.
- **Title** (700 weight, 15–21px, -0.01em tracking, Hanken Grotesk): card titles, proposal names, step headings ("Your addresses", "When are you travelling?").
- **Body** (400 weight, 12.5–14.5px, 1.6 line-height, Hanken Grotesk): descriptions, verdict explanation sentences, About-modal prose. Kept to 1-3 lines everywhere it appears.
- **Label** (700 weight, 11–13.5px, Hanken Grotesk): button labels, field values, segmented-control options, destination names.
- **Meta** (500 weight, 10–12px, 0.02em tracking, JetBrains Mono): step counters ("Step 2 of 4"), city/status tags, destination counts, timestamps.

### Named Rules
**The Mono-Is-Meta Rule.** JetBrains Mono is reserved for system bookkeeping (counters, tags, timestamps) and never carries a heading, a decision, or prose a visitor is meant to read as content.

## Layout

A single scroll-column app, not a camera-cut between staged objects (the previous system's model). Each screen is an ordinary centered card (max-width 340–460px on the wizard/landing, wider on the proposal grid) on the shared `surface-ground` page background — moving between screens is routing/navigation, not a scene transition. The proposal wall is a responsive card grid with one card expandable in place; the wizard is a fixed-width single card whose content changes step to step while its progress bar, header, and footer chrome stay constant.

## Elevation & Depth

Shadows are soft, shallow, and mostly ambient — a light `shadow-sm`/`shadow-xl` on cards and the landing hero, never a hard offset. Primary CTAs additionally carry a **colored lift**: a soft shadow tinted to the button's own fill color (e.g. `shadow-[#214d65]/25`) rather than a neutral grey shadow, so the one main-color action reads as slightly raised off the page in a way a neutral button doesn't.

### Shadow Vocabulary
- **Card-lift** (`shadow-sm` to `shadow-xl shadow-zinc-900/5`): default elevation for cards, the landing hero, and modals.
- **Button-lift** (`shadow-md shadow-{button-color}/25`): primary buttons and the civic-action banner — a soft shadow tinted to match the fill, not neutral grey.

### Named Rules
**The No-Hard-Shadow Rule.** All elevation is soft and diffuse; hard-offset shadows are not part of this world.

## Shapes

A deliberately rounder silhouette than the previous "nearly-square" paper system: cards and the landing hero use a generous radius (12–16px), inputs and buttons a moderate radius (8px), and anything representing a discrete choice — badges, chips, segmented-control pills, wizard progress segments — uses a full pill radius. Roundness scales with how "chosen" or "contained" an element is, not with its material.

### Named Rules
**The Rounder-Than-Before Rule.** This world has no flat/near-square content surfaces. Every card, button, input, and badge carries visible corner radius; a hard 0–2px corner reads as the retired system and should not reappear.

## Components

### Buttons
- **Shape:** 8–12px radius depending on container (12px inside the landing hero, 8px elsewhere).
- **Primary:** kōtare-navy fill, white label, colored button-lift shadow. Hover shifts the fill to kōtare-blue — the only place blue directly replaces navy rather than sitting beside it.
- **Outline:** transparent fill, 2px kōtare-blue border and text — the "one step down" secondary action (e.g. "Learn more"), paired next to a primary button rather than replacing it.
- **Disabled:** kōtare-grey fill, `ink-faint` text, no shadow, no hover.
- **Ghost/text:** no fill or border, kōtare-blue text — back/forward navigation and low-emphasis links.

### Chips / Segmented Controls
- **Style:** a kōtare-grey/10% track holding a full-pill-radius group; the active option is a solid kōtare-navy fill with white bold label, inactive options are `ink-soft` text on the transparent track.
- **Use:** day type, time window, city filter — always the same segmented shape, never a different chip layout for a conceptually identical choice.

### Cards / Containers
- **Corner Style:** 12–16px radius.
- **Background:** `surface-card` (white) on `surface-ground`.
- **Border:** 1px kōtare-grey by default. Expanded-but-not-selected (e.g. a proposal card opened to read its detail) upgrades to a 1px kōtare-blue border — a step up in emphasis without claiming the "chosen" signal. Only a card the visitor has actually selected earns the solid 2px kōtare-navy border; expanding and selecting must never share a treatment. See Named Rules.
- **Motion:** the border-colour change across resting → expanded → selected transitions over 200ms (`transition-colors`), never a hard cut — this is the one repeated moment a visitor's attention should visibly follow a state change.

### Named Rules
**The Expanding-Isn't-Choosing Rule.** A card's expanded state and its selected state must never share a border treatment. Expanded-but-unselected gets a 1px kōtare-blue border; the solid 2px kōtare-navy border is reserved exclusively for a card the visitor has actually selected.
- **Shadow Strategy:** see Elevation & Depth — card-lift by default.

### Inputs / Fields
- **Style:** white fill, 1px kōtare-grey border, 8px radius, inline leading icon (e.g. map-pin) in `ink-faint`.
- **Focus:** a 2px white ring plus a 4px kōtare-blue/55% outer ring (`sd-focus`) — visible on every interactive element, not just inputs.
- **Suggestions:** an attached dropdown directly beneath the field, kōtare-grey 1px divider between rows, kōtare-blue/6% hover fill.

### Badges (signature component)
The system's only carriers of teal/brown: a small pill or rounded-rect, solid fill (never a pale tint), white bold text. Navy and blue badges (status tags) follow the same solid-fill shape; teal, brown, and grey (the "better"/"worse"/"no change" verdicts) are visually identical in shape and weight to navy/blue badges, distinguished only by hue — each verdict hue is exclusive to that meaning (see the No-Verdict-Hue-Doubles-As-Chrome Rule under Colors), so no legend is needed to read them correctly.

### Wizard Progress (signature component)
A three-segment pill-capped bar plus a "Step N of M" mono meta line (Proposal → Location → Results), rendered identically on every wizard screen and filled up to the current step. Replaces the previous system's physical four-dot tabbar with an ordinary in-page progress indicator. The newly-filled segment fades in over 300ms on a confident-arrival curve (`cubic-bezier(0.16, 1, 0.3, 1)`) rather than snapping — advancing a step should read as progress being made, not a screen being swapped.

### Motion, generally
Every interactive control shares one 150ms colour/border transition and a 100ms focus-ring transition, so routine hover and press feedback feels identical everywhere rather than authored per-button. Motion never touches a layout-driving property (width, height, position) — colour, border, and shadow only. The proposal-card sequence and the wizard progress bar (above) are the two moments *within the app itself* that earn a slower, authored duration (200–300ms); everything else stays in the 100–150ms "immediate feedback" range.

**The landing hero's network backdrop is a named third exception, not a violation.** It sits on the one screen this system explicitly treats as Persuade rather than Operate: attention and action are the product there, so a live, continuously-moving backdrop is allowed to compete for the eye in a way nothing else in the app is. That includes the address input on the same screen — the backdrop does not get to claim it stays out of the primary task's way; it deliberately doesn't. The trade is bold-landing-screen for total-quiet, made consciously, not a rule that was missed. Because this exception does move layout-adjacent visual weight (dozens of animated SVG elements, `iterations: Infinity`), it is also the one motion in this system that needs a `prefers-reduced-motion` fallback — every other transition here is colour/border/shadow only and needs none.

### Named Rules
**The One Authored Moment Rule (in-app).** Within the Operate-mode app itself, only the proposal-card expand/select sequence and the wizard progress bar earn a slower, deliberate transition (200-300ms); every other control shares the same routine 150ms feedback, and a fourth in-app "authored" duration appearing elsewhere would dilute what makes those two moments feel considered. The landing hero's network backdrop sits outside this count on purpose — it's the one Persuade-mode screen, governed by its own named exception above, not a quiet erosion of this rule.

## Do's and Don'ts

### Do:
- **Do** keep kōtare-navy as the only main/CTA/selected color, and kōtare-blue as the only one-step-down/link/hover color, on every screen.
- **Do** reserve kōtare-teal and kotare-brown exclusively for trip-verdict badges on the Results screen; "no change" uses kotare-grey, the system's existing neutral.
- **Do** use generous, consistent corner radii (8–16px on containers, full pill on badges/chips/progress) — nothing in this world is flat or near-square.
- **Do** give every primary action a colored (not neutral-grey) button-lift shadow.
- **Do** render the same segmented-control shape for every binary/ternary choice (day type, time window, city filter) rather than inventing a new chip style per decision.

### Don't:
- **Don't** reintroduce the retired Street Furniture System's physical-object staging (poster case, sign housing, laminate) — no screen is a bolted-on object in this world.
- **Don't** use kōtare-teal or kotare-brown as chrome, decoration, or a second alert/positive color outside the Results verdict badges.
- **Don't** add a second "brand"/CTA color alongside kōtare-navy.
- **Don't** render a technical fault (fetch failure) as a verdict color — use a neutral ink-bordered banner instead, matching the old system's rule for the same reason: an outage isn't a "worse" verdict.
- **Don't** flatten cards, buttons, inputs, or badges back to a 0–2px radius; roundness is load-bearing for this world's "ordinary app," not "stamped paper," read.
