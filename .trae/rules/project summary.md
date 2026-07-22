We are building a dynamic, real-time sports scoring application utilizing React (TypeScript) for the frontend and Supabase for backend authentication, database storage, and real-time synchronization. The core flow allows users to select a sport, adjust specific house rules, assemble a roster of registered users or quick local guests, and initiate active match tracking.

📊 App Status Breakdown & Core Features

🟢 What is Fully Working & Structurally Sound
- **Authentication & Profile Management**: Robust handling of current users alongside functional routines to fetch global application profiles. Includes frontend security hardening (local storage sanitization of PIN hashes, brute-force delay deterrence, and input constraints). The app now refreshes the canonical `profiles` row during auth initialization and syncs profile edits straight back into local auth state so updated display names and uploaded avatars appear without requiring logout/login.
- **Dynamic Multi-Step Setup UI**: The `NewMatchPage` safely segregates match creation into sequential screens (sport -> variant -> config -> players).
- **Theme & UI System**: "Prime Time Neon" theme is fully implemented. It features Light/Dark modes toggled via a global React Context, an athletic font (`Oswald`), angular geometric component cutouts using CSS `clip-path`, and highly visible neon green accents.
- **Diverse Game Engines**:
  - **Darts**: Includes interactive SVG dartboard with two-tap multiplier flow. Supports 3 sub-games: 501/301 Countdown, Around the World, and Killer. Includes complex post-match advanced analytics (PPR, Checkout %, Lethality).
  - **Cricket (Classic)**: Team-based T20-style tracking.
  - **Cricket (Backyard)**: Infinite individual mode where players establish a batting order that automatically loops. The bowling/fielding team dynamically updates to exclude the active batters.
  - **Golf / Chip Off / PvP**: Tracks standard strokes, specialized Chip-Off rounds, and the new PvP (Putt vs Putt) team variant with lineup order, shared-pool event logging, and tie-break support.
- **Responsive Layouts**: Match rooms use `h-[100dvh]` with absolute positioned, fully transparent scoring trays floating above heavily padded scrollable content, ensuring perfect mobile and desktop viewport behaviors.
- **End-of-Match Flows**: Games cleanly transition to a completed state, freezing inputs and presenting a Match Summary banner with options for "Rematch" or returning to the "Dashboard".
- **Live Spectator / Broadcast Mode**: All sports feature dedicated spectator routing that strips interactive inputs and replaces them with live, real-time advanced analytical dashboards (like TV broadcasts) perfectly scaled for HDMI displays.
- **Player Identity / Avatars**: The shared `UserAvatar` system is now standardized across Dashboard, Profile, Leaderboard, Match Rooms, and Spectator Views so any surface rendering a real player profile consistently shows the uploaded photo with initials fallback behavior.
- **Global Leaderboards**: Aggregates metrics to show Global MVPs alongside dedicated sport-specific tabs. Features responsive mobile wrap layouts, custom player profile pictures, and personalized catchphrases. Safely unifies variant stats (e.g., merging Classic Golf and Chip Off best scores and Hole-In-Ones).
- **Shared Rules Reference**: Match setup now uses a shared `ruleDefinitions.ts` dictionary and `InfoTooltip` helper for inline house-rule explanations, while Match Room and Spectator headers expose a shared `HouseRulesPanel` reference overlay.
- **Shared Stat Definitions**: A shared `statDefinitions.ts` source now exists for tooltip-driven stat copy and includes the new PvP analytics terminology.
- **Delete Flow Reliability**: Shared match deletion has been hardened so `deleteMatch()` now clears dependent tables in a deterministic, checked order, and the Dashboard removes deleted rows from local state before refreshing. This fixed the completed PvP dashboard delete crash without changing the broader delete UX.
- **Season Points System**: A centralized scoring logic (`SEASON_POINT_RULES`) that rewards match placements and sport-specific milestones (e.g., 50+ runs, Hole-In-Ones), fully visible to users via an in-app explainer modal.
- **Infrastructure & Deployment**: Fully deployed to Cloudflare Pages. Supabase backend and WebSockets successfully stress-tested in the field with 10 concurrent active users running real-time multi-room matches. The latest verified backup/deploy shipped on GitHub commit `8ad2af2` and Cloudflare deployment `d6e2722c.scorekeeper-pro-d49.pages.dev`.

🛡️ Security & Reliability Notes
- **Security Audit Complete**: RLS is hardened around `get_current_session_profile_id()`, rate limiting is enforced server-side on match events, profile text fields have DB-level XSS constraints, storage uploads are path-validated and size-limited, and spectator/guest IDs now use secure UUID-based generation for initial match creation.
- **Known Remaining Security Gap**: Rematch flows in `CricketRoom.tsx`, `DartsRoom.tsx`, and `ChipOffRoom.tsx` still use short `Math.random()` room codes and remain separate hardening work.
- **Header Injection Lesson**: The custom Supabase `fetch` wrapper must preserve built-in SDK headers when appending `x-session-id`; replacing headers outright caused the dashboard-wide `No API key found in request` failure and should not be repeated.
- **Delete Reliability Lesson**: Match deletion should not rely on unchecked parallel child-table cleanup. Completed PvP delete stability improved only after `deleteMatch()` was made deterministic and the Dashboard stopped depending on a post-delete refresh alone.
