import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, Menu, X } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { EventSaverProvider, useSaver, useSaverRevision, type ServerRow } from "@/hooks/use-event-saver";
import { useAreaPermissions } from "@/hooks/use-event-access";
import { useAuth } from "@/hooks/use-auth";
import { buildEventStructure, type StructArea, type StructField } from "@/lib/event-structure";
import type { AreaMeta } from "@/lib/currency";
import { toDateOnly } from "@/lib/dates";
import { fieldDomId } from "@/components/fields/field-editor";
import { tableRowDomId } from "@/components/fields/table-field";
import {
  WorkspaceProvider, type Change, type DocTextRow, type EventRow, type Pin, type WorkspaceCtx, type WorkspaceSearch,
} from "./context";
import { EventHeader } from "./event-header";
import { EventNav, currentSectionLabel } from "./event-nav";
import { EventHome } from "./event-home";
import { AreaPanel } from "./area-panel";
import { DocumentsView } from "./documents-view";
import { SearchView } from "./search-view";
import { AttentionView } from "./attention-view";
import { StructureDialog } from "./structure-dialog";
import { AreaSettingsDialog } from "./area-settings-dialog";

export type { WorkspaceSearch } from "./context";
export { parseWorkspaceSearch } from "./context";

export type WorkspaceProps = {
  eventId: string;
  event: EventRow;
  sections: any[];
  fields: any[];
  extras: any[];
  customFields: any[];
  values: any[];
  canEdit: boolean;
  canManageEvent: boolean;
  isAdmin: boolean;
  userId: string | null;
  eventCount: number;
  preview?: boolean;
  search: WorkspaceSearch;
  onSearchChange: (patch: Partial<WorkspaceSearch>, opts?: { replace?: boolean }) => void;
  onDeleted?: () => void;
  backTo?: { to: string; label: string };
};

export function EventWorkspace(props: WorkspaceProps) {
  return (
    <EventSaverProvider eventId={props.eventId} preview={props.preview}>
      <WorkspaceInner {...props} />
    </EventSaverProvider>
  );
}

function WorkspaceInner(props: WorkspaceProps) {
  const { eventId, event, search, onSearchChange } = props;
  const preview = !!props.preview;
  const qc = useQueryClient();
  const { user } = useAuth();
  const saver = useSaver();
  // Feed server rows into the saver; newer versions win, unsaved edits stay on top.
  saver.hydrate(props.values as ServerRow[], true);
  useSaverRevision();

  const allAreas = useMemo(
    () => buildEventStructure({ sections: props.sections, fields: props.fields, extras: props.extras, customFields: props.customFields, values: props.values }),
    [props.sections, props.fields, props.extras, props.customFields, props.values],
  );
  const getValue = useCallback((f: StructField) => saver.getValue(f.ref), [saver]);

  const [asStakeholder, setAsStakeholder] = useState(false);
  const perms = useAreaPermissions(eventId, !preview);
  const areaPerms = perms.data ?? null;
  const areas = useMemo(() => allAreas.filter((a) => {
    const p = areaPerms?.get(a.id);
    if (p && !p.can_read) return false;
    if (asStakeholder && p?.restricted_to) return false;
    return true;
  }), [allAreas, areaPerms, asStakeholder]);

  const enabled = !preview;
  const metaQ = useQuery({ queryKey: ["area-meta", eventId], enabled, queryFn: async () => (await supabase.from("event_area_meta").select("*").eq("event_id", eventId)).data ?? [] });
  const pinsQ = useQuery({ queryKey: ["pins", eventId], enabled, queryFn: async () => (await supabase.from("event_pins").select("*").eq("event_id", eventId).order("sort_order").order("created_at")).data ?? [] });
  const changesQ = useQuery({ queryKey: ["changes", eventId], enabled, staleTime: 0, queryFn: async () => (await supabase.from("event_changes").select("*").eq("event_id", eventId).order("updated_at", { ascending: false }).limit(200)).data ?? [] });
  const profilesQ = useQuery({ queryKey: ["profiles-min"], enabled, queryFn: async () => (await supabase.from("profiles").select("id, display_name, email")).data ?? [] });
  const docTextQ = useQuery({ queryKey: ["doc-text", eventId], enabled, queryFn: async () => (await supabase.from("document_text").select("path, status, error, indexed_at").eq("event_id", eventId)).data ?? [] });

  const meta = useMemo(() => new Map<string, AreaMeta>((metaQ.data ?? []).map((m: any) => [m.area_id, m])), [metaQ.data]);
  const profiles = useMemo(() => new Map<string, string>((profilesQ.data ?? []).map((p: any) => [p.id, (p.display_name?.trim() || p.email) as string])), [profilesQ.data]);
  const docText = useMemo(() => new Map<string, DocTextRow>((docTextQ.data ?? []).map((d: any) => [d.path, d])), [docTextQ.data]);

  // An archived event is read-only for everyone (the database enforces this too).
  const archived = event.stage === "archived";
  const canEdit = props.canEdit && !asStakeholder && !archived;
  const canManage = props.canManageEvent && !asStakeholder && !archived;
  const canRestore = props.canManageEvent && !asStakeholder && archived;
  const isAdmin = props.isAdmin && !asStakeholder;

  // Give event content the width: tuck the main app menu away on larger screens.
  const sidebar = useSidebar();
  useEffect(() => {
    if (sidebar.isMobile) return;
    const was = sidebar.open;
    sidebar.setOpen(false);
    return () => { if (was) sidebar.setOpen(true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = search.view ?? (search.area ? "area" : "home");
  const active = view === "area" ? areas.find((a) => a.id === search.area || a.key === search.area) ?? null : null;

  // Reveal a linked field or table row.
  const [highlight, setHighlight] = useState<{ field: string; row?: number } | null>(null);
  useEffect(() => {
    if (view !== "area" || !search.field) return;
    const t = setTimeout(() => {
      const fid = fieldDomId(search.field!);
      const el = (search.row !== undefined ? document.getElementById(tableRowDomId(fid, search.row)) : null) ?? document.getElementById(fid);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlight({ field: search.field!, row: search.row });
        setTimeout(() => setHighlight(null), 4000);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [search.field, search.row, active?.id, view, search.edit]);

  // Scroll to top of content when switching section.
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (search.field) return;
    contentRef.current?.closest("main")?.scrollTo({ top: 0 });
  }, [view, active?.id]);

  // Search shortcut: "/" or Ctrl/Cmd+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        document.getElementById("event-search-input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Block leaving the event while edits are unsaved.
  const blocker = useBlocker({
    shouldBlockFn: async ({ current, next }) => {
      if (current.pathname === next.pathname) return false;
      if (!saver.hasUnsaved()) return false;
      await saver.flush();
      return saver.hasUnsaved();
    },
    enableBeforeUnload: false,
    withResolver: true,
  });

  const [navOpen, setNavOpen] = useState(false);
  const [structArea, setStructArea] = useState<StructArea | null>(null);
  const [settingsArea, setSettingsArea] = useState<StructArea | null>(null);

  const go = useCallback((patch: Partial<WorkspaceSearch>, opts?: { replace?: boolean }) => {
    onSearchChange(patch, opts);
    setNavOpen(false);
  }, [onSearchChange]);

  const ctx: WorkspaceCtx = {
    eventId, event, preview, areas, getValue, canEdit, canManage, archived, canRestore, isAdmin, asStakeholder,
    userId: props.userId,
    userName: (props.userId && profiles.get(props.userId)) || (user?.user_metadata as any)?.display_name || user?.email || "Someone",
    today: toDateOnly(new Date()),
    meta, areaPerms, profiles,
    pins: (pinsQ.data ?? []) as Pin[],
    changes: (changesQ.data ?? []) as Change[],
    docText,
    search,
    go,
    openArea: (areaId, o) => go({
      view: undefined, area: areaId, field: o?.field, row: o?.row, edit: o?.edit || undefined, doc: undefined, sec: undefined, ask: undefined,
      ...(o?.keepQuery ? {} : { q: undefined, scope: undefined, type: undefined }),
    }),
    absoluteLink: (params) => {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const qs = Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
      return `${origin}/events/${eventId}${qs ? `?${qs}` : ""}`;
    },
    areaUpdated: (area) => {
      let at: string | null = null, by: string | null = null;
      for (const s of area.sections) for (const f of s.fields) {
        const v: any = getValue(f);
        if (v?.updated_at && (!at || v.updated_at > at)) { at = v.updated_at; by = v.updated_by ? profiles.get(v.updated_by) ?? null : null; }
      }
      return { at, by };
    },
    invalidate: (what) => {
      const key = what === "meta" ? ["area-meta", eventId] : what === "pins" ? ["pins", eventId] : what === "changes" ? ["changes", eventId] : what === "docText" ? ["doc-text", eventId] : ["event", eventId];
      qc.invalidateQueries({ queryKey: key });
      if (what === "meta") qc.invalidateQueries({ queryKey: ["area-permissions", eventId] });
    },
    openStructure: (a) => setStructArea(a),
    openAreaSettings: (a) => setSettingsArea(a),
  };

  const nav = <EventNav />;
  const sectionLabel = currentSectionLabel(view, active, search);

  return (
    <WorkspaceProvider value={ctx}>
      <div className="min-h-full">
        <EventHeader
          backTo={props.backTo}
          onDeleted={props.onDeleted}
          realIsAdmin={props.isAdmin}
          onToggleStakeholder={() => { setAsStakeholder((v) => !v); go({ edit: undefined }); }}
          mobileNav={
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="lg:hidden min-h-10 max-w-[45%] justify-start gap-2" aria-label={`Event sections. Current: ${sectionLabel}`}>
                  <Menu className="size-4 shrink-0" aria-hidden /><span className="truncate">{sectionLabel}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto">
                <SheetHeader><SheetTitle>Event sections</SheetTitle></SheetHeader>
                <div className="px-3 pb-6">{nav}</div>
              </SheetContent>
            </Sheet>
          }
        />

        <div className="mx-auto max-w-[90rem] px-4 lg:px-6 py-5 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8">
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100vh-9.5rem)] overflow-y-auto pr-1 pb-6">{nav}</div>
          </aside>

          <div ref={contentRef} className="min-w-0 max-w-5xl space-y-4">
            {preview && (
              <div className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-sm flex items-center gap-2" role="note">
                <Eye className="size-4 shrink-0" aria-hidden />
                <span><strong>Template preview</strong> — this is how the template looks inside an event. Nothing typed here is saved.</span>
              </div>
            )}
            {asStakeholder && (
              <div className="rounded-md border border-info/40 bg-info/10 px-3 py-2 text-sm flex flex-wrap items-center gap-2" role="note">
                <Eye className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 min-w-[12rem]"><strong>Stakeholder preview</strong> — shown as an external stakeholder with view access: read-only, staff-only and manager-only areas hidden. This is a visual preview; the database rules are what actually protect information.</span>
                <Button size="sm" variant="outline" onClick={() => setAsStakeholder(false)}><X className="size-3.5" /> Exit preview</Button>
              </div>
            )}

            {view === "search" ? <SearchView />
              : view === "documents" ? <DocumentsView />
               
                : view === "attention" ? <AttentionView />
                  : view === "area" && active ? <AreaPanel area={active} highlight={highlight} />
                    : view === "area" ? (
                      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
                        This section isn't available. It may have been removed, or you may not have access to it.
                        <div className="mt-3"><Button variant="outline" size="sm" onClick={() => go({ area: undefined, view: undefined })}>Go to Event Home</Button></div>
                      </div>
                    ) : <EventHome />}
          </div>
        </div>

        {structArea && canEdit && !preview && (
          <StructureDialog
            open={!!structArea}
            onOpenChange={(o) => !o && setStructArea(null)}
            eventId={eventId}
            area={structArea}
            isAdmin={props.isAdmin}
            userId={props.userId}
            eventCount={props.eventCount}
          />
        )}
        {settingsArea && !preview && (
          <AreaSettingsDialog area={settingsArea} open={!!settingsArea} onOpenChange={(o) => !o && setSettingsArea(null)} />
        )}

        <AlertDialog open={blocker.status === "blocked"}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Some changes haven't saved</AlertDialogTitle>
              <AlertDialogDescription>
                We couldn't save every change to this event. If you leave now, those changes will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay and retry</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => blocker.proceed?.()}>
                Leave without saving
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </WorkspaceProvider>
  );
}
