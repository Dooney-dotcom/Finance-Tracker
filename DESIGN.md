---
name: Finance Tracker
description: A personal ledger in Apple Liquid Glass. Content rests on solid grouped cards; every control floats above it in glass.
colors:
  ground: "#f2f2f7"
  paper: "#ffffff"
  fill: "rgb(118 118 128 / 0.12)"
  fill-2: "rgb(118 118 128 / 0.07)"
  ink: "#1d1d1f"
  ink-2: "#6e6e73"
  ink-3: "#aeaeb2"
  rule: "#e5e5ea"
  income: "#007aff"
  income-text: "#0066cc"
  income-deep: "#003e80"
  expense: "#ff3b30"
  expense-text: "#d70015"
  expense-soft: "#ffa39e"
  ochre: "#ff9500"
  ochre-wash: "#fff2dd"
  expected: "#248a3d"
  focus: "rgb(0 122 255 / 0.45)"
  pill: "#ffffff"
  glass: "rgb(255 255 255 / 0.5)"
  glass-strong: "rgb(250 250 252 / 0.82)"
  ground-dark: "#000000"
  paper-dark: "#1c1c1e"
  fill-dark: "rgb(118 118 128 / 0.24)"
  ink-dark: "#f5f5f7"
  ink-2-dark: "#8e8e93"
  ink-3-dark: "#636366"
  rule-dark: "#38383a"
  income-dark: "#0a84ff"
  income-text-dark: "#409cff"
  expense-dark: "#ff453a"
  expense-text-dark: "#ff6961"
  ochre-dark: "#ff9f0a"
  expected-dark: "#30d158"
  pill-dark: "#636366"
  glass-dark: "rgb(44 44 48 / 0.4)"
  glass-strong-dark: "rgb(32 32 36 / 0.8)"
typography:
  display:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "4.5rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  period:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    letterSpacing: "-0.022em"
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    letterSpacing: "-0.015em"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.008em"
  control:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
  caption:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    fontFeature: "tnum"
rounded:
  check: "6px"
  row: "10px"
  ctl: "12px"
  day: "14px"
  readout: "16px"
  popover: "22px"
  card: "24px"
  toolbar: "28px"
  sheet: "30px"
  capsule: "999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  xxl: "32px"
components:
  button:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.capsule}"
    padding: "8px 18px"
    height: "40px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.capsule}"
    padding: "8px 18px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.capsule}"
    padding: "8px 18px"
    height: "40px"
  field:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.ctl}"
    padding: "10px 14px"
    height: "44px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "20px 24px 24px"
  segmented:
    backgroundColor: "{colors.fill}"
    rounded: "{rounded.capsule}"
    padding: "3px"
  segmented-selected:
    backgroundColor: "{colors.pill}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.capsule}"
    padding: "0 16px"
    height: "34px"
  nav-tab:
    textColor: "{colors.ink-2}"
    typography: "{typography.control}"
    rounded: "{rounded.capsule}"
    padding: "0 18px"
    height: "40px"
  nav-tab-active:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
  chip:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.capsule}"
    padding: "2px 10px"
---

# Design System: Finance Tracker

## Overview

**Creative North Star: "Still Water, Floating Glass"**

Money sits still; the hands move. Every figure, chart and table rests on a solid, shadowless card over the iOS grouped background, and every control that acts on that content (the tab capsule, the period and filter toolbars, the record sheet, popovers, chart readouts, the sticky import bar) floats above it in Liquid Glass: a translucent tint, backdrop blur with boosted saturation, a light rim with an inner specular edge, and a soft drop shadow. The split is the system. Glass never touches content, and content never floats.

The world follows the operating system: SF Pro through the system font stack, Apple system colours, light and dark by `prefers-color-scheme`, solid glass under Reduce Transparency, no motion under Reduce Motion. Density is a working tool's, not a brochure's: tabular numerals everywhere money is counted, 0.5px hairline rules between rows, capsule controls at 40px and fields at 44px. The one flourish is the selection droplet, a pill that slides between tabs and segments on an overshooting ease and settles.

The previous "Olivetti" paper-and-black-bar shell is gone and is not a reference. So is the "glass on every card" costume.

**Key Characteristics:**
- Two layers only: solid content cards (no shadow) and a floating glass control layer.
- Apple system colours carry money: blue income, red expense, orange attention, green expected.
- Capsules for every control; 24px cards; 12px filled fields.
- Selection is a sliding droplet with a springy overshoot.
- Follows system light/dark and the OS accessibility preferences.

## Colors

A near-neutral Apple grey ground with four system colours that each mean one thing about money.

### Primary
- **System Blue** (`income`): income, the positive net figure, the income plane, links, caret, selection tint and the focus ring. As small text it steps down to **Deep Link Blue** (`income-text`, 5.6:1), and to **Navy Ink** (`income-deep`) on the deepest heat cell.
- **System Red** (`expense`): expense, the negative net figure, the expense plane, the calendar heat ramp (`heat-1..4` are `expense` mixed into `paper` at 12/24/38/54%). Small text uses **Signal Red** (`expense-text`, 5.4:1). **Blush** (`expense-soft`) is the "Partly avoidable" tier.

### Secondary
- **System Orange** (`ochre`; the token keeps its old name): attention only. Uncategorised records, overdue plans, active filters, "late" and "gap" underlines. **Orange Wash** (`ochre-wash`) is its tinted background for attention boxes and an active filter.
- **System Green** (`expected`): planned bills still to come, always drawn dashed. A projection, never spending.

### Neutral
- **Grouped Ground** (`ground`): the page behind everything; also the scroll-edge fade under the top bar.
- **Card White** (`paper`): content cards, chart strokes and label halos, checkbox fill.
- **Grey Fill** (`fill`, `fill-2`): fields, segmented tracks, quiet buttons, chips, the active nav tab; `fill-2` is row hover.
- **Label** (`ink`): text, primary buttons, selected days and months, neutral chart series.
- **Secondary Label** (`ink-2`): secondary text and ticks (5.1:1 on paper).
- **Tertiary Grey** (`ink-3`): graphic only (tracks, "other", locked), never text.
- **Separator** (`rule`): 0.5px hairlines and the donut track.
- **Pill** (`pill`): the selected segment droplet (white in light, `#636366` in dark).

Dark mode swaps every role to its `-dark` token: pure black ground, `#1c1c1e` cards, and the brighter dark-mode system hues.

### Named Rules
**The Money Has Four Colours Rule.** Blue is income, red is expense, orange is "look here", green is expected. No other hue enters the chrome; a new state reuses one of these meanings or stays neutral.

**The User's Colours Are Data Rule.** Category colours are chosen by the user and are rendered as given, on keys, dots, bars and donut slices. Never restyle, tint or theme them.

**The Text-Tone Rule.** A system colour used as small text takes its `-text` variant; the bright hue is for fills, strokes and the big figure only. `ink-3` is never text.

## Typography

**Display Font:** system-ui (SF Pro on Apple devices), with -apple-system, Segoe UI, Roboto, Helvetica Neue
**Body Font:** the same stack
**Label/Mono Font:** none; numerals switch to tabular figures instead

**Character:** One family, Apple's, carried by weight and tight negative tracking. Bold (700) for figures and titles, semibold (600) for controls and labels, regular for prose.

### Hierarchy
- **Display** (700, 4.5rem, 1, -0.04em; 3.25rem on phones): the period's net figure, the only display text. Proportional numerals here, by exception.
- **Headline** (700, 2rem, 1.1, -0.03em, tabular): a chart's headline figure; the auth title at the same size.
- **Period** (700, 1.375rem, -0.022em; 1.125rem on phones): the period label between the stepper arrows. Totals in the hero (`.io`) use the same size.
- **Title** (700, 1.125rem, -0.015em): card titles and the brand; the sheet title at 1.25rem.
- **Body** (400, 16px, 1.45, -0.008em): prose and table cells (tables at 0.9375rem). Summaries cap at 65ch.
- **Control** (600, 0.9375rem): segmented and subtab labels; buttons and tabs inherit 16px at 600.
- **Label** (600, 0.875rem, `ink-2`): field labels, legends, hero sub-labels.
- **Caption** (600, 0.8125rem): table heads, chips, readouts, calendar weekday heads. Chart ticks are 12px.

### Named Rules
**The Tabular Money Rule.** Every amount in a table, list, legend, readout, chip or calendar cell uses tabular numerals so columns align. Only the hero net figure is proportional.

**The Negative Tracking Rule.** Headings tighten as they grow: -0.015em at title size down to -0.04em at display. Never positive tracking, never uppercase labels.

## Layout

A centred page (max 1320px, 32px side padding; 12px on phones) under a 72px sticky top bar (60px on phones). Dashboard and Wealth use a 12-column board with 20px gaps (12px on phones); cards span fixed column ranges and collapse to full width at 1100px and 720px. Records is a toolbar over one card holding the table; Calendar is an 8fr/4fr split with a sticky day-detail column that stacks at 1100px.

Toolbars sit sticky directly under the top bar and, above 720px, shrink to fit their controls rather than spanning the page. The record sheet is non-modal and docks right (440px), so the table stays usable beside it; on phones it becomes an inset full-screen sheet. On phones the nav leaves the top bar and becomes a floating bottom tab bar, 16px from the edges and above the safe area, and the page gains 96px of bottom padding to clear it. The records table reflows into two-line rows.

Spacing steps by 4: 4, 8, 12, 16, 20, 24, 32. Card padding is 20/24/24 (18/18/20 on phones); stacks use 16px gaps; card-to-card is 20px.

## Elevation & Depth

Two planes. Content is flat: cards have no shadow and are separated from the ground by tone alone. The control layer is lifted, and only the control layer casts a shadow. Depth inside a control is built from a light rim and inner glow, not from a darker border.

### Shadow Vocabulary
- **Glass edge** (`--glass-edge`: `inset 1px 1px 0 rgb(255 255 255 / 0.9), inset -1px -1px 0 rgb(255 255 255 / 0.5), inset 0 0 0 0.5px rgb(0 0 0 / 0.06), inset 0 0 14px rgb(255 255 255 / 0.45)`): the specular rim on every glass surface; much dimmer in dark.
- **Glass shadow** (`--glass-shadow`: `0 8px 28px rgb(0 0 0 / 0.09), 0 1px 3px rgb(0 0 0 / 0.06)`): the float under every glass surface; 0.55/0.4 alpha in dark.
- **Pill shadow** (`--pill-shadow`: `0 3px 8px rgb(0 0 0 / 0.12), 0 0 0 0.5px rgb(0 0 0 / 0.04)`): the selected segment droplet only.
- **Focus** (`0 0 0 3px var(--focus)` on fields, a 3px `--focus` outline elsewhere).

Glass comes in two weights. **Regular glass** (`glass`, blur 10px, saturate 190%) for the tab capsule, account button, period and filter toolbars, chart readouts and the sticky import bar. **Strong glass** (`glass-strong`, blur 32px, saturate 190%) for surfaces that hold reading or editing: the record sheet, popovers and the customizable select list.

### Named Rules
**The Glass Is For Hands Rule.** Glass belongs to things you operate, never to things you read. A card, table, chart or banner is solid `paper`, always.

**The Reduce Transparency Rule.** Under `prefers-reduced-transparency: reduce` both glass tints become `paper` and blur is removed. Any new glass surface must read its tint and blur from the tokens so it inherits this.

**The Scroll-Edge Rule.** The top bar has no fill of its own; content fades and softens under it through a `ground` gradient with a 6px blur and a masked bottom edge.

## Shapes

Everything is rounded; nothing is square. Controls are full capsules (999px): buttons, tabs, segments, chips, steppers, calendar days in the picker, filter selects and the search field. Cards are 24px (22px on phones), fields and notices 12px, and floating surfaces round more the larger they are: readout 16px, popover 22px, toolbar 28px (24px on phones), sheet 30px. Small inset elements step down: calendar month cells 14px, hover rows 10px, checkbox 6px. Borders are 0.5px hairlines in `rule`; the only drawn outlines are the planned-bill dashed capsule, the selected calendar day (2px `ink`) and swatch rings.

Icons are stroked SVG on a 20px grid, 1.75 stroke, round caps and joins, `currentColor`. They appear on the phone tab bar (22px), stepper arrows and plan status, never as decoration.

## Components

### Buttons
Soft capsules that press in.
- **Shape:** full capsule (999px), 40px tall, 8px 18px padding, weight 600.
- **Default:** `fill` on `ink`; hover deepens to `ink` at 14%.
- **Primary:** `ink` with `paper` text; hover mixes 16% `paper` in.
- **Ghost:** transparent; hover shows `fill`.
- **Press:** scales to 0.96 on the liquid ease. Disabled is 40% opacity.
- **Danger:** a solid red capsule with white text, used once, inside the record sheet's danger zone.
- **Link:** `income-text`, weight 500, underline on hover only.

### Chips
- **Style:** `fill` capsule, caption type, tabular. `up` takes `expense-text`, `down` takes `ink-2`.

### Cards / Containers
- **Corner Style:** 24px (`card`).
- **Background:** `paper`.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** none; inner rows use 0.5px `rule` hairlines.
- **Internal Padding:** 20px 24px 24px; title row has 14px below it.
- **Variants:** the expense banner is `expense` mixed 12% into `paper` at 20px radius; attention boxes use `ochre-wash` at 14px.

### Inputs / Fields
- **Style:** filled `fill` background, no border, 12px radius, 44px tall, 10px 14px padding. Labels sit above in Label type.
- **Focus:** a 3px `focus` ring as box-shadow, no outline.
- **Selects:** an SVG chevron; where `appearance: base-select` is supported, the open list is strong glass at 18px radius with 10px-radius options, the checked option filled `ink`.
- **Checkbox:** 20px, 6px radius, `ink-3` stroke; checked fills `ink` and the tick scales in on the liquid ease.
- **Inline cell selects** in the table are transparent until hover.

### Navigation
- **Desktop:** brand left, a regular-glass tab capsule centred (4px padding, 40px text-only tabs in `ink-2`, the current tab `ink` on a `fill` droplet), the Account capsule right in its own glass.
- **Phone:** the capsule detaches into a fixed bottom tab bar (62px, 16px from the edges), tabs become a 22px icon over 11px label.
- **Subtabs** (Records sections) are a segmented control styled as links.

### Toolbars
Regular-glass capsules at 28px radius, sticky under the top bar, fit-content above 720px. The period toolbar holds the Day/Week/Month/Year segmented control, the stepper (36px round ghost buttons around the period label) and Today. The filter toolbar holds capsule selects and search; an active filter turns `ochre-wash` with a 1.5px `ochre` inset.

### Chart readout
A regular-glass card (16px radius, min 176px) that follows the cursor over a chart, listing series with 8px dots and tabular right-aligned values. Charts themselves are hand-drawn SVG reading colour tokens; text gets a 4px `paper` halo; income and expense planes overlap with `multiply` blending in light and none in dark. Every chart keeps a "table" disclosure below it.

### Record sheet
Strong glass, 30px radius, docked right below the top bar, non-modal, sliding in from 32px right on the standard ease. Inset full-screen on phones.

### Selection Droplet (signature)
The selected item in the tab capsule, segmented controls and subtabs is one pseudo-element anchored to the current item with CSS anchor positioning. When selection changes it slides its left and right edges over 460ms on the liquid ease (`cubic-bezier(0.34, 1.4, 0.64, 1)`), overshooting and settling. In segments it is `pill` with the pill shadow; in the nav capsule it is `fill`. Without anchor positioning the selected item carries the same background statically. Items scale to 0.94 on press.

## Do's and Don'ts

### Do:
- **Do** put new controls that float (toolbars, popovers, overlays) in glass using `--glass`/`--glass-strong`, `--glass-blur`/`--glass-blur-strong`, `--glass-edge` and `--glass-shadow`, never literal values.
- **Do** put new content on a solid `paper` card at `--r-card` with no shadow.
- **Do** make every control a capsule (999px) and every field a 12px filled `fill` box.
- **Do** use the selection droplet for any new single-choice control.
- **Do** use the liquid ease for presses, droplets and popover entry; use `--ease-out` for bars and disclosure chevrons.
- **Do** read chart colours from the tokens so charts follow light/dark.
- **Do** set money in tabular numerals.

### Don't:
- **Don't** put glass on cards, tables, charts, banners or any content surface.
- **Don't** add a shadow to a content card.
- **Don't** introduce a hue outside the four money colours and the greys.
- **Don't** restyle or theme user-chosen category colours.
- **Don't** use `ink-3` or a bright system hue as small text; use `ink-2` or the `-text` variant.
- **Don't** hard-code a colour that has a token; dark mode only works through the tokens.
