# Plan: Theme Overhaul (Prime Time Neon)

## Summary
Implement a global React Context Theme Provider ('light' | 'dark') saved to local storage, add a theme toggle to the global BottomNav (or App layout), and overhaul global Tailwind components to a "Prime Time Neon" aesthetic. This involves updating typography to an athletic broadcast style, adding sharp geometric cutouts to cards, and transitioning colors smoothly between a crisp white/neon light mode and a metallic/neon dark mode.

## Current State Analysis
1. **Theming**: The app currently hardcodes `bg-charcoal-900`, `bg-charcoal-800`, and `text-white` across ~25 `.tsx` files, effectively locking it into a dark mode.
2. **Typography**: Uses standard `Inter` and `JetBrains Mono`.
3. **Components**: Cards use rounded corners (`rounded-xl`).

## Proposed Changes

### 1. Global Theme Context (`src/contexts/ThemeContext.tsx`)
- Create a `ThemeProvider` that manages `'light' | 'dark'` state.
- Sync state to `localStorage.getItem('theme')`.
- Apply `.dark` class to `document.documentElement` based on state.
- Wrap the app with `ThemeProvider` in `App.tsx`.

### 2. Theme Toggle Switch
- Add a neon-styled toggle switch.
- Place it in `Dashboard.tsx`, `ProfilePage.tsx`, `LeaderboardPage.tsx`, and `HistoryPage.tsx` top headers (since there is no single global top header).

### 3. Tailwind & CSS Overhaul (`tailwind.config.js` & `index.css`)
- **Typography**: Add `font-athletic: ['Oswald', 'sans-serif']` to Tailwind config. Update headings (`h1`, `h2`, `h3`) and scoreboard metrics in `index.css` to use `@apply font-athletic uppercase tracking-wider italic font-bold`.
- **Color Palette Mapping**: To avoid a massive, error-prone manual refactor of 500+ lines, we will map the existing `charcoal` color palette in `tailwind.config.js` to CSS variables defined in `index.css`.
  - Light Mode (`:root`): Maps `charcoal-900` to `#f8f9fa` (white bg), `charcoal-800` to `#ffffff` (card bg), `charcoal-700` to `#22c55e` (neon green border), and `charcoal-50/100` to `#09090b` (black text).
  - Dark Mode (`.dark`): Maps `charcoal-900` to `#09090b`, `charcoal-800` to `#18181b`, `charcoal-700` to `#27272a` (or neon if glowing), and `charcoal-50` to `#ffffff`.
- **Card Styling (`.card` & global overrides)**: 
  - Add `clip-path` geometric cutouts (bevels) to `.card`, `.btn-primary`, and other key containers.
  - Add neon green `box-shadow` to cards.
  - Add `transition-colors duration-300` to all layout containers.

### 4. Text Color Refactor
- Write a quick Node script to replace instances of `text-white` with `text-charcoal-50` in TSX files where they act as primary text on the app background, so they correctly invert to black in light mode. (Excluding explicitly colored buttons like `bg-emerald-600` which should remain `text-white`).

## Assumptions & Decisions
- A CSS variable mapping approach for the `charcoal` palette is the safest way to implement Light/Dark mode across the entire app without breaking layout logic.
- We will use the Google Font "Oswald" for the athletic broadcast ticker look.
- The geometric cutouts will be achieved using CSS `clip-path: polygon(...)`.

## Verification Steps
1. Toggle the theme switch in the dashboard.
2. Verify smooth transition between dark metallic and crisp white backgrounds.
3. Verify cards have sharp angular corners and neon green borders/glow.
4. Verify text is readable in both modes (black in light mode, white in dark mode).
5. Verify heading typography matches the broadcast ticker style (uppercase, italic, wide).