import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ClipboardList, Eye, FileSearch, FolderOpen, Search, SlidersHorizontal, X } from "lucide-react";
import { DataTable, useTableState, type TableState } from "@/components/data-table";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useArchiveClasses, useDistricts, useDocumentTypes, useLicenseTypes } from "@/hooks/useReference";
import { cn } from "@/lib/utils";
import { documentSpec } from "@/services/documents";
import { licenseSpec, yearOptions } from "@/services/licenses";
import { fetchAll, fetchPage, type ListParams } from "@/services/listQuery";
import { DOC_STATUSES, DOC_STATUS_LABEL, LICENSE_STATUSES, LICENSE_STATUS_LABEL, type DocumentRow, type LicenseRow } from "@/types/entities";
import { licenseColumns } from "@/pages/licenses/licenseColumns";
import { documentColumns } from "@/pages/documents/documentColumns";
import { DocumentDialogs, type DocDialog } from "@/pages/documents/DocumentDialogs";

/** Kunci URL filter lanjutan → kunci filter di licenseSpec / documentSpec. */
const LIC_KEYS = { jenis: "type", status: "status", kecamatan: "district", tahun: "year", terbit_dari: "issue_from", terbit_sampai: "issue_to", nik: "nik", nib: "nib" } as const;
const DOC_KEYS = { dok_jenis: "type", dok_status: "status", klasifikasi: "class", tahun: "year" } as const;
const ALL_KEYS = [...new Set([...Object.keys(LIC_KEYS), ...Object.keys(DOC_KEYS)])];

function pick(params: URLSearchParams, map: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [url, key] of Object.entries(map)) {
    const v = params.get(url);
    if (v) out[key] = v;
  }
  return out;
}

export default function SearchPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const viewer = profile?.role === "viewer";
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const tab = params.get("tab") === "dokumen" ? "dokumen" : "izin";
  const hasCriteria = !!q || ALL_KEYS.some((k) => params.get(k));
  const [advanced, setAdvanced] = useState(ALL_KEYS.some((k) => params.get(k)));
  const [dialog, setDialog] = useState<DocDialog>(null);

  const licFilters = useMemo(() => pick(params, LIC_KEYS), [params]);
  const docFilters = useMemo(() => pick(params, DOC_KEYS), [params]);
  const licSpec = useMemo(() => licenseSpec(licFilters), [licFilters]);
  const docSpec = useMemo(() => documentSpec(docFilters), [docFilters]);

  const licTable = useTableState({ urlSync: false });
  const docTable = useTableState({ urlSync: false });
  const { setPage: setLicPage } = licTable;
  const { setPage: setDocPage } = docTable;
  // Kriteria berubah → kembali ke halaman 1 pada kedua tabel.
  useEffect(() => {
    setLicPage(1);
    setDocPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const licParams: ListParams = { ...licTable.params, search: q, filters: {} };
  const docParams: ListParams = { ...docTable.params, search: q, filters: {} };
  const lic = useQuery({
    queryKey: ["search", "licenses", licFilters, licParams],
    queryFn: () => fetchPage<LicenseRow>(licSpec, licParams),
    enabled: hasCriteria,
    placeholderData: keepPreviousData,
  });
  const doc = useQuery({
    queryKey: ["search", "documents", docFilters, docParams],
    queryFn: () => fetchPage<DocumentRow>(docSpec, docParams),
    enabled: hasCriteria,
    placeholderData: keepPreviousData,
  });

  const clearAll = () => setParams(new URLSearchParams(), { replace: true });
  // Status tabel untuk DataTable: pencarian & filter dikendalikan formulir halaman ini.
  const asState = (t: TableState, p: ListParams): TableState => ({ ...t, params: p, activeFilterCount: 1, resetFilters: clearAll });

  return (
    <>
      <PageHeader
        title="Pencarian Arsip"
        description="Cari sekaligus di data perizinan dan dokumen arsip: nomor izin/permohonan, nama pemohon atau perusahaan, NIB, judul dan nomor dokumen, nama file."
      />

      <SearchForm initialQ={q} advanced={advanced} onToggleAdvanced={() => setAdvanced((v) => !v)} params={params} setParams={setParams} viewer={viewer} />

      {!hasCriteria ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed bg-white px-6 py-14 text-center">
          <FileSearch className="h-10 w-10 text-navy-400" aria-hidden />
          <p className="mt-3 text-sm font-medium">Masukkan kata kunci atau pilih filter</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Contoh: nomor izin "503/IU", nama pemohon, nama perusahaan, NIB, atau nomor dokumen.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 inline-flex rounded-lg border bg-white p-1" role="tablist" aria-label="Hasil pencarian">
            {(
              [
                ["izin", "Perizinan", ClipboardList, lic.data?.total],
                ["dokumen", "Dokumen", FolderOpen, doc.data?.total],
              ] as const
            ).map(([key, label, Icon, n]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setParams((p) => { const x = new URLSearchParams(p); if (key === "izin") x.delete("tab"); else x.set("tab", key); return x; }, { replace: true })}
                className={cn(
                  "flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium",
                  tab === key ? "bg-navy-800 text-white" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden /> {label}
                <span className={cn("rounded-full px-1.5 text-xs tabular-nums", tab === key ? "bg-white/20" : "bg-muted")}>
                  {n === undefined ? "…" : n.toLocaleString("id-ID")}
                </span>
              </button>
            ))}
          </div>

          {tab === "izin" ? (
            <DataTable
              tableId="search-licenses"
              exportName="pencarian_perizinan"
              hideSearch
              columns={licenseColumns}
              rows={lic.data?.rows}
              total={lic.data?.total ?? 0}
              loading={lic.isLoading}
              fetching={lic.isFetching}
              error={lic.error}
              onRetry={() => lic.refetch()}
              state={asState(licTable, licParams)}
              getRowId={(r) => r.id}
              onRowClick={(r) => navigate(`/perizinan/${r.id}`)}
              rowActions={[{ label: "Lihat detail", icon: Eye, onSelect: (r) => navigate(`/perizinan/${r.id}`) }]}
              exportAll={() => fetchAll<LicenseRow>(licSpec, licParams)}
              empty={{ icon: ClipboardList, title: "Tidak ada izin yang cocok" }}
            />
          ) : (
            <DataTable
              tableId="search-documents"
              exportName="pencarian_dokumen"
              hideSearch
              columns={documentColumns}
              rows={doc.data?.rows}
              total={doc.data?.total ?? 0}
              loading={doc.isLoading}
              fetching={doc.isFetching}
              error={doc.error}
              onRetry={() => doc.refetch()}
              state={asState(docTable, docParams)}
              getRowId={(r) => r.id}
              onRowClick={(r) => setDialog({ kind: "preview", doc: r })}
              rowActions={[
                { label: "Lihat", icon: Eye, onSelect: (r) => setDialog({ kind: "preview", doc: r }) },
                { label: "Buka izin", icon: ClipboardList, onSelect: (r) => navigate(`/perizinan/${r.license_id}`) },
              ]}
              exportAll={() => fetchAll<DocumentRow>(docSpec, docParams)}
              empty={{ icon: FolderOpen, title: "Tidak ada dokumen yang cocok" }}
            />
          )}
        </>
      )}
      <DocumentDialogs dialog={dialog} onClose={() => setDialog(null)} onOpen={setDialog} />
    </>
  );
}

function SearchForm({
  initialQ,
  advanced,
  onToggleAdvanced,
  params,
  setParams,
  viewer,
}: {
  initialQ: string;
  advanced: boolean;
  onToggleAdvanced: () => void;
  params: URLSearchParams;
  setParams: ReturnType<typeof useSearchParams>[1];
  viewer: boolean;
}) {
  const [text, setText] = useState(initialQ);
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(ALL_KEYS.map((k) => [k, params.get(k) ?? ""])));
  const types = useLicenseTypes();
  const districts = useDistricts();
  const docTypes = useDocumentTypes();
  const classes = useArchiveClasses();

  // Sinkron bila URL berubah dari luar (mis. kotak cari di topbar).
  useEffect(() => {
    setText(params.get("q") ?? "");
    setDraft(Object.fromEntries(ALL_KEYS.map((k) => [k, params.get(k) ?? ""])));
  }, [params]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (text.trim()) next.set("q", text.trim());
    for (const [k, v] of Object.entries(draft)) if (v.trim()) next.set(k, v.trim());
    const tab = params.get("tab");
    if (tab) next.set("tab", tab);
    setParams(next, { replace: true });
  }

  const bind = (k: string) => ({ value: draft[k] ?? "", onChange: (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value })) });
  const activeCount = ALL_KEYS.filter((k) => params.get(k)).length;

  return (
    <Card className="mb-5">
      <CardContent className="pt-5">
        <form onSubmit={submit} role="search" className="space-y-4" noValidate>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Kata kunci: no. izin, pemohon, perusahaan, NIB, judul/nomor dokumen, nama file…"
                aria-label="Kata kunci pencarian"
                className="h-11 pl-9 text-base"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={onToggleAdvanced} aria-expanded={advanced}>
                <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filter{activeCount ? ` (${activeCount})` : ""}
              </Button>
              <Button type="submit" className="h-11 px-6">
                Cari
              </Button>
            </div>
          </div>

          {advanced ? (
            <div className="grid gap-4 rounded-lg border bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2 lg:col-span-4">Perizinan</p>
              <Labeled label="Jenis izin">
                <Select {...bind("jenis")}>
                  <option value="">Semua</option>
                  {(types.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Labeled>
              <Labeled label="Status izin">
                <Select {...bind("status")}>
                  <option value="">Semua</option>
                  {LICENSE_STATUSES.map((s) => <option key={s} value={s}>{LICENSE_STATUS_LABEL[s]}</option>)}
                </Select>
              </Labeled>
              <Labeled label="Kecamatan">
                <Select {...bind("kecamatan")}>
                  <option value="">Semua</option>
                  {(districts.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Labeled>
              <Labeled label="Tahun arsip">
                <Select {...bind("tahun")}>
                  <option value="">Semua</option>
                  {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
                </Select>
              </Labeled>
              <Labeled label="Terbit dari">
                <Input type="date" {...bind("terbit_dari")} />
              </Labeled>
              <Labeled label="Terbit sampai">
                <Input type="date" {...bind("terbit_sampai")} />
              </Labeled>
              {!viewer ? (
                <Labeled label="NIK pemohon (tepat)">
                  <Input {...bind("nik")} inputMode="numeric" maxLength={16} autoComplete="off" />
                </Labeled>
              ) : null}
              <Labeled label="NIB (tepat)">
                <Input {...bind("nib")} inputMode="numeric" maxLength={13} autoComplete="off" />
              </Labeled>

              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2 lg:col-span-4">Dokumen</p>
              <Labeled label="Jenis dokumen">
                <Select {...bind("dok_jenis")}>
                  <option value="">Semua</option>
                  {(docTypes.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Labeled>
              {!viewer ? (
                <Labeled label="Status dokumen">
                  <Select {...bind("dok_status")}>
                    <option value="">Semua</option>
                    {DOC_STATUSES.map((s) => <option key={s} value={s}>{DOC_STATUS_LABEL[s]}</option>)}
                  </Select>
                </Labeled>
              ) : null}
              <Labeled label="Klasifikasi arsip">
                <Select {...bind("klasifikasi")}>
                  <option value="">Semua</option>
                  {(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </Select>
              </Labeled>
              <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setText("");
                    setDraft(Object.fromEntries(ALL_KEYS.map((k) => [k, ""])));
                    setParams(new URLSearchParams(), { replace: true });
                  }}
                >
                  <X className="h-4 w-4" aria-hidden /> Hapus semua
                </Button>
                <Button type="submit">Terapkan</Button>
              </div>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
