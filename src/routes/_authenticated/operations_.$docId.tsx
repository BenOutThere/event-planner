import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PlanReader, type PlanUrlState } from "@/components/ops/plan-reader";
import { EditPlanDialog, LinkEventDialog, type OpsCategory } from "@/components/ops/plan-dialogs";
import { canManageOps, canReadOps, parseSectionName } from "@/lib/operations";
import { OPS_DOC_COLS } from "@/lib/ops-files";
import type { EventOpsDoc } from "@/hooks/use-ops-search";

export const Route = createFileRoute("/_authenticated/operations_/$docId")({
  validateSearch: (s: Record<string, unknown>): PlanUrlState => ({
    ask: typeof s.ask === "string" && s.ask ? s.ask : undefined,
    sec: typeof s.sec === "string" && s.sec ? s.sec : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Operations plan — OTG Event Planner" },
      { name: "description", content: "Read an operations plan by section, search it for key words and ask it questions with section and page references." },
      { property: "og:title", content: "Operations plan — OTG Event Planner" },
      { property: "og:description", content: "Read an operations plan by section, search it for key words and ask it questions with section and page references." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanPage,
});

type PlanRow = EventOpsDoc & { events: { name: string } | null };

function PlanPage() {
  const { docId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/operations/$docId" });
  const { roles, user, loading } = useAuth();
  const canRead = canReadOps(roles);
  const canManage = canManageOps(roles);
  const userName = (user?.user_metadata as any)?.display_name ?? user?.email ?? null;
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const plan = useQuery({
    queryKey: ["ops-documents", "one", docId],
    enabled: !loading,
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_documents").select(`${OPS_DOC_COLS}, events(name)`).eq("id", docId).maybeSingle();
      if (error) throw error;
      return (data as unknown as PlanRow | null) ?? null;
    },
    refetchInterval: (q) => ((q.state.data as PlanRow | null | undefined)?.status === "pending" ? 3000 : false),
  });
  const cats = useQuery({
    queryKey: ["ops-categories"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_categories").select("id, name, sort_order").order("sort_order").order("name");
      if (error) throw error;
      return data as OpsCategory[];
    },
  });

  const go = (patch: PlanUrlState, opts?: { replace?: boolean }) =>
    navigate({ search: (s: PlanUrlState) => ({ ...s, ...patch }), replace: opts?.replace });
  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/operations"><ArrowLeft className="size-4" /> All operations plans</Link>
    </Button>
  );

  const doc = plan.data ?? null;
  const categories = cats.data ?? [];
  const recognised = doc?.sections?.length ?? 0;
  const expected = categories.filter((c) => parseSectionName(c.name)).length;
  const missing = categories.filter((c) => parseSectionName(c.name) && !(doc?.sections ?? []).some((x) => x.category_id === c.id));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-4">
      {back}
      {plan.isLoading || loading ? (
        <p className="rounded-xl border bg-card p-10 text-center text-muted-foreground" role="status">Loading operations plan…</p>
      ) : plan.error ? (
        <p className="rounded-xl border bg-card p-10 text-center text-muted-foreground">The operations plan couldn't be loaded. Check your connection and refresh.</p>
      ) : !doc ? (
        <p className="rounded-xl border bg-card p-10 text-center text-muted-foreground">
          {canRead ? "This operations plan doesn't exist any more, or you don't have access to it." : "Operations plans are available to Out There Group staff only."}
        </p>
      ) : (
        <>
          <PlanReader
            doc={doc}
            eyebrow={doc.event_id ? `Operations plan · ${doc.events?.name ?? "Event"}` : "Company-wide operations plan"}
            canManage={canManage}
            userName={userName}
            state={search}
            go={go}
            onEditDetails={() => setEditOpen(true)}
            onMoveToEvent={() => setLinkOpen(true)}
            onRemoved={() => navigate({ to: "/operations", search: {} as any })}
            note={canManage && doc.status === "indexed" && recognised > 0 && expected > 0 ? (
              <div className="text-xs text-muted-foreground mt-1">
                {recognised} of {expected} category sections recognised.
                {missing.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer">Sections not found ({missing.length})</summary>
                    <span className="block mt-1">{missing.map((c) => c.name).join("; ")}. Check the heading in the file matches the category name, then use Re-read text and sections.</span>
                  </details>
                )}
              </div>
            ) : null}
          />
          {canManage && <EditPlanDialog open={editOpen} onOpenChange={setEditOpen} doc={doc} categories={categories} onSaved={() => plan.refetch()} />}
          {canManage && <LinkEventDialog open={linkOpen} onOpenChange={setLinkOpen} doc={doc} onMoved={() => plan.refetch()} />}
        </>
      )}
    </div>
  );
}
