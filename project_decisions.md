# Project decisions

Each decision: what we chose, and why. Newest at the bottom.

1. **Phone web app (PWA), not an App Store app.** Works on iPhone and Android from one codebase, installs to the home screen, no review process or fees. Can be wrapped into store apps later if it goes public.
2. **Hosted on GitHub Pages.** Free for public repos. The repo holds only generic code and sample ideas.
3. **Shared data in Supabase (free tier).** Both phones read and write one `items` table. Chosen over Firebase because plain web requests work without an SDK.
4. **Couple code instead of logins.** Each couple gets a random code (like `maple-otter-cocoa-1234`). Database rules only return rows matching the code the phone sends. Simple for two people; swap for real sign-in if this becomes public.
5. **No build step.** Plain HTML/CSS/JS so nothing breaks when tools update.
6. **Weather from Open-Meteo.** Free, no account or key.
7. **Private ratings with a reveal.** Each person rates alone; scores show side by side only after both submit, so neither feels pressured.
8. **Ideas use drive time, not GPS distance.** Avoids needing addresses for every idea in v1.
9. **Personal data stays out of the code.** Real ideas, names, and home location live only in the database, so the code can be public.
10. **Weather location comes from the phone.** No default town in the code; each couple taps "Use my location" once.
11. **Swipe one card at a time for Tonight.** Less decision fatigue than a long list. Chips that changed from the last card are highlighted.
12. **Calendar via Google's prefilled link, not the Calendar API.** Free, no sign-in setup, and the user always taps Save themselves.
