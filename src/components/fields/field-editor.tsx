import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Link2, Loader2, Mail, Phone, RotateCw, Info, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useFieldValue } from "@/hooks/use-event-saver";
import { fieldState } from "@/lib/coverage";
import type { StructField } from "@/lib/event-structure";
import { formatAuDate } from "@/lib/dates";
import { mapUrl } from "@/lib/event-home";
import { DateField } from "./date-field";
import { LinksField, LinksDisplay } from "./links-field";
import { KvField, KvDisplay } from "./kv-field";
import { FilesField, FilesDisplay } from "./files-field";
import { TableField, TableDisplay } from "./table-field";
import { asTable } from "@/lib/coverage";
import { cn } from "@/lib/utils";

export function fieldDomId(refKey: string) {
  return `field-${refKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

const KIND_COLUMN: Record<string, "value_text" | "value_kv" | "value_links" | "value_table"> = {
  text: "value_text", phone: "value_text", email: "value_text", date: "value_text",
  kv: "value_kv", links: "value_links", files: "value_links", table: "value_table",
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function phoneProblem(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (/[^\d\s()+\-.]/.test(t)) return "Use digits, spaces, + and brackets only.";
  if (t.replace(/\D/g, "").length < 8) return "That looks too short for a phone number.";
  return null;
}

const isAddressField = (f: StructField) => /address/i.test(`${f.key} ${f.label}`);

/** Information saved while the field had a different type. Never discarded. */
function legacyData(kind: string, v: any): string | null {
  if (!v) return null;
  const own = KIND_COLUMN[kind];
  if (own !== "value_text" && v.value_text && String(v.value_text).trim()) return String(v.value_text);
  if (own !== "value_table") {
    const t = asTable(v.value_table);
    if (t && t.rows.some((r) => r.some((c) => c.trim()))) return t.rows.filter((r) => r.some((c) => c.trim())).map((r) => r.filter(Boolean).join(" · ")).join("\n");
  }
  if (own !== "value_kv" && Array.isArray(v.value_kv) && v.value_kv.some((r: any) => r?.value)) return v.value_kv.map((r: any) => `${r.key}: ${r.value}`).join("\n");
  if (own !== "value_links" && Array.isArray(v.value_links) && v.value_links.some((l: any) => l?.url || l?.path)) return v.value_links.map((l: any) => l.label || l.url).join("\n");
  return null;
}

/** Plain text with web addresses made clickable. */
export function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p)
          ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 break-all">{p}</a>
          : <span key={i}>{p}</span>,
      )}
    </>
  );
}

const NotProvided = () => <p className="text-sm text-muted-foreground">Not provided yet</p>;

export function FieldEditor({
  field, eventId, areaId, canEdit, mode = "edit", highlighted, highlightRow, showHelp, linkFor, hideLabel,
}: {
  /** In reading view, visually hide a label that only repeats the section heading. */
  hideLabel?: boolean;
  field: StructField;
  eventId: string;
  areaId?: string;
  /** The person may edit this event. */
  canEdit: boolean;
  /** "read" shows clean text; "edit" shows inputs (only when canEdit). */
  mode?: "read" | "edit";
  highlighted?: boolean;
  highlightRow?: number | null;
  showHelp?: boolean;
  linkFor?: (refKey: string) => string;
}) {
  const f = useFieldValue(field.ref, { label: field.label, kind: field.kind });
  const v: any = f.value ?? {};
  const state = fieldState(field, f.value);
  const na = state.na;
  const editing = canEdit && mode === "edit";
  const disabled = !editing || na;
  const domId = fieldDomId(field.refKey);
  const inputId = `${domId}-input`;
  const legacy = legacyData(field.kind, f.value);
  const [touched, setTouched] = useState(false);

  const setText = (text: string, delay?: number) => f.set({ value_text: text }, delay);

  async function copyLink() {
    if (!linkFor) return;
    try {
      await navigator.clipboard.writeText(linkFor(field.refKey));
      toast.success("Link to this item copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  }

  const text: string = v.value_text ?? "";
  let body: React.ReactNode = null;

  if (!editing) {
    switch (field.kind) {
      case "text":
        body = text.trim() ? (
          <div className="space-y-1">
            <p className="text-sm whitespace-pre-wrap break-words leading-relaxed"><LinkifiedText text={text.trim()} /></p>
            {isAddressField(field) && (
              <a href={mapUrl(text.trim())} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline underline-offset-2 inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> Open map
              </a>
            )}
          </div>
        ) : <NotProvided />;
        break;
      case "phone":
        body = text.trim()
          ? <a href={`tel:${text.replace(/[^\d+]/g, "")}`} className="text-sm text-primary underline underline-offset-2 inline-flex items-center gap-1"><Phone className="size-3.5" aria-hidden /> {text}</a>
          : <NotProvided />;
        break;
      case "email":
        body = text.trim()
          ? <a href={`mailto:${text.trim()}`} className="text-sm text-primary underline underline-offset-2 inline-flex items-center gap-1 break-all"><Mail className="size-3.5" aria-hidden /> {text.trim()}</a>
          : <NotProvided />;
        break;
      case "date":
        body = text ? <p className="text-sm">{formatAuDate(text)}</p> : <NotProvided />;
        break;
      case "kv":
        body = <KvDisplay rows={v.value_kv ?? []} />;
        break;
      case "links":
        body = <LinksDisplay links={v.value_links ?? []} emptyText="No links added yet" />;
        break;
      case "files":
        body = <FilesDisplay files={v.value_links ?? []} emptyText="No files uploaded yet" />;
        break;
      case "table": {
        const t = asTable(v.value_table) ?? asTable(field.default_table);
        body = t ? <TableDisplay table={t} label={field.label} domId={domId} highlightRow={highlightRow} /> : <NotProvided />;
        break;
      }
    }
  } else {
    switch (field.kind) {
      case "text":
        body = field.multiline ? (
          <Textarea id={inputId} rows={3} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={f.flush} placeholder="Add details…" />
        ) : (
          <Input id={inputId} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={f.flush} />
        );
        break;
      case "phone": {
        const problem = touched ? phoneProblem(text) : null;
        body = (
          <div className="space-y-1">
            <Input id={inputId} type="tel" inputMode="tel" autoComplete="tel" value={text} disabled={disabled} aria-invalid={!!problem}
              aria-describedby={problem ? `${inputId}-err` : undefined}
              onChange={(e) => setText(e.target.value)} onBlur={() => { setTouched(true); f.flush(); }} placeholder="e.g. 0412 345 678" className="sm:max-w-xs" />
            {problem && <p id={`${inputId}-err`} className="text-xs text-destructive">{problem}</p>}
          </div>
        );
        break;
      }
      case "email": {
        const bad = touched && text.trim() && !EMAIL_RE.test(text.trim());
        body = (
          <div className="space-y-1">
            <Input id={inputId} type="email" inputMode="email" autoComplete="email" value={text} disabled={disabled}
              aria-invalid={!!bad} aria-describedby={bad ? `${inputId}-err` : undefined}
              onChange={(e) => setText(e.target.value)} onBlur={() => { setTouched(true); f.flush(); }} placeholder="name@example.com" className="sm:max-w-sm" />
            {bad && <p id={`${inputId}-err`} className="text-xs text-destructive">That doesn't look like an email address.</p>}
          </div>
        );
        break;
      }
      case "date":
        body = <DateField id={inputId} ariaLabel={field.label} value={text || null} disabled={disabled} onChange={(d) => f.set({ value_text: d }, 0)} />;
        break;
      case "kv":
        body = <KvField fieldLabel={field.label} value={v.value_kv ?? []} disabled={disabled} onChange={(rows, d) => f.set({ value_kv: rows }, d)} onBlur={f.flush} />;
        break;
      case "links":
        body = <LinksField fieldLabel={field.label} canEdit disabled={disabled} value={v.value_links ?? []} onChange={(rows, d) => f.set({ value_links: rows }, d)} onBlur={f.flush} />;
        break;
      case "files":
        body = <FilesField fieldLabel={field.label} eventId={eventId} areaId={areaId} canEdit disabled={disabled} preview={f.preview} value={v.value_links ?? []} onChange={(files) => f.set({ value_links: files }, 0)} />;
        break;
      case "table":
        body = <TableField fieldLabel={field.label} value={asTable(v.value_table)} defaults={field.default_table} disabled={disabled}
          requiredColumns={field.table_rules?.required_columns ?? []} domId={domId} highlightRow={highlightRow}
          onChange={(tv, d) => f.set({ value_table: tv }, d)} onBlur={f.flush} />;
        break;
    }
  }

  return (
    <div
      id={domId}
      className={cn(
        "group relative scroll-mt-32 rounded-lg px-3 -mx-3 transition-colors",
        editing ? "py-3" : "py-2",
        highlighted && "bg-accent/10 ring-2 ring-accent/60",
      )}
    >
      <div className={cn("flex flex-wrap items-start justify-between gap-x-3 gap-y-1", hideLabel && !editing ? "sr-only" : "mb-1")}>
        <div className="min-w-0">
          <label
            htmlFor={editing && ["text", "phone", "email", "date"].includes(field.kind) ? inputId : undefined}
            className={cn(editing ? "text-sm font-medium" : hideLabel ? "sr-only" : "text-xs font-semibold uppercase tracking-wide text-muted-foreground")}
          >
            {field.label}
            {editing && field.is_required && <span className="text-destructive"> *<span className="sr-only"> (required)</span></span>}
          </label>
          {editing && showHelp && field.help_text && <p className="text-xs text-muted-foreground mt-0.5">{field.help_text}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {editing && field.scope === "event" && <Badge variant="outline" className="text-[10px] font-normal">This event only</Badge>}
          {field.archived && <Badge variant="outline" className="text-[10px] font-normal">Removed from template</Badge>}
          {editing && f.status.saving && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" aria-hidden />Saving…</span>}
          {editing && state.required && !state.requirementMet && (
            <span className="text-[11px] text-destructive font-medium">{state.detail ?? "Required"}</span>
          )}
          {editing && state.required && state.requirementMet && state.detail && (
            <span className="text-[11px] text-muted-foreground">{state.detail}</span>
          )}
          {linkFor && !(hideLabel && !editing) && (
            <Button type="button" size="icon" variant="ghost"
              className={cn("size-7", !editing && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
              onClick={copyLink} aria-label={`Copy link to ${field.label}`}>
              <Link2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {na ? (
        <p className="text-sm text-muted-foreground italic">Not applicable for this event</p>
      ) : body}

      {legacy && (
        <div className="mt-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium"><Info className="size-3.5" aria-hidden /> Kept from when this field was a different type</div>
          <p className="whitespace-pre-wrap mt-1 text-foreground/80">{legacy}</p>
        </div>
      )}

      {editing && field.allow_na && (
        <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Checkbox checked={!!v.not_applicable} onCheckedChange={(c) => f.set({ not_applicable: c === true }, 0)} />
          Not applicable for this event
        </label>
      )}

      {f.status.conflict && (
        <ConflictNotice onKeepMine={() => f.resolveConflict("mine")} onUseTheirs={() => f.resolveConflict("theirs")} />
      )}
      {f.status.error && !f.status.conflict && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          <AlertTriangle className="size-3.5" aria-hidden />
          <span className="flex-1">Couldn't save this field. Your changes are kept on this page.</span>
          <Button size="sm" variant="outline" className="h-7" onClick={f.flush}><RotateCw className="size-3.5" /> Retry</Button>
        </div>
      )}
    </div>
  );
}

function ConflictNotice({ onKeepMine, onUseTheirs }: { onKeepMine: () => void; onUseTheirs: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-2 rounded-md border border-warning/50 bg-warning/15 px-3 py-2 text-xs space-y-2" role="alert">
      <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="size-3.5" aria-hidden /> Someone else changed the same information while you were editing.</p>
      <p className="text-muted-foreground">Your version hasn't been saved and is still shown here. Choose which version to keep.</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => { setBusy(true); onUseTheirs(); }}>Use their version</Button>
        <Button size="sm" className="h-7" disabled={busy} onClick={() => { setBusy(true); onKeepMine(); }}>Keep my version</Button>
      </div>
    </div>
  );
}
