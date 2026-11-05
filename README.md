# Date Night 💕

A phone app for picking, planning, and rating date nights together. It runs in the browser and installs to the home screen on iPhone and Android. No App Store needed.

## What it does
- **Ideas:** a shared idea list with filters (drive time, budget, energy, food/activity type, "not tonight" exclusions, in season, weather) and a "best bet for tonight."
- **Spin:** a wheel of matching ideas; better fits for tonight come up more often.
- **Decide:** put two ideas head to head and let the app pick.
- **Our dates:** plan a date, log how it went (length, weather, season, spend, what happened), rate it privately, then reveal both ratings side by side with a follow-up for next time.

## Setup (one time)
1. Create a Supabase project, open **SQL Editor**, paste `supabase/schema.sql`, and click **Run**.
2. Put the project URL and anon/publishable key in `js/config.js`.
3. In GitHub: **Settings → Pages → Deploy from branch → main / (root)**.
4. Open the Pages link on each phone and add it to the home screen.

Without step 1–2 the app still works, but data stays on one phone.
