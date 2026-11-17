import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { keywordTerms } from "@/lib/ops-ask";
import { OPS_DOC_COLS } from "@/lib/ops-files";
import { sectionHits, type OpsSection } from "@/lib/operations";

export type OpsHit = {
  key: string;
  docId: string;
  title: string;
  fileName: string;
  docCategoryId: string | null;
  docCategoryName: string | null;
  /** The event this plan belongs to (null = company-wide plan). */
  eventId: string | null;
  eventName: string | null;
  /** Section of a large plan the match is in (null = front pages, undefined = whole document). */
  section?: OpsSection | null;
  snippet: string | null;
  count: number;
  page: number | null;
};

type Meta = { id: string; status: string; sections: OpsSection[] | null; pages: number[] | null; updated_at: string };

/** Light details of every plan: which have recognised sections, and their page offsets. */
export function useOpsMeta(enabled: boolean) {
  return useQuery({
    queryKey: ["ops-documents", "meta"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_documents").select("id, status, sections, pages, updated_at");
      if (error) throw error;
      return new Map(((data ?? []) as unknown as Meta[]).map((d) => [d.id, d]));
    },
  });
}

/** Full extracted text of one plan (cached; refreshed when the plan changes). */
export function opsFullQuery(id: string, updatedAt: string | undefined) {
  return {
    queryKey: ["ops-documents", "full", id, updatedAt],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_documents").select("content, sections, pages").eq("id", id).maybeSingle();
      if (error) throw error;
      return {
        content: (data?.content as string | null) ?? "",
        sections: ((data?.sections as unknown as OpsSection[] | null) ?? []),
        pages: (data?.pages as unknown as number[] | null) ?? null,
      };
    },
  };
}

/**
 * Searches operations plans: company-wide plans, plus one event's own plan
 * (`eventId`) or every event plan the person can see (`allEvents`). Questions are
 * reduced to their key words. Plans with recognised sections return one hit per
 * matching section (with page), others one hit per plan.
 */
export function useOpsHits(q: string, enabled: boolean, opts: { eventId?: string; allEvents?: boolean } = {}) {
  const words = keywordTerms(q.trim());
  const dq = words.join(" ");
  const on = enabled && dq.length >= 2;
  const rpc = useQuery({
    queryKey: ["ops-search", dq, opts.eventId ?? null, !!opts.allEvents],
    enabled: on,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_ops_documents", { _q: dq, _event_id: opts.eventId, _all_events: !!opts.allEvents });
      if (error) throw error;
      return data ?? [];
    },
  });
  const meta = useOpsMeta(on);
  const sectioned = (rpc.data ?? [])
    .filter((r) => r.snippet && meta.data?.get(r.id)?.status === "indexed" && (meta.data?.get(r.id)?.sections?.length ?? 0) > 0)
    .slice(0, 5);
  const full = useQueries({ queries: sectioned.map((r) => ({ ...opsFullQuery(r.id, meta.data?.get(r.id)?.updated_at), enabled: on })) });
  const fullKey = full.map((f) => f.dataUpdatedAt).join(",");

  const hits = useMemo(() => {
    const terms = words;
    const out: OpsHit[] = [];
    for (const r of rpc.data ?? []) {
      const base = { docId: r.id, title: r.title, fileName: r.file_name, docCategoryId: r.category_id, docCategoryName: r.category_name, eventId: r.event_id, eventName: r.event_name };
      const i = sectioned.findIndex((s) => s.id === r.id);
      const f = i >= 0 ? full[i]?.data : undefined;
      const groups = f ? sectionHits(f.content, f.sections, f.pages, terms) : [];
      if (groups.length) {
        for (const g of groups) out.push({ ...base, key: `${r.id}|${g.section?.code ?? "front"}`, section: g.section, snippet: g.snippet, count: g.count, page: g.page });
      } else {
        out.push({ ...base, key: r.id, snippet: r.snippet ? `…${r.snippet.replace(/\s+/g, " ").trim()}…` : null, count: r.snippet ? 1 : 0, page: null });
      }
    }
    return out;
  }, [rpc.data, fullKey, dq]);

  return { hits, terms: words, isFetching: rpc.isFetching || meta.isFetching || full.some((f) => f.isFetching), ready: on };
}

export type EventOpsDoc = {
  id: string; title: string; description: string | null; category_id: string | null; file_name: string;
  file_size: number | null; status: string; error: string | null; storage_path: string;
  uploaded_by_name: string | null; created_at: string; updated_at: string;
  sections: OpsSection[] | null; pages: number[] | null; event_id: string | null;
};

/** An event's own overall operations plan (null when it hasn't been added). */
export function useEventOpsPlan(eventId: string, enabled = true) {
  return useQuery({
    queryKey: ["event-ops-plan", eventId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_documents").select(OPS_DOC_COLS).eq("event_id", eventId).maybeSingle();
      if (error) throw error;
      return (data as unknown as EventOpsDoc | null) ?? null;
    },
    refetchInterval: (query) => ((query.state.data as EventOpsDoc | null | undefined)?.status === "pending" ? 3000 : false),
  });
}
