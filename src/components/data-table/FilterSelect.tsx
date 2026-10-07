import { cn } from "@/lib/utils";

export type Option = { value: string; label: string };

/** Dropdown filter ringkas untuk toolbar DataTable. Nilai kosong = semua. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  className,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: Option[];
  allLabel?: string;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 max-w-[200px] rounded-lg border bg-white px-2.5 text-sm",
        value ? "border-navy-300 text-navy-900" : "text-muted-foreground",
        className,
      )}
    >
      <option value="">{allLabel ?? `Semua ${label.toLowerCase()}`}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
