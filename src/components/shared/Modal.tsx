import { useEffect, useId, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl" | "full";
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative flex max-h-[92vh] w-full flex-col rounded-xl bg-white shadow-xl ${
          size === "full" ? "h-[92vh] max-w-6xl" : size === "xl" ? "max-w-3xl" : size === "lg" ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 id={titleId} className="min-w-0 truncate text-base font-semibold text-navy-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className={size === "full" ? "flex min-h-0 flex-1 flex-col p-0" : "overflow-y-auto px-5 py-4"}>{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
