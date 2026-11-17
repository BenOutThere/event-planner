import { createContext, useContext } from "react";
import type { StructArea, StructField } from "@/lib/event-structure";
import type { AreaMeta } from "@/lib/currency";
import type { AreaPermission } from "@/hooks/use-event-access";
import type { EventStage } from "@/lib/event-status";

export type WorkspaceView = "home" | "area" | "documents" | "search" | "attention" | "ops";

export type WorkspaceSearch = {
  view?: "home" | "documents" | "search" | "attention" | "ops";
  area?: string;
  field?: string;
  row?: number;
  edit?: boolean;
  q?: string;
  scope?: "event" | "all";
  type?: string;
  doc?: string;
  incomplete?: boolean;
  /** Operations plan: section code being read, and the search/question typed there. */
  sec?: string;
  ask?: string;
};

/** Lenient parser for the event page's URL parameters (unknown values are dropped). */
export function parseWorkspaceSearch(s: Record<string, unknown>): WorkspaceSearch {
  const str = (v: unknown) => (typeof v === "string" && v.length ? v : typeof v === "number" ? String(v) : undefined);
  const view = str(s.view);
  const row = typeof s.row === "number" ? s.row : typeof s.row === "string" && /^\d+$/.test(s.row) ? Number(s.row) : undefined;
  return {
    view: view && ["home", "documents", "search", "attention", "ops"].includes(view) ? (view as WorkspaceSearch["view"]) : undefined,
    area: str(s.area),
    field: str(s.field),
    row,
    edit: s.edit === true || s.edit === "true" ? true : undefined,
    q: str(s.q),
    scope: s.scope === "all" ? "all" : undefined,
    type: str(s.type),
    doc: str(s.doc),
    incomplete: s.incomplete === true || s.incomplete === "true" ? true : undefined,
    sec: str(s.sec),
    ask: str(s.ask),
  };
}

export type EventRow = {
  id: string;
  name: string;
  proposed_date: string | null;
  end_date: string | null;
  location: string | null;
  stage: EventStage;
  lead_user_id?: string | null;
  created_by?: string | null;
  workspace_links?: unknown;
  updated_at?: string;
};

export type Pin = { id: string; pin_kind: "area" | "field" | "document"; target: string; label: string; area_id: string | null; sort_order: number };
export type Change = {
  id: string; area_id: string | null; section_id: string | null; extra_section_id: string | null; field_key: string | null;
  field_label: string | null; change_kind: string; summary: string | null; changed_by_name: string | null; updated_at: string;
};
export type DocTextRow = { path: string; status: string; error: string | null; indexed_at: string };

export type WorkspaceCtx = {
  eventId: string;
  event: EventRow;
  preview: boolean;
  areas: StructArea[];
  getValue: (f: StructField) => any;
  canEdit: boolean;
  canManage: boolean;
  isAdmin: boolean;
  asStakeholder: boolean;
  userId: string | null;
  userName: string;
  today: string;
  meta: Map<string, AreaMeta>;
  areaPerms: Map<string, AreaPermission> | null;
  profiles: Map<string, string>;
  pins: Pin[];
  changes: Change[];
  docText: Map<string, DocTextRow>;
  search: WorkspaceSearch;
  go: (patch: Partial<WorkspaceSearch>, opts?: { replace?: boolean }) => void;
  openArea: (areaId: string, opts?: { field?: string; row?: number; edit?: boolean; keepQuery?: boolean }) => void;
  absoluteLink: (params: Record<string, string | number | undefined>) => string;
  areaUpdated: (area: StructArea) => { at: string | null; by: string | null };
  invalidate: (what: "meta" | "pins" | "changes" | "docText" | "event") => void;
  openStructure: (area: StructArea) => void;
  openAreaSettings: (area: StructArea) => void;
};

const Ctx = createContext<WorkspaceCtx | null>(null);
export const WorkspaceProvider = Ctx.Provider;
export function useWorkspace() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWorkspace must be used inside the event workspace");
  return c;
}
