We are building a dynamic, real-time sports scoring application utilizing React (TypeScript) for the frontend and Supabase for backend authentication, database storage, and real-time synchronization. The core flow allows users to select a sport, adjust specific house rules, assemble a roster of registered users or quick local guests, and initiate active match tracking.

📊 App Status Breakdown & Core Features

🟢 What is Fully Working & Structurally Sound
- Authentication & Profile Management: Robust handling of current users alongside functional routines to fetch global application profiles.
- Dynamic Multi-Step Setup UI: The `NewMatchPage` safely segregates match creation into sequential screens (sport -> variant -> config -> players).
- Theme & UI System: "Prime Time Neon" theme is fully implemented. It features Light/Dark modes toggled via a global React Context, an athletic font (`Oswald`), angular geometric component cutouts using CSS `clip-path`, and highly visible neon green accents.
- Diverse Game Engines:
  - Darts: Includes interactive SVG dartboard with two-tap multiplier flow. Supports 3 sub-games: 501/301 Countdown, Around the World, and Killer. Includes complex post-match advanced analytics (PPR, Checkout %, Lethality).
  - Cricket (Classic): Team-based T20-style tracking.
  - Cricket (Backyard): Infinite individual mode where players establish a batting order that automatically loops. The bowling/fielding team dynamically updates to exclude the active batters.
  - Golf / Chip Off: Tracks standard strokes and specialized Chip-Off variants with par logic.
- Responsive Layouts: Match rooms use `h-[100dvh]` with absolute positioned, fully transparent scoring trays floating above heavily padded scrollable content, ensuring perfect mobile and desktop viewport behaviors.
- End-of-Match Flows: Games cleanly transition to a completed state, freezing inputs and presenting a Match Summary banner with options for "Rematch" or returning to the "Dashboard".
- Global Leaderboards: Aggregates metrics to show Global MVPs (displaying their Best Sport) alongside dedicated sport-specific tabs.