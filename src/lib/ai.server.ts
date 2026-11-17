// AI answers for "Ask the operations plan" and "Ask about this event".
// Written by Claude from passages the app has already picked (and the person
// is allowed to see), returned as JSON so the app can attach citations.
//
// Needs ANTHROPIC_API_KEY (the same key the Control Centre's search bar uses).
// ASK_MODEL can override the model (e.g. claude-sonnet-5-5 for cheaper answers).
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ASK_MODEL || "claude-opus-5-5";

export class AiNotConfiguredError extends Error {}

export type AnswerJson = { found: boolean; answer: string; citations: Array<{ id: string; quote: string }> };

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "answer", "citations"],
  properties: {
    found: { type: "boolean" },
    answer: { type: "string" },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "quote"],
        properties: { id: { type: "string" }, quote: { type: "string" } },
      },
    },
  },
} as const;

/**
 * Asks Claude for a grounded answer. Returns null when Claude declines to answer.
 * Throws AiNotConfiguredError when no key is set, and Anthropic.APIError on API failures.
 */
export async function askForAnswer(instructions: string, userContent: string): Promise<AnswerJson | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiNotConfiguredError("AI answers aren't set up yet: ANTHROPIC_API_KEY is missing (see SETUP.md).");
  }
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: ANSWER_SCHEMA } },
    system: instructions,
    messages: [{ role: "user", content: userContent }],
  });
  if (response.stop_reason === "refusal") return null;
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as AnswerJson;
}

export function isRateLimit(e: unknown) {
  return e instanceof Anthropic.RateLimitError;
}
