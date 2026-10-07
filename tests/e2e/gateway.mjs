// Gateway tiruan Supabase untuk uji E2E lokal: /rest/v1 → PostgREST (:3000), /auth/v1 → login sederhana (JWT HS256),
// /storage/v1 → tiruan Storage API dengan policy RLS asli (storage-emu.mjs).
// HANYA untuk pengujian. Kata sandi dan secret di bawah sengaja sama dengan seed_test_users.sql dan pgrst.conf.
import http from "node:http";
import crypto from "node:crypto";
import { makeStorage } from "./storage-emu.mjs";
const SECRET = "sipar-local-test-secret-0123456789abcdef";
const USERS = {
  "superadmin@example.com": "11111111-1111-1111-1111-111111111101",
  "adminarsip@example.com": "11111111-1111-1111-1111-111111111102",
  "petugas@example.com": "11111111-1111-1111-1111-111111111103",
  "verifikator@example.com": "11111111-1111-1111-1111-111111111104",
  "pimpinan@example.com": "11111111-1111-1111-1111-111111111105",
  "viewer@example.com": "11111111-1111-1111-1111-111111111106",
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function sign(sub, email) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ sub, email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 * 8 });
  const s = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
/** Verifikasi JWT HS256 buatan gateway ini; kembalikan klaim atau null. */
function verifyJwt(authorization) {
  const tok = (authorization || "").replace(/^Bearer /, "");
  const [h, p, s] = tok.split(".");
  if (!h || !p || !s) return null;
  if (crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url") !== s) return null;
  const claims = JSON.parse(Buffer.from(p, "base64url").toString());
  return claims.exp > Date.now() / 1000 ? claims : null;
}
const storage = makeStorage({ verifyJwt, secret: SECRET });
const PASSWORDS = {}; // akun yang dibuat lewat API admin (uji Edge Function)
import pg from "pg";
const pool = new pg.Pool({ host: process.env.PGHOST || "/tmp", port: Number(process.env.PGPORT || 54329), user: "postgres", database: "sipar", max: 2 });

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range, content-profile, content-disposition" };
http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    // Tiruan API admin Auth (hanya kunci service_role), dipakai uji Edge Function admin-create-user.
    if (req.url.startsWith("/auth/v1/admin/users")) {
      const claims = verifyJwt(req.headers.authorization);
      const send = (st, obj) => { res.writeHead(st, { ...cors, "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (claims?.role !== "service_role") return send(401, { msg: "service_role required" });
      const id = req.url.split("/")[5]?.split("?")[0];
      const b = JSON.parse(body.toString() || "{}");
      (async () => {
        if (req.method === "POST" && !id) {
          if (Object.values(USERS).length && (USERS[b.email] || PASSWORDS[b.email])) return send(422, { code: 422, msg: "A user with this email address has already been registered" });
          const r = await pool.query("insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id", [b.email]);
          USERS[b.email] = r.rows[0].id; PASSWORDS[b.email] = b.password;
          return send(200, { id: r.rows[0].id, email: b.email, aud: "authenticated", role: "authenticated", user_metadata: b.user_metadata ?? {}, app_metadata: {}, created_at: new Date().toISOString() });
        }
        if (req.method === "PUT" && id) {
          const email = Object.keys(USERS).find((k) => USERS[k] === id);
          if (!email) return send(404, { msg: "User not found" });
          if (b.password) PASSWORDS[email] = b.password;
          return send(200, { id, email, aud: "authenticated", role: "authenticated", user_metadata: {}, app_metadata: {} });
        }
        if (req.method === "DELETE" && id) {
          await pool.query("delete from auth.users where id = $1", [id]);
          return send(200, {});
        }
        send(404, {});
      })().catch((e) => send(500, { msg: String(e) }));
      return;
    }
    if (req.url.startsWith("/auth/v1/token")) {
      const { email, password } = JSON.parse(body.toString() || "{}");
      const id = USERS[email];
      if (!id || password !== (PASSWORDS[email] ?? "SiparBelu#Uji2026")) {
        res.writeHead(400, { ...cors, "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }));
      }
      const t = sign(id, email);
      res.writeHead(200, { ...cors, "content-type": "application/json" });
      return res.end(JSON.stringify({ access_token: t, token_type: "bearer", expires_in: 28800, expires_at: Math.floor(Date.now()/1000)+28800, refresh_token: "r-" + id,
        user: { id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" } }));
    }
    if (req.url.startsWith("/auth/v1/logout")) { res.writeHead(204, cors); return res.end(); }
    if (req.url.startsWith("/auth/v1/user")) {
      const tok = (req.headers.authorization || "").replace("Bearer ", "");
      try { const p = JSON.parse(Buffer.from(tok.split(".")[1], "base64url")); res.writeHead(200, { ...cors, "content-type": "application/json" });
        return res.end(JSON.stringify({ id: p.sub, aud: "authenticated", role: "authenticated", email: p.email, app_metadata: {}, user_metadata: {} })); }
      catch { res.writeHead(401, cors); return res.end("{}"); }
    }
    if (req.url.startsWith("/storage/v1/object/")) {
      return storage(req, res, body, cors).catch((e) => { res.writeHead(500, cors); res.end(String(e)); });
    }
    if (req.url.startsWith("/rest/v1/")) {
      const headers = { ...req.headers }; delete headers.host; delete headers.apikey;
      if (headers.authorization === "Bearer anon-key") delete headers.authorization;
      const up = http.request({ host: "127.0.0.1", port: 3000, path: req.url.slice(8), method: req.method, headers }, (r) => {
        res.writeHead(r.statusCode, { ...r.headers, ...cors }); r.pipe(res);
      });
      up.on("error", (e) => { res.writeHead(502, cors); res.end(String(e)); });
      return up.end(body);
    }
    res.writeHead(404, { ...cors, "content-type": "application/json" }); res.end("{}");
  });
}).listen(54321, () => console.log("gateway :54321"));
