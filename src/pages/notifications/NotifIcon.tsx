import { AlarmClock, BadgeCheck, Bell, CalendarX2, CheckCircle2, FileClock, Send, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const MAP: Record<string, { icon: LucideIcon; cls: string }> = {
  izin_diajukan: { icon: Send, cls: "bg-blue-50 text-blue-600" },
  dokumen_menunggu: { icon: FileClock, cls: "bg-amber-50 text-amber-600" },
  dokumen_ditolak: { icon: XCircle, cls: "bg-red-50 text-red-600" },
  dokumen_terverifikasi: { icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-600" },
  izin_disetujui: { icon: BadgeCheck, cls: "bg-emerald-50 text-emerald-600" },
  izin_ditolak: { icon: XCircle, cls: "bg-red-50 text-red-600" },
  izin_terbit: { icon: BadgeCheck, cls: "bg-blue-50 text-blue-600" },
  izin_akan_berakhir: { icon: AlarmClock, cls: "bg-amber-50 text-amber-600" },
  izin_berakhir: { icon: CalendarX2, cls: "bg-slate-100 text-slate-600" },
};

export function NotifIcon({ type, className }: { type: string; className?: string }) {
  const m = MAP[type] ?? { icon: Bell, cls: "bg-slate-100 text-slate-600" };
  const Icon = m.icon;
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", m.cls, className)}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}
