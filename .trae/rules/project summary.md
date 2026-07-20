We are building a dynamic, real-time sports scoring application utilizing React (TypeScript) for the frontend and Supabase for backend authentication, database storage, and real-time synchronization. The core flow allows users to select a sport, adjust specific house rules, assemble a roster of registered users or quick local guests, and initiate active match tracking.

📊 App Status Breakdown & Core Features

🟢 What is Fully Working & Structurally Sound
- **Authentication & Profile Management**: Robust handling of current users alongside functional routines to fetch global application profiles. Includes frontend security hardening (local storage sanitization of PIN hashes, brute-force delay deterrence, and input constraints).
- **Dynamic Multi-Step Setup UI**: The `NewMatchPage` safely segregates match creation into sequential screens (sport -> variant -> config -> players).
- **Theme & UI System**: "Prime Time Neon" theme is fully implemented. It features Light/Dark modes toggled via a global React Context, an athletic font (`Oswald`), angular geometric component cutouts using CSS `clip-path`, and highly visible neon green accents.
- **Diverse Game Engines**:
  - **Darts**: Includes interactive SVG dartboard with two-tap multiplier flow. Supports 3 sub-games: 501/301 Countdown, Around the World, and Killer. Includes complex post-match advanced analytics (PPR, Checkout %, Lethality).
  - **Cricket (Classic)**: Team-based T20-style tracking.
  - **Cricket (Backyard)**: Infinite individual mode where players establish a batting order that automatically loops. The bowling/fielding team dynamically updates to exclude the active batters.
  - **Golf / Chip Off**: Tracks standard strokes and specialized Chip-Off variants with par logic.
- **Responsive Layouts**: Match rooms use `h-[100dvh]` with absolute positioned, fully transparent scoring trays floating above heavily padded scrollable content, ensuring perfect mobile and desktop viewport behaviors.
- **End-of-Match Flows**: Games cleanly transition to a completed state, freezing inputs and presenting a Match Summary banner with options for "Rematch" or returning to the "Dashboard".
- **Live Spectator / Broadcast Mode**: All sports feature dedicated spectator routing that strips interactive inputs and replaces them with live, real-time advanced analytical dashboards (like TV broadcasts) perfectly scaled for HDMI displays.
- **Global Leaderboards**: Aggregates metrics to show Global MVPs alongside dedicated sport-specific tabs. Features responsive mobile wrap layouts, custom player profile pictures, and personalized catchphrases. Safely unifies variant stats (e.g., merging Classic Golf and Chip Off best scores and Hole-In-Ones).
- **Season Points System**: A centralized scoring logic (`SEASON_POINT_RULES`) that rewards match placements and sport-specific milestones (e.g., 50+ runs, Hole-In-Ones), fully visible to users via an in-app explainer modal.
- **Infrastructure & Deployment**: Fully deployed to Cloudflare Pages. Supabase backend and WebSockets successfully stress-tested in the field with 10 concurrent active users running real-time multi-room matches.