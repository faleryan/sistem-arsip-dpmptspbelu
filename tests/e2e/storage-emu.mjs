// Tiruan Supabase Storage API untuk uji E2E. Perilaku yang ditiru:
//  - POST /storage/v1/object/{bucket}/{path}   unggah (batas ukuran & MIME bucket, tanpa upsert)
//  - POST /storage/v1/object/sign/{bucket}/{path}  signed URL
//  - GET  /storage/v1/object/sign/{bucket}/{path}?token=…[&download=nama]
// Hak akses TIDAK ditiru: setiap operasi dijalankan sebagai user (SET LOCAL ROLE authenticated +
// request.jwt.claims) sehingga policy RLS storage.objects dari migration 0005 yang memutuskan,
// persis seperti layanan Storage Supabase. HANYA untuk pengujian.
import crypto from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import pg from "pg";

const DIR = join(dirname(new URL(import.meta.url).pathname), ".storage");
const pool = new pg.Pool({
  host: process.env.PGHOST || "/tmp",
  port: Number(process.env.PGPORT || 54329),
  user: process.env.PGUSER || "postgres",
  database: "sipar",
  max: 4,
});

/** Jalankan fn dalam transaksi sebagai user JWT (meniru cara layanan Storage memakai RLS). */
async function asUser(claims, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await c.query("set local role authenticated");
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const json = (res, cors, status, body) => {
  res.writeHead(status, { ...cors, "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
// Supabase Storage mengembalikan HTTP 400 dengan statusCode asli di badan respons.
const fail = (res, cors, code, error, message) => json(res, cors, 400, { statusCode: String(code), error, message });

export function makeStorage({ verifyJwt, secret }) {
  const sigFor = (path, exp) => crypto.createHmac("sha256", secret).update(`${path}|${exp}`).digest("base64url");

  return async function handle(req, res, body, cors) {
    const u = new URL(req.url, "http://x");
    const rest = decodeURIComponent(u.pathname.replace(/^\/storage\/v1\/object\//, ""));

    // ── unduh lewat signed URL (tanpa login) ──
    if (req.method === "GET" && rest.startsWith("sign/")) {
      const full = rest.slice(5);
      const [p64, sig] = (u.searchParams.get("token") || "").split(".");
      let tok;
      try { tok = JSON.parse(Buffer.from(p64, "base64url").toString()); } catch { tok = null; }
      if (!tok || tok.p !== full || tok.exp < Date.now() / 1000 || sig !== sigFor(tok.p, tok.exp)) {
        return fail(res, cors, 400, "InvalidSignature", "The signature is invalid or has expired");
      }
      const file = join(DIR, full);
      if (!existsSync(file)) return fail(res, cors, 404, "not_found", "Object not found");
      const meta = JSON.parse(readFileSync(file + ".meta.json", "utf8"));
      const dl = u.searchParams.get("download");
      const headers = { ...cors, "content-type": meta.mimetype, "content-length": meta.size };
      if (dl !== null) headers["content-disposition"] = `attachment; filename="${(dl || full.split("/").pop()).replace(/"/g, "")}"`;
      res.writeHead(200, headers);
      return res.end(readFileSync(file));
    }

    const claims = verifyJwt(req.headers.authorization);
    if (!claims) return fail(res, cors, 401, "Unauthorized", "Invalid JWT");

    // ── buat signed URL ──
    if (req.method === "POST" && rest.startsWith("sign/")) {
      const full = rest.slice(5);
      const [bucket, ...parts] = full.split("/");
      const name = parts.join("/");
      const found = await asUser(claims, (c) =>
        c.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name]));
      if (!found.rowCount || !existsSync(join(DIR, full))) return fail(res, cors, 404, "not_found", "Object not found");
      const { expiresIn = 60 } = JSON.parse(body.toString() || "{}");
      const exp = Math.floor(Date.now() / 1000) + Number(expiresIn);
      const token = `${Buffer.from(JSON.stringify({ p: full, exp })).toString("base64url")}.${sigFor(full, exp)}`;
      return json(res, cors, 200, { signedURL: `/object/sign/${full}?token=${token}` });
    }

    // ── unggah ──
    if (req.method === "POST") {
      const [bucket, ...parts] = rest.split("/");
      const name = parts.join("/");
      const mime = (req.headers["content-type"] || "").split(";")[0].trim();
      try {
        const b = (await pool.query("select * from storage.buckets where id = $1", [bucket])).rows[0];
        if (!b) return fail(res, cors, 404, "Bucket not found", "Bucket not found");
        if (b.file_size_limit && body.length > Number(b.file_size_limit)) {
          return fail(res, cors, 413, "Payload too large", "The object exceeded the maximum allowed size");
        }
        if (b.allowed_mime_types && !b.allowed_mime_types.includes(mime)) {
          return fail(res, cors, 415, "invalid_mime_type", `mime type ${mime} is not supported`);
        }
        const id = await asUser(claims, async (c) => {
          const dup = await c.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name]);
          if (dup.rowCount) throw Object.assign(new Error("dup"), { dup: true });
          const r = await c.query(
            "insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4) returning id",
            [bucket, name, claims.sub, JSON.stringify({ size: body.length, mimetype: mime })]);
          return r.rows[0].id;
        });
        const file = join(DIR, bucket, name);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, body);
        writeFileSync(file + ".meta.json", JSON.stringify({ size: body.length, mimetype: mime }));
        return json(res, cors, 200, { Key: `${bucket}/${name}`, Id: id });
      } catch (e) {
        if (e.dup) return fail(res, cors, 409, "Duplicate", "The resource already exists");
        if (/row-level security/.test(e.message)) return fail(res, cors, 403, "Unauthorized", "new row violates row-level security policy");
        return fail(res, cors, 500, "internal", e.message);
      }
    }
    return fail(res, cors, 404, "not_found", "Not found");
  };
}
