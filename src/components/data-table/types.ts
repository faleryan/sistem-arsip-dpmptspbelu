import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Nama kolom database untuk urut server-side. Kosong = tidak bisa diurutkan. */
  sortField?: string;
  /** Nilai untuk ekspor CSV. Kosong = kolom tidak diekspor. */
  exportValue?: (row: T) => string | number | null | undefined;
  /** Default true. Kolom utama sebaiknya tidak bisa disembunyikan. */
  hideable?: boolean;
  defaultHidden?: boolean;
  className?: string;
  headerClassName?: string;
};

export type RowAction<T> = {
  label: string;
  icon?: LucideIcon;
  onSelect: (row: T) => void;
  danger?: boolean;
  hidden?: (row: T) => boolean;
};
