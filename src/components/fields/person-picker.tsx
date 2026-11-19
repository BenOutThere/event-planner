import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PersonValue = { userId: string | null; name: string };

const NOBODY = "__none";
const OTHER = "__other";

/**
 * Pick an OTG person (an Event Planner user), or type someone else's name.
 * Picking a person stores their id, so their name stays right if it changes.
 */
export function PersonPicker({
  id, people, value, onChange, allowOther = true, noneLabel = "Nobody", ariaLabel,
}: {
  id?: string;
  people: Array<{ id: string; name: string }>;
  value: PersonValue;
  onChange: (v: PersonValue) => void;
  allowOther?: boolean;
  noneLabel?: string;
  ariaLabel?: string;
}) {
  const known = value.userId && people.some((p) => p.id === value.userId);
  const [other, setOther] = useState(!value.userId && !!value.name.trim());
  const selected = known ? value.userId! : other ? OTHER : NOBODY;
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-2">
      <Select value={selected} onValueChange={(v) => {
        if (v === OTHER) { setOther(true); onChange({ userId: null, name: value.userId ? "" : value.name }); }
        else if (v === NOBODY) { setOther(false); onChange({ userId: null, name: "" }); }
        else { setOther(false); onChange({ userId: v, name: people.find((p) => p.id === v)?.name ?? "" }); }
      }}>
        <SelectTrigger id={id} aria-label={ariaLabel}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NOBODY}>{noneLabel}</SelectItem>
          {sorted.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          {allowOther && <SelectItem value={OTHER}>Someone else (type a name)…</SelectItem>}
        </SelectContent>
      </Select>
      {selected === OTHER && (
        <Input aria-label="Name or team" value={value.name} onChange={(e) => onChange({ userId: null, name: e.target.value })} placeholder="Name or team" />
      )}
    </div>
  );
}
