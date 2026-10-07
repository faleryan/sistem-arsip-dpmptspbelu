/** Pembuatan QR code (library dimuat saat dibutuhkan agar halaman lain tetap ringan). */

const OPTS = { errorCorrectionLevel: "M" as const, margin: 1 };

/** QR sebagai data URL SVG (tajam di layar dan saat dicetak). */
export async function qrSvgDataUrl(text: string): Promise<string> {
  const QR = await import("qrcode");
  const svg = await QR.toString(text, { ...OPTS, type: "svg", color: { dark: "#0b1d38", light: "#ffffff" } });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** QR sebagai PNG (untuk ditempel di dokumen Word/surat). */
export async function qrPngDataUrl(text: string, width = 1024): Promise<string> {
  const QR = await import("qrcode");
  return QR.toDataURL(text, { ...OPTS, margin: 2, width, color: { dark: "#000000", light: "#ffffff" } });
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
