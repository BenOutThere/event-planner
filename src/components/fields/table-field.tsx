import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowDown, ArrowUp, Columns3, LayoutList, MoreHorizontal, Pencil, Plus, Rows3, Table as TableIcon, Trash2, Mail, Phone,
} from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { asTable, type TableValue } from "@/lib/coverage";
import { cn } from "@/lib/utils";

const EMAIL_COL = /e-?mail/i;
const PHONE_COL = /phone|mobile|\bmob\b|\bcell\b/i;
const EMAIL_VAL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function colType(name: string): "email" | "tel" | "text" {
  if (EMAIL_COL.test(name)) return "email";
  if (PHONE_COL.test(name)) return "tel";
  return "text";
}

/** Render a saved cell; emails and phone numbers become tappable links. */
export function CellText({ value, column }: { value: string; column: string }) {
  const v = (value ?? "").trim();
  if (!v) return <span className="text-muted-foreground">—</span>;
  const t = colType(column);
  if (t === "email" || EMAIL_VAL.test(v)) {
    return <a href={`mailto:${v}`} className="text-primary underline underline-offset-2 break-all inline-flex items-center gap-1"><Mail className="size-3 shrink-0" aria-hidden />{v}</a>;
  }
  if (t === "tel" && /[0-9]{3,}/.test(v)) {
    return <a href={`tel:${v.replace(/[^\d+]/g, "")}`} className="text-primary underline underline-offset-2 inline-flex items-center gap-1"><Phone className="size-3 shrink-0" aria-hidden />{v}</a>;
  }
  return <span className="whitespace-pre-wrap break-words">{v}</span>;
}

export function tableRowDomId(domId: string, row: number) {
  return `${domId}-row-${row}`;
}

export function TableDisplay({ table, label, domId, highlightRow }: { table: TableValue; label: string; domId?: string; highlightRow?: number | null }) {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const indexed = table.rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((c) => c?.trim()));
  if (!indexed.length) return <p className="text-sm text-muted-foreground">Nothing entered yet.</p>;
  const terms = filter.toLowerCase().split(/\s+/).filter(Boolean);
  let rows = terms.length ? indexed.filter(({ r }) => terms.every((t) => r.join(" ").toLowerCase().includes(t))) : indexed;
  if (sort) rows = rows.slice().sort((a, b) => (a.r[sort.col] ?? "").localeCompare(b.r[sort.col] ?? "", "en", { numeric: true, sensitivity: "base" }) * sort.dir);
  const rowId = (i: number) => (domId ? tableRowDomId(domId, i) : undefined);
  const hl = (i: number) => highlightRow === i && "bg-accent/15 ring-2 ring-inset ring-accent/60";
  const tools = indexed.length > 5 && (
    <div className="flex items-center gap-2 mb-2">
      <Input aria-label={`Filter ${label}`} placeholder={`Filter ${indexed.length} rows…`} value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 max-w-xs" />
      {terms.length > 0 && <span className="text-xs text-muted-foreground" role="status">{rows.length} of {indexed.length}</span>}
    </div>
  );
  if (isMobile) {
    return (
      <div>
        {tools}
        <ul className="space-y-2" aria-label={label}>
          {rows.map(({ r, i }) => (
            <li key={i} id={rowId(i)} className={cn("rounded-md border bg-background p-3 scroll-mt-32", hl(i))}>
              <dl className="space-y-1 text-sm">
                {table.columns.map((c, ci) => (r[ci] ?? "").trim() ? (
                  <div key={ci} className="grid grid-cols-[7rem_1fr] gap-2">
                    <dt className="text-muted-foreground">{c}</dt>
                    <dd className="min-w-0"><CellText value={r[ci] ?? ""} column={c} /></dd>
                  </div>
                ) : null)}
              </dl>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div>
      {tools}
      <div className="overflow-x-auto rounded-md border" role="region" aria-label={label} tabIndex={0}>
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr>{table.columns.map((c, i) => (
              <th key={i} scope="col" aria-sort={sort?.col === i ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="text-left font-semibold px-3 py-2 min-w-[9rem]">
                <button type="button" className="inline-flex items-center gap-1 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  onClick={() => setSort((s) => (s?.col === i ? (s.dir === 1 ? { col: i, dir: -1 } : null) : { col: i, dir: 1 }))}>
                  {c}{sort?.col === i ? (sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />) : null}
                  <span className="sr-only">, sort</span>
                </button>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map(({ r, i }) => (
              <tr key={i} id={rowId(i)} className={cn("border-t align-top scroll-mt-32", hl(i))}>
                {table.columns.map((c, ci) => <td key={ci} className="px-3 py-2"><CellText value={r[ci] ?? ""} column={c} /></td>)}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={table.columns.length} className="px-3 py-4 text-sm text-muted-foreground text-center">No rows match “{filter}”.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { inputRef?: (el: HTMLTextAreaElement | null) => void }) {
  const { inputRef, className, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return (
    <textarea
      ref={(el) => { ref.current = el; inputRef?.(el); }}
      rows={1}
      className={cn(
        "block w-full resize-none bg-transparent px-3 py-2 text-sm leading-snug outline-none",
        "focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        "disabled:opacity-60",
        className,
      )}
      {...rest}
    />
  );
}

export function TableField({
  value, defaults, onChange, onBlur, disabled, fieldLabel, requiredColumns = [], domId, highlightRow,
}: {
  domId?: string;
  highlightRow?: number | null;
  value: TableValue | null;
  defaults?: TableValue | null;
  onChange: (v: TableValue, delay?: number) => void;
  onBlur?: () => void;
  disabled?: boolean;
  fieldLabel: string;
  requiredColumns?: string[];
}) {
  const isMobile = useIsMobile();
  const [view, setView] = useState<"auto" | "table" | "cards">("auto");
  const [editRow, setEditRow] = useState<number | null>(null);
  const [manageCols, setManageCols] = useState(false);
  const [newCols, setNewCols] = useState(3);
  const [newRows, setNewRows] = useState(3);
  const cells = useRef(new Map<string, HTMLTextAreaElement>());
  const [focusReq, setFocusReq] = useState<{ r: number; c: number } | null>(null);

  const table = asTable(value) ?? asTable(defaults);
  useEffect(() => {
    if (!focusReq) return;
    cells.current.get(`${focusReq.r}:${focusReq.c}`)?.focus();
    setFocusReq(null);
  }, [focusReq]);

  if (!table) {
    return (
      <div className="rounded-md border border-dashed p-3 space-y-2">
        <p className="text-sm text-muted-foreground">This table hasn't been set up yet. Choose a starting size — you can add rows and columns later.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="new-cols" className="text-xs">Columns</Label>
            <Input id="new-cols" type="number" min={1} max={20} value={newCols} onChange={(e) => setNewCols(parseInt(e.target.value) || 1)} className="w-20" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-rows" className="text-xs">Rows</Label>
            <Input id="new-rows" type="number" min={1} max={50} value={newRows} onChange={(e) => setNewRows(parseInt(e.target.value) || 1)} className="w-20" />
          </div>
          <Button type="button" size="sm" disabled={disabled} onClick={() => {
            const c = Math.max(1, Math.min(20, newCols));
            const r = Math.max(1, Math.min(50, newRows));
            onChange({ columns: Array.from({ length: c }, (_, i) => `Column ${i + 1}`), rows: Array.from({ length: r }, () => Array(c).fill("")) }, 0);
          }}>
            <TableIcon className="size-4" /> Create table
          </Button>
        </div>
      </div>
    );
  }

  const t = table;
  const isReq = (c: string) => requiredColumns.some((r) => r.trim().toLowerCase() === c.trim().toLowerCase());
  const setCell = (r: number, c: number, v: string) =>
    onChange({ columns: t.columns, rows: t.rows.map((row, ri) => (ri === r ? t.columns.map((_, ci) => (ci === c ? v : row[ci] ?? "")) : row)) });
  const blankRow = () => Array(t.columns.length).fill("");
  const addRow = (at = t.rows.length) => {
    const rows = t.rows.slice();
    rows.splice(at, 0, blankRow());
    onChange({ columns: t.columns, rows }, 0);
    return at;
  };
  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= t.rows.length) return;
    const rows = t.rows.slice();
    [rows[i], rows[j]] = [rows[j], rows[i]];
    onChange({ columns: t.columns, rows }, 0);
  };
  const deleteRow = (i: number) => {
    const before = t;
    onChange({ columns: t.columns, rows: t.rows.filter((_, ri) => ri !== i) }, 0);
    toast("Row deleted", { action: { label: "Undo", onClick: () => onChange(before, 0) } });
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, r: number, c: number) => {
    const el = e.currentTarget;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd = el.selectionStart === el.value.length;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (r + 1 >= t.rows.length) addRow();
      setFocusReq({ r: r + 1, c });
    } else if (e.key === "ArrowDown" && atEnd && r + 1 < t.rows.length) {
      e.preventDefault(); setFocusReq({ r: r + 1, c });
    } else if (e.key === "ArrowUp" && atStart && r > 0) {
      e.preventDefault(); setFocusReq({ r: r - 1, c });
    }
  };

  const RowMenu = ({ i }: { i: number }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label={`Row ${i + 1} actions`} className="size-8">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setEditRow(i)}><Pencil className="size-4" /> Edit row</DropdownMenuItem>
        <DropdownMenuItem disabled={i === 0} onSelect={() => moveRow(i, -1)}><ArrowUp className="size-4" /> Move up</DropdownMenuItem>
        <DropdownMenuItem disabled={i === t.rows.length - 1} onSelect={() => moveRow(i, 1)}><ArrowDown className="size-4" /> Move down</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { addRow(i + 1); setEditRow(i + 1); }}><Plus className="size-4" /> Insert row below</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => deleteRow(i)}><Trash2 className="size-4" /> Delete row</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const showCards = view === "cards" || (view === "auto" && isMobile);

  return (
    <div className="space-y-2" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onBlur?.(); }}>
      {showCards ? (
        <ul className="space-y-2" aria-label={fieldLabel}>
          {t.rows.map((row, ri) => (
            <li key={ri} id={domId ? tableRowDomId(domId, ri) : undefined} className={cn("rounded-md border bg-background p-3 space-y-2 scroll-mt-32", highlightRow === ri && "ring-2 ring-accent/60 bg-accent/10")}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Row {ri + 1}</span>
                <RowMenu i={ri} />
              </div>
              {t.columns.map((c, ci) => (
                <div key={ci} className="space-y-1">
                  <Label htmlFor={`card-${ri}-${ci}`} className="text-xs">{c}{isReq(c) && <span className="text-destructive" aria-label="required"> *</span>}</Label>
                  <Input id={`card-${ri}-${ci}`} type={colType(c)} inputMode={colType(c) === "text" ? undefined : colType(c) as any}
                    value={row[ci] ?? ""} disabled={disabled} onChange={(e) => setCell(ri, ci, e.target.value)} />
                </div>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-md border" role="region" aria-label={fieldLabel}>
          <table className="w-full text-sm border-collapse">
            <thead className="bg-muted/60">
              <tr>
                {t.columns.map((c, i) => (
                  <th key={i} scope="col" className="text-left font-semibold px-3 py-2 min-w-[10rem] border-b">
                    {c}{isReq(c) && <span className="text-destructive" aria-label="required"> *</span>}
                  </th>
                ))}
                <th scope="col" className="w-10 border-b"><span className="sr-only">Row actions</span></th>
              </tr>
            </thead>
            <tbody>
              {t.rows.map((row, ri) => (
                <tr key={ri} id={domId ? tableRowDomId(domId, ri) : undefined} className={cn("border-b last:border-b-0 align-top hover:bg-muted/20 scroll-mt-32", highlightRow === ri && "bg-accent/15 ring-2 ring-inset ring-accent/60")}>
                  {t.columns.map((c, ci) => (
                    <td key={ci} className="p-0 border-r last:border-r-0">
                      <AutoTextarea
                        aria-label={`${c}, row ${ri + 1}`}
                        inputMode={colType(c) === "text" ? undefined : colType(c) as any}
                        value={row[ci] ?? ""}
                        disabled={disabled}
                        onChange={(e) => setCell(ri, ci, e.target.value)}
                        onKeyDown={(e) => onKey(e, ri, ci)}
                        inputRef={(el) => { if (el) cells.current.set(`${ri}:${ci}`, el); else cells.current.delete(`${ri}:${ci}`); }}
                      />
                    </td>
                  ))}
                  <td className="px-1 py-1 text-right"><RowMenu i={ri} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => { const at = addRow(); if (!showCards) setFocusReq({ r: at, c: 0 }); }}>
          <Plus className="size-4" /> Add row
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setManageCols(true)}>
          <Columns3 className="size-4" /> Manage columns
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setView(showCards ? "table" : "cards")}>
          {showCards ? <><Rows3 className="size-4" /> Table view</> : <><LayoutList className="size-4" /> Card view</>}
        </Button>
        {!showCards && <span className="text-xs text-muted-foreground hidden md:inline">Enter moves down a row · Shift+Enter adds a new line</span>}
      </div>

      <RowEditor
        open={editRow !== null}
        onOpenChange={(o) => { if (!o) { setEditRow(null); onBlur?.(); } }}
        table={t}
        rowIndex={editRow ?? 0}
        onCell={setCell}
        fieldLabel={fieldLabel}
        isReq={isReq}
      />
      <ColumnManager open={manageCols} onOpenChange={setManageCols} table={t} onApply={(next) => onChange(next, 0)} />
    </div>
  );
}

function RowEditor({
  open, onOpenChange, table, rowIndex, onCell, fieldLabel, isReq,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  table: TableValue;
  rowIndex: number;
  onCell: (r: number, c: number, v: string) => void;
  fieldLabel: string;
  isReq: (c: string) => boolean;
}) {
  const row = table.rows[rowIndex] ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{fieldLabel} — row {rowIndex + 1}</DialogTitle>
          <DialogDescription>Changes save automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {table.columns.map((c, ci) => {
            const t = colType(c);
            return (
              <div key={ci} className="space-y-1">
                <Label htmlFor={`row-${ci}`}>{c}{isReq(c) && <span className="text-destructive" aria-label="required"> *</span>}</Label>
                {t === "text" ? (
                  <Textarea id={`row-${ci}`} rows={2} value={row[ci] ?? ""} onChange={(e) => onCell(rowIndex, ci, e.target.value)} />
                ) : (
                  <Input id={`row-${ci}`} type={t} inputMode={t as any} value={row[ci] ?? ""} onChange={(e) => onCell(rowIndex, ci, e.target.value)} />
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter><Button onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColumnManager({
  open, onOpenChange, table, onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  table: TableValue;
  onApply: (t: TableValue) => void;
}) {
  // Each column keeps a pointer to its original index so values move with it.
  const [cols, setCols] = useState<Array<{ name: string; from: number | null }>>([]);
  useEffect(() => {
    if (open) setCols(table.columns.map((name, i) => ({ name, from: i })));
  }, [open]);

  const filledIn = (from: number | null) => from === null ? 0 : table.rows.filter((r) => (r[from] ?? "").trim()).length;
  const removed = table.columns.map((_, i) => i).filter((i) => !cols.some((c) => c.from === i));
  const lostCells = removed.reduce((n, i) => n + filledIn(i), 0);

  function apply() {
    const usable = cols.filter((c) => c.name.trim());
    if (!usable.length) { toast.error("A table needs at least one column."); return; }
    onApply({
      columns: usable.map((c) => c.name.trim()),
      rows: table.rows.map((r) => usable.map((c) => (c.from === null ? "" : r[c.from] ?? ""))),
    });
    onOpenChange(false);
  }

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= cols.length) return;
    const next = cols.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setCols(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage columns</DialogTitle>
          <DialogDescription>
            Rename, reorder, add or remove columns for this event's table. Nothing changes until you select Apply.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {cols.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input aria-label={`Column ${i + 1} name`} value={c.name} onChange={(e) => setCols(cols.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))} />
              <Button type="button" size="icon" variant="ghost" aria-label={`Move column ${c.name} left`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button>
              <Button type="button" size="icon" variant="ghost" aria-label={`Move column ${c.name} right`} disabled={i === cols.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button>
              <Button type="button" size="icon" variant="ghost" aria-label={`Remove column ${c.name}`} onClick={() => setCols(cols.filter((_, xi) => xi !== i))}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setCols([...cols, { name: `Column ${cols.length + 1}`, from: null }])}>
            <Plus className="size-4" /> Add column
          </Button>
        </div>
        {lostCells > 0 && (
          <p className="text-sm rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2" role="alert">
            Removing {removed.map((i) => `"${table.columns[i]}"`).join(", ")} will delete information in {lostCells} cell{lostCells === 1 ? "" : "s"}.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={lostCells > 0 ? "destructive" : "default"} onClick={apply}>
            {lostCells > 0 ? "Apply and delete information" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
