// Autosave for event content.
//
// One saver per open event. Every field edit goes through `queue()`; the saver
// debounces, serialises saves per field, checks for conflicting edits by
// someone else (row version), keeps unsaved edits after failures, and exposes
// one status for the whole event: Saving… / Saved at HH:MM / Couldn't save.

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { refKey as toRefKey, type ValueRef } from "@/lib/event-structure";
import { autoMerge } from "@/lib/merge";

export type ValuePatch = {
  value_text?: string | null;
  value_kv?: any;
  value_links?: any;
  value_table?: any;
  not_applicable?: boolean;
};

export type ServerRow = ValuePatch & {
  id: string;
  version: number;
  updated_at?: string;
  section_id: string | null;
  extra_section_id: string | null;
  field_key: string;
  label?: string | null;
  kind?: string;
};

type Entry = {
  ref: ValueRef;
  meta: { label: string; kind: string };
  row: ServerRow | null;
  pending: ValuePatch | null;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
  error: string | null;
  conflict: ServerRow | null;
};

export type SaverStatus = {
  state: "idle" | "saving" | "saved" | "error" | "conflict" | "preview";
  savedAt: Date | null;
  failed: number;
  conflicts: number;
};

export class EventSaver {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private revision = 0;
  private savedAt: Date | null = null;
  private status: SaverStatus = { state: "idle", savedAt: null, failed: 0, conflicts: 0 };

  constructor(public eventId: string, public preview = false) {
    if (preview) this.status = { ...this.status, state: "preview" };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getRevision = () => this.revision;
  getStatus = () => this.status;

  private emit() {
    this.revision++;
    let saving = false, failed = 0, conflicts = 0;
    for (const e of this.entries.values()) {
      if (e.inFlight || e.timer) saving = true;
      if (e.error) failed++;
      if (e.conflict) conflicts++;
    }
    const state: SaverStatus["state"] = this.preview
      ? "preview"
      : conflicts ? "conflict" : failed ? "error" : saving ? "saving" : this.savedAt ? "saved" : "idle";
    this.status = { state, savedAt: this.savedAt, failed, conflicts };
    this.listeners.forEach((l) => l());
  }

  private entry(ref: ValueRef, meta?: { label: string; kind: string }): Entry {
    const k = toRefKey(ref);
    let e = this.entries.get(k);
    if (!e) {
      e = { ref, meta: meta ?? { label: ref.field_key, kind: "text" }, row: null, pending: null, timer: null, inFlight: null, error: null, conflict: null };
      this.entries.set(k, e);
    } else if (meta) e.meta = meta;
    return e;
  }

  /** Feed rows loaded from the server; newer versions win unless the user has unsaved edits. */
  hydrate(rows: ServerRow[], silent = false) {
    let changed = false;
    for (const r of rows) {
      const e = this.entry({ section_id: r.section_id, extra_section_id: r.extra_section_id, field_key: r.field_key });
      if (!e.row || (r.version ?? 0) > (e.row.version ?? 0)) {
        if (e.pending && e.row && !e.conflict) {
          // Someone else saved while we have unsaved edits: combine non-overlapping changes, otherwise ask.
          const merged = autoMerge(e.row as any, e.pending as any, r as any);
          if (merged) { e.pending = Object.keys(merged).length ? merged : null; e.row = r; }
          else e.conflict = r;
        } else if (!e.conflict) {
          e.row = r;
        }
        changed = true;
      }
    }
    if (changed && !silent) this.emit();
  }

  /** The value to show: unsaved edits merged over the latest known saved row. */
  getValue(ref: ValueRef): (ValuePatch & { id?: string }) | null {
    const e = this.entries.get(toRefKey(ref));
    if (!e) return null;
    if (!e.row && !e.pending) return null;
    return { ...(e.row ?? {}), ...(e.pending ?? {}) };
  }

  fieldStatus(ref: ValueRef) {
    const e = this.entries.get(toRefKey(ref));
    return {
      saving: !!(e?.inFlight || e?.timer),
      error: e?.error ?? null,
      conflict: e?.conflict ?? null,
      dirty: !!e?.pending,
    };
  }

  queue(ref: ValueRef, meta: { label: string; kind: string }, patch: ValuePatch, delay = 700) {
    const e = this.entry(ref, meta);
    e.pending = { ...(e.pending ?? {}), ...patch };
    e.error = null;
    if (this.preview) { this.emit(); return; }
    if (e.timer) clearTimeout(e.timer);
    e.timer = setTimeout(() => { e.timer = null; void this.run(e); }, delay);
    this.emit();
  }

  async flush(ref?: ValueRef) {
    const list = ref ? [this.entries.get(toRefKey(ref))].filter(Boolean) as Entry[] : [...this.entries.values()];
    await Promise.all(list.map(async (e) => {
      if (e.timer) { clearTimeout(e.timer); e.timer = null; }
      if (e.inFlight) await e.inFlight;
      if (e.pending && !e.conflict) await this.run(e);
    }));
  }

  retryAll() {
    for (const e of this.entries.values()) if (e.error) e.error = null;
    return this.flush();
  }

  hasUnsaved() {
    if (this.preview) return false;
    for (const e of this.entries.values()) if (e.pending || e.inFlight) return true;
    return false;
  }

  resolveConflict(ref: ValueRef, choice: "mine" | "theirs") {
    const e = this.entries.get(toRefKey(ref));
    if (!e || !e.conflict) return;
    e.row = e.conflict;
    e.conflict = null;
    if (choice === "theirs") {
      e.pending = null;
      this.emit();
    } else {
      this.emit();
      void this.run(e);
    }
  }

  private run(e: Entry): Promise<void> {
    if (e.inFlight) {
      // A save is already running: the newest edits stay pending and are saved after it.
      return e.inFlight.then(() => (e.pending && !e.conflict ? this.run(e) : undefined));
    }
    if (!e.pending || e.conflict) return Promise.resolve();
    const p = this.save(e).finally(() => {
      e.inFlight = null;
      this.emit();
      if (e.pending && !e.error && !e.conflict && !e.timer) void this.run(e);
    });
    e.inFlight = p;
    this.emit();
    return p;
  }

  private async save(e: Entry, attempt = 0): Promise<void> {
    const sending = e.pending!;
    const payload: any = { ...sending, label: e.meta.label, kind: e.meta.kind };
    try {
      let saved: ServerRow | null = null;
      if (e.row?.id) {
        const { data, error } = await supabase
          .from("event_field_values")
          .update(payload)
          .eq("id", e.row.id)
          .eq("version", e.row.version)
          .select("*")
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          // Someone else saved since we loaded this field (or it was removed).
          const latest = await this.fetchRow(e.ref);
          if (latest) {
            if (samePayload(latest, sending)) { e.row = latest; clearSent(e, sending); return; }
            // Different parts changed (e.g. different table rows): combine and save again.
            const merged = attempt < 3 && e.pending ? autoMerge(e.row as any, e.pending as any, latest as any) : null;
            if (merged) {
              e.row = latest;
              e.pending = Object.keys(merged).length ? merged : null;
              if (!e.pending) { this.savedAt = new Date(); return; }
              return this.save(e, attempt + 1);
            }
            e.conflict = latest;
            return;
          }
          e.row = null;
          return this.save(e, attempt + 1);
        }
        saved = data as any;
      } else {
        const { data, error } = await supabase
          .from("event_field_values")
          .insert({ id: crypto.randomUUID(), event_id: this.eventId, ...e.ref, ...payload })
          .select("*")
          .single();
        if (error) {
          if ((error as any).code === "23505") {
            const latest = await this.fetchRow(e.ref);
            if (latest) {
              const merged = attempt < 3 && e.pending ? autoMerge(null, e.pending as any, latest as any) : null;
              if (merged) {
                e.row = latest;
                e.pending = Object.keys(merged).length ? merged : null;
                if (!e.pending) { this.savedAt = new Date(); return; }
                return this.save(e, attempt + 1);
              }
              e.conflict = latest;
              return;
            }
          }
          throw error;
        }
        saved = data as any;
      }
      e.row = saved;
      clearSent(e, sending);
      e.error = null;
      this.savedAt = new Date();
    } catch (err: any) {
      e.error = err?.message ?? "Couldn't save";
    }
  }

  private async fetchRow(ref: ValueRef): Promise<ServerRow | null> {
    let q = supabase.from("event_field_values").select("*").eq("event_id", this.eventId).eq("field_key", ref.field_key);
    q = ref.section_id ? q.eq("section_id", ref.section_id) : q.is("section_id", null);
    q = ref.extra_section_id ? q.eq("extra_section_id", ref.extra_section_id) : q.is("extra_section_id", null);
    const { data } = await q.maybeSingle();
    return (data as any) ?? null;
  }
}

function samePayload(row: any, patch: ValuePatch) {
  return Object.entries(patch).every(([k, v]) => JSON.stringify(row?.[k] ?? null) === JSON.stringify(v ?? null));
}

/** Remove the parts of `pending` that were just saved, keeping any newer edits. */
function clearSent(e: Entry, sent: ValuePatch) {
  if (!e.pending) return;
  const rest: any = { ...e.pending };
  for (const [k, v] of Object.entries(sent)) {
    if (JSON.stringify(rest[k]) === JSON.stringify(v)) delete rest[k];
  }
  e.pending = Object.keys(rest).length ? rest : null;
}

const Ctx = createContext<EventSaver | null>(null);

export function EventSaverProvider({ eventId, preview, children }: { eventId: string; preview?: boolean; children: ReactNode }) {
  const ref = useRef<EventSaver | null>(null);
  if (!ref.current || ref.current.eventId !== eventId) ref.current = new EventSaver(eventId, !!preview);
  const saver = ref.current;
  useEffect(() => {
    const onUnload = (ev: BeforeUnloadEvent) => {
      if (saver.hasUnsaved()) { ev.preventDefault(); ev.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [saver]);
  return <Ctx.Provider value={saver}>{children}</Ctx.Provider>;
}

export function useSaver() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSaver must be used inside EventSaverProvider");
  return s;
}

/** Re-render on any saver change; returns the revision number. */
export function useSaverRevision() {
  const s = useSaver();
  return useSyncExternalStore(s.subscribe, s.getRevision, s.getRevision);
}

export function useSaverStatus() {
  const s = useSaver();
  return useSyncExternalStore(s.subscribe, s.getStatus, s.getStatus);
}

/** Value + save helpers for one field. */
export function useFieldValue(ref: ValueRef, meta: { label: string; kind: string }) {
  const s = useSaver();
  useSaverRevision();
  const value = s.getValue(ref);
  const status = s.fieldStatus(ref);
  return useMemo(() => ({
    value,
    status,
    set: (patch: ValuePatch, delay?: number) => s.queue(ref, meta, patch, delay),
    flush: () => s.flush(ref),
    resolveConflict: (c: "mine" | "theirs") => s.resolveConflict(ref, c),
    preview: s.preview,
  }), [value, status.saving, status.error, status.conflict, status.dirty, s, ref.section_id, ref.extra_section_id, ref.field_key, meta.label, meta.kind]);
}
