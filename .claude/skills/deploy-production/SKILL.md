---
name: deploy-production
description: Ship the current code to the scoreboard app's live production site (scorekeeper-pro-d49.pages.dev). Use this whenever the user asks to deploy, ship, push live, publish, release, or "update production" for this app, or asks to check/verify a change on the live/deployed site. Also use it if a live-site check fails or looks stale — production here does NOT auto-deploy from git, so a plain `git push` never updates it; this skill is the only way to actually publish a change.
---

# Deploying this app to production

## Why this skill exists

The production site (`https://scorekeeper-pro-d49.pages.dev`, Cloudflare Pages
project `scorekeeper-pro`) has **no Git integration**. Pushing to GitHub
`main` only updates the repo — it does nothing to the live site. The only
way anything goes live is a manual `wrangler pages deploy`.

This isn't a cosmetic detail. On 2026-07-24, six commits sat undeployed for
about three days — including a security fix that moved login off an
insecure direct table query onto a safe RPC. A backend migration tied to
that fix landed on the shared Supabase project, which broke login for every
real user because the *live* frontend was still running the old, now-broken
code path. Nobody caught it until someone tried to log in on their phone
and got locked out. Always treat "committed" and "deployed" as two separate
facts about this app.

## Deploying

Run from the project root (`C:\Users\User\Desktop\scoreboard app\project`):

```bash
npm run build
npx wrangler pages deploy dist --project-name scorekeeper-pro
```

Wrangler is already authenticated on this machine (`ianjohn.j1@gmail.com`,
Pages write scope) — there's no login step. If `wrangler whoami` ever shows
no session, tell the user rather than trying to authenticate yourself.

The deploy command prints two URLs worth noting:
- A versioned URL (e.g. `https://<hash>.scorekeeper-pro-d49.pages.dev`) —
  this specific deployment, always fresh.
- The production alias `https://scorekeeper-pro-d49.pages.dev` — points at
  the latest deployment, but can take a moment to propagate.

## Verifying the deploy actually landed

Don't just trust the "Deployment complete" message — confirm the *new*
build is what's being served, since Cloudflare's edge or a browser tab can
hold onto a stale cached copy of the production alias even when the
deployment itself succeeded:

1. Note the asset filenames Vite just built, e.g. from the build output or
   by checking `dist/assets/*.js` — they're content-hashed
   (`index-XXXXXXXX.js`).
2. Load the site and check which asset hashes it actually served:
   ```js
   Array.from(document.querySelectorAll('script[src], link[rel=stylesheet]'))
     .map(e => e.src || e.href)
   ```
3. If the hashes served don't match the ones you just built, the alias
   domain is showing something stale — navigate to the versioned
   `<hash>.scorekeeper-pro-d49.pages.dev` URL instead to confirm the new
   build is live and reachable. Give the alias a bit longer to catch up
   before assuming something is actually wrong.

If you're verifying a login-related or Supabase-dependent change, checking
the Supabase API logs (`get_logs` with `service: "api"`) can confirm which
build a request actually came from — the old direct `profiles?...pin_hash=eq...`
query pattern versus the current `rpc/rpc_login` call is a reliable tell for
"is the deployed frontend actually current."

## Before deploying

- `git status` — confirm you're deploying what you think you're deploying.
  Wrangler will warn about uncommitted changes but will still deploy the
  working directory as-is, not the last commit.
- If the user only asked you to commit/push, deploying is a separate,
  visible, production-affecting action — confirm with them first unless
  they've already asked for it in this conversation (as they did here).
