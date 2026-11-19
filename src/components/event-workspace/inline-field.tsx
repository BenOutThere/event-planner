import { useEffect, useRef } from "react";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Escape pressed inside an open menu, picker or dialog closes that first. */
export function escapeBelongsToPopup(e: KeyboardEvent | React.KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('[role="listbox"],[role="menu"],[role="dialog"],[role="alertdialog"],[data-radix-popper-content-wrapper]')) return true;
  return !!document.querySelector('[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[role="listbox"],[role="menu"][data-state="open"]');
}

/**
 * R15: in reading view, an editor can click a field (or its pencil) to edit
 * just that field. Typing saves as usual; Escape or Done goes back to reading.
 */
export function InlineField({ label, enabled, active, onStart, onDone, children }: {
  label: string; enabled: boolean; active: boolean; onStart: () => void; onDone: () => void; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const el = ref.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), textarea:not([disabled]), button[role=combobox]");
    el?.focus();
  }, [active]);
  if (!enabled) return <>{children}</>;
  if (active) {
    return (
      <div ref={ref} className="rounded-lg ring-2 ring-primary/40 bg-muted/30 p-2 -mx-2"
        onKeyDown={(e) => { if (e.key === "Escape" && !e.defaultPrevented && !escapeBelongsToPopup(e)) { e.preventDefault(); onDone(); } }}>
        {children}
        <div className="flex items-center justify-end gap-2 pt-1">
          <span className="text-[11px] text-muted-foreground hidden sm:inline">Saves as you type · Esc to finish</span>
          <Button size="sm" variant="secondary" className="h-7" onClick={onDone}><Check className="size-3.5" /> Done</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="group/field relative rounded-lg -mx-2 px-2 hover:bg-muted/50 cursor-text"
      onClick={(e) => {
        // Links, buttons and table controls in the field keep working as normal.
        if ((e.target as HTMLElement).closest("a,button,input,textarea,select,[role=button],[role=menuitem],table")) return;
        if (window.getSelection()?.toString()) return; // selecting text to copy
        onStart();
      }}>
      {children}
      <button type="button" onClick={onStart} aria-label={`Edit ${label}`}
        className="absolute top-1 right-1 rounded-md p-1 text-muted-foreground opacity-60 sm:opacity-0 group-hover/field:opacity-100 focus-visible:opacity-100 hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Pencil className="size-3.5" />
      </button>
    </div>
  );
}
