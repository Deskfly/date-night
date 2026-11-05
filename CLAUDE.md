# CLAUDE.md — rules for working on Date Night

## What this is
A phone web app (PWA) for a couple to pick, plan, and rate date nights together.
It installs to the home screen from the browser on iPhone and Android. No App Store. No build step.

## Rules
- This repo is public. Never commit personal info: real names, home town, addresses, real date
  history, or the couple's own idea list. That data lives only in the database.
- Never commit to a dirty `main`. Every change goes on a `feat/*` or `fix/*` branch, gets tested, then merges into `main`.
  No pull requests on this public repo (their required attribution would show the owner's name); merge locally.
- Memory files: `CLAUDE.md` (rules), `project_state.md` (current state), `project_decisions.md` (choices + why),
  `project_arch.md` (how it fits together), `todo.md` (next tasks). Never create `PROJECT_LOG.md`.
- Talk to the owner in plain English, no jargon, and end each message with one clear next step.
  Handle Git quietly; to them it's the automatic save/undo checkpoint.
- The database must stay on Supabase's free plan. Anything that could cost money needs the owner's
  explicit OK, asked twice in plain English.
- Keep it plain HTML/CSS/JS (ES modules). No frameworks, no bundler, so GitHub Pages serves it as-is.
- The app never sends calendar invites or messages to anyone.
- When changing app files, bump `VERSION` in `sw.js` so phones pick up the update.

## Layout
- `index.html`, `styles.css` — app shell and styles
- `js/app.js` — screens and UI logic
- `js/store.js` — data layer (phone cache + Supabase sync)
- `js/logic.js` — filters, scoring, weather, reveal math
- `js/seed.js` — generic sample ideas
- `js/config.js` — Supabase URL and publishable key
- `supabase/schema.sql` — one-time database setup
- `sw.js`, `manifest.webmanifest`, `icons/` — install + offline support
