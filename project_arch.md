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
| checkin | `c_<YYYY-MM-DD>_<name>` | tonight's energy, time, budget, vibes, new-vs-favorite, swipe deck, likes/passes, second-look deck, done |
| rating | `r_<dateId>_<name>` | 5 scores (overall, fun, food, connection, value), do-again, best part, what to change |

## Sync
1. Every change saves to the phone first (works offline).
2. Changes are pushed to Supabase, then everything for the couple is pulled back.
3. If the same record changed on both phones, the newest one wins.
4. Phones re-sync when opened and every 20 seconds while open.

## "Smart" picks (`js/logic.js` → `scoreIdea`)
Ideas get a weight from: in-season boost, bad weather penalty for outdoor ideas, how you rated similar dates, whether you just did it, whether it's new, a favorite, and taking turns between whose favorite it is. The wheel and "Best bet" use this weight.

## Tonight tab (`js/tonight.js`)
1. Each partner checks in privately (one question per screen).
2. A swipe deck of up to 10 ideas that fit both check-ins (lowest energy, time, and budget win). If the partner already swiped, their yeses that fit are added so matches are likely.
3. 5 nos in a row offers "pick for me", "second look", or "change check-in". Zero yeses triggers a second look at up to 4 skipped ideas (partner's yeses first), each with a fresh angle.
4. When both finish: matches (both yes), best fit first. Both chose "something new" → celebration screen first. No match → compromise via the Decide tab.

## Calendar
"Add to Google Calendar" opens Google Calendar's own prefilled event page (title, time, details, partner's email as guest). Nothing is sent until the user taps Save there. Emails live in the private `couple` record.
