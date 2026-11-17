# Setting up Event Planner on your own accounts

Event Planner now runs on accounts **you** own instead of inside Lovable, and it shares the
**OTG Control Centre's login**, the same way Asset Manager does. Staff sign in once at the Control
Centre, then open Event Planner from its tile. There is no separate sign-in page any more.

What changed behind the scenes:

- Event Planner uses the same Supabase project as the Control Centre (**OTG Shared**). Its tables sit
  in their own `eventplanner` section, and its files in two private folders
  (`eventplanner-files` and `eventplanner-ops-plans`), so they never clash with the other apps.
- Who can open Event Planner is decided by the **Event Planner tile** in the Control Centre (Admin
  dashboard → tick Event Planner for each person). People added from Event Planner's own Admin page
  get it ticked automatically. Inside Event Planner, its admins still choose each person's role
  (Admin, Lead, Member, Supplier, Viewer) and each event's view / edit / manage access, exactly as before.
- Invites and password emails come from the Control Centre. Event Planner sends no emails of its own.
- "Ask" answers on operations plans now use Claude, with the same section and page citations.
- It's hosted on **Vercel** instead of Lovable.

You already have every account you need from the Control Centre move.

---

## 1. Supabase: add Event Planner's database

1. Open your **OTG Shared** project in Supabase, then **SQL Editor → New query**.
2. Open `supabase/migrations/20261119000000_event_planner.sql` on GitHub, click the **copy** icon
   (top right of the file), paste it in, and click **Run**. You should see
   "Success. No rows returned".
3. Go to **Project Settings → Data API**. Under **Exposed schemas**, add `eventplanner` next to the
   ones already there (for example `public` and `assetmanager`), then click **Save**. Without this,
   Event Planner can't read its own tables.

## 2. Vercel: the website

1. In Vercel (**OTG team**), click **Add New → Project** and choose the `event-planner` repository.
   Do this **once**.
2. Leave the build settings as they are. Under **Environment Variables**, add each line from
   `.env.example`:
   - The four `SUPABASE` values are **the same as the Control Centre's** (Supabase → Project Settings → API).
   - `SUPABASE_SERVICE_ROLE_KEY`: the same secret key as the Control Centre's.
   - `ANTHROPIC_API_KEY`: the same Claude key as the Control Centre's.
   - Leave `ASK_MODEL` and `VITE_CONTROL_CENTRE_URL` out.
   - Tip: click into a box and clear it before pasting, so a value never ends up pasted twice.
3. Click **Deploy**.

## 3. A test address

The shared login only works on `outthereadmin.com.au` addresses, so test on a temporary one
before switching the real Event Planner over.

1. Vercel → your event-planner project → **Settings → Domains** → add
   `events-new.outthereadmin.com.au`.
2. In GoDaddy's DNS for `outthereadmin.com.au`, add the record Vercel shows you
   (usually a **CNAME** named `events-new`). Leave the existing `events` record alone.
3. Supabase → **Authentication → URL Configuration → Redirect URLs**: add
   `https://events-new.outthereadmin.com.au/**` and `https://events.outthereadmin.com.au/**`.
4. In the Control Centre, **Admin → Apps → Event Planner**: set its link to
   `https://events-new.outthereadmin.com.au` for now.
5. Open Event Planner from its tile. As a Control Centre admin you become its first admin automatically.

## 4. Bring the old records across

The old app gets a new **Move export** page from a small change on GitHub (a pull request on the
`outthere-orchestrator` repository). Merge it first, then in Lovable click **Publish → Update** so
the page goes live.

1. In the **old** Event Planner (Lovable), open `events.outthereadmin.com.au/admin/move-export`
   and click **Download export file**. It contains every table and every stored file. Keep this
   file private, and delete it once the move is finished.
2. In the **new** Event Planner, open `events-new.outthereadmin.com.au/admin/move-import`,
   choose that file, and click **Check people**. It shows how each person will be matched to an
   OTG login by email. Leave **Send invites** unticked unless you want emails to go out now.
3. Click **Start import**. It uploads the files, copies every record with its original id, and then
   shows a **reconciliation table**: for each event and each table, the count in the export next to
   the count now stored. Every row should show a tick.
4. Open **Admin** and check each person's role.

## 5. Switch over (only after you sign off)

1. Vercel → **Settings → Domains** → add `events.outthereadmin.com.au`. In GoDaddy, change the
   existing `events` record to what Vercel shows. This replaces the Lovable version.
2. Run the export (from the old app's `.lovable.app` link) and import once more, so anything entered
   since the first import comes across. Running it twice never makes duplicates.
3. In the Control Centre, change the Event Planner tile's link back to
   `https://events.outthereadmin.com.au`.
4. The old Lovable app is set to read-only with a banner and kept for 30 days.
5. After a week or so of everything working, you can remove the `events-new` address.

## How it fits together

- Opening Event Planner when you're not signed in sends you to the Control Centre's sign-in page,
  which brings you back afterwards. Forgotten passwords are reset there too.
- Signing out of Event Planner signs you out of every OTG app.
- Event Planner's **Admin → Add a person** still adds people. New people get the Control Centre
  invite email with Event Planner already ticked; people who already have an OTG login just get it added.
- Removing someone in Event Planner only affects Event Planner. Their OTG login, other apps and the
  history they recorded are untouched. To block someone from everything, deactivate them in the
  Control Centre.
