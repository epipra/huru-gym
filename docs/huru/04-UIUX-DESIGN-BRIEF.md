# UI/UX Design Brief - Huru GYM
> Linked PRD v1.0 and App Flow | Web (PWA), iOS, Android | Light and dark themes | Evolves the existing openGym design language under new branding

## 0. Design principles & brand tone
1. **Built for the gym floor:** one-handed, glanceable, large numbers, sweaty-finger-friendly targets (48 px minimum during workouts).
2. **Zero friction logging:** values pre-filled, steppers instead of keyboards, 2 taps per set.
3. **Never in the way:** no popups during a set; celebrate PRs with a short animation and haptic, never block the screen.
4. **Calm and honest:** explain every target ("Last time 5x5 at 80 kg, all reps hit, so +2.5 kg"); no guilt for misses; no dark patterns in the paywall.
5. **Designed, not assembled:** one hand-drawn icon set, consistent on every platform; no emoji as UI.
6. **Native feel:** platform haptics, safe areas, back gestures, and share sheets respected.

Brand: **Huru GYM**. Mood words: strong, calm, trustworthy. Tone of voice: short, direct, encouraging. The logo, wordmark and app icon are new work (Design phase); no openGym artwork is reused.

## 1. Color palette
Contrast checked approximately against white and dark surfaces; verify final values with a contrast tool before release.

| Token | Hex (light) | Usage |
|-------|-------------|-------|
| Primary | `#15803D` | Main buttons, active tab, links, focus ring (white text 5:1) |
| Primary-soft | `#22C55E` | Dark-mode primary, charts, progress fill |
| Accent (PR / energy) | `#F97316` | PR Badge, rest timer ring, streak flame |
| Info | `#3B82F6` | Info banners, tips |
| Warning | `#F59E0B` | Warnings, away-from-goal weight movement |
| Error | `#DC2626` | Errors and destructive confirmations (white text 4.8:1) |
| Success | `#15803D` | Completed sets, toward-goal weight movement |
| Neutral-900 / 600 / 200 / 50 | `#0F172A` / `#475569` / `#E2E8F0` / `#F8FAFC` | Text, secondary text, borders, backgrounds |

Dark theme: background `#0B0F14`, surface `#151B23`, surface-raised `#1E2631`, text `#F1F5F9`, Primary becomes `#22C55E`. **User accent color:** 8 selectable swatches (green, blue, violet, pink, orange, teal, red, gold) replace Primary for highlights; text-on-accent always checked for 4.5:1. Weight movement is never red: toward goal uses Success, away from goal uses Warning.

## 2. Typography
Typeface: **Inter** (bundled, variable, open license) on all platforms so the app looks the same everywhere; fallback system sans-serif. Numeric style uses tabular figures.

| Style | Size / line height (px) | Weight |
|-------|-------------------------|--------|
| Display numeric (weight, timer) | 56 / 60 | Bold, tabular |
| H1 | 32 / 40 | Bold |
| H2 | 24 / 32 | Semibold |
| H3 | 20 / 28 | Semibold |
| Body 1 | 16 / 24 | Regular |
| Body 2 | 14 / 20 | Regular |
| Caption | 12 / 16 | Regular |

Weights: Bold, Semibold, Medium, Regular. Support dynamic type up to 200% except fixed-size timers, which scale to 150%.

## 3. Spacing & layout
- **4px grid.** Scale: 4, 8, 12, 16, 20, 24, 32, 48, 56, 64.
- Page margin 16 (mobile), 24 (tablet width), content max width 720 on web; left rail from 900 px wide.
- Radius: 12 cards and inputs, 999 buttons and chips, 20 bottom sheets.
- Safe areas respected; Bottom Navigation 64 px plus inset; workout screen reserves 96 px for the primary action.
- Breakpoints for web: 0-599 phone, 600-899 large phone/small tablet, 900+ desktop with left rail.

## 4. Icons
One consistent outline set (the existing hand-drawn set, redrawn or extended for Huru GYM), 24 px, 1.75 px stroke. Core icons: home, calendar, bar-chart, coach (spark), settings, plus, check, close, back, edit, swap, skip, timer, play, pause, flame, trophy (PR), scale (weight), dumbbell, barbell, kettlebell, cable, machine, bodyweight, search, filter, lock (Pro), sync, offline, share, trash, eye, info.

## 5. Buttons
| Variant | Look | Use |
|---------|------|-----|
| Button/Primary | Filled Primary, white label, 56 px high in workout, 48 elsewhere | One main action per screen (Start workout, Finish) |
| Button/Secondary | Outlined Primary | Alternate actions |
| Text Button | Label only | Skip, Resend, Restore purchases |
| Icon Button | 48 px circle, filled or outlined | Swap, reschedule, social sign-in |

States: default, pressed (10% darker), disabled (40% opacity), loading (spinner, width unchanged). Destructive actions use Error fill inside a Dialog only. Haptic: light on tap, success on set complete.

## 6. Components
| Component | Variants / states | Usage rule |
|-----------|-------------------|-----------|
| Set Row | Pending, active, done, PR; optional effort column | Core of SCR-12; shows weight stepper, reps stepper, check; 56 px high |
| Stepper | Minus/plus with long-press repeat, tap number to type | Weight and reps without keyboard by default |
| Rest Timer | Ring with countdown, +15 s / -15 s, skip | Appears after a set; also on lock screen and as push alert |
| PR Badge | Small pill with trophy icon and animation | Only on a new best |
| Exercise Card | With media thumbnail, equipment icon, muscles | Library and routine editor |
| Routine Card | Name, exercise count, estimated time, weekday chip | Plan and Home |
| Progression Chip | Rule name (Linear, Greyskull LP, Double, Time) | Routine editor |
| Input Field / Search | Default, focused, error, disabled | Name, email, search |
| Chip | Selected, unselected, with icon | Filters, onboarding, equipment |
| Segmented Control | 2-4 segments | Period, units, theme, effort scale |
| Toggle | On, off, disabled | Settings and consents |
| Card | Default, tappable | Summary and stats blocks |
| List Item | Icon, subtitle, trailing control | Settings and lists |
| Checkbox | Unchecked, checked | Coach change acceptance |
| Progress Bar | Determinate, 8 px | Session and onboarding progress |
| Chart | Line (weight, e1RM), bar (volume), goal line | Stats and body weight; always with text summary |
| Heatmap | 5 intensity steps of Primary | Year activity |
| Muscle Map | Front and back figure, male or female, intensity shading | Stats, summary, routine preview |
| Sync Chip | Synced, syncing, offline with pending count | Home header |
| Skeleton | Row, card and chart shapes | Loading states |
| Banner | Info, warning, error | Offline, interrupted workout, quota |

## 7. Feedback
| Type | Color | Pattern |
|------|-------|---------|
| Success | Success tint | Toast, 3 s ("Workout saved") with Undo where possible |
| Info | Info tint | Inline Banner with icon |
| Warning | Warning tint | Banner with action ("Notifications are off. Open settings") |
| Error | Error tint | Inline field error or Banner; icon plus text, never color alone |

Haptics: set complete (light success), PR (strong success), rest timer end (notification haptic), error (warning). Respect system reduce-motion and haptics settings.

## 8. Navigation
- **Bottom Navigation (5 tabs):** Today, Plan, Stats, Coach, Settings; active tab uses Primary icon and label; Coach shows a lock icon for free users.
- **Left rail** on web 900 px and wider.
- **Tab Bar (in-screen):** Segmented Control for period and filter switching.
- **Breadcrumbs:** not used on mobile; large title with back arrow; web admin uses breadcrumbs.
- Active workout is a full-screen mode with a persistent minimize control.

## 9. Overlays
- **Modal Bottom Sheet:** exercise picker, swap exercise, rest timer adjustments, filters, reschedule day.
- **Action Sheet:** exercise options (replace, skip, delete set).
- **Dialog:** destructive confirmations, e.g. "Delete account? All workouts, plans and weights are permanently removed." with Cancel (Secondary) and Delete (Error); AI Coach consent Dialog describing exactly what is shared.
- **Toast:** transient confirmations with Undo.

## 10. Accessibility
- Text contrast 4.5:1, non-text 3:1; PR, effort and goal direction use icon and text as well as color.
- Touch targets 48 px in workout, 44 px elsewhere; 8 px between adjacent targets.
- Screen-reader labels such as "Bench press, set 2 of 4, 80 kilograms, 5 repetitions, not completed, double tap to complete".
- Dynamic type, bold text, reduce motion (no PR animation), VoiceOver and TalkBack order matching visual order; charts have a text summary and data table alternative.
- Keyboard navigation and visible focus on web; WCAG 2.2 AA target.

## 11. Screen-to-component map
| Screen | Components used |
|--------|-----------------|
| SCR-01 Landing / Welcome | Button/Primary, Button/Secondary, Card, Text Button |
| SCR-02 Create account / SCR-03 Sign in | Button/Primary, Icon Button, Text Button, Input Field, Banner |
| SCR-04 Account recovery | Input Field, Button/Primary, Banner |
| SCR-05 Onboarding intake | Chip, Segmented Control, Progress Bar, Button/Primary, Text Button |
| SCR-06 Starter plan picker | Card, Routine Card, Button/Primary, Text Button |
| SCR-07 Home - Today | Card, Routine Card, Sync Chip, Button/Primary, Icon Button, Banner |
| SCR-08 Weekly plan | Routine Card, Icon Button, Modal Bottom Sheet |
| SCR-09 Routine editor | List Item, Exercise Card, Progression Chip, Toggle, Stepper, Muscle Map, Button/Primary |
| SCR-10 Exercise library | Search, Chip, Exercise Card, Skeleton, Button/Secondary |
| SCR-11 Exercise detail | Card, Chart, Button/Primary |
| SCR-12 Guided workout | Set Row, Stepper, Rest Timer, PR Badge, Progress Bar, Icon Button, Action Sheet, Button/Primary, Banner |
| SCR-13 Workout summary | Card, PR Badge, Muscle Map, Button/Primary, Text Button |
| SCR-14 Body weight | Chart, Segmented Control, Input Field, Toggle, List Item |
| SCR-15 Stats | Heatmap, Chart, Segmented Control, Muscle Map, List Item |
| SCR-16 Coach home | Card, Button/Primary, List Item, Dialog, Skeleton |
| SCR-17 Coach proposal and review | List Item, Checkbox, Button/Primary, Button/Secondary, Toast, Skeleton |
| SCR-18 Paywall | Card, Button/Primary, Text Button |
| SCR-19 Settings | List Item, Toggle, Segmented Control, Chip, Dialog |
| SCR-20 Data and privacy | List Item, Toggle, Button/Secondary, Dialog |
| SCR-21 Admin dashboard | List Item, Search, Toggle, Dialog, Banner |
