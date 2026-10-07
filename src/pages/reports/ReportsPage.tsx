import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, CalendarClock, FileSpreadsheet, FileText, FileType2, Loader2, MapPin, ScrollText, Sheet, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useDistricts } from "@/hooks/useReference";
import { useAgency } from "@/hooks/useSettings";
import { errorMessage } from "@/lib/errors";
import { exportReportCsv, exportReportPdf, exportReportXlsx, type ReportModel } from "@/lib/export/report";
import { cn } from "@/lib/utils";
import { documentSummary, licenseList, licenseSummary, monthlyTrend } from "@/services/reports";
import { addDays, todayWita } from "@/utils/date";
import { buildDocuments, buildIssued, buildSummary, buildValidity, type Built, type ReportFilters, type ReportKind } from "./buildReport";
import { MonthlyChart } from "./MonthlyChart";
import { ReportTable } from "./ReportTable";

const TABS: { kind: ReportKind; label: string; icon: LucideIcon }[] = [
  { kind: "rekap", label: "Rekap perizinan", icon: BarChart3 },
  { kind: "kecamatan", label: "Per kecamatan", icon: MapPin },
  { kind: "terbit", label: "Izin terbit", icon: ScrollText },
  { kind: "berlaku", label: "Masa berlaku", icon: CalendarClock },
  { kind: "dokumen", label: "Dokumen arsip", icon: FileType2 },
];

export default function ReportsPage() {
  const { profile, hasRole } = useAuth();
  const agency = useAgency();
  const canExport = hasRole("super_admin", "admin_arsip", "pimpinan");
  const [params, setParams] = useSearchParams();
  const today = todayWita();
  const kind = (TABS.find((t) => t.kind === params.get("jenis"))?.kind ?? "rekap") as ReportKind;
  const f: ReportFilters = {
    from: params.get("dari") ?? `${today.slice(0, 4)}-01-01`,
    to: params.get("sampai") ?? today,
    basis: params.get("dasar") === "issue" ? "issue" : "application",
    district: params.get("kecamatan") ?? "",
    validity: params.get("berlaku") === "sudah" ? "sudah" : "akan",
    days: [30, 60, 90, 180].includes(Number(params.get("hari"))) ? Number(params.get("hari")) : 30,
  };
  const set = (patch: Record<string, string>) =>
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
        return n;
      },
      { replace: true },
    );

  const districts = useDistricts();
  const districtName = districts.data?.find((d) => d.id === f.district)?.name ?? "";
  const year = Number((f.to || today).slice(0, 4));

  const data = useQuery({
    queryKey: ["reports", kind, f],
    queryFn: async (): Promise<Built> => {
      switch (kind) {
        case "rekap":
        case "kecamatan":
          return buildSummary(
            kind,
            await licenseSummary({ from: f.from, to: f.to, basis: f.basis, districtId: kind === "rekap" ? f.district : undefined }),
            f,
            districtName,
          );
        case "terbit":
          return buildIssued(
            await licenseList(
              { issue_from: f.from, issue_to: f.to, district: f.district, status: "DITERBITKAN,AKTIF,BERAKHIR,DICABUT" },
              { field: "issue_date", asc: true },
            ),
            f,
            districtName,
          );
        case "berlaku":
          return buildValidity(
            await licenseList(
              f.validity === "akan"
                ? { status: "AKTIF", expiry_from: today, expiry_to: addDays(today, f.days)! }
                : { status: "BERAKHIR", expiry_from: f.from, expiry_to: f.to },
              { field: "expiry_date", asc: true },
            ),
            f,
            today,
          );
        case "dokumen":
          return buildDocuments(await documentSummary(f.from, f.to), f);
      }
    },
    // Nama kecamatan dipakai di subjudul: tunggu daftarnya bila filter kecamatan aktif.
    enabled: !f.district || !!districts.data,
  });
  const monthly = useQuery({ queryKey: ["reports", "monthly", year], queryFn: () => monthlyTrend(year), enabled: kind === "rekap" });

  const [exporting, setExporting] = useState<string | null>(null);
  const model: ReportModel | null = useMemo(
    () =>
      data.data
        ? { ...data.data, meta: { agency: agency.name, printedBy: profile?.full_name ?? "-", printedAt: new Date() } }
        : null,
    [data.data, profile?.full_name, agency.name],
  );

  async function doExport(fmt: "xlsx" | "pdf" | "csv") {
    if (!model) return;
    setExporting(fmt);
    try {
      const m = { ...model, meta: { ...model.meta, printedAt: new Date() } };
      if (fmt === "xlsx") await exportReportXlsx(m);
      else if (fmt === "pdf") await exportReportPdf(m);
      else exportReportCsv(m);
      toast.success("Laporan diekspor.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(null);
    }
  }

  const showPeriod = !(kind === "berlaku" && f.validity === "akan");

  return (
    <>
      <PageHeader title="Laporan" description="Rekapitulasi dan daftar perizinan untuk pelaporan berkala. Angka mengikuti data yang dapat Anda akses." />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border bg-white p-1" role="tablist" aria-label="Jenis laporan">
        {TABS.map((t) => (
          <button
            key={t.kind}
            role="tab"
            aria-selected={kind === t.kind}
            onClick={() => set({ jenis: t.kind })}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium",
              kind === t.kind ? "bg-navy-800 text-white" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden /> {t.label}
          </button>
        ))}
      </div>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          {kind === "berlaku" ? (
            <Labeled label="Tampilkan">
              <Select value={f.validity} onChange={(e) => set({ berlaku: e.target.value })} className="h-9 w-48">
                <option value="akan">Akan berakhir</option>
                <option value="sudah">Sudah berakhir</option>
              </Select>
            </Labeled>
          ) : null}
          {kind === "berlaku" && f.validity === "akan" ? (
            <Labeled label="Dalam">
              <Select value={String(f.days)} onChange={(e) => set({ hari: e.target.value })} className="h-9 w-32">
                {[30, 60, 90, 180].map((d) => (
                  <option key={d} value={d}>
                    {d} hari
                  </option>
                ))}
              </Select>
            </Labeled>
          ) : null}
          {showPeriod ? (
            <>
              <Labeled label="Dari tanggal">
                <input type="date" value={f.from} max={f.to || today} onChange={(e) => set({ dari: e.target.value })} className="h-9 rounded-lg border bg-white px-2 text-sm" />
              </Labeled>
              <Labeled label="Sampai tanggal">
                <input type="date" value={f.to} min={f.from} max={today} onChange={(e) => set({ sampai: e.target.value })} className="h-9 rounded-lg border bg-white px-2 text-sm" />
              </Labeled>
            </>
          ) : null}
          {kind === "rekap" || kind === "kecamatan" ? (
            <Labeled label="Berdasarkan">
              <Select value={f.basis} onChange={(e) => set({ dasar: e.target.value === "issue" ? "issue" : "" })} className="h-9 w-48">
                <option value="application">Tanggal permohonan</option>
                <option value="issue">Tanggal terbit</option>
              </Select>
            </Labeled>
          ) : null}
          {kind === "rekap" || kind === "terbit" ? (
            <Labeled label="Kecamatan">
              <Select value={f.district} onChange={(e) => set({ kecamatan: e.target.value })} className="h-9 w-48">
                <option value="">Semua kecamatan</option>
                {(districts.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Labeled>
          ) : null}

          {canExport ? (
            <div className="ml-auto flex flex-wrap gap-2">
              {(
                [
                  ["xlsx", "Excel", FileSpreadsheet],
                  ["pdf", "PDF", FileText],
                  ["csv", "CSV", Sheet],
                ] as const
              ).map(([fmt, label, Icon]) => (
                <Button key={fmt} variant="outline" size="sm" className="h-9" onClick={() => doExport(fmt)} disabled={!model || !!exporting}>
                  {exporting === fmt ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
                  {label}
                </Button>
              ))}
            </div>
          ) : (
            <p className="ml-auto text-xs text-muted-foreground">Ekspor laporan tersedia untuk Admin Arsip dan Pimpinan.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 pt-5">
          {data.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-80" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : data.isError || !data.data ? (
            <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {errorMessage(data.error)}
            </div>
          ) : (
            <>
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{agency.name}</p>
                <h3 className="mt-1 text-lg font-semibold text-navy-900">{data.data.title}</h3>
                <p className="text-sm text-muted-foreground">{data.data.subtitle}</p>
              </div>
              {kind === "rekap" && monthly.data ? <MonthlyChart data={monthly.data} year={year} /> : null}
              {data.data.rows.length ? (
                <ReportTable columns={data.data.columns} rows={data.data.rows} totals={data.data.totals} />
              ) : (
                <EmptyState icon={BarChart3} title="Tidak ada data pada periode ini" description="Ubah rentang tanggal atau filter laporan." />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
