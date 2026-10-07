import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Menu tarik-turun sederhana. Panel dirender ke <body> dengan posisi fixed agar tidak
 * terpotong oleh kontainer tabel yang bisa digulir horizontal.
 */
export function Dropdown({
  trigger,
  children,
  width = 220,
  label,
}: {
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu"; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  children: (close: () => void) => ReactNode;
  width?: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  // Hitung posisi panel dari posisi tombol. Kembalikan false bila tombol sudah keluar layar.
  const place = useCallback((): boolean => {
    if (!btn.current) return false;
    const r = btn.current.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return false;
    const h = panel.current?.offsetHeight ?? 200;
    const below = r.bottom + 4 + h < window.innerHeight;
    setPos({
      top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - h),
      left: Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8),
    });
    return true;
  }, [width]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    // Halaman digulir: panel ikut tombol; tutup hanya bila tombol keluar layar.
    const onScroll = (e: Event) => {
      if (panel.current?.contains(e.target as Node)) return;
      if (!place()) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close, place]);

  return (
    <>
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-haspopup": "menu", ref: btn })}
      {open
        ? createPortal(
            <div
              ref={panel}
              role="menu"
              aria-label={label}
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
              className="fixed z-[60] max-h-[60vh] overflow-y-auto rounded-lg border bg-white p-1 shadow-lg"
            >
              {children(close)}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function MenuItem({
  children,
  onSelect,
  danger,
  disabled,
  icon,
}: {
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-50",
        danger ? "text-red-600 hover:bg-red-50" : "text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
