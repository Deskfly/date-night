# Project architecture

## Pieces
- **The app** (`index.html`, `styles.css`, `js/`): runs entirely in the phone's browser.
- **Offline + install** (`sw.js`, `manifest.webmanifest`, `icons/`): lets it install to the home screen and open without signal.
- **Database** (Supabase, `supabase/schema.sql`): one table, `items`.
- **Weather** (Open-Meteo API): today's weather plus 14 days back and 10 days ahead.

## Data
Every record in `items` has `couple`, `id`, `kind`, `data` (JSON), `deleted`, `updated_at`.

| kind | id | data |
|---|---|---|
| couple | `couple` | names, home location |
| idea | `s01`… or `i_…` | title, cost range, drive minutes, seasons, energy, whose favorite, tags, fav/tried/hidden |
| date | `d_…` | idea, day, time, notes, status (planned/done), log (start, end, length, spent, weather, season, what happened), who has seen the reveal |
| rating | `r_<dateId>_<name>` | 5 scores (overall, fun, food, connection, value), do-again, best part, what to change |

## Sync
1. Every change saves to the phone first (works offline).
2. Changes are pushed to Supabase, then everything for the couple is pulled back.
3. If the same record changed on both phones, the newest one wins.
4. Phones re-sync when opened and every 20 seconds while open.

## "Smart" picks (`js/logic.js` → `scoreIdea`)
Ideas get a weight from: in-season boost, bad weather penalty for outdoor ideas, how you rated similar dates, whether you just did it, whether it's new, a favorite, and taking turns between whose favorite it is. The wheel and "Best bet" use this weight.
