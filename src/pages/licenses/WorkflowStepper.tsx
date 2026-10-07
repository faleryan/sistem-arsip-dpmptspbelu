import { useQuery } from "@tanstack/react-query";
import { Ban, Check, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { listHistory } from "@/services/licenses";
import { LICENSE_STATUS_LABEL, type LicenseStatus } from "@/types/entities";

/** Jalur utama permohonan. Status lain (Ditolak, Dicabut, Dibatalkan) ditampilkan sebagai penanda akhir. */
const MAIN: LicenseStatus[] = ["DRAFT", "DIAJUKAN", "VERIFIKASI", "DISETUJUI", "DITERBITKAN", "AKTIF", "BERAKHIR"];
const SIDE: Partial<Record<LicenseStatus, { icon: typeof Ban; cls: string }>> = {
  DITOLAK: { icon: XCircle, cls: "border-red-300 bg-red-50 text-red-700" },
  DICABUT: { icon: Ban, cls: "border-red-300 bg-red-50 text-red-700" },
  DIBATALKAN: { icon: Ban, cls: "border-slate-300 bg-slate-100 text-slate-600" },
};

export function WorkflowStepper({ licenseId, status, withHistory }: { licenseId: string; status: LicenseStatus; withHistory: boolean }) {
  // Riwayat dipakai untuk menandai tahap yang benar-benar pernah dilalui (Viewer tidak punya akses riwayat).
  const history = useQuery({
    queryKey: ["licenses", "history", licenseId],
    queryFn: () => listHistory(licenseId),
    enabled: withHistory,
  });
  const visited = new Set<LicenseStatus>((history.data ?? []).map((h) => h.to_status));
  visited.add(status);
  const currentIdx = MAIN.indexOf(status);
  // Untuk status samping, tahap terakhir yang dicapai = tahap utama terjauh yang pernah dilalui.
  const reached = currentIdx >= 0 ? currentIdx : Math.max(-1, ...MAIN.map((s, i) => (visited.has(s) ? i : -1)));
  const side = SIDE[status];
  // Arsip izin lama bisa langsung Aktif tanpa melewati tahap awal: tandai tahap sebelumnya "dilewati".
  const steps = MAIN.filter((s) => s !== "BERAKHIR" || status === "BERAKHIR");

  return (
    <nav aria-label="Tahap perizinan" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ol className="flex min-w-max items-center gap-1">
        {steps.map((s, i) => {
          const idx = MAIN.indexOf(s);
          const done = idx < reached || (idx === reached && !!side);
          const current = s === status;
          const skipped = done && withHistory && history.isSuccess && !visited.has(s);
          return (
            <li key={s} className="flex items-center gap-1">
              {i > 0 ? <span className={cn("h-px w-5 sm:w-8", idx <= reached ? "bg-navy-500" : "bg-slate-300")} aria-hidden /> : null}
              <span
                aria-current={current ? "step" : undefined}
                title={skipped ? "Tahap ini tidak dilalui (mis. arsip izin lama)" : undefined}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
                  current
                    ? "border-navy-800 bg-navy-800 text-white"
                    : done
                      ? skipped
                        ? "border-dashed border-slate-300 text-muted-foreground"
                        : "border-navy-200 bg-navy-50 text-navy-800"
                      : "border-slate-200 text-muted-foreground",
                )}
              >
                {done && !current && !skipped ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                {LICENSE_STATUS_LABEL[s]}
              </span>
            </li>
          );
        })}
        {side ? (
          <li className="flex items-center gap-1">
            <span className="h-px w-5 bg-red-300 sm:w-8" aria-hidden />
            <span aria-current="step" className={cn("flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium", side.cls)}>
              <side.icon className="h-3.5 w-3.5" aria-hidden />
              {LICENSE_STATUS_LABEL[status]}
            </span>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
