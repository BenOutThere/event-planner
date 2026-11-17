import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pageAt, type OpsSection } from "@/lib/operations";
import { chunkPlan, pickExcerpts } from "@/lib/ops-ask";

export type OpsAnswer =
  | {
    ok: true;
    found: boolean;
    answer: string;
    citations: Array<{ code: string | null; title: string | null; page: number | null; start: number; quote: string }>;
  }
  | { ok: false; error: string };

/**
 * Answers a question from one operations plan, quoting the sections and pages used.
 * Runs as the signed-in person, so they can only ask about plans they can read.
 */
export const askOpsPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ docId: z.string().uuid(), question: z.string().trim().min(3).max(500) }).parse(input))
  .handler(async ({ data, context }): Promise<OpsAnswer> => {
    const { data: doc, error } = await context.supabase
      .from("ops_documents")
      .select("id, title, status, content, sections, pages, event_id, events(name)")
      .eq("id", data.docId)
      .maybeSingle();
    if (error || !doc) return { ok: false, error: "That operations plan couldn't be found, or you don't have access to it." };
    if (doc.status !== "indexed" || !doc.content) return { ok: false, error: "This plan's text isn't readable yet, so questions can't be answered from it." };

    const sections = ((doc.sections as unknown) ?? []) as OpsSection[];
    const pages = (doc.pages as unknown as number[] | null) ?? null;
    const excerpts = pickExcerpts(chunkPlan(doc.content, sections, pages), data.question);
    if (!excerpts.length) {
      return { ok: true, found: false, answer: "The plan doesn't mention the words in this question. Try different words, or browse the sections.", citations: [] };
    }

    const eventName = (doc as any).events?.name as string | undefined;
    const label = (e: (typeof excerpts)[number]) =>
      [e.section ? `Section ${e.section.code} ${e.section.title}` : "Front pages", e.page ? `page ${e.page}` : null].filter(Boolean).join(", ");
    const context_ = excerpts.map((e) => `[${e.id}] (${label(e)})\n${e.text}`).join("\n\n---\n\n");

    const { askForAnswer, AiNotConfiguredError, isRateLimit } = await import("@/lib/ai.server");
    try {
      const parsed = await askForAnswer(
          `You answer questions from staff about ${eventName ? `the ${eventName} ` : "an "}event operations plan ("${doc.title}"). ` +
          "Use ONLY the numbered excerpts provided. Never add rules, numbers, names or procedures that aren't in them. " +
          "If the excerpts don't answer the question, set found to false and say briefly what the plan does cover that is closest. " +
          "Write in plain Australian English, concise: a one-sentence summary, then short bullet points (lines starting with '- ') where helpful. " +
          "Don't say anything is approved, safe or ready unless the excerpt says so. " +
          "In citations, list the ids of the excerpts you relied on (most important first) with a short exact quote from each.",
        `Question: ${data.question}\n\nExcerpts from the plan:\n\n${context_}`,
      );
      if (!parsed) return { ok: false, error: "The assistant couldn't answer this question." };

      const byId = new Map(excerpts.map((e) => [e.id, e]));
      const seen = new Set<string>();
      const citations = (parsed.citations ?? [])
        .map((c) => ({ c, e: byId.get(c.id) }))
        .filter((x): x is { c: { id: string; quote: string }; e: (typeof excerpts)[number] } => !!x.e && !seen.has(x.c.id) && !!seen.add(x.c.id))
        .slice(0, 6)
        .map(({ c, e }) => {
          // Point at the quoted words when they're really in the plan, else the start of the passage.
          const at = c.quote ? doc.content!.indexOf(c.quote.slice(0, 60), e.start) : -1;
          const start = at >= 0 && at < e.start + e.text.length + 60 ? at : e.start;
          return { code: e.section?.code ?? null, title: e.section?.title ?? null, page: pageAt(pages, start) ?? e.page, start, quote: c.quote };
        });
      return { ok: true, found: !!parsed.found, answer: String(parsed.answer ?? "").trim(), citations };
    } catch (e) {
      if (e instanceof AiNotConfiguredError) return { ok: false, error: "AI answers aren't set up yet. Keyword results below still work." };
      if (isRateLimit(e)) return { ok: false, error: "Too many questions are being asked right now. Wait a minute and try again." };
      if (e instanceof SyntaxError) return { ok: false, error: "The answer couldn't be read. Try asking again." };
      console.error("askOpsPlan failed", (e as Error)?.message);
      return { ok: false, error: "The answer couldn't be generated just now. Keyword results below still work." };
    }
  });
