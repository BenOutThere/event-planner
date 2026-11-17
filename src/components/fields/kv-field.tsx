import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

type Row = { key: string; value: string };

export function KvDisplay({ rows }: { rows: Row[] }) {
  const usable = rows.filter((r) => r.value?.trim() || r.key?.trim());
  if (!usable.length) return <p className="text-sm text-muted-foreground">Nothing entered yet.</p>;
  return (
    <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {usable.map((r, i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{r.key || "—"}</dt>
          <dd className="break-words">{r.value || <span className="text-muted-foreground">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function KvField({
  value, onChange, onBlur, disabled, fieldLabel,
}: {
  value: Row[];
  onChange: (v: Row[], delay?: number) => void;
  onBlur?: () => void;
  disabled?: boolean;
  fieldLabel: string;
}) {
  const rows = Array.isArray(value) && value.length ? value : [{ key: "", value: "" }];
  const update = (i: number, patch: Partial<Row>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onBlur?.(); }}>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[minmax(8rem,14rem)_1fr_auto]">
          <Input aria-label={`${fieldLabel} — row ${i + 1} label`} placeholder="Label" value={r.key} disabled={disabled}
            onChange={(e) => update(i, { key: e.target.value })} />
          <Input aria-label={`${fieldLabel} — row ${i + 1} value`} placeholder="Value" value={r.value} disabled={disabled}
            onChange={(e) => update(i, { value: e.target.value })} />
          <Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label={`Remove row ${i + 1}`}
            onClick={() => onChange(rows.filter((_, idx) => idx !== i), 0)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" disabled={disabled}
        onClick={() => onChange([...rows, { key: "", value: "" }], 5000)}>
        <Plus className="size-4" /> Add row
      </Button>
    </div>
  );
}
