/** Utilitas tanggal "YYYY-MM-DD" (tanpa zona waktu), meniru aritmetika tanggal PostgreSQL. */

/** Tanggal hari ini di zona Asia/Makassar (WITA), format YYYY-MM-DD. */
export function todayWita(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
}

/** date + interval 'n months' (akhir bulan dijepit, mis. 31 Jan + 1 bulan = 28/29 Feb). */
export function addMonths(isoDate: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const d = Number(m[3]);
  const ty = y + Math.floor(mo / 12);
  const tm = ((mo % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
