# Plan: Create "Chip Off" Golf Mini Game

This plan introduces a new golf variant called "Chip Off" with specific scoring logic, turn rotation, and backyard-friendly UI.

## Summary
- **Access**: After selecting "Golf" on the sports page, users choose between "Classic" and "Chip Off".
- **Classic**: Current hole-by-hole par tracking.
- **Chip Off**: Point-based game (10, 5, 2, 0/-1) with fixed balls per turn and round-by-round winners.

## Proposed Changes

### 1. Update Match Creation Flow
- **[NewMatchPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/NewMatchPage.tsx)**
    - Add `golf_variant` to `Step` type.
    - Add `golfVariant` state (`'classic' | 'chip_off' | null`).
    - Update `SPORTS` list or selection logic to move to `golf_variant` step when Golf is selected.
    - Implement the variant selection UI (Classic vs. Chip Off).
    - Add configuration for Chip Off:
        - `ballsPerTurn` (Default: 3).
        - `totalRounds` (Default: 9).
        - `hazardPenalty` (Toggle).
    - Update `handleCreateMatch` to store `variant: 'chip_off'` and these parameters in `match_rooms.house_rules`.

### 2. Update Match Room Switching
- **[MatchRoomPage.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/pages/MatchRoomPage.tsx)**
    - Update `getSportRoom` to check `match.house_rules.variant`.
    - If `sport === 'golf'` and `variant === 'chip_off'`, return `ChipOffRoom`.

### 3. Create Chip Off Scoring Engine
- **[ChipOffRoom.tsx](file:///c:/Users/User/Desktop/scoreboard%20app/project/src/components/sports/ChipOffRoom.tsx)**
    - **State Management**:
        - Track current round (1 to Total Rounds).
        - Track current player index.
        - Track balls hit in the current turn (e.g., `0/3`).
        - Local state for the current round's scores.
    - **Database Interaction**:
        - Use `recordEvent` for every ball scored (e.g., `type: 'chip_off_score'`).
        - Use `golf_holes` table to represent "Rounds" for compatibility with history views if needed, or just rely on events. (Recommendation: Use events for flexibility).
    - **UI Components**:
        - **Header**: Show "Round X of Y" and "Player A's Turn".
        - **Visual Progress**: Display ball icons (⚪ ⚪ ⚪) representing remaining shots.
        - **Scoring Pad**: Large buttons for [10], [5], [2], [0] (or [-1] if hazard penalty is on).
        - **Leaderboard**: Real-time points tally and "10-pointer" count for tie-breakers.
        - **Round Winner Overlay**: Prominent screen shown after all players finish a round: *"Round Complete! [Player Name] wins the round. Move the Tee Box and Pin, then tap Next Round!"*
    - **Game End**:
        - Aggregate total points.
        - Implement tie-breaker: most 10-pointers wins.

## Assumptions & Decisions
- **Data Storage**: Individual ball scores will be stored as `match_events`. This avoids schema changes and supports the "Undo" feature out of the box.
- **Initialization**: Like `GolfRoom`, `ChipOffRoom` will initialize rounds (as `golf_holes`) if they don't exist, to ensure the match is structured.

## Verification Steps
1. **Creation**: Start a new match, select Golf, then select "Chip Off". Configure 3 balls and 9 rounds.
2. **Gameplay**: 
    - Verify Player 1 hits all 3 balls and the UI updates ball icons.
    - Verify scoring [10], [5], [2], [0] correctly updates the leaderboard.
    - Verify turn rotates to Player 2 after 3 balls.
3. **Round End**: After all players finish Round 1, verify the winner announcement appears.
4. **Tie-Breaker**: Create a tie in total points and verify the player with more 10-pointers is ranked higher.
5. **Undo**: Tap "Undo" and verify the last ball score is removed and the turn state reverts.
