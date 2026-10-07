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

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range, content-profile, content-disposition" };
http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    if (req.url.startsWith("/auth/v1/token")) {
      const { email, password } = JSON.parse(body.toString() || "{}");
      const id = USERS[email];
      if (!id || password !== "SiparBelu#Uji2026") {
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
