import { useEffect, useRef, useState } from "react";
import type { MonthlyRow } from "@/services/reports";

/**
 * Tren bulanan: kolom berkelompok (permohonan masuk vs izin terbit) per bulan.
 * Warna = slot kategorikal 1–2 palet rujukan (lolos validator: CVD ΔE 24,7; kontras ≥ 3:1 di permukaan putih).
 * Identitas tidak bergantung warna saja: legenda, tooltip berlabel, dan tabel alternatif.
 */
const SERIES = [
  { key: "submitted" as const, label: "Permohonan masuk", color: "#2a78d6" },
  { key: "issued" as const, label: "Izin terbit", color: "#eb6834" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTHS_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => v / s <= 4) ?? pow * 10;
  return Math.ceil(v / step) * step;
}

/** Kolom dengan ujung data membulat 4px dan sisi dasar persegi. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export function MonthlyChart({ data, year }: { data: MonthlyRow[]; year: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 220;
  const pad = { l: 36, r: 8, t: 12, b: 26 };
  const plotW = width - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...data.flatMap((d) => [d.submitted, d.issued])));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const band = plotW / 12;
  const gap = 2;
  const barW = Math.min(24, Math.max(4, (band * 0.7 - gap) / 2));
  const y = (v: number) => pad.t + plotH - (v / max) * plotH;
  const totals = SERIES.map((s) => data.reduce((a, d) => a + d[s.key], 0));

  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <figcaption className="text-sm font-semibold">Tren bulanan {year}</figcaption>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex flex-wrap items-center gap-4" aria-hidden>
            {SERIES.map((s, i) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label} <span className="font-medium text-foreground">({totals[i].toLocaleString("id-ID")})</span>
              </span>
            ))}
          </span>
          <button type="button" onClick={() => setShowTable((v) => !v)} className="font-medium text-accent hover:underline">
            {showTable ? "Sembunyikan tabel" : "Lihat tabel"}
          </button>
        </div>
      </div>

      <div ref={box} className="relative">
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`Grafik permohonan masuk dan izin terbit per bulan tahun ${year}. Total permohonan ${totals[0]}, izin terbit ${totals[1]}.`}
          className="block"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[10px]">
                {t.toLocaleString("id-ID")}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.l + band * i + band / 2;
            const x0 = cx - barW - gap / 2;
            return (
              <g
                key={d.month}
                tabIndex={0}
                role="button"
                aria-label={`${MONTHS_FULL[i]}: ${d.submitted} permohonan, ${d.issued} izin terbit`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="outline-none"
              >
                {/* area sentuh selebar pita bulan, lebih besar dari batangnya */}
                <rect x={pad.l + band * i} y={pad.t} width={band} height={plotH} fill={hover === i ? "#f1f5fb" : "transparent"} />
                {SERIES.map((s, si) => {
                  const v = d[s.key];
                  if (!v) return null;
                  const h = plotH - (y(v) - pad.t);
                  return <path key={s.key} d={columnPath(x0 + si * (barW + gap), y(v), barW, h)} fill={s.color} />;
                })}
                <text x={cx} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[10px]">
                  {MONTHS[i]}
                </text>
              </g>
            );
          })}
          <line x1={pad.l} x2={width - pad.r} y1={pad.t + plotH} y2={pad.t + plotH} stroke="#94a3b8" strokeWidth={1} />
        </svg>

        {hover !== null ? (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 rounded-lg border bg-white px-3 py-2 text-xs shadow-lg"
            style={{
              left: Math.min(Math.max(0, pad.l + band * hover + band / 2 - 80), width - 170),
              top: 0,
            }}
          >
            <p className="mb-1 font-semibold">
              {MONTHS_FULL[hover]} {year}
            </p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                <span className="text-muted-foreground">{s.label}</span>
                <span className="ml-auto pl-3 font-semibold tabular-nums">{data[hover][s.key].toLocaleString("id-ID")}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {showTable ? (
        <div className="mt-3 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Permohonan masuk dan izin terbit per bulan {year}</caption>
            <thead className="bg-slate-50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2">Bulan</th>
                {SERIES.map((s) => (
                  <th key={s.key} scope="col" className="px-3 py-2 text-right">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((d, i) => (
                <tr key={d.month}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">{MONTHS_FULL[i]}</th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.submitted.toLocaleString("id-ID")}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.issued.toLocaleString("id-ID")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}
