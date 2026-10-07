import { cn } from "@/lib/utils";

type Tone = "gray" | "blue" | "amber" | "green" | "red" | "slate";

const TONE: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
};

/** Peta status izin/dokumen → warna lencana. */
export const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "gray",
  DIAJUKAN: "blue",
  VERIFIKASI: "amber",
  DISETUJUI: "blue",
  DITERBITKAN: "blue",
  AKTIF: "green",
  BERAKHIR: "slate",
  DITOLAK: "red",
  DICABUT: "red",
  DIBATALKAN: "slate",
  MENUNGGU_VERIFIKASI: "amber",
  TERVERIFIKASI: "green",
  DIARSIPKAN: "slate",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONE[status] ?? "gray";
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE[tone],
      )}
    >
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}
