import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, Link2, Pencil, Plus, Trash2, Check } from "lucide-react";
import { linkHost, linkTitle, validateUrl, type LinkItem } from "@/lib/links";
import { newDocId, STATUS_INFO, type DocRecord } from "@/lib/documents";
import { formatAuTimestampDate } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Link = LinkItem & DocRecord;

export function LinksDisplay({ links, emptyText = "No links added yet." }: { links: Link[]; emptyText?: string }) {
  const usable = (Array.isArray(links) ? links : []).filter((l) => l.url && validateUrl(l.url) === null && l.status !== "superseded");
  if (usable.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="space-y-1.5">
      {usable.map((l, i) => (
        <li key={l.id ?? i} className="flex items-center gap-3 rounded-md border bg-background px-3 py-2">
          <Link2 className="size-4 text-muted-foreground shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium break-words flex flex-wrap items-center gap-1.5">
              {linkTitle(l)}
              {l.version && <span className="text-xs font-normal text-muted-foreground">{l.version}</span>}
              {l.status && l.status !== "current" && <Badge variant="outline" className={cn("text-[10px] font-normal", STATUS_INFO[l.status].tone)}>{STATUS_INFO[l.status].label}</Badge>}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              External link · {linkHost(l.url)}{l.checked_at ? ` · Link checked ${formatAuTimestampDate(l.checked_at)}${l.checked_by_name ? ` by ${l.checked_by_name}` : ""}` : ""}
            </div>
            {l.description && <p className="text-xs text-foreground/80 mt-0.5">{l.description}</p>}
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <a href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${linkTitle(l)} in a new tab`}>
              Open <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function LinksField({
  value, onChange, onBlur, canEdit, disabled, fieldLabel,
}: {
  value: Link[];
  onChange: (v: Link[], delay?: number) => void;
  onBlur?: () => void;
  canEdit: boolean;
  disabled?: boolean;
  fieldLabel: string;
}) {
  const links = Array.isArray(value) ? value : [];
  const hasLinks = links.some((l) => l.url?.trim());
  const [editing, setEditing] = useState(!hasLinks);
  const [touched, setTouched] = useState<Record<number, boolean>>({});

  if (!canEdit || (!editing && hasLinks)) {
    return (
      <div className="space-y-2">
        <LinksDisplay links={links} />
        {canEdit && !disabled && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> Edit links
          </Button>
        )}
      </div>
    );
  }

  const rows: Link[] = links.length ? links : [{ id: newDocId(), label: "", url: "" }];
  const update = (i: number, patch: Partial<Link>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, id: r.id ?? newDocId(), ...patch } : r)));

  return (
    <div className="space-y-2" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onBlur?.(); }}>
      {rows.map((r, i) => {
        const err = touched[i] && r.url.trim() ? validateUrl(r.url) : null;
        return (
          <div key={r.id ?? i} className="grid gap-2 sm:grid-cols-[minmax(8rem,14rem)_1fr_auto] items-start">
            <Input
              aria-label={`${fieldLabel} — link ${i + 1} title`}
              placeholder="Title (e.g. Ticketing structure v3)"
              value={r.label}
              disabled={disabled}
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <div>
              <Input
                aria-label={`${fieldLabel} — link ${i + 1} web address`}
                aria-invalid={!!err}
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={r.url}
                disabled={disabled}
                onChange={(e) => update(i, { url: e.target.value })}
                onBlur={() => setTouched((t) => ({ ...t, [i]: true }))}
              />
              {err && <p className="text-xs text-destructive mt-1">{err}</p>}
            </div>
            <Button
              type="button" size="icon" variant="ghost" disabled={disabled}
              aria-label={`Remove link ${i + 1}`}
              onClick={() => onChange(rows.filter((_, idx) => idx !== i), 0)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled}
          onClick={() => onChange([...rows, { id: newDocId(), label: "", url: "" }], 5000)}>
          <Plus className="size-4" /> Add another link
        </Button>
        {hasLinks && (
          <Button type="button" size="sm" variant="ghost" onClick={() => { onBlur?.(); setEditing(false); }}>
            <Check className="size-4" /> Done
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        A saved link points to the document — it doesn't confirm the document is accessible, current or approved.
      </p>
    </div>
  );
}
