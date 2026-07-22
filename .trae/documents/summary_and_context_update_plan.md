# Plan: Summarise Recent Avatar Rollout And Update Project Context

## Summary
Create one documentation/context update pass that records the recently completed avatar rollout, the latest GitHub backup and Cloudflare deployment, and the engineering rules that should prevent the same avatar/data-flow mistakes from recurring in future sessions.

This plan covers both in-repo rules and external project memory/context:
- update the repo rule summary so the app status reflects the latest shipped behavior
- update project memory so future runs inherit the avatar conventions and deployment lessons
- avoid touching unrelated rules unless they directly help prevent a known mistake

## Current State Analysis
- The repo currently has two rule files in `c:\Users\User\Desktop\scoreboard app\project\.trae\rules`:
  - `project summary.md`
  - `test login.md`
- `project summary.md` already records the broad product state, spectator mode, season points, and the 10-user field test, but it does not yet mention:
  - the full shared avatar rollout across match rooms and spectator views
  - the auth/profile-sync hardening that fixed stale dashboard avatars
  - the latest backup/deploy outcome tied to commit `8ad2af2`
- Project memory at `c:\Users\User\.trae\memory\projects\-c-Users-User-Desktop-scoreboard-app-project\project_memory.md` already includes strong avatar conventions:
  - use `UserAvatar.tsx` for profile-driven surfaces
  - if a real `Profile` is shown, use `UserAvatar`
  - raw `Avatar` is only for primitive/non-profile displays
- Project memory already captures the mobile profile-header fix and an avatar standardization lesson, but it does not yet explicitly record:
  - the dashboard data-flow causes of stale avatar rendering
  - the requirement to refresh canonical profile data after auth init and profile edits
  - the Cloudflare Pages project naming lesson (`scorekeeper-pro` vs the `scorekeeper-pro-d49.pages.dev` domain)
- `test login.md` is unrelated to the recent avatar/deploy mistakes and should remain unchanged unless execution uncovers a direct need.
- The latest recent-topic memory ends at the start of the consolidated avatar rollout and does not summarize the completed verification, backup, and deployment.
- The latest observed repo/deploy state from exploration:
  - latest commit: `8ad2af2 feat: consolidate avatar rollout`
  - latest deployment URL: `https://d6e2722c.scorekeeper-pro-d49.pages.dev`
  - project domain: `https://scorekeeper-pro-d49.pages.dev`
  - Cloudflare Pages project name: `scorekeeper-pro`
- There are unrelated local modifications still present in `src/components/Avatar.tsx` and `src/pages/LeaderboardPage.tsx`, so the documentation update pass should not describe those files as part of the recent shipped avatar rollout unless explicitly verified later.

## Proposed Changes

### 1. Update the repo-level app summary

#### File
`c:\Users\User\Desktop\scoreboard app\project\.trae\rules\project summary.md`

#### What to change
- Add a concise status note that the shared avatar system is now standardized across:
  - dashboard header and live activity
  - profile and leaderboard identity surfaces
  - match room/player roster surfaces
  - spectator headers and sport-specific broadcast views
- Add a note that auth/profile management now refreshes the canonical `profiles` row and synchronizes profile edits back into local auth state, so uploaded photos appear without requiring logout/login.
- Add the latest infrastructure/deployment status:
  - GitHub backup on commit `8ad2af2`
  - Cloudflare Pages deployment on `d6e2722c.scorekeeper-pro-d49.pages.dev`
- Keep the summary high level and user-facing; do not turn it into a changelog.

#### Why
- This rule file is the repo’s top-level product snapshot and should reflect the current shipped identity/avatar behavior.
- Future sessions rely on this file for quick orientation, so leaving out the avatar rollout risks re-opening already solved issues.

#### How
- Extend the existing bullets instead of creating a separate “recent updates” section unless spacing/readability clearly benefits.
- Fold avatar behavior into the existing Authentication/Profile Management and Theme/UI or add one new bullet for Player Identity/Avatars if that reads more cleanly.
- Preserve the current tone and feature-oriented structure already used in the file.

### 2. Update persistent project memory with anti-regression rules

#### File
`c:\Users\User\.trae\memory\projects\-c-Users-User-Desktop-scoreboard-app-project\project_memory.md`

#### What to change
- Expand the avatar engineering conventions to explicitly capture the data-flow rule:
  - when profile-facing fields change, sync the updated profile back into auth/local cache immediately
  - on auth initialization, prefer refreshing the canonical profile row over trusting stale local storage alone
- Add a lessons-learned note that dashboard avatar bugs were caused by missing `avatar_url` in joined queries and stale cached auth state, not by the base avatar renderer itself.
- Add a deployment/infrastructure lesson:
  - when deploying to Cloudflare Pages via Wrangler, use the Pages project name `scorekeeper-pro`, not the public subdomain `scorekeeper-pro-d49.pages.dev`
- Record the latest verified shipped state:
  - avatar rollout completed across dashboard, match rooms, and spectator surfaces
  - production build passed before backup/deploy

#### Why
- These are project-level conventions and lessons, so `project_memory.md` is the correct long-lived place to keep them.
- The goal is to prevent future mistakes where an agent fixes rendering but misses the actual data source or deploy target naming.

#### How
- Update existing `Engineering Conventions` and `Lessons Learned` sections rather than creating redundant headings.
- Keep rules actionable and phrased as defaults/facts the next executor can apply directly.

### 3. Add a fresh recent-topic memory summary for continuity

#### File
`c:\Users\User\.trae\memory\projects\-c-Users-User-Desktop-scoreboard-app-project\20260720\topics.md`

#### What to change
- Append a new topic entry summarizing that the consolidated avatar rollout was completed, verified, backed up to GitHub, and deployed to Cloudflare.
- Mention the key delivered outcomes:
  - `UserAvatar` standardized across profile-driven room/spectator surfaces
  - dashboard avatar data flow fixed through canonical profile refresh + profile sync
  - successful build verification
  - GitHub commit `8ad2af2`
  - Cloudflare deployment URL `https://d6e2722c.scorekeeper-pro-d49.pages.dev`

#### Why
- `topics.md` is the quickest high-level continuity layer for future sessions.
- The current topic history only records the rollout plan starting point, not its completed execution.

#### How
- Append a single new dated/session-style summary entry matching the existing file format.
- Keep it concise and outcome-oriented.

### 4. Leave unrelated rules untouched

#### File
`c:\Users\User\Desktop\scoreboard app\project\.trae\rules\test login.md`

#### Decision
- Do not modify this file during execution unless a newly discovered contradiction appears.

#### Why
- The recent mistakes were about avatar data flow, shared UI conventions, and Cloudflare deployment naming, not login credentials or login test procedure.

## Assumptions & Decisions
- “Update context” means both repo rules and project memory/context, based on user confirmation.
- The correct sources of truth for this task are:
  - repo summary/rules for product status
  - `project_memory.md` for durable engineering conventions
  - `topics.md` for session continuity
- The plan should document only the verified shipped avatar rollout and deploy state already observed during exploration.
- Unrelated local changes in `src/components/Avatar.tsx` and `src/pages/LeaderboardPage.tsx` remain out of scope for the summary/context update.
- `test login.md` stays unchanged unless execution finds a direct rule gap tied to the recent mistakes.

## Verification Steps
- Re-read updated `project summary.md` and confirm it mentions:
  - standardized avatar rollout
  - canonical profile sync behavior
  - latest backup/deploy status
- Re-read updated `project_memory.md` and confirm it includes:
  - `UserAvatar` rule for all profile-driven surfaces
  - canonical profile refresh/sync rule
  - Cloudflare Pages project naming lesson
- Re-read updated `topics.md` and confirm it adds a completed-session summary for the avatar rollout, build verification, backup, and deployment.
- Confirm no unrelated rule file was modified, especially `test login.md`.
