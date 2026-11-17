import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { EventWorkspace, parseWorkspaceSearch, type WorkspaceSearch } from "@/components/event-workspace/workspace";

export const Route = createFileRoute("/_authenticated/admin/template-preview")({
  validateSearch: (s: Record<string, unknown>) => parseWorkspaceSearch(s),
  head: () => ({
    meta: [
      { title: "Template preview — OTG Event Planner" },
      { name: "description", content: "Preview how the shared event template looks inside an event." },
      { property: "og:title", content: "Template preview — OTG Event Planner" },
      { property: "og:description", content: "Preview how the shared event template looks inside an event." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TemplatePreview,
});

function TemplatePreview() {
  const { isAdmin, loading } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/template-preview" });
  const sections = useQuery({
    queryKey: ["tpl-sections"],
    queryFn: async () => (await supabase.from("template_sections").select("*").order("sort_order")).data ?? [],
  });
  const fields = useQuery({
    queryKey: ["tpl-fields"],
    queryFn: async () => (await supabase.from("template_fields").select("*").order("sort_order")).data ?? [],
  });

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  return (
    <EventWorkspace
      eventId="preview"
      preview
      event={{ id: "preview", name: "Sample event", proposed_date: null, end_date: null, location: "Sample venue", stage: "draft" }}
      sections={((sections.data ?? []) as any[]).filter((s) => s.is_active)}
      fields={((fields.data ?? []) as any[]).filter((f) => !f.archived_at)}
      extras={[]}
      customFields={[]}
      values={[]}
      canEdit
      canManageEvent={false}
      isAdmin
      userId={null}
      eventCount={0}
      search={search}
      onSearchChange={(patch: Partial<WorkspaceSearch>, opts) => navigate({ search: (prev: WorkspaceSearch) => ({ ...prev, ...patch }), replace: opts?.replace })}
      backTo={{ to: "/admin/templates", label: "Back to template builder" }}
    />
  );
}
