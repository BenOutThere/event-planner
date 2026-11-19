// Checks for contact details typed into fields and table cells (R2).
// They warn; they never block saving, so nothing typed is lost.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailProblem(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  return EMAIL_RE.test(t) ? null : "That doesn't look like an email address.";
}

export function phoneProblem(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  if (/[^\d\s()+\-.]/.test(t)) return "Use digits, spaces, + and brackets only.";
  if (t.replace(/\D/g, "").length < 8) return "That looks too short for a phone number.";
  return null;
}

const EMAIL_COL = /e-?mail/i;
const PHONE_COL = /phone|mobile|\bmob\b|\bcell\b/i;
const PERSON_COL = /^(name|person|contact|team member|staff|lead|manager|owner|responsible|who)\b|\b(name|person|contact person)$/i;

export type ColumnKind = "email" | "tel" | "person" | "text";

export function columnKind(name: string): ColumnKind {
  if (EMAIL_COL.test(name)) return "email";
  if (PHONE_COL.test(name)) return "tel";
  if (PERSON_COL.test(name.trim()) && !/company|business|venue|event|supplier|organisation|organization/i.test(name)) return "person";
  return "text";
}

/** The warning for a table cell, from its column heading. */
export function cellProblem(column: string, value: string | null | undefined): string | null {
  const k = columnKind(column);
  if (k === "email") return emailProblem(value);
  if (k === "tel") return phoneProblem(value);
  return null;
}
