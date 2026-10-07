import { cn } from "@/lib/utils";

/** Input tanggal ringkas untuk toolbar DataTable (rentang tanggal). */
export function FilterDate({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <input
        type="date"
        aria-label={`Tanggal ${label.toLowerCase()}`}
        value={value ?? ""}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-9 rounded-lg border bg-white px-2 text-sm", value ? "border-navy-300 text-navy-900" : "text-muted-foreground")}
      />
    </label>
  );
}
