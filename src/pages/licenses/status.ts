import type { LicenseStatus } from "@/types/entities";

/** Label tombol aksi per status tujuan. */
export const ACTION_LABEL: Record<LicenseStatus, string> = {
  DRAFT: "Kembalikan ke Draft",
  DIAJUKAN: "Ajukan",
  VERIFIKASI: "Mulai verifikasi",
  DISETUJUI: "Setujui",
  DITERBITKAN: "Terbitkan",
  AKTIF: "Aktifkan",
  BERAKHIR: "Tandai berakhir",
  DITOLAK: "Tolak",
  DICABUT: "Cabut izin",
  DIBATALKAN: "Batalkan",
};

export const DANGER_TARGETS: LicenseStatus[] = ["DITOLAK", "DICABUT", "DIBATALKAN"];

/** Penjelasan singkat yang ditampilkan di dialog konfirmasi. */
export const ACTION_HINT: Partial<Record<LicenseStatus, string>> = {
  DIAJUKAN: "Permohonan dikirim ke Verifikator. Data izin masih dapat diperbaiki Petugas selama berstatus Diajukan.",
  VERIFIKASI: "Syarat: minimal satu dokumen sudah diunggah.",
  DISETUJUI: "Syarat: semua dokumen wajib jenis izin ini sudah terverifikasi.",
  DITERBITKAN:
    "Syarat: nomor izin dan tanggal terbit sudah diisi. Tanggal berakhir dihitung otomatis dari masa berlaku bila kosong. Bila tanggal terbit ≤ hari ini, izin langsung Aktif.",
  DITOLAK: "Petugas akan menerima notifikasi beserta alasan penolakan.",
  DICABUT: "Izin tidak berlaku lagi. Tindakan ini tercatat di riwayat dan audit log.",
  DIBATALKAN: "Permohonan dihentikan dan tidak dapat diproses lagi.",
};

/** Status di mana Petugas masih boleh mengubah data izin (sesuai RLS licenses_update). */
export const PETUGAS_EDITABLE: LicenseStatus[] = ["DRAFT", "DIAJUKAN"];
