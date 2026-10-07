import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/utils/format";

export function StatCard({
  label,
  value,
  icon: Icon,
  loading,
  to,
}: {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  loading: boolean;
  /** Bila diisi, kartu menjadi tautan ke halaman rincian. */
  to?: string;
}) {
  const card = (
    <Card className={to ? "p-5 transition-colors hover:border-navy-300" : "p-5"}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-20" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums text-navy-900">{formatNumber(value)}</p>
          )}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-600">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </Card>
  );
  return to ? (
    <Link to={to} className="block rounded-xl" aria-label={`${label}: ${formatNumber(value)}. Lihat rincian`}>
      {card}
    </Link>
  ) : (
    card
  );
}
