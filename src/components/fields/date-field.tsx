import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { useState } from "react";
import { formatAuDate, parseDateOnly, toDateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function DateField({
  value, onChange, disabled, id, ariaLabel,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const date = parseDateOnly(value);
  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel ? `${ariaLabel}: ${date ? formatAuDate(value) : "not set"}` : undefined}
            className={cn("w-full sm:w-56 justify-start text-left font-normal", !date && "text-muted-foreground")}
          >
            <CalendarIcon className="size-4" />
            {date ? formatAuDate(value) : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date}
            captionLayout="dropdown"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2040, 11)}
            onSelect={(d) => { onChange(d ? toDateOnly(d) : null); setOpen(false); }}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      {date && !disabled && (
        <Button type="button" size="icon" variant="ghost" onClick={() => onChange(null)} aria-label="Clear date" className="shrink-0">
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
