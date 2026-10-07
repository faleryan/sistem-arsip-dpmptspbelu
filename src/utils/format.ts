const dateTime = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Makassar",
});

const dateOnly = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Makassar",
});

const number = new Intl.NumberFormat("id-ID");

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "-" : dateTime.format(d);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "-" : dateOnly.format(d);
}

export function formatNumber(value: number | null | undefined): string {
  return number.format(value ?? 0);
}

/** "baru saja", "5 menit lalu", "3 jam lalu", "kemarin", atau tanggal untuk yang lebih lama. */
export function formatRelative(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  const sec = Math.round((now.getTime() - d.getTime()) / 1000);
  if (sec < 60) return "baru saja";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "kemarin";
  if (day < 7) return `${day} hari lalu`;
  return formatDate(d);
}
