import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askOpsPlan, type OpsAnswer } from "@/lib/ops-ask.functions";
import { cn } from "@/lib/utils";

export type Citation = Extract<OpsAnswer, { ok: true }>["citations"][number];

/** Plain-text answer: "- " lines become bullet points, the rest paragraphs. */
function AnswerText({ text }: { text: string }) {
  const blocks: Array<{ kind: "p" | "ul"; lines: string[] }> = [];
  for (const raw of text.replace(/\*\*/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^[-•*]\s+/.test(line);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.kind === "ul") last.lines.push(line.replace(/^[-•*]\s+/, ""));
      else blocks.push({ kind: "ul", lines: [line.replace(/^[-•*]\s+/, "")] });
    } else blocks.push({ kind: "p", lines: [line] });
  }
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((b, i) => b.kind === "ul"
        ? <ul key={i} className="list-disc pl-5 space-y-1">{b.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
        : <p key={i}>{b.lines[0]}</p>)}
    </div>
  );
}

/**
 * Answers a question from one operations plan, with the sections and pages it
 * comes from. Asked once per question (cached), never automatically retried.
 */
export function AskAnswer({ docId, question, onCite, className }: {
  docId: string; question: string; onCite: (c: Citation) => void; className?: string;
}) {
  const ask = useServerFn(askOpsPlan);
  const q = useQuery({
    queryKey: ["ops-ask", docId, question],
    queryFn: () => ask({ data: { docId, question } }),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const res = q.data;

  return (
    <section aria-labelledby="ops-answer-title" aria-busy={q.isFetching} className={cn("rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5 space-y-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <h3 id="ops-answer-title" className="font-display font-semibold flex items-center gap-2 text-sm sm:text-base">
          <Sparkles className="size-4 text-accent shrink-0" aria-hidden /> Answer from the operations plan
        </h3>
        {(q.isError || (res && !res.ok)) && (
          <Button size="sm" variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}><RefreshCw className="size-3.5" /> Try again</Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground break-words">“{question}”</p>

      {q.isFetching ? (
        <p className="text-sm text-muted-foreground inline-flex items-center gap-2" role="status"><Loader2 className="size-4 animate-spin" aria-hidden /> Reading the plan…</p>
      ) : q.isError ? (
        <p className="text-sm text-destructive">The answer couldn't be generated. Check your connection and try again — keyword results still work.</p>
      ) : res && !res.ok ? (
        <p className="text-sm text-destructive">{res.error}</p>
      ) : res && res.ok ? (
        <>
          <AnswerText text={res.answer} />
          {res.citations.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{res.found ? "Where this comes from" : "Closest parts of the plan"}</h4>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {res.citations.map((c, i) => (
                  <li key={`${c.start}-${i}`}>
                    <button type="button" onClick={() => onCite(c)}
                      className="w-full h-full text-left rounded-md border bg-card px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="flex items-center gap-1.5 text-xs font-medium">
                        <BookOpen className="size-3.5 shrink-0 text-primary" aria-hidden />
                        <span className="truncate">{c.code ? `${c.code} ${c.title}` : "Front pages"}</span>
                        {c.page && <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">p. {c.page}</span>}
                      </span>
                      {c.quote && <span className="mt-1 block text-xs text-muted-foreground italic line-clamp-2 break-words">“{c.quote}”</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Written by AI from the plan's text only. Check the cited sections before acting on it.</p>
        </>
      ) : null}
    </section>
  );
}
