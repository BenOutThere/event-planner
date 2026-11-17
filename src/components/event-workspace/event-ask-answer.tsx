import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askEvent } from "@/lib/event-ask.functions";
import { eventFacts, pickFacts, type EventFact } from "@/lib/event-search";
import { keywordTerms } from "@/lib/ops-ask";
import { useWorkspace } from "./context";

/** AI answer to a question, written only from this event's information you can see. */
export function EventAskAnswer({ question }: { question: string }) {
  const w = useWorkspace();
  const ask = useServerFn(askEvent);
  const facts = useMemo(() => pickFacts(eventFacts(w.areas, w.getValue), keywordTerms(question)), [w.areas, w.getValue, question]);
  const byId = useMemo(() => new Map(facts.map((f) => [f.id, f])), [facts]);
  const q = useQuery({
    queryKey: ["event-ask", w.eventId, question],
    queryFn: () => ask({ data: { eventId: w.eventId, question, facts: facts.map((f) => ({ id: f.id, label: `${f.areaTitle} › ${f.sectionTitle} › ${f.fieldLabel}`.slice(0, 600), text: f.text })) } }),
    staleTime: Infinity, gcTime: 30 * 60 * 1000, retry: false, refetchOnWindowFocus: false,
  });
  const res = q.data;
  const open = (f: EventFact) => w.openArea(f.areaId, { field: f.refKey, row: f.row, keepQuery: true });

  return (
    <section aria-busy={q.isFetching} className="rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display font-semibold flex items-center gap-2 text-sm sm:text-base">
          <Sparkles className="size-4 text-accent shrink-0" aria-hidden /> Answer from this event's information
        </h3>
        {(q.isError || (res && !res.ok)) && <Button size="sm" variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}><RefreshCw className="size-3.5" /> Try again</Button>}
      </div>
      <p className="text-xs text-muted-foreground break-words">“{question}”</p>
      {q.isFetching ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Reading the event information…</p>
      ) : q.isError || !res ? (
        <p className="text-sm text-destructive">The answer couldn't be generated just now.</p>
      ) : !res.ok ? (
        <p className="text-sm text-destructive">{res.error}</p>
      ) : (
        <>
          <div className="space-y-2 text-sm leading-relaxed">
            {res.answer.replace(/\*\*/g, "").split("\n").map((l) => l.trim()).filter(Boolean).map((l, i) =>
              /^[-•*]\s+/.test(l) ? <p key={i} className="pl-4 relative before:content-['•'] before:absolute before:left-0">{l.replace(/^[-•*]\s+/, "")}</p> : <p key={i}>{l}</p>)}
          </div>
          {res.citations.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Where this comes from</p>
              <div className="flex flex-wrap gap-2">
                {res.citations.map((c) => { const f = byId.get(c.id); if (!f) return null; return (
                  <Button key={c.id} size="sm" variant="outline" className="h-auto py-1.5 text-left whitespace-normal" onClick={() => open(f)}>
                    <MapPin className="size-3.5 shrink-0" /> <span className="text-xs">{f.areaTitle} › {f.fieldLabel}{f.row !== undefined ? ` (row ${f.row + 1})` : ""}</span>
                  </Button>
                ); })}
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Written by AI from the information entered for this event. Check the linked fields before relying on it.</p>
        </>
      )}
    </section>
  );
}
