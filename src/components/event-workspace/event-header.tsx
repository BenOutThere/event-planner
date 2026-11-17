import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, CalendarDays, ChevronsUpDown, MapPin, MoreHorizontal, Search, Info, Link2, Settings2, Trash2, Users, X,
  Loader2, AlertTriangle, CheckCircle2, RotateCw, Eye, Check,
} from "lucide-react";
import { toast } from "sonner";
import { useSaver, useSaverStatus } from "@/hooks/use-event-saver";
import { STAGE_INFO, STAGE_ORDER, type EventStage } from "@/lib/event-status";
import { formatAuRange } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./context";
import { AccessDialog } from "./access-dialog";

export function SaveIndicator() {
  const status = useSaverStatus();
  const saver = useSaver();
  if (status.state === "preview") return <span className="text-xs text-muted-foreground">Preview — not saved</span>;
  if (status.state === "saving") return <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5" role="status"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…</span>;
  if (status.state === "error") {
    return (
      <span className="text-xs text-destructive inline-flex items-center gap-1.5" role="alert">
        <AlertTriangle className="size-3.5" aria-hidden /> Couldn't save {status.failed} change{status.failed === 1 ? "" : "s"}
        <Button size="sm" variant="outline" className="h-7 ml-1" onClick={() => saver.retryAll()}><RotateCw className="size-3.5" /> Retry</Button>
      </span>
    );
  }
  if (status.state === "conflict") return <span className="text-xs inline-flex items-center gap-1.5 rounded bg-warning/20 px-2 py-0.5" role="alert"><AlertTriangle className="size-3.5" aria-hidden /> Someone else changed the same information — choose a version</span>;
  if (status.state === "saved" && status.savedAt) {
    return <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5" role="status"><CheckCircle2 className="size-3.5 text-success" aria-hidden /> Saved at {status.savedAt.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</span>;
  }
  return null;
}

function EventSwitcher() {
  const { event, preview } = useWorkspace();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const events = useQuery({
    queryKey: ["event-switcher"],
    enabled: !preview && open,
    queryFn: async () => (await supabase.from("events").select("id, name, proposed_date, end_date").order("proposed_date", { ascending: true, nullsFirst: false })).data ?? [],
  });
  if (preview) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Switch to another event">
          <ChevronsUpDown className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Find an event…" />
          <CommandList>
            <CommandEmpty>{events.isLoading ? "Loading…" : "No events found."}</CommandEmpty>
            <CommandGroup heading="Events you can see">
              {(events.data ?? []).map((e: any) => (
                <CommandItem key={e.id} value={`${e.name} ${e.id}`} onSelect={() => { setOpen(false); navigate({ to: "/events/$id", params: { id: e.id }, search: {} as any }); }}>
                  <Check className={cn("size-4", e.id === event.id ? "opacity-100" : "opacity-0")} aria-hidden />
                  <div className="min-w-0">
                    <div className="truncate">{e.name}</div>
                    <div className="text-xs text-muted-foreground">{formatAuRange(e.proposed_date, e.end_date)}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SearchBox() {
  const { search, go } = useWorkspace();
  const prev = useRef<{ view?: any; area?: string; field?: string } | null>(null);
  const value = search.q ?? "";
  const onChange = (q: string) => {
    if (search.view !== "search") {
      prev.current = { view: search.view, area: search.area, field: search.field };
      go({ view: "search", q: q || undefined });
    } else {
      go({ q: q || undefined }, { replace: true });
    }
  };
  const clear = () => {
    const back = prev.current ?? {};
    go({ q: undefined, scope: undefined, type: undefined, view: back.view, area: back.area, field: back.field }, { replace: true });
    prev.current = null;
  };
  return (
    <div className="relative flex-1 min-w-0" role="search">
      <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden />
      <Input
        id="event-search-input"
        aria-label="Search this event, or ask a question ending with a question mark (press / to focus)"
        placeholder="Search, or ask a question and end it with a question mark (?)"
        title="Search, or ask a question and end it with a question mark (?)"
        value={value}
        autoComplete="off"
        onFocus={() => { if (value && search.view !== "search") go({ view: "search" }); }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); clear(); (e.target as HTMLInputElement).blur(); }
          if (e.key === "ArrowDown" || e.key === "Enter") {
            const first = document.querySelector<HTMLElement>("[data-search-result]");
            if (first) { e.preventDefault(); first.focus(); }
          }
        }}
        className="pl-8 pr-14 h-10 bg-card"
      />
      {value ? (
        <button type="button" aria-label="Clear search" onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-4" />
        </button>
      ) : (
        <kbd className="hidden sm:inline absolute right-2 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 text-[10px] text-muted-foreground" aria-hidden>/</kbd>
      )}
    </div>
  );
}

export function EventHeader({
  backTo, onDeleted, mobileNav, realIsAdmin, onToggleStakeholder,
}: {
  backTo?: { to: string; label: string };
  onDeleted?: () => void;
  mobileNav: React.ReactNode;
  realIsAdmin: boolean;
  onToggleStakeholder: () => void;
}) {
  const { event, canEdit, canManage, isAdmin, preview, asStakeholder, go } = useWorkspace();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const info = STAGE_INFO[event.stage] ?? STAGE_INFO.draft;

  async function setStage(stage: EventStage) {
    const { error } = await supabase.from("events").update({ stage }).eq("id", event.id);
    if (error) return toast.error("Couldn't change the status. Only people who manage this event can do this.");
    toast.success(`Status set to ${STAGE_INFO[stage].label}`);
    qc.invalidateQueries({ queryKey: ["event", event.id] });
    qc.invalidateQueries({ queryKey: ["events"] });
  }

  async function deleteEvent() {
    setDeleting(true);
    try {
      const { data: vals } = await supabase.from("event_field_values").select("kind, value_links").eq("event_id", event.id);
      const paths = (vals ?? []).filter((v: any) => v.kind === "files" && Array.isArray(v.value_links))
        .flatMap((v: any) => v.value_links.flatMap((f: any) => [f?.path, ...((f?.revisions ?? []).map((r: any) => r?.path))]).filter(Boolean));
      if (paths.length) await supabase.storage.from("eventplanner-files").remove(paths);
      // The event's own operations plan (its row goes with the event; remove the file too).
      const { data: plans } = await supabase.from("ops_documents").select("storage_path").eq("event_id", event.id);
      if (plans?.length) await supabase.storage.from("eventplanner-ops-plans").remove(plans.map((p) => p.storage_path));
      await supabase.from("event_field_values").delete().eq("event_id", event.id);
      await supabase.from("event_section_extras").delete().eq("event_id", event.id);
      const { error } = await supabase.from("events").delete().eq("id", event.id);
      if (error) throw error;
      toast.success(`Deleted ${event.name}`);
      onDeleted?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't delete the event");
      setDeleting(false);
    }
  }

  async function copyEventLink() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/events/${event.id}`); toast.success("Event link copied"); }
    catch { toast.error("Couldn't copy the link"); }
  }

  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-[90rem] px-4 lg:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 flex items-center gap-1.5">
          {backTo && (
            <Button asChild variant="ghost" size="icon" className="size-8 shrink-0">
              <Link to={backTo.to} aria-label={backTo.label}><ArrowLeft className="size-4" /></Link>
            </Button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <h1 className="font-display font-semibold text-base sm:text-lg leading-tight truncate" title={event.name}>
                <button type="button" onClick={() => go({ view: undefined, area: undefined, field: undefined, q: undefined, edit: undefined })} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded truncate max-w-full">
                  {event.name}
                </button>
              </h1>
              <EventSwitcher />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden /> {formatAuRange(event.proposed_date, event.end_date)}</span>
              {event.location && <span className="hidden sm:inline-flex items-center gap-1 min-w-0"><MapPin className="size-3.5 shrink-0" aria-hidden /> <span className="truncate max-w-[16rem]">{event.location}</span></span>}
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-px text-[11px] font-medium", info.tone)} aria-label={`Status: ${info.label}. What does this mean?`}>
                    {info.label} <Info className="size-3" aria-hidden />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 text-sm space-y-2">
                  <p className="font-medium">Status: {info.label}</p>
                  <p className="text-muted-foreground">{info.description}</p>
                  <p className="text-xs text-muted-foreground">Status is set by people who manage the event. It isn't changed by planning coverage or reviews.</p>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        <div className="order-last w-full lg:order-none lg:w-[22rem] xl:w-[26rem] flex items-center gap-2">
          {mobileNav}
          <SearchBox />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canEdit && <span className="hidden md:inline"><SaveIndicator /></span>}
          {!preview && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-9" aria-label="More event actions"><MoreHorizontal className="size-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onSelect={copyEventLink}><Link2 className="size-4" /> Copy link to event</DropdownMenuItem>
                {(canManage || isAdmin) && (
                  <DropdownMenuItem onSelect={() => setAccessOpen(true)}><Users className="size-4" /> People with access…</DropdownMenuItem>
                )}
                {canManage && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger><Settings2 className="size-4" /> Change status</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuRadioGroup value={event.stage} onValueChange={(v) => setStage(v as EventStage)}>
                        {STAGE_ORDER.map((s) => <DropdownMenuRadioItem key={s} value={s}>{STAGE_INFO[s].label}</DropdownMenuRadioItem>)}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {realIsAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Admin</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem checked={asStakeholder} onCheckedChange={onToggleStakeholder}>
                      <Eye className="size-4" /> Preview as external stakeholder
                    </DropdownMenuCheckboxItem>
                    {!asStakeholder && (
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmDelete(true)}>
                        <Trash2 className="size-4" /> Delete event…
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {canEdit && <div className="md:hidden w-full -mt-1 empty:hidden"><SaveIndicator /></div>}
      </div>

      {accessOpen && <AccessDialog open={accessOpen} onOpenChange={setAccessOpen} />}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{event.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the event and everything entered for it — text, tables, links, event-only fields and uploaded files, including earlier versions — for everyone. It can't be undone. The shared template isn't affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep event</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); void deleteEvent(); }}>
              {deleting ? "Deleting…" : "Delete event permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
