import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EventAnswer =
  | { ok: true; found: boolean; answer: string; citations: Array<{ id: string; quote: string }> }
  | { ok: false; error: string };

const Fact = z.object({ id: z.string().max(12), label: z.string().max(600), text: z.string().max(1600) });

/**
 * Answers a question from one event's saved information. The browser sends only the
 * facts it already shows the signed-in person, so answers never include hidden areas.
 */
export const askEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    eventId: z.string().uuid(),
    question: z.string().trim().min(3).max(500),
    facts: z.array(Fact).max(2000),
  }).parse(input))
  .handler(async ({ data, context }): Promise<EventAnswer> => {
    const { data: ev } = await context.supabase.from("events").select("id, name").eq("id", data.eventId).maybeSingle();
    if (!ev) return { ok: false, error: "That event couldn't be found, or you don't have access to it." };
    if (!data.facts.length) return { ok: true, found: false, answer: "No information has been entered for this event yet.", citations: [] };
    const ctx = data.facts.map((f) => `[${f.id}] ${f.label}: ${f.text}`).join("\n");
    const { askForAnswer, AiNotConfiguredError, isRateLimit } = await import("@/lib/ai.server");
    try {
      const parsed = await askForAnswer(
          `You answer staff questions about the event "${ev.name}" using ONLY the numbered facts from its event plan. ` +
          "Never invent names, numbers, dates, times or procedures. If the facts don't answer the question, set found to false and briefly say what related information exists. " +
          "Plain Australian English, concise: a one-sentence summary, then short bullet points (lines starting with '- ') where helpful. " +
          "Don't say anything is approved, safe or ready unless a fact says so. In citations list the fact ids you used (most important first) with a short quote.",
        `Question: ${data.question}\n\nFacts:\n${ctx}`,
      );
      if (!parsed) return { ok: false, error: "The assistant couldn't answer this question." };
      const ids = new Set(data.facts.map((f) => f.id));
      const seen = new Set<string>();
      const citations = (parsed.citations ?? []).filter((c) => ids.has(c.id) && !seen.has(c.id) && !!seen.add(c.id)).slice(0, 6);
      return { ok: true, found: !!parsed.found, answer: String(parsed.answer ?? "").trim(), citations };
    } catch (e) {
      if (e instanceof AiNotConfiguredError) return { ok: false, error: "AI answers aren't set up yet. Keyword results below still work." };
      if (isRateLimit(e)) return { ok: false, error: "Too many questions are being asked right now. Wait a minute and try again." };
      if (e instanceof SyntaxError) return { ok: false, error: "The answer couldn't be read. Try asking again." };
      console.error("askEvent failed", (e as Error)?.message);
      return { ok: false, error: "The answer couldn't be generated just now. Keyword results below still work." };
    }
  });
