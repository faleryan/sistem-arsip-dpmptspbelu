/**
 * Setelah deploy baru, file JS lama (nama ber-hash) tidak ada lagi di server. Tab yang masih
 * memuat versi lama akan gagal saat membuka halaman yang dimuat belakangan (lazy route).
 * Solusinya: muat ulang halaman satu kali untuk mengambil versi terbaru.
 */
const KEY = "sipar.chunk-reload-at";
const WINDOW_MS = 30_000;

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Unable to preload CSS|Loading chunk [\w-]+ failed/i.test(
    msg,
  );
}

/** Muat ulang sekali; jika baru saja dicoba (dalam 30 detik) kembalikan false agar tidak berulang. */
export function reloadOnceForNewVersion(): boolean {
  let last = 0;
  try {
    last = Number(window.sessionStorage.getItem(KEY) || 0);
  } catch {
    /* penyimpanan sesi tidak tersedia */
  }
  if (Date.now() - last < WINDOW_MS) return false;
  try {
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* abaikan */
  }
  window.location.reload();
  return true;
}
