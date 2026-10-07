import type { Column } from "@/components/data-table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/utils/format";
import { LICENSE_STATUS_LABEL, type LicenseRow } from "@/types/entities";

const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "-" : v);

export const licenseColumns: Column<LicenseRow>[] = [
  {
    id: "application_number",
    header: "No. Permohonan",
    cell: (r) => <span className="whitespace-nowrap font-mono text-xs font-medium text-navy-900">{r.application_number}</span>,
    sortField: "application_number",
    exportValue: (r) => r.application_number,
    hideable: false,
  },
  {
    id: "license_number",
    header: "No. Izin",
    cell: (r) => <span className="whitespace-nowrap font-mono text-xs">{dash(r.license_number)}</span>,
    sortField: "license_number",
    exportValue: (r) => r.license_number,
  },
  {
    id: "license_type",
    header: "Jenis Izin",
    cell: (r) => r.license_type_name,
    sortField: "license_type_name",
    exportValue: (r) => r.license_type_name,
  },
  {
    id: "applicant",
    header: "Pemohon",
    cell: (r) => <span className="font-medium">{r.applicant_name}</span>,
    sortField: "applicant_name",
    exportValue: (r) => r.applicant_name,
  },
  {
    id: "nik",
    header: "NIK",
    cell: (r) => <span className="font-mono text-xs">{dash(r.applicant_nik)}</span>,
    exportValue: (r) => r.applicant_nik,
    defaultHidden: true,
  },
  {
    id: "business",
    header: "Perusahaan",
    cell: (r) => dash(r.business_name),
    sortField: "business_name",
    exportValue: (r) => r.business_name,
  },
  {
    id: "nib",
    header: "NIB",
    cell: (r) => <span className="font-mono text-xs">{dash(r.nib)}</span>,
    exportValue: (r) => r.nib,
    defaultHidden: true,
  },
  {
    id: "district",
    header: "Kecamatan",
    cell: (r) => dash(r.district_name),
    sortField: "district_name",
    exportValue: (r) => r.district_name,
    defaultHidden: true,
  },
  {
    id: "status",
    header: "Status",
    cell: (r) => <StatusBadge status={r.status} label={LICENSE_STATUS_LABEL[r.status]} />,
    sortField: "status",
    exportValue: (r) => LICENSE_STATUS_LABEL[r.status],
  },
  {
    id: "application_date",
    header: "Tgl. Permohonan",
    cell: (r) => <span className="whitespace-nowrap">{formatDate(r.application_date)}</span>,
    sortField: "application_date",
    exportValue: (r) => r.application_date,
    defaultHidden: true,
  },
  {
    id: "issue_date",
    header: "Tgl. Terbit",
    cell: (r) => <span className="whitespace-nowrap">{formatDate(r.issue_date)}</span>,
    sortField: "issue_date",
    exportValue: (r) => r.issue_date,
  },
  {
    id: "expiry_date",
    header: "Berlaku s.d.",
    cell: (r) => <span className="whitespace-nowrap">{formatDate(r.expiry_date)}</span>,
    sortField: "expiry_date",
    exportValue: (r) => r.expiry_date,
  },
  {
    id: "year",
    header: "Tahun",
    cell: (r) => dash(r.year),
    sortField: "year",
    exportValue: (r) => r.year,
    defaultHidden: true,
  },
];
