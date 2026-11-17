import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyEventAccess } from "@/hooks/use-event-access";
import { canEditLevel } from "@/lib/access";
import { EventWorkspace, parseWorkspaceSearch, type WorkspaceSearch } from "@/components/event-workspace/workspace";

export const Route = createFileRoute("/_authenticated/events/$id")({
  validateSearch: (s: Record<string, unknown>) => parseWorkspaceSearch(s),
  head: () => ({
    meta: [
      { title: "Event — OTG Event Planner" },
      { name: "description", content: "Event information shared across Out There Group departments." },
      { property: "og:title", content: "Event — OTG Event Planner" },
      { property: "og:description", content: "Event information shared across Out There Group departments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EventDetail,
});

function EventDetail() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/events/$id" });
  const { user, isAdmin } = useAuth();
  const access = useMyEventAccess();

  const event = useQuery({
    queryKey: ["event", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const sections = useQuery({
    queryKey: ["tpl-sections"],
    queryFn: async () => (await supabase.from("template_sections").select("*").order("sort_order")).data ?? [],
  });
  const fields = useQuery({
    queryKey: ["tpl-fields"],
    queryFn: async () => (await supabase.from("template_fields").select("*").order("sort_order")).data ?? [],
  });
  const values = useQuery({
    queryKey: ["event-values", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_field_values").select("*").eq("event_id", id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const extras = useQuery({
    queryKey: ["event-extras", id],
    queryFn: async () => (await supabase.from("event_section_extras").select("*").eq("event_id", id).order("sort_order")).data ?? [],
  });
  const customFields = useQuery({
    queryKey: ["event-custom-fields", id],
    queryFn: async () => (await supabase.from("event_custom_fields").select("*").eq("event_id", id).order("sort_order")).data ?? [],
  });
  const eventCount = useQuery({
    queryKey: ["events-count"],
    queryFn: async () => (await supabase.from("events").select("id", { count: "exact", head: true })).count ?? 0,
  });

  const loading = event.isLoading || sections.isLoading || fields.isLoading || values.isLoading || extras.isLoading || customFields.isLoading || access.isLoading;
  if (loading) return <div className="p-12 text-center text-muted-foreground" role="status">Loading event…</div>;
  if (event.error || values.error) return <div className="p-12 text-center">This event couldn't be loaded. Check your connection and refresh the page.</div>;
  if (!event.data) return <div className="p-12 text-center">Event not found, or you don't have access to it.</div>;

  // Access comes from the database (my_event_access), the same rules that protect the data.
  const level = access.data?.get(id)?.access ?? null;
  const canManageEvent = level === "manage";
  const canEdit = canEditLevel(level);

  const onSearchChange = (patch: Partial<WorkspaceSearch>, opts?: { replace?: boolean }) =>
    navigate({ search: (prev: WorkspaceSearch) => ({ ...prev, ...patch }), replace: opts?.replace });

  return (
    <EventWorkspace
      key={id}
      eventId={id}
      event={event.data as any}
      sections={(sections.data ?? []) as any[]}
      fields={(fields.data ?? []) as any[]}
      extras={(extras.data ?? []) as any[]}
      customFields={(customFields.data ?? []) as any[]}
      values={values.data as any[]}
      canEdit={canEdit}
      canManageEvent={canManageEvent}
      isAdmin={isAdmin}
      userId={user?.id ?? null}
      eventCount={eventCount.data ?? 0}
      search={search}
      onSearchChange={onSearchChange}
      onDeleted={() => navigate({ to: "/dashboard" })}
      backTo={{ to: "/dashboard", label: "All events" }}
    />
  );
}
