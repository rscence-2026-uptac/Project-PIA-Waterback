---
name: Tubig Patas
description: Water-security PIA system for the Antiao River basin, Catbalogan. Every household knows when the water comes back, and where to get it until then.
colors:
  water: "#248dc5"
  sky: "#a3d0e8"
  foam: "#fdfdfd"
  tide: "#1a6e9c"
  ink: "#0d2e42"
  ink-soft: "#34505f"
  mist: "#eef6fb"
  frost: "#f4f9fc"
  haze: "#d3e6f1"
  ink-raised: "#1d4560"
  coral: "#f4846c"
  coral-wash: "#fdebe6"
  coral-deep: "#b23f2a"
  water-murky: "#4f8eac"
  water-cloudy: "#93a3a8"
typography:
  display:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(40px, 5.4vw, 72px)"
    fontWeight: 750
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  numeral:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "52px"
    fontWeight: 750
    lineHeight: 1
    letterSpacing: "-0.035em"
    fontFeature: "\"tnum\" 1"
  headline:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 750
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
  body-staff:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Atkinson Hyperlegible, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.3
rounded:
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  hero: "32px"
  device: "44px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "56px"
components:
  button-primary:
    backgroundColor: "{colors.tide}"
    textColor: "{colors.foam}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "56px"
    padding: "0 20px"
  button-soft:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "52px"
    padding: "0 18px"
  button-quiet:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "52px"
    padding: "0 18px"
  chip-flowing:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  chip-heads-up:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.foam}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  chip-interrupted:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  chip-schedule:
    backgroundColor: "{colors.tide}"
    textColor: "{colors.foam}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  status-card:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.ink}"
    rounded: "{rounded.hero}"
    padding: "20px 18px"
  panel:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "24px"
  panel-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.foam}"
    rounded: "{rounded.xl}"
    padding: "24px"
  metric-tile:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "20px 22px"
  alert-card:
    backgroundColor: "{colors.coral-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input-field:
    backgroundColor: "{colors.foam}"
    textColor: "{colors.ink}"
    typography: "{typography.body-staff}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 14px"
  segment-option:
    backgroundColor: "{colors.foam}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "44px"
  segment-option-flowing:
    backgroundColor: "{colors.tide}"
    textColor: "{colors.foam}"
  segment-option-dry:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.ink}"
  sms-bubble-in:
    backgroundColor: "{colors.foam}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
  sms-bubble-out:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
---

# Design System: Tubig Patas

## Overview

**Creative North Star: "The Drop Is the Status"**

Tubig Patas is opened on a stressful day, often on a cheap Android phone in bright outdoor light, sometimes by an elderly resident, sometimes by a purok captain standing at a dry faucet. The system answers one question before any word is read: *how much water can I count on right now?* It answers with a single shape, the brand's own water drop, used as a gauge. Its level is how much water you can rely on, its clarity is whether the source is clean, and its stillness is whether anything is flowing. Every screen, in every role, leads with state and follows with exactly one next step.

The world is light, cool and calm: a near-white ground, soft sky fields, deep ink type, and one saturated blue that is reserved for water itself. Warmth enters only when something is wrong, as a soft coral that complements the blue instead of shouting over it. Density is low for residents (one screen, one sentence, one action) and moderate for CWD and LGU staff, who get more data but the same calm surfaces. Personality lives in type and in the water, not in decoration.

Surfaces are separated by tone, never by lines. Panels are soft fills on the ground, darker fills sit inside lighter ones, and the deepest ink panels carry the moments that ask for a decision. Motion is spent almost entirely on water: it rises, ripples, clouds and goes still, and everything else answers taps quickly and identically.

**Key Characteristics:**
- The water drop is both logo and status gauge; level, clarity and stillness always agree with the words beside it.
- One reserved blue for water, one coral for interruption, everything else ink, sky, mist and foam.
- Fills and spacing separate surfaces; no outline borders.
- Large, tabular display numerals for every time a resident waits on.
- One sentence and at most one primary action per role per state.

## Colors

A cool, near-monochrome blue world where the brightest blue always means water and the only warm colour means "interrupted".

### Primary
- **River Blue** (water): Reserved for water and nothing else: drop-gauge fills, storage containers filling, time-window bands, the waterline wave, progress that represents litres. White text on it only at 24px and above (3.6:1).
- **Deep Tide** (tide): The action colour. Primary buttons, links, the "flowing" option in the captain's status control, the "on a schedule" chip. White text on it passes at all sizes (5.5:1).

### Secondary
- **Clear Sky** (sky): The friendly field colour. The resident status card, dashboard metric tiles, soft buttons, selected storage tiles, outgoing SMS bubbles. Ink text on it is 8.6:1.

### Tertiary
- **Soft Coral** (coral): Interruption only, as the warm complement to the blues. "Interrupted" chips, the "Dry" status option, "Over limit" tags, icon tiles on alert cards. Always paired with ink text (5.6:1), an icon and a word.
- **Coral Wash** (coral-wash): The background of alert cards and the "boil before drinking" pill.
- **Ember** (coral-deep): Small coral marks on light grounds where coral itself is too pale: warning icons, the plant-limit line on charts (5.7:1 on foam).

### Neutral
- **Foam** (foam): The ground of every screen, and the inner surface of fields and inputs set on mist panels.
- **Deep Current** (ink): All primary text, dark decision panels, the "heads-up" chip, the gauge outline.
- **Slate Current** (ink-soft): Secondary text and captions on foam, mist and sky (5.2:1 on sky, 8.4:1 on foam).
- **Mist** (mist): Panels, quiet buttons, location pills, chart surfaces, keyword rows.
- **Frost** (frost): Alternate page ground for presentation boards that hold white cards.
- **Haze** (haze): Hover tint for small controls only; never a line or a border.
- **Raised Current** (ink-raised): Inner panels and secondary buttons inside dark ink panels.
- **Murky Water** (water-murky) and **Cloudy Water** (water-cloudy): Gauge fill only, for the heads-up and muddy-river states.

### Named Rules
**The Water Only Rule.** River Blue (#248dc5) only ever paints water. If it isn't water, a level of water, or time until water, it is tide, sky or ink.

**The One Warm Colour Rule.** Coral is the only warm hue in the system and it means one thing: supply is interrupted or over a limit. No decorative warmth, no red, no brown.

**The Ink-on-Coral Rule.** Text on coral is always Deep Current, never white.

## Typography

**Display Font:** Bricolage Grotesque (with ui-sans-serif, system-ui)
**Body Font:** Atkinson Hyperlegible (with ui-sans-serif, system-ui)

**Character:** A warm, slightly quirky grotesque for headlines and every number a resident waits on, paired with a typeface built by the Braille Institute for low-vision readers. The display face gives the product a voice; the body face makes sure an elderly resident can read it in sunlight.

### Hierarchy
- **Display** (750, clamp(40px, 5.4vw, 72px), 1.02): Presentation and overview headlines only.
- **Numeral** (750, 48–56px, 1.0, tabular): The time window on resident screens ("4–7 PM"), restoration times, metric values. The largest thing on a resident screen after the drop.
- **Headline** (750, 30–34px resident / 32–40px dashboards, 1.05): The one-sentence state ("No water from the tap", "Who gets water first?").
- **Title** (700, 18–24px, 1.2): Section and card titles.
- **Body** (400, 17px, 1.45): Resident copy. Never below 16px on resident screens; keep to 30–60ch.
- **Body staff** (400, 15–16px, 1.5): Dashboard copy for CWD and LGU.
- **Label** (700, 13–15px): Chips, buttons, field labels, time-of-update stamps. Sentence case, never uppercase.

### Named Rules
**The Waiting Number Rule.** Any time a resident is waiting on is set in Bricolage at numeral size. It is the second thing the eye lands on, after the drop.

**The Sentence-Case Rule.** No uppercase labels and no tracked-out eyebrows. Headings carry their own weight.

## Layout

Resident and captain screens are phone-first single columns at 390px wide with 20px side gutters, stacked top to bottom in reading order: state, time, the one action. Status content is centred around the drop; supporting cards are full-width and left-aligned.

Dashboards are fluid pages: a max-width container of 1360px with 32px gutters, a main column (flex 999 1 640px) and a side column (flex 1 1 360–380px) that wraps beneath on narrow screens. Metric tiles and fact cards use auto-fit grids (minmax 180–240px). Overview boards use a 1240px container.

Spacing follows a soft 4px rhythm (6, 8, 12, 16, 24, 32, 56): 8–12px inside groups, 16–24px between cards, 32px and up between sections, with more space above a heading than below it. Touch targets are at least 44px; primary actions are 52–56px tall.

## Elevation & Depth

Depth is tonal. Surfaces sit flat at rest and are layered by fill: foam ground, then mist or sky panels, then foam fields set inside those panels. The darkest ink panels mark the moments that ask for a decision, such as confirming priorities, the disruption detector and a closing summary. Shadows appear only on objects that float: the phone frame on presentation boards, toasts and the restored-screen card over moving water.

### Shadow Vocabulary
- **Floating card** (`box-shadow: 0 12px 32px -12px rgba(13, 46, 66, 0.45)`): The card that sits over the water on the "Water's back" screen.
- **Toast** (`box-shadow: 0 12px 28px -10px rgba(13, 46, 66, 0.5)`): Confirmation toasts that rise from the bottom edge.
- **Device frame** (`box-shadow: 0 30px 60px -30px rgba(13, 46, 66, 0.45)`): Phone mockups on presentation boards only.

### Named Rules
**The No-Line Rule.** Surfaces are separated by fill and spacing, never by 1–1.5px borders, hairline dividers or outline buttons. If two areas need separating, change the fill one step (foam → mist → sky) or add space.

**The Decision Is Dark Rule.** A full ink panel means "this is where you decide or act". Don't spend it on information.

## Shapes

Soft, generous rounding that feels friendly in the hand: 12px for small controls and segment options, 16px for buttons, 20–24px for cards and panels, 32px for the resident status card, 44px for device frames, and full pills for chips and the location selector.

The signature silhouette is the water drop: a point at the top resolving into a circle, used as the logo, the status gauge (160×210 large, 96–104px medium, 72×94 mini) and the favicon. Inside the gauge, the water surface is a gentle sine wave, never a straight line. Storage containers are drawn as small jerrycans with a cap and a 2px ink stroke, the only stroked shape in the system because it is an illustration, not a border.

## Components

### Buttons
Confident, chunky and finger-sized.
- **Shape:** gently rounded (16px), 52–56px tall.
- **Primary:** Deep Tide fill with foam text, 17px bold label, optional leading 20px stroke icon.
- **Soft / Quiet:** Clear Sky or Mist fill with ink text, for secondary actions and actions inside dark panels.
- **Press:** scales to 0.97 over 140ms with cubic-bezier(0.23, 1, 0.32, 1). No hover lift.
- **Rule:** one primary button per role per state.

### Chips
- **Style:** full pills, 14px bold label, optional 16px icon, ink or foam text as the token specifies.
- **States:** Flowing (sky), Heads-up (ink), Interrupted (coral), On a schedule (tide), Planned repair (mist).

### Cards / Containers
- **Corner Style:** 20–24px (32px for the resident status card).
- **Background:** mist panels on foam; sky for status cards and metric tiles; coral wash for alerts; ink for decision panels.
- **Shadow Strategy:** flat; see Elevation & Depth.
- **Border:** none.
- **Internal Padding:** 16px on phones, 20–24px on dashboards.

### Inputs / Fields
- **Style:** foam field inside a mist panel, no stroke, 16px radius, 48px tall, tabular numerals for readings.
- **Focus:** 3px River Blue outline with 2px offset, the system-wide focus ring.
- **Labels:** always visible above the field in label style.

### Navigation
- **Resident app:** a three-tab bottom bar (Status, Sources, History), 56px tall, 20px stroke icons over 13px labels; the current tab is ink and bold, the others slate.
- **Dashboards:** a top bar with the drop wordmark, the organisation name and text tabs; the current tab sits in a soft pill.

### Drop Gauge (signature)
The water drop drawn as a vessel and filled to the current level. Flowing: about 80% full, River Blue, the surface ripples slowly (5s linear loop). Heads-up: about 72%, Murky Water, still rippling. Muddy river: about 14%, Cloudy Water, still. Low river: about 32%, River Blue, still. Repair: about 6%, still. Back: refills to about 86% and the ripple resumes. Level changes move over 800ms with cubic-bezier(0.77, 0, 0.175, 1); colour changes fade over 600ms. Under reduced motion the level changes instantly, the colour still fades and the ripple stops. The gauge always sits next to words that say the same thing.

### Storage Tiles
Three tappable jerrycan tiles (20 L each) in a mist card. Tapping fills the container from its base (scaleY over 420ms, ease-out) and advances the progress segments. The card stops at 60 L and says so; the plan never rewards storing more.

### Source Status Control
The captain's three-option segmented control (Flowing / Long queue / Dry) at 44px tall. Flowing selects to tide, Long queue to ink, Dry to coral with ink text. Each change confirms its reach with a toast that rises from the bottom edge ("Sent to 212 households").

### SMS Thread
Plain GSM-7 messages under 160 characters, each ending with the next reply keyword. Incoming bubbles are foam, replies are sky, and the closing "water is back" message is tide with foam text.

## Do's and Don'ts

### Do:
- **Do** lead every screen with state: drop gauge, status chip, one-sentence headline, then the waiting number.
- **Do** keep resident text at 16–17px or larger and every touch target at least 44px (primary actions 52–56px).
- **Do** separate surfaces with fills (foam → mist → sky → ink) and spacing.
- **Do** pair every coloured status with an icon and a word; colour never carries state alone.
- **Do** use ink text on coral and on sky; use foam text on tide and ink.
- **Do** make motion mean something about water, and provide a reduced-motion version that fades instead of moving.

### Don't:
- **Don't** use River Blue (#248dc5) for anything that isn't water.
- **Don't** draw 1–1.5px borders, hairline dividers, table rules or outline buttons.
- **Don't** use brown, red or any warm colour other than coral.
- **Don't** put white text on coral or on River Blue below 24px.
- **Don't** add streaks, leaderboards, points or surprise rewards.
- **Don't** animate data that people read (charts, counters), pulse status badges, or run a seconds countdown.
- **Don't** set labels in uppercase or add eyebrow text above headings.
