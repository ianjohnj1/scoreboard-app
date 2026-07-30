# TODO

Tracks known gaps, unresolved tech debt, and planned features for this app.
`CLAUDE.md` documents what's already true of the code; this file is where
forward-looking intent lives instead — update it directly as scope changes,
rather than letting it accumulate in CLAUDE.md.

## Known gaps

- **Match deletion is admin-only, even for the creator.** Currently by
  design (see `deleteMatch()` in `src/lib/matches.ts`), but worth revisiting
  — a creator may reasonably expect to delete their own not-yet-played match.
- **No automated test suite.** No test runner is installed; verification is
  `npm run typecheck` + `npm run lint` + manual browser QA. Fine for now, but
  means regressions in event-sourced score logic (the sport rooms rehydrating
  from `match_events`) rely entirely on manual testing.
- **Sport/variant dispatch tables can drift silently.** Adding a sport or
  variant touches four places (`getSportRoom()` in `MatchRoomPage.tsx`; the
  `sportRooms` map *and* golf-variant branch in `SpectatorPage.tsx`;
  `getSportIcon()`/`getSportLabel()` in `lib/matches.ts`; `NewMatchPage.tsx`).
  Missing one doesn't error — spectator view just silently falls back to
  `CustomRoom`. No lint rule or test currently catches this.

## Tech debt

_None open right now — add here as it's found._

## Bug fixes

_None open right now — add here when a bug is confirmed but not yet fixed._

## Future features

_None planned yet — add here as ideas come up._
