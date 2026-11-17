import { Type, ListTree, Link as LinkIcon, FileUp, Table as TableIcon, Phone, Mail, Calendar as CalendarIcon } from "lucide-react";

export const FIELD_KINDS = [
  { value: "text", label: "Text", icon: Type },
  { value: "kv", label: "Label & value list", icon: ListTree },
  { value: "links", label: "Document links", icon: LinkIcon },
  { value: "files", label: "File uploads", icon: FileUp },
  { value: "table", label: "Table", icon: TableIcon },
  { value: "phone", label: "Phone", icon: Phone },
  { value: "email", label: "Email", icon: Mail },
  { value: "date", label: "Date", icon: CalendarIcon },
] as const;

export type FieldKindValue = (typeof FIELD_KINDS)[number]["value"];

export function kindMeta(kind: string) {
  return FIELD_KINDS.find((k) => k.value === kind) ?? FIELD_KINDS[0];
}
