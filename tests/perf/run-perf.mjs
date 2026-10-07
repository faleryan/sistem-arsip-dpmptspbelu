// Uji performa kueri utama aplikasi lewat PostgREST (gateway lokal) dengan data sintetis.
// Prasyarat: stack E2E berjalan + tests/perf/seed_perf.sql sudah dimuat. Pemakaian: node tests/perf/run-perf.mjs
// Setiap kueri dijalankan 7× (1 pemanasan + 6 diukur); dilaporkan median & maksimum (ms).
const GW = process.env.GW || "http://127.0.0.1:54321";
const RUNS = 6;
const BUDGET_MS = Number(process.env.BUDGET_MS || 500);

async function login(email) {
  const r = await fetch(`${GW}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "SiparBelu#Uji2026" }),
  });
  return (await r.json()).access_token;
}

const LIC = "id,license_number,application_number,nib,year,status,application_date,issue_date,expiry_date,license_type_id,license_type_code,license_type_name,district_id,district_name,applicant_id,applicant_name,applicant_nik,applicant_npwp,business_id,business_name,officer_id,created_at";
const DOC = "id,license_id,title,document_number,document_date,status,created_at,document_type_name,version_no,file_name,mime_type,size_bytes,storage_path,uploaded_at,application_number,license_number,license_status,applicant_name,business_name,year";
const or = (cols, term) => `or=(${cols.map((c) => `${c}.ilike.*${encodeURIComponent(term)}*`).join(",")})`;
const LIC_SEARCH = ["application_number", "license_number", "applicant_name", "business_name", "nib", "applicant_nik"];
const DOC_SEARCH = ["title", "document_number", "file_name", "application_number", "license_number", "applicant_name", "business_name"];
const year = new Date().getFullYear();

const CASES = [
  ["Daftar izin hal. 1 (urut terbaru)", "GET", `v_license_search?select=${LIC}&order=created_at.desc.nullslast,id.asc&offset=0&limit=20`],
  ["Daftar izin hal. 1.000", "GET", `v_license_search?select=${LIC}&order=created_at.desc.nullslast,id.asc&offset=19980&limit=20`],
  ["Cari izin (nama pemohon)", "GET", `v_license_search?select=${LIC}&${or(LIC_SEARCH, "Sintetis 1234")}&order=created_at.desc.nullslast,id.asc&limit=20`],
  ["Cari izin (no. permohonan)", "GET", `v_license_search?select=${LIC}&${or(LIC_SEARCH, "PRF-00420")}&order=created_at.desc.nullslast,id.asc&limit=20`],
  ["Filter AKTIF + urut berakhir", "GET", `v_license_search?select=${LIC}&status=eq.AKTIF&order=expiry_date.asc.nullslast,id.asc&limit=20`],
  ["NIK tepat (pencarian lanjutan)", "GET", `v_license_search?select=${LIC}&applicant_nik=eq.7900000000012345&limit=20`],
  ["Detail izin", "GET", `v_license_search?select=${LIC}&application_number=eq.PRF-0025000`, false],
  ["Arsip dokumen hal. 1", "GET", `v_document_search?select=${DOC}&order=uploaded_at.desc.nullslast,id.asc&limit=20`],
  ["Cari arsip dokumen", "GET", `v_document_search?select=${DOC}&${or(DOC_SEARCH, "PRF-00777")}&order=uploaded_at.desc.nullslast,id.asc&limit=20`],
  ["Audit log hal. 1", "GET", `audit_logs?select=id,user_name,action,description,module,record_id,created_at&order=created_at.desc.nullslast,id.asc&limit=20`],
  ["Cari audit log", "GET", `audit_logs?select=id,user_name,action,description,module,record_id,created_at&${or(["description", "user_name"], "PRF-0004")}&order=created_at.desc.nullslast,id.asc&limit=20`],
  ["Dashboard: hitung izin aktif", "HEAD", `licenses?select=id&deleted_at=is.null&status=eq.AKTIF`],
  ["Dashboard: dokumen menunggu", "HEAD", `documents?select=id&deleted_at=is.null&status=eq.MENUNGGU_VERIFIKASI`],
  ["Notifikasi belum dibaca", "HEAD", `notifications?select=id&is_read=eq.false`],
  ["Laporan rekap (7 tahun)", "POST", `rpc/report_license_summary`, false, { p_from: "2019-01-01", p_to: `${year}-12-31`, p_basis: "application", p_district_id: null }],
  ["Laporan tren bulanan", "POST", `rpc/report_monthly`, false, { p_year: year }],
  ["Laporan dokumen", "POST", `rpc/report_document_summary`, false, { p_from: null, p_to: null }],
];

async function timeOne(token, method, path, count, body) {
  const t0 = performance.now();
  const r = await fetch(`${GW}/rest/v1/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(count !== false ? { prefer: "count=exact" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const ms = performance.now() - t0;
  if (!r.ok) throw new Error(`${r.status} ${text.slice(0, 200)}`);
  return { ms, total: r.headers.get("content-range")?.split("/")[1] };
}

const roles = (process.env.ROLES || "superadmin,viewer").split(",");
let over = 0;
for (const role of roles) {
  const token = await login(`${role}@example.com`);
  console.log(`\n── ${role} ──`);
  console.log("kueri".padEnd(36), "median".padStart(8), "maks".padStart(8), "  total baris");
  for (const [name, method, path, count, body] of CASES) {
    try {
      await timeOne(token, method, path, count, body);
      const ms = [];
      let total;
      for (let i = 0; i < RUNS; i++) {
        const r = await timeOne(token, method, path, count, body);
        ms.push(r.ms);
        total = r.total;
      }
      ms.sort((a, b) => a - b);
      const med = (ms[2] + ms[3]) / 2;
      if (med > BUDGET_MS) over++;
      console.log(name.padEnd(36), med.toFixed(0).padStart(8), ms.at(-1).toFixed(0).padStart(8), `  ${total ?? "-"}${med > BUDGET_MS ? "  ⚠ melebihi anggaran" : ""}`);
    } catch (e) {
      over++;
      console.log(name.padEnd(36), "GAGAL", e.message);
    }
  }
}
console.log(`\nAnggaran ${BUDGET_MS} ms per kueri: ${over ? `${over} kueri melebihi` : "semua terpenuhi"}`);
process.exit(over ? 1 : 0);
