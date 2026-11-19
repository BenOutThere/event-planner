import { useEffect, useState } from "react";
import { loadLastArea } from "@/lib/nav-prefs";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowRight, CalendarDays, ExternalLink, FileText, FolderOpen, Info, Link2, ListTodo, Mail, MapPin, Pencil, Phone, Pin, PinOff, Plus,
  Trash2, User, History as HistoryIcon, LayoutGrid, AlertTriangle,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { formatAuDate, formatAuRange } from "@/lib/dates";
import { contactsFrom, dateCheck, findField, HOME_KEYS, mapUrl, quickAccess, textOf } from "@/lib/event-home";
import { collectDocuments, type DocItem } from "@/lib/documents";
import { formatAuTimestamp } from "@/lib/currency";
import { linkHost, validateUrl } from "@/lib/links";
import { refKey } from "@/lib/event-structure";
import { openStoredFile } from "@/components/fields/files-field";
import { useWorkspace } from "./context";
import { attentionItems, CoverageSummary, ReadinessSummary } from "./attention-view";

function Card({ title, icon: Icon, action, children, className }: { title: string; icon: React.ComponentType<{ className?: string }>; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border bg-card ${className ?? ""}`} aria-label={title}>
      <div className="flex items-center justify-between gap-2 px-4 sm:px-5 pt-4 pb-2">
        <h2 className="font-display font-semibold text-base flex items-center gap-2"><Icon className="size-4 text-accent" /> {title}</h2>
        {action}
      </div>
      <div className="px-4 sm:px-5 pb-4">{children}</div>
    </section>
  );
}

export function openDoc(d: DocItem) {
  if (d.kind === "link") window.open(d.record.url, "_blank", "noopener,noreferrer");
  else void openStoredFile(d.record as any);
}

export function EventHome() {
  const w = useWorkspace();
  const { areas, getValue, canEdit, event, openArea } = w;
  const loc = (keys: string[]) => findField(areas, keys);
  const descLoc = loc(HOME_KEYS.description);
  const description = textOf(descLoc, getValue);
  const venue = textOf(loc(HOME_KEYS.venue), getValue) ?? event.location;
  const addressLoc = loc(HOME_KEYS.address);
  const address = textOf(addressLoc, getValue);
  const dateLoc = { start: loc(HOME_KEYS.start), end: loc(HOME_KEYS.end), bumpIn: loc(HOME_KEYS.bumpIn), bumpOut: loc(HOME_KEYS.bumpOut) };
  const start = textOf(dateLoc.start, getValue) ?? event.proposed_date;
  const end = textOf(dateLoc.end, getValue) ?? event.end_date;
  const bumpIn = textOf(dateLoc.bumpIn, getValue);
  const bumpOut = textOf(dateLoc.bumpOut, getValue);
  const publicLoc = loc(HOME_KEYS.publicDates);
  const publicDates = textOf(publicLoc, getValue);
  const publicStartLoc = loc(HOME_KEYS.publicStart);
  const dc = dateCheck(areas, getValue, { start: event.proposed_date, end: event.end_date });
  const publicRange = dc.publicStart ? formatAuRange(dc.publicStart, dc.publicEnd ?? dc.publicStart) : publicDates;
  const overview = areas.find((a) => a.key === "overview") ?? descLoc?.area ?? dateLoc.start?.area ?? null;
  const contacts = contactsFrom(areas, getValue, 8);
  const contactArea = contacts[0]?.loc.area ?? areas.find((a) => /people|contact/i.test(a.navGroup ?? "")) ?? null;
  const quick = quickAccess(areas, getValue);
  const docs = collectDocuments(areas, getValue);
  const currentDocs = docs.filter((d) => d.status !== "superseded");
  const leadName = event.lead_user_id ? w.profiles.get(event.lead_user_id) : null;
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const changes = w.changes.filter((c) => !c.area_id || areaById.has(c.area_id)).slice(0, 8);
  const attention = canEdit ? attentionItems(w).length : 0;
  const [lastAreaId, setLastAreaId] = useState<string | null>(null);
  useEffect(() => { setLastAreaId(loadLastArea(event.id)); }, [event.id]);
  const lastArea = lastAreaId ? areaById.get(lastAreaId) ?? null : null;

  const edit = (l: typeof descLoc) => l && canEdit ? (
    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openArea(l.area.id, { field: l.field.refKey, edit: true })}><Plus className="size-3.5" /> Add</Button>
  ) : null;

  // Pins resolve against the current records; a pin whose item no longer exists is shown as unavailable.
  const pins = w.pins.map((p) => {
    if (p.pin_kind === "area") { const a = areaById.get(p.target); return { p, label: a?.title ?? p.label, open: a ? () => openArea(a.id) : null, sub: a?.navGroup ?? "Section" }; }
    if (p.pin_kind === "document") { const d = docs.find((x) => x.id === p.target); return { p, label: d?.title ?? p.label, open: d ? () => openDoc(d) : null, sub: d ? `${d.typeLabel} · ${d.area.title}` : "No longer available" }; }
    const f = areas.flatMap((a) => a.sections.flatMap((s) => s.fields.map((fl) => ({ a, fl })))).find((x) => x.fl.refKey === p.target);
    return { p, label: f?.fl.label ?? p.label, open: f ? () => openArea(f.a.id, { field: f.fl.refKey }) : null, sub: f?.a.title ?? "No longer available" };
  });

  async function unpin(id: string) {
    const { error } = await supabase.from("event_pins").delete().eq("id", id);
    if (error) return toast.error("Couldn't unpin.");
    w.invalidate("pins");
  }

  return (
    <div className="space-y-4">
      {lastArea && (
        <button type="button" onClick={() => openArea(lastArea.id)}
          className="w-full sm:w-auto flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <HistoryIcon className="size-4 text-muted-foreground shrink-0" aria-hidden />
          <span>Pick up where you left off: <strong>{lastArea.title}</strong></span>
        </button>
      )}
      <section className="rounded-xl border bg-card overflow-hidden" aria-labelledby="home-title">
        <div className="h-1.5 bg-gradient-to-r from-primary via-primary to-accent" aria-hidden />
        <div className="p-4 sm:p-5 grid gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-3 min-w-0">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Event Home</p>
              <h2 id="home-title" className="font-display font-semibold text-2xl leading-tight mt-0.5 break-words">{event.name}</h2>
            </div>
            {description ? (
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap line-clamp-6">{description}</p>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-2">No event description yet. {edit(descLoc)}</p>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <div className="flex items-start gap-2 min-w-0">
                <MapPin className="size-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden />
                <div className="min-w-0">
                  {venue ? <div className="font-medium">{venue}</div> : <div className="text-muted-foreground">Venue not added</div>}
                  {address && <div className="text-muted-foreground text-xs whitespace-pre-wrap">{address}</div>}
                  {(address || venue) && (
                    <a href={mapUrl(address ?? venue!)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-2 inline-flex items-center gap-1">
                      Open map <ExternalLink className="size-3" aria-hidden />
                    </a>
                  )}
                  {!address && canEdit && addressLoc && <div>{edit(addressLoc)}</div>}
                </div>
              </div>
              {leadName && (
                <div className="flex items-start gap-2"><User className="size-4 text-muted-foreground mt-0.5" aria-hidden /><div><div className="text-xs text-muted-foreground">Event lead</div><div className="font-medium">{leadName}</div></div></div>
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-1.5"><CalendarDays className="size-4 text-accent" aria-hidden /> Dates</h3>
              <Popover>
                <PopoverTrigger asChild><Button size="icon" variant="ghost" className="size-7" aria-label="About these dates"><Info className="size-3.5" /></Button></PopoverTrigger>
                <PopoverContent className="w-80 text-xs space-y-2">
                  <p><strong>Public dates</strong> are the days open to the public or on sale (Public start and end date in Event Overview). Leave them empty when they're the same as the event dates.</p>
                  <p><strong>Event dates</strong> are the Event start and end dates. <strong>Bump-in and bump-out</strong> are the operational dates either side.</p>
                  <p className="text-muted-foreground">If the event description mentions days that don't match, you'll see a warning here and on the To do list. Nothing is changed automatically.</p>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="rounded-md border bg-background p-2.5">
                <div className="text-xs font-medium text-muted-foreground">Open to the public</div>
                <div className="font-medium mt-0.5">{publicRange ?? (start || end ? formatAuRange(start, end) : "Not added")}</div>
                {!publicRange && (start || end) && (publicStartLoc || publicLoc) && <div className="text-xs text-muted-foreground">Same as the event dates</div>}
                {!publicRange && canEdit && publicStartLoc && (
                  <Button size="sm" variant="ghost" className="h-6 px-1 text-xs -ml-1" onClick={() => openArea(publicStartLoc.area.id, { field: publicStartLoc.field.refKey, edit: true })}><Plus className="size-3" /> Different public dates</Button>
                )}
              </div>
              <div className="rounded-md border bg-background p-2.5">
                <div className="text-xs font-medium text-muted-foreground">Event (operational)</div>
                <dl className="space-y-1 mt-0.5">
                  <DateRow label="Event dates" value={start || end ? formatAuRange(start, end) : null} empty="Not added" />
                  <DateRow label="Bump-in starts" value={bumpIn ? formatAuDate(bumpIn) : null} empty="Not added" muted />
                  <DateRow label="Bump-out ends" value={bumpOut ? formatAuDate(bumpOut) : null} empty="Not added" muted />
                </dl>
              </div>
            </div>
            {dc.conflicts.length > 0 && dc.descLoc && (
              <div className="rounded-md border border-warning/50 bg-warning/15 p-2.5 text-xs flex items-start gap-2">
                <AlertTriangle className="size-3.5 mt-px shrink-0" aria-hidden />
                <div className="space-y-1">
                  <p>The description says <strong>{dc.conflicts.map((m) => `“${m.text}”`).join(", ")}</strong>, but the {dc.reference === "public" ? "public dates are" : "event dates are"} <strong>{dc.reference === "public" ? formatAuRange(dc.publicStart, dc.publicEnd ?? dc.publicStart) : formatAuRange(start, end)}</strong>.</p>
                  {canEdit && (
                    <p className="flex flex-wrap gap-2">
                      {dc.reference === "event" && publicStartLoc && <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => openArea(publicStartLoc.area.id, { field: publicStartLoc.field.refKey, edit: true })}>Set public dates</Button>}
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => openArea(dc.descLoc!.area.id, { field: dc.descLoc!.field.refKey, edit: true })}>Edit description</Button>
                    </p>
                  )}
                </div>
              </div>
            )}
            {canEdit && dateLoc.start && (!start || !bumpIn || !bumpOut) && (
              <Button size="sm" variant="ghost" className="h-7 text-xs -ml-2" onClick={() => openArea(dateLoc.start!.area.id, { field: dateLoc.start!.field.refKey, edit: true })}>
                <Pencil className="size-3.5" /> Add missing dates
              </Button>
            )}
          </div>
        </div>
        {overview && (
          <div className="border-t px-4 sm:px-5 py-2 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" className="h-8" onClick={() => openArea(overview.id)}>Open {overview.title} <ArrowRight className="size-3.5" /></Button>
          </div>
        )}
      </section>

      {(pins.length > 0 || canEdit) && (
        <Card title="Pinned" icon={Pin}>
          {pins.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing pinned yet. Use <em>Pin to Event Home</em> in a section's ⋯ menu or in Documents &amp; links to keep up to 6 important items here.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {pins.map(({ p, label, open, sub }) => (
                <li key={p.id} className="flex items-center gap-2 rounded-md border bg-background pl-3 pr-1 py-1.5">
                  <button type="button" disabled={!open} onClick={() => open?.()} className="flex-1 min-w-0 text-left disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                    <div className="text-sm font-medium truncate">{label}</div>
                    <div className="text-xs text-muted-foreground truncate">{sub}</div>
                  </button>
                  {canEdit && <Button size="icon" variant="ghost" className="size-8" aria-label={`Unpin ${label}`} onClick={() => unpin(p.id)}><PinOff className="size-3.5" /></Button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {quick.map((q) => (
          <div key={q.key} className="rounded-xl border bg-card p-4 flex flex-col gap-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5"><FileText className="size-4 text-accent" aria-hidden /> {q.title}</h3>
            {q.docs.length > 0 ? (
              <ul className="space-y-1">
                {q.docs.slice(0, 3).map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => openDoc(d)} className="text-sm text-primary underline underline-offset-2 text-left break-words inline-flex items-start gap-1">
                      {d.title} <ExternalLink className="size-3 mt-1 shrink-0" aria-hidden />
                    </button>
                    <div className="text-[11px] text-muted-foreground">{d.kind === "link" ? `External link · ${d.host}` : d.typeLabel}</div>
                  </li>
                ))}
              </ul>
            ) : q.hasInfo ? (
              <p className="text-sm text-muted-foreground">Information added — open to read.</p>
            ) : (
              <p className="text-sm text-muted-foreground">{q.emptyLabel}</p>
            )}
            <div className="mt-auto pt-1">
              {q.area ? (
                <Button size="sm" variant="ghost" className="h-7 -ml-2 text-xs" onClick={() => openArea(q.area!.id, { edit: canEdit && !q.docs.length && !q.hasInfo })}>
                  {canEdit && !q.docs.length && !q.hasInfo ? <><Plus className="size-3.5" /> Add</> : <>Open <ArrowRight className="size-3.5" /></>}
                </Button>
              ) : w.isAdmin ? <span className="text-[11px] text-muted-foreground">Add an area named “{q.title}” in the Template builder.</span> : null}
            </div>
          </div>
        ))}
        <div className="rounded-xl border bg-card p-4 flex flex-col gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5"><FolderOpen className="size-4 text-accent" aria-hidden /> Documents &amp; links</h3>
          <p className="text-sm text-muted-foreground">{currentDocs.length ? `${currentDocs.length} current item${currentDocs.length === 1 ? "" : "s"} across all areas.` : "No documents or links added yet."}</p>
          <div className="mt-auto pt-1"><Button size="sm" variant="ghost" className="h-7 -ml-2 text-xs" onClick={() => w.go({ view: "documents", area: undefined })}>Open index <ArrowRight className="size-3.5" /></Button></div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Key contacts" icon={User} action={contactArea ? <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openArea(contactArea.id)}>All contacts <ArrowRight className="size-3.5" /></Button> : null}>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts added yet.{canEdit && contactArea ? " " : ""}{canEdit && contactArea && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openArea(contactArea.id, { edit: true })}><Plus className="size-3.5" /> Add contacts</Button>}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {contacts.map((c) => (
                <li key={`${c.loc.field.refKey}-${c.row}`} className="rounded-md border bg-background p-2.5 min-w-0">
                  <button type="button" onClick={() => openArea(c.loc.area.id, { field: c.loc.field.refKey, row: c.row })} className="text-sm font-medium text-left hover:underline break-words">{c.name}</button>
                  {(c.role || c.org) && <div className="text-xs text-muted-foreground break-words">{[c.role, c.org].filter(Boolean).join(" · ")}</div>}
                  <div className="flex flex-wrap gap-x-3 mt-1">
                    {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="text-xs text-primary inline-flex items-center gap-1 underline underline-offset-2"><Phone className="size-3" aria-hidden />{c.phone}</a>}
                    {c.email && <a href={`mailto:${c.email}`} className="text-xs text-primary inline-flex items-center gap-1 underline underline-offset-2 break-all"><Mail className="size-3" aria-hidden />{c.email}</a>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">Contacts are information only — being listed doesn't give someone access to this app.</p>
        </Card>

        <Card title="Recent changes" icon={HistoryIcon}>
          {changes.length === 0 ? <p className="text-sm text-muted-foreground">No changes recorded yet.</p> : (
            <ul className="divide-y -my-1">
              {changes.map((c) => {
                const area = c.area_id ? areaById.get(c.area_id) : null;
                const rk = c.field_key ? refKey({ section_id: c.section_id, extra_section_id: c.extra_section_id, field_key: c.field_key }) : undefined;
                return (
                  <li key={c.id} className="py-2">
                    <button type="button" disabled={!area} onClick={() => area && openArea(area.id, { field: rk })} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="text-sm font-medium">{c.change_kind === "review" ? `${c.field_label ?? "Section"} marked reviewed` : c.field_label}</span>
                        <span className="text-[11px] text-muted-foreground">{formatAuTimestamp(c.updated_at)}</span>
                      </div>
                      {c.change_kind !== "review" && c.summary && <p className="text-xs text-foreground/80 line-clamp-1">{c.summary}</p>}
                      <p className="text-[11px] text-muted-foreground">{[area?.title, c.changed_by_name].filter(Boolean).join(" · ")}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <WorkspaceLinks />

      {canEdit && (
        <Card title="Readiness (editors)" icon={ListTodo} action={<Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => w.go({ view: "attention" })}>{attention ? `To do (${attention})` : "To do"} <ArrowRight className="size-3.5" /></Button>}>
          <ReadinessSummary compact />
          <div className="mt-3 pt-3 border-t"><CoverageSummary compact /></div>
        </Card>
      )}
    </div>
  );
}

function DateRow({ label, value, empty, muted }: { label: string; value: string | null; empty: string; muted?: boolean }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2">
      <dt className={muted ? "text-muted-foreground" : "font-medium"}>{label}</dt>
      <dd className={value ? "" : "text-muted-foreground"}>{value ?? empty}</dd>
    </div>
  );
}

type WLink = { label: string; url: string };

function WorkspaceLinks() {
  const w = useWorkspace();
  const links: WLink[] = Array.isArray(w.event.workspace_links) ? (w.event.workspace_links as WLink[]) : [];
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<WLink[]>([]);
  const [busy, setBusy] = useState(false);
  if (!links.length && !w.canManage) return null;

  async function save() {
    const clean = rows.map((r) => ({ label: r.label.trim(), url: r.url.trim() })).filter((r) => r.url);
    const bad = clean.find((r) => validateUrl(r.url));
    if (bad) return toast.error(`${bad.url}: ${validateUrl(bad.url)}`);
    setBusy(true);
    const { error } = await supabase.from("events").update({ workspace_links: clean }).eq("id", w.eventId);
    setBusy(false);
    if (error) return toast.error("Couldn't save these links.");
    w.invalidate("event");
    setOpen(false);
  }

  return (
    <Card title="Other OTG workspaces for this event" icon={LayoutGrid}
      action={w.canManage ? <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setRows(links.length ? links : [{ label: "", url: "" }]); setOpen(true); }}><Pencil className="size-3.5" /> Edit</Button> : null}>
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">No linked workspaces. Add a link to this event's work in another OTG app (for example a task board or ticketing workspace).</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {links.map((l, i) => (
            <li key={i}>
              <Button asChild variant="outline" size="sm">
                <a href={l.url} target="_blank" rel="noopener noreferrer"><Link2 className="size-3.5" /> {l.label || linkHost(l.url)} <ExternalLink className="size-3" /></a>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Other OTG workspaces</DialogTitle>
            <DialogDescription>Links to where this event's work lives in other OTG apps. Opening a link doesn't confirm access to it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
                <Input aria-label={`Workspace ${i + 1} name`} placeholder="e.g. Control Centre" value={r.label} onChange={(e) => setRows(rows.map((x, xi) => xi === i ? { ...x, label: e.target.value } : x))} />
                <Input aria-label={`Workspace ${i + 1} address`} type="url" placeholder="https://…" value={r.url} onChange={(e) => setRows(rows.map((x, xi) => xi === i ? { ...x, url: e.target.value } : x))} />
                <Button size="icon" variant="ghost" aria-label={`Remove workspace ${i + 1}`} onClick={() => setRows(rows.filter((_, xi) => xi !== i))}><Trash2 className="size-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setRows([...rows, { label: "", url: "" }])}><Plus className="size-4" /> Add link</Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
