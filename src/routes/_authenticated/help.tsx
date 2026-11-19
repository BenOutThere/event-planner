import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Home, Search, BookOpen, FolderOpen, Clock, Users, Layers, Pencil, Save, Table as TableIcon, LayoutTemplate,
  HelpCircle, LifeBuoy, Rocket, Download, ArrowRight, ListTodo, Lock, ClipboardList, Archive,
} from "lucide-react";
import { ACCESS_INFO, GLOBAL_ROLE_INFO } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/help")({
  head: () => ({
    meta: [
      { title: "User guide — OTG Event Planner" },
      { name: "description", content: "How to find, read and update event information in the Out There Event Planner, with a downloadable PDF guide." },
      { property: "og:title", content: "User guide — OTG Event Planner" },
      { property: "og:description", content: "How to find, read and update event information in the Out There Event Planner, with a downloadable PDF guide." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HelpPage,
});

const sections = [
  { id: "start", label: "Getting started", icon: Rocket },
  { id: "home", label: "Event Home", icon: Home },
  { id: "search", label: "Search", icon: Search },
  { id: "reading", label: "Reading and editing", icon: BookOpen },
  { id: "docs", label: "Documents & links", icon: FolderOpen },
  { id: "ops", label: "Operations plans", icon: ClipboardList },
  { id: "currency", label: "Ownership & reviews", icon: Clock },
  { id: "status", label: "Event status & archiving", icon: Archive },
  { id: "attention", label: "To do and readiness", icon: ListTodo },
  { id: "tables", label: "Tables", icon: TableIcon },
  { id: "saving", label: "How saving works", icon: Save },
  { id: "customise", label: "Adding fields to an event", icon: Pencil },
  { id: "access", label: "Who can see and edit", icon: Users },
  { id: "restrict", label: "Restricted areas", icon: Lock },
  { id: "template", label: "Template builder (admins)", icon: LayoutTemplate },
  { id: "where", label: "Where things are now", icon: Layers },
  { id: "faq", label: "Tips & FAQ", icon: HelpCircle },
  { id: "support", label: "Getting support", icon: LifeBuoy },
];

function HelpPage() {
  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <header className="rounded-xl border bg-card p-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">User guide</p>
          <h1 className="font-display font-semibold text-2xl sm:text-3xl mt-1">Out There Event Planner</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            One place for every event's key information — captured once, kept current, and easy for every department and authorised stakeholder to find.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <a href="/out-there-user-guide.pdf" download="Out-There-Event-Planner-User-Guide.pdf">
            <Download className="size-4" /> Download full guide (PDF)
          </a>
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-8 items-start">
        <div className="space-y-5 min-w-0">
          <Section id="start" icon={Rocket} title="Getting started">
            <ol className="list-decimal pl-5 space-y-1">
              <li>Open <strong>Events</strong> and select an event. You land on its <strong>Event Home</strong>.</li>
              <li>Use the list on the left to open any section (on a phone, tap the section button next to search). For people who can edit, the dot beside each area shows how complete it is: an empty ring (nothing yet), half filled (some fields), full green (every field) or red (required information missing). Select a group heading to fold it away; the menu remembers. Event Home offers <em>Pick up where you left off</em> to reopen the last area you were in.</li>
              <li>Press <kbd className="rounded border px-1 text-xs">/</kbd> (or Ctrl/⌘ + K) to jump to <strong>Search</strong> at the top.</li>
              <li>If you can edit, click any field (or its pencil) to change it. Changes save as you type; press <kbd className="rounded border px-1 text-xs">Esc</kbd> or <strong>Done</strong> when you're finished.</li>
            </ol>
            <p>Select the menu icon at the top left to fold the main app menu away for more room, or to bring it back. It stays the way you leave it, including inside events.</p>
            <p>You sign in once at the OTG Control Centre and open Event Planner from its tile. Forgotten passwords are reset there too.</p>
            <p>The <strong>Events</strong> page shows events as <em>Cards</em>, a month <em>Calendar</em> or a 12-month <em>Timeline</em>. Filter by status, event lead or dates, or turn on <em>My events</em> for the events you lead, are assigned to, or are responsible for an area in. Your view and filters are remembered on that device. Each card shows days to go and, for people who can edit, how many reviews are overdue and how many items are to do.</p>
            <p><strong>New event</strong> (Events page) needs the event's real name, its start date and its type: <em>Major event</em> (every area) or <em>Smaller event</em> (the areas chosen for smaller events). People who manage an event can change its type from the ⋯ menu. Areas that already hold information always stay.</p>
            <p><strong>Running an event again?</strong> Use <em>Copy a previous event</em> on the New event page, or <em>Copy to a new event…</em> in an event's ⋯ menu. The new event starts as a Draft that you lead, with the old event's own sections and fields, who's responsible for each area, any area restrictions, and the information in the areas you tick. Dates, uploaded files, reviews and people with access aren't copied. Only areas you can see are copied.</p>
            <p>The new event form needs the event's real name and its start date. A best guess for the date is fine; you can change it later. Event names typed in capitals are shown in title case, e.g. “SUMMERNATS NEW ZEALAND” shows as “Summernats New Zealand”.</p>
          </Section>

          <Section id="home" icon={Home} title="Event Home">
            <p>A summary built from the event's own saved information — there's nothing extra to maintain:</p>
            <ul>
              <li>Name, short description, venue and address with <em>Open map</em>, event lead and status.</li>
              <li><strong>Dates</strong>, side by side: <em>Open to the public</em> (Public start and end date, or the event dates when they're the same) and <em>Event (operational)</em>: event dates, bump-in and bump-out. If the event description mentions days that don't match, a warning appears with buttons to set public dates or edit the description.</li>
              <li><strong>Pinned</strong>: up to 6 important sections, fields or documents chosen by editors.</li>
              <li>Quick access to the <strong>Event program</strong>, <strong>Master schedule</strong>, <strong>Site information</strong> and <strong>Documents &amp; links</strong>. Missing items say so plainly, e.g. “Master schedule not added”, with an <em>Add</em> button for editors.</li>
              <li><strong>Key contacts</strong> from the contact and team tables, with tap-to-call and email.</li>
              <li><strong>Recent changes</strong>: what changed, when and by whom.</li>
              <li><strong>Other OTG workspaces</strong>: links to this event's work in other OTG apps (added by people who manage the event).</li>
            </ul>
            <p>The Event Overview fields are still a normal section you can open and edit.</p>
          </Section>

          <Section id="search" icon={Search} title="Search">
            <ul>
              <li>The search box is always at the top of an event. Results appear straight away in the main area.</li>
              <li>Choose <strong>This event</strong> (default) or <strong>All events I can access</strong>.</li>
              <li>Filter by <strong>Contacts</strong>, <strong>Documents &amp; links</strong>, <strong>Event information</strong>, <strong>Inside uploaded documents</strong> or <strong>Operations plans</strong> (the event's own plan — or every event's, with All events — plus the company-wide plans).</li>
              <li>Type a question, e.g. <em>“Who is in charge of medical operations?”</em>, to get an answer from the event's operations plan above the results. Selecting an operations plan result opens that plan's page in <strong>Operations plans</strong>.</li>
              <li>Search covers section names, field labels, saved text, table cells (so a person's name or responsibility finds their row), document titles, descriptions and file names.</li>
              <li>Selecting a result opens the exact field or table row and highlights it. <em>Back to results</em> returns you to the same place in the list.</li>
              <li>Use the arrow keys to move through results and Enter to open one. Esc clears the search.</li>
              <li><strong>Inside uploaded documents</strong> searches the text of uploaded PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx) and text files once they've been indexed. Scanned images and other formats can't be searched inside.</li>
              <li>Linked documents (OneDrive, Smartsheet, websites) are found by title and address only — their contents aren't searched.</li>
              <li>Results only ever include information you're allowed to see.</li>
            </ul>
          </Section>

          <Section id="reading" icon={BookOpen} title="Reading and editing">
            <ul>
              <li>Sections open in a clean <strong>reading view</strong>: plain text, tappable phone numbers and emails, <em>Open map</em> for addresses, and Open/Preview/Download for documents.</li>
              <li>Contact tables can be sorted by selecting a column heading, and filtered when they have more than five rows. On a phone, rows show as labelled cards.</li>
              <li>Empty states are specific: <em>Not provided yet</em> (no information), <em>Not applicable for this event</em> (marked N/A), and <em>Not set up yet</em> (the section has no fields).</li>
              <li>Editors can click a single field to edit just that one, then press <kbd className="rounded border px-1 text-xs">Esc</kbd> or <strong>Done</strong>. Links, buttons and table tools inside a field still work as normal; use the field's pencil to edit a table.</li>
              <li>To work through a whole section, select <strong>Edit all fields</strong>. In edit mode you get inputs, table tools, help text, required markers (*), <em>Only fields still to fill</em>, and <em>Add field or sub-section</em>. Select <strong>Done editing</strong> or press <kbd className="rounded border px-1 text-xs">Esc</kbd> to return to reading view.</li>
              <li>Each field and section has a direct link (link icon, or <em>Copy link to this section</em> in the ⋯ menu).</li>
            </ul>
          </Section>

          <Section id="docs" icon={FolderOpen} title="Documents & links">
            <p>One list of every file and link saved anywhere in the event. It's an index of the original items — opening or updating one here changes the same item in its section.</p>
            <ul>
              <li>Filter by text, section, or files/links. Each item shows its type (or “External link”), source section, responsible person, last update and status.</li>
              <li><strong>Status</strong>: Current, Draft or Superseded. Superseded items are hidden from normal lists and search; turn on <em>Show superseded</em> to see them.</li>
              <li><strong>Replace with new version</strong> uploads a new file and keeps the previous one in <em>Version history</em>, where you can still preview, open or download it.</li>
              <li><strong>Edit details</strong> sets the title, description, responsible person, version label and status.</li>
              <li>For links, <strong>I checked this link opens</strong> records who checked it and when. A saved link doesn't confirm the target is accessible, approved or current, and the app never claims it was verified automatically.</li>
              <li>Each file shows whether its contents are searchable, with <em>Make contents searchable</em> or <em>Re-index</em> for editors.</li>
              <li><strong>Pin to Event Home</strong> keeps an important document on the Event Home.</li>
            </ul>
          </Section>

          <Section id="ops" icon={ClipboardList} title="Operations plans">
            <p>All operations plans live in <strong>Operations plans</strong> in the main menu: each event's overall operations plan and the company-wide SOPs that apply to every event.</p>
            <h3 className="font-semibold text-sm pt-1">Finding a plan</h3>
            <ul>
              <li>The list shows every plan you can see, grouped by category. Filter by category, or use the search box to find the exact passage across all plans — results show the section and page each match is on.</li>
              <li>Select a plan's name (or a search result) to open the plan on its own page. <strong>Open</strong> shows the file in a new tab and <strong>Page N</strong> opens a PDF at that page.</li>
            </ul>
            <h3 className="font-semibold text-sm pt-1">Reading, searching and asking one plan</h3>
            <ul>
              <li><strong>Contents</strong> lists the plan's numbered sections with their page numbers, read from the plan's own contents page (lines such as <em>11 Burnout operations 18</em>). Choose a section to read it in the app; use the arrows or the section list to move between sections, and <strong>Open at page N</strong> to see it in the PDF.</li>
              <li><strong>Search this plan</strong> by typing words such as <em>burnout</em> or <em>evacuation</em>: matching passages from this plan only are shown by section and page, with <strong>Read section</strong> to open the whole section.</li>
              <li><strong>Ask a question</strong> such as <em>“What are the rules for the burnout competition?”</em> and press Enter or <strong>Ask</strong>. An answer is written by AI from this plan's text only, with <strong>Where this comes from</strong> links to the sections and pages it used. If the plan doesn't cover the question, it says so and shows the closest parts. Always check the cited sections before acting on an answer.</li>
              <li>The page address keeps your search and section, so you can share a link or use Back.</li>
            </ul>
            <h3 className="font-semibold text-sm pt-1">Who can do what</h3>
            <ul>
              <li>All staff can read, search and ask company-wide plans. An event's plan can be read by anyone with access to that event.</li>
              <li><strong>Admins and Leads</strong> upload plans (PDF or Word, up to 50 MB, several at once). On a plan's page, the ⋯ menu lets them edit details, replace the file with a new version, re-read its text and sections, link it to an event (or make it company-wide again) and delete it.</li>
              <li>Plans are filtered by eight main categories: Safety, Medical, Traffic, Site, Competition, Security, Comms and SOP. More detailed categories (often the sections of a large plan, like “17 Medical operations”) are grouped under one of them and still found by search. Admins manage this on the <strong>Admin</strong> page under <em>Manage categories</em>, where a main category is suggested for anything not grouped yet.</li>
              <li>The text inside PDF and Word (.docx) files is searchable. Older .doc files and scanned PDFs are found by title, description and category only — save as .docx (or a text PDF) and replace the file.</li>
              <li>External stakeholders can't see the company-wide plans. They can see an event's plan only if they've been given access to that event.</li>
            </ul>
          </Section>

          <Section id="currency" icon={Clock} title="Ownership & reviews">
            <ul>
              <li>Each section shows <strong>when it was last updated and by whom</strong>.</li>
              <li>Editors can set an optional <strong>responsible person</strong> and <strong>review date</strong> (⋯ → <em>Responsible person &amp; review date</em>). Pick an OTG person from the list (their name stays up to date), or choose <em>Someone else</em> to type a name or team.</li>
              <li><strong>Mark reviewed</strong> records that someone checked the section is current. Editing never marks a section reviewed.</li>
              <li>After a review, any later change shows <em>Changed since review</em>. After the review date, it shows <em>Review overdue</em>.</li>
              <li><strong>Change history</strong> (⋯ menu) lists recent changes; quick edits by the same person are grouped.</li>
              <li>Event status, readiness, planning coverage and review status are separate — none changes the others.</li>
            </ul>
          </Section>

          <Section id="status" icon={Archive} title="Event status & archiving">
            <p>Every event has a status that people who manage it set (⋯ → <em>Change status</em>):</p>
            <ul>
              <li><strong>Draft</strong> → <strong>In planning</strong> → <strong>Confirmed</strong> → <strong>Delivery ready</strong> → <strong>Live</strong> → <strong>Completed</strong> → <strong>Archived</strong>.</li>
              <li>The app suggests the next status from the event dates: <em>In planning</em> when a draft is within 90 days of starting, <em>Live</em> while the event is on, <em>Completed</em> once its dates have passed, and archiving 30 days after it ends. A suggestion appears under the event name for people who manage the event; select the button to accept it or <em>Not now</em>. Status never changes by itself.</li>
              <li><strong>Archive event</strong> (⋯ menu) is available once an event is <em>Completed</em>. An archived event leaves the Events list and <em>All events</em> search, and becomes read-only for everyone, admins included. Nothing is deleted: information, files, history and access are kept.</li>
              <li>To see archived events, turn on <em>Show archived</em> on the Events page. Searching inside an archived event still works.</li>
              <li><strong>Restore event</strong> (⋯ menu, or the button on the archived banner) brings it back as <em>Completed</em>. Anyone who manages the event can restore it.</li>
            </ul>
          </Section>

          <Section id="attention" icon={ListTodo} title="To do and readiness (editors)">
            <p><strong>To do</strong> (left-hand list) is everything still open for the event, each with a button to fix it: required information missing, areas not set up, reviews due or changed since review, and email addresses or phone numbers that don't look right. The count always comes with its breakdown, e.g. “4 to do: 4 areas not set up”.</p>
            <p><strong>Readiness</strong> is one score for how far planning has got. It weighs required fields with information (half), areas set up (a quarter) and areas with up-to-date reviews (a quarter). It's shown with the days to go and a state that expects more as the event gets closer:</p>
            <ul>
              <li><strong>On track</strong> (green), <strong>Behind</strong> (amber) or <strong>At risk</strong> (red). More than 6 months out, 25% is on track; within 2 months it takes 75%; in the last 2 weeks, 90%.</li>
              <li>Events that are on now or finished aren't graded.</li>
              <li>The Events page shows each event's days to go, readiness and To do count (for people who can edit it).</li>
              <li><strong>My work</strong> (main menu) lists the areas you're responsible for in upcoming events, soonest first, with each one's review state and anything still missing. If you lead an event, it also says how many of its areas have no one responsible.</li>
            </ul>
            <p><strong>Planning coverage</strong> is still shown underneath: the share of all fields with information entered. Neither readiness nor coverage means the information has been checked or the event is operationally ready, and neither changes the event status.</p>
          </Section>

          <Section id="tables" icon={TableIcon} title="Tables">
            <ul>
              <li>In edit mode, click a cell and type. <strong>Enter</strong> moves down a row; <strong>Shift+Enter</strong> adds a new line.</li>
              <li>The <strong>⋯</strong> on each row edits it in a larger window, moves it, inserts a row below, or deletes it (with Undo).</li>
              <li><strong>Manage columns</strong> renames, reorders, adds or removes columns, with a warning before information would be lost.</li>
              <li>If two people edit different rows or cells at the same time, both changes are kept. If they change the same cell, you're asked which version to keep.</li>
              <li>Columns headed <em>Email</em> or <em>Phone</em>/<em>Mobile</em> are checked: anything that isn't an email address or phone number is marked with a warning so it can be fixed. It's still saved.</li>
              <li>In columns headed <em>Name</em>, <em>Person</em> or <em>Contact</em>, OTG people and directory contacts are suggested as you type (in the row window and on phones), and <em>Company</em> or <em>Supplier</em> columns suggest directory suppliers. Anyone else can still be typed.</li>
              <li><strong>Contacts &amp; suppliers</strong> (main menu, OTG staff) is the shared directory. Pick someone from it and the row's empty company, phone and email cells fill in; you add their role for this event. Use <em>Fill from directory…</em> or <em>Save to directory</em> in a row's ⋯ menu. Admins, Leads and Members can add and change entries; external stakeholders never see the directory. Changing an entry doesn't change details already in events.</li>
            </ul>
          </Section>

          <Section id="saving" icon={Save} title="How saving works">
            <ul>
              <li><strong>Saving…</strong> — your change is on its way.</li>
              <li><strong>Saved at 10:42 am</strong> — shown only after the change is confirmed as stored.</li>
              <li><strong>Couldn't save — Retry</strong> — for example with no internet. Your typing stays on the page.</li>
              <li><strong>Someone else changed the same information</strong> — choose <em>Use their version</em> or <em>Keep my version</em>. Nothing is overwritten silently.</li>
            </ul>
            <p>If you try to leave with changes that haven't saved, you're asked first.</p>
          </Section>

          <Section id="customise" icon={Pencil} title="Adding fields to an event">
            <p>In edit mode, select <strong>Add field or sub-section</strong>:</p>
            <ul>
              <li><strong>This event only</strong> — other events and the shared template don't change. Labelled <em>This event only</em>.</li>
              <li><strong>Shared template</strong> (admins only) — adds it to every event, after confirmation.</li>
            </ul>
          </Section>

          <Section id="access" icon={Users} title="Who can see and edit">
            <p><strong>Global role</strong> — what someone can do across the app. Each person has one role, shown under their name in the main menu and on the Admin page; admins change it there.</p>
            <ul>
              {(["admin", "lead", "member", "viewer", "supplier"] as const).map((r) => (
                <li key={r}><strong>{GLOBAL_ROLE_INFO[r].label}</strong> — {GLOBAL_ROLE_INFO[r].description}</li>
              ))}
            </ul>
            <p><strong>Event access</strong> — set per event by an admin (Admin) or by someone who manages the event (⋯ → <em>People with access</em>):</p>
            <ul>
              {(["view", "edit", "manage"] as const).map((l) => <li key={l}><strong>{ACCESS_INFO[l].label}</strong> — {ACCESS_INFO[l].description}</li>)}
            </ul>
            <p>The event lead and the person who created an event manage it automatically. Only admins can change the event lead (⋯ → <em>Change event lead</em>), choosing from OTG people. People's names come from their Control Centre profile, so update a name there. Only admins can give someone <em>Can manage</em>. An assignment never gives access to other events. Names in contact tables are information only — they never give access.</p>
            <p>Admins can see each person's effective access in <em>Admin → Show effective access</em>, and use <em>Preview as external stakeholder</em> in an event's ⋯ menu.</p>
            <p>Assignments created under the old rules kept their editing access and are listed under <em>Assignments to check</em> so an admin can confirm the right level.</p>
          </Section>

          <Section id="restrict" icon={Lock} title="Restricted areas">
            <ul>
              <li>An area can be <strong>OTG staff only</strong> (hidden from external stakeholders) or <strong>Event managers and admins only</strong>.</li>
              <li>Admins set the default for every event in the Template builder, and can override it for one event (section ⋯ → <em>Responsible person &amp; review date</em> → <em>Who can see this area</em>).</li>
              <li>The rule protects the area's information, files and earlier versions, search results, previews, downloads and change history — including through direct links. Restricted areas show a lock icon.</li>
              <li>To restrict a single document, keep it in a restricted area.</li>
            </ul>
          </Section>

          <Section id="template" icon={LayoutTemplate} title="Template builder (admins)">
            <ul>
              <li>The outline lists areas and sub-sections; select one to edit it. Set its name, help text, navigation group and <em>Who can see this area</em>.</li>
              <li><strong>Included for</strong> sets which event types show an area: <em>Major event</em>, <em>Smaller event</em> or both. Areas ticked for both are the common core.</li>
              <li>Fields have a name, type, help text, <em>Required</em>, <em>Allow “Not applicable”</em> and, for tables, starting rows and completion rules.</li>
              <li><strong>Suggested starter fields</strong> appear for common areas (Operations, Marketing, Commercial, Scope, Audience, Event dates). They're optional; adding them creates empty fields only.</li>
              <li>To reorder, drag an area, sub-section or field by its handle (⋮⋮), or use the Up and Down arrows (on phones and with a keyboard). The new order applies to every event.</li>
              <li>Renaming or reordering keeps saved information attached. Removing something that holds information archives it instead.</li>
              <li><strong>Preview</strong> shows the template as an event. Nothing typed there is saved.</li>
            </ul>
          </Section>

          <Section id="where" icon={Layers} title="Where things are now">
            <ul>
              <li>Area list, incomplete filter, continue where you left off → left-hand list; <em>Only fields still to fill</em> is in edit mode.</li>
              <li>Search this event → search box at the top (now with All events, result types and inside-document search).</li>
              <li>Readiness, planning coverage and missing items → <em>To do</em> and the Readiness card on Event Home.</li>
              <li>Status, archive or restore, copy event link, delete event → ⋯ menu at the top right.</li>
              <li>Field and area links → link icon on a field; ⋯ → <em>Copy link to this section</em>.</li>
              <li>Files and links → still in their fields; also listed together in <em>Documents &amp; links</em>.</li>
              <li>Event assignments → <em>Admin</em> (admins) or ⋯ → <em>People with access</em>.</li>
            </ul>
          </Section>

          <Section id="faq" icon={HelpCircle} title="Tips & FAQ">
            <dl className="space-y-4">
              <Faq q="Why can't I see a section other people mention?">It may be restricted to staff or event managers. Ask an admin.</Faq>
              <Faq q="Why can't I edit an event?">You have view access. Ask an admin or the event lead for edit access.</Faq>
              <Faq q="The event dates and the marketing description show different days.">They can mean different things (e.g. the event runs 24–28 Feb but is open to the public 26–28 Feb). Fill in <em>Public start date</em> and <em>Public end date</em> in Event Overview: Event Home then shows both, and the warning goes once the description matches the public dates. Nothing is changed automatically.</Faq>
              <Faq q="What does “Operating entity” mean?">The OTG company that runs the event, for example Out There Productions Major Events (formerly shown as “OTPME”). Admins manage the list of choices in the Template builder.</Faq>
              <Faq q="Where do uploaded files go?">They're stored with the event and follow the event's and the area's access rules.</Faq>
            </dl>
          </Section>

          <Section id="support" icon={LifeBuoy} title="Getting support">
            <p>
              Contact your administrator, or email{" "}
              <a href="mailto:support@outthereadmin.com.au" className="text-primary underline underline-offset-2">support@outthereadmin.com.au</a>.
            </p>
            <div className="pt-2">
              <Button asChild variant="outline"><Link to="/dashboard">Back to events <ArrowRight className="size-4" /></Link></Button>
            </div>
          </Section>
        </div>

        <aside className="hidden lg:block sticky top-6">
          <nav aria-label="On this page" className="rounded-xl border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 font-medium">On this page</p>
            <div className="flex flex-col gap-0.5">
              {sections.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground py-1.5 px-2 rounded-md hover:bg-muted transition-colors">
                  <s.icon className="size-3.5 shrink-0" aria-hidden /> <span>{s.label}</span>
                </a>
              ))}
            </div>
          </nav>
        </aside>
      </div>
    </div>
  );
}

function Section({ id, icon: Icon, title, children }: {
  id: string; icon: React.ComponentType<{ className?: string }>; title: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-xl border bg-card p-5 sm:p-6 scroll-mt-20">
      <div className="flex items-center gap-3 mb-3">
        <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center shrink-0"><Icon className="size-4" /></div>
        <h2 className="font-display font-semibold text-lg">{title}</h2>
      </div>
      <div className="space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_strong]:text-foreground text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-foreground text-sm">{q}</dt>
      <dd className="text-sm text-muted-foreground mt-1">{children}</dd>
    </div>
  );
}
