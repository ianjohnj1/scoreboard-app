# Plan: App-Wide Newcomer Summary

## Summary
Create a newcomer-friendly app-wide summary that explains what the product is, who it is for, how a typical session works, what sports and modes are supported, and what makes the experience distinct. The summary should be written in plain language for someone seeing the app for the first time, while still staying faithful to the current implementation.

## Current State Analysis
- The app already has a strong product shape in the live codebase, but its description is spread across routes, sport rooms, setup flows, and analytics pages rather than being expressed as a single onboarding narrative.
- The app shell in `src/App.tsx` shows the primary product structure: login, dashboard, new match setup, live match rooms, spectator mode, history, leaderboards, and profiles.
- The match creation experience in `src/pages/NewMatchPage.tsx` proves the app is not a single-scoreboard tool. It supports multiple sports, variants, house rules, guest players, and both team and individual setups.
- The runtime match shell in `src/pages/MatchRoomPage.tsx` shows that the core experience is live match management with real-time updates, room sharing, roster controls, and TV display support.
- The public broadcast flow in `src/pages/SpectatorPage.tsx` confirms the app supports spectator-only viewing, making it useful beyond just the people entering scores.
- The dashboard, profile, leaderboard, and stats layers in `src/pages/Dashboard.tsx`, `src/pages/LeaderboardPage.tsx`, and `src/lib/stats.ts` show that the product also acts as a social and analytical sports hub, not just a transient scoring screen.

## Proposed Changes

### Deliverable Scope
- Produce a layered summary with four outputs so the same source material can serve different contexts:
  - A one-sentence elevator pitch.
  - A short paragraph summary for a first-time user.
  - A feature overview grouped by user journey.
  - A concise technical/product positioning summary for internal documentation.

### Summary Structure
- Explain the app in this order:
  - What the app is.
  - Who uses it.
  - How a normal session works from login to match completion.
  - Which sports and variants are supported today.
  - What makes the experience feel unique compared with a basic scoreboard.
  - How stats, leaderboards, and spectator mode extend the product beyond match entry.

### Source Files To Ground The Summary
- `src/App.tsx`
  - Use to describe the top-level app shape and main destinations.
- `src/pages/Dashboard.tsx`
  - Use to describe the home experience, live activity, active matches, and “start match” workflow.
- `src/pages/NewMatchPage.tsx`
  - Use to describe sport selection, variants, house rules, teams, individuals, and guest support.
- `src/pages/MatchRoomPage.tsx`
  - Use to describe live scoring, room controls, sharing, and TV display mode.
- `src/pages/SpectatorPage.tsx`
  - Use to describe broadcast viewing and read-only live match following.
- `src/pages/LeaderboardPage.tsx`
  - Use to describe Season Points, rankings, and player identity/personalisation.
- `src/lib/stats.ts`
  - Use to describe how persistent stats and milestone-based Season Points extend long-term engagement.

### Content Decisions
- Frame the app primarily as a real-time social sports scoring platform rather than a generic score tracker.
- Mention the currently strongest sports experiences explicitly:
  - Cricket Classic and Backyard.
  - Golf and Chip Off.
  - Darts with Countdown, Around the World, and Killer.
- Mention that other supported score rooms also exist:
  - Table Tennis, Pool, Basketball, Cards, and Custom Sport.
- Highlight the product differentiators that are visible in the code today:
  - Real-time multi-room match tracking.
  - Spectator / broadcast mode.
  - Persistent player profiles with avatars and catchphrases.
  - History, leaderboards, and Season Points.
  - House-rule flexibility and guest-player support.

### Recommended Final Writing Shape
- Prepare the final summary in a reusable format with these sections:
  - `What It Is`
  - `Who It’s For`
  - `How It Works`
  - `Sports & Modes`
  - `Why It Feels Different`
  - `Why Players Keep Coming Back`
- Keep the tone plain-English and product-facing, not deeply technical.
- Avoid implementation jargon like “React route tree” or “Supabase channel” in the main newcomer summary, but preserve technical accuracy in the internal summary version.

## Assumptions & Decisions
- The audience is a general newcomer to the app, not a developer reading source code for the first time.
- The summary should describe the app as it behaves today, not as a future roadmap.
- The summary should balance product clarity with feature richness, so it should not list every edge case or configuration option.
- The preferred framing is “live sports experience and social competition platform” rather than “database-backed scoring utility.”
- The existing project summary and recent feature set are sufficient to write the final summary without additional product clarification.

## Verification Steps
- Verify the final summary mentions all major destinations represented in `src/App.tsx`: dashboard, match setup, live rooms, spectator mode, history, leaderboard, and profile.
- Verify the final summary reflects the supported sports and variants visible in `src/pages/NewMatchPage.tsx`.
- Verify the final summary includes persistent stats/leaderboards and Season Points based on `src/pages/LeaderboardPage.tsx` and `src/lib/stats.ts`.
- Verify the wording is understandable to a non-technical reader and could be reused in onboarding, docs, or pitch-style copy without rewriting core claims.
