import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Loader2, X } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string; hint?: string | null };

/**
 * Pilihan dengan pencarian ke server (pola ARIA combobox). Dipakai untuk memilih
 * pemohon/perusahaan dari ribuan data tanpa memuat semuanya.
 */
export function Combobox({
  id,
  value,
  label,
  onChange,
  search,
  queryKey,
  placeholder = "Ketik untuk mencari…",
  disabled,
  invalid,
  "aria-describedby": describedBy,
}: {
  id?: string;
  value: string;
  /** Label opsi terpilih (ditampilkan saat tertutup). */
  label: string;
  onChange: (opt: ComboOption | null) => void;
  search: (term: string) => Promise<ComboOption[]>;
  queryKey: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  "aria-describedby"?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const debounced = useDebounce(term, 300);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const results = useQuery({
    queryKey: ["combo", queryKey, debounced],
    queryFn: () => search(debounced),
    enabled: open,
    staleTime: 30_000,
  });
  const options = results.data ?? [];

  useEffect(() => setActive(0), [debounced]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(opt: ComboOption) {
    onChange(opt);
    setOpen(false);
    setTerm("");
  }

  return (
    <div ref={wrap} className="relative">
      <div
        className={cn(
          "flex h-10 w-full items-center rounded-lg border bg-white pr-1 text-sm",
          disabled && "cursor-not-allowed opacity-50",
          invalid && "border-red-400",
        )}
      >
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          disabled={disabled}
          value={open ? term : label}
          placeholder={value ? label : placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, options.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && open) {
              e.preventDefault();
              if (options[active]) pick(options[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="h-full min-w-0 flex-1 rounded-lg bg-transparent px-3 outline-none placeholder:text-muted-foreground"
          autoComplete="off"
        />
        {value && !disabled ? (
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Kosongkan pilihan"
            onClick={() => {
              onChange(null);
              input.current?.focus();
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <ChevronsUpDown className="mx-1.5 h-4 w-4 text-muted-foreground" aria-hidden />
        )}
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-white p-1 shadow-lg"
        >
          {results.isLoading ? (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Mencari…
            </li>
          ) : results.isError ? (
            <li className="px-3 py-2 text-sm text-red-600">Gagal memuat data.</li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Tidak ditemukan.</li>
          ) : (
            options.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.value === value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-2 text-sm",
                  i === active && "bg-muted",
                  o.value === value && "font-medium text-navy-900",
                )}
              >
                {o.label}
                {o.hint ? <span className="ml-2 font-mono text-xs text-muted-foreground">{o.hint}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
