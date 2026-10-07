-- ============================================================================
-- SIPAR-BELU · Migration 0007 · Status dokumen "DIARSIPKAN"
-- Jalankan SETELAH 0006 dan SEBELUM 0008, sebagai satu eksekusi tersendiri.
-- (PostgreSQL tidak mengizinkan nilai enum baru dipakai di transaksi yang sama
--  dengan penambahannya, jadi pernyataan ini sengaja dipisah dari 0008.)
--
-- DIARSIPKAN = dokumen yang diunggah ke izin yang sudah melewati tahap verifikasi
-- (Disetujui, Diterbitkan, Aktif, Berakhir, Dicabut, Dibatalkan), mis. Surat Izin
-- atau hasil pindai arsip izin lama. Dokumen ini tidak masuk antrean verifikasi.
-- Aman dijalankan ulang.
-- ============================================================================

alter type public.doc_status add value if not exists 'DIARSIPKAN';
