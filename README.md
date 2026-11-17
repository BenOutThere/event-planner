# OTG Event Planner

Plans OTG events from first summary to full delivery plan, with per-event access, Staff-only and
Managers-only areas, documents and links, change history, and operations plans you can search and ask.

- Runs on Vercel at `events.outthereadmin.com.au`.
- Uses the shared **OTG Shared** Supabase project (schema `eventplanner`) and the OTG Control Centre login.
- Setup steps: [SETUP.md](SETUP.md). Rules for changing the code: [AGENTS.md](AGENTS.md).
- The original Lovable brief is kept in [docs/original-brief.md](docs/original-brief.md).

```
npm install
npm run dev     # local app (needs a .env copied from .env.example)
npm test        # unit tests
python3 supabase/tests/permissions_test.py   # database permission matrix (needs a local Postgres)
```
