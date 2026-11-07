---
version: 1
slug: "web-src-app-tsx"
primary_target: "web/src/App.tsx"
related_targets: ["web/src/index.css"]
---

# App shell (all signed-in screens + auth)

Mode: Operate. The owner logs and fixes records and reads the dashboard, several times a week, on a Mac by day and evening and on an iPhone on the go.

User decisions (2026-11-06): Apple Liquid Glass, Apple-faithful (glass only on the floating control layer, never on content); follow system light/dark; nav is a floating top capsule on desktop and a floating bottom tab bar on phones.

Constraints: charts stay hand-drawn SVG and read their colours from CSS tokens; category colours are user data and are never restyled; every chart keeps its table alternative.

## Direction contract

THESIS: Content sits still on solid grouped cards; every control floats above it in Liquid Glass. Refuses the old Olivetti paper-and-black-bar shell and the "glass on every card" costume.

OWN-WORLD: iOS 26 / macOS Tahoe grouped background (#f2f2f7 / #000), cards #fff / #1c1c1e at 24px radius, no card shadow. Glass: translucent tint, backdrop blur + saturation, a 1px light rim and an inner specular edge, a soft offset shadow. Capsule buttons and segmented controls, filled grey fields at 12px. Apple system colours carry money: blue income, red expense, orange attention, green expected. System font (SF Pro on Apple devices), tabular numerals.

STORY: The owner sees the period and its balance at once, steps periods from a glass toolbar that stays in reach, and edits a record in a floating glass sheet beside the table.

FIRST VIEWPORT: Dashboard. Brand at left, the glass tab capsule centred, Account at right, with an iOS scroll-edge fade under it. Below it a sticky glass period toolbar (Day/Week/Month/Year segmented, stepper, Today). Then the balance card (big net figure, income/expense planes) beside the trend card.

FORM: Apple Liquid Glass, pinned by the user, so concept-seed did not run (new-work.md: a direction the user pinned reads the mode file instead; mode-operate.md was read). seed: none (pinned by user, no roll per new-work.md). Signature move: the selection is a liquid droplet; the selected pill slides between tabs and segments with a springy overshoot (CSS anchor positioning, static pill fallback).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Known ceiling (builder decision, 2026-11-06): no lensing/refraction edge. The only way to get one in CSS, backdrop-filter: url(#svg-filter), works only in Chromium; the cross-browser glass is a tint + blur + saturation with a specular rim. Also not built: the tab bar shrinking on scroll, a droplet that stretches as it moves, and the sheet growing out of its row.
