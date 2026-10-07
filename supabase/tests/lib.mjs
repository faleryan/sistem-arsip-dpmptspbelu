import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const here = dirname(fileURLToPath(import.meta.url));
export const root = join(here, "..");

export const read = (...p) => readFileSync(join(root, ...p), "utf8");

/** Boot PGlite, pasang tiruan Supabase, jalankan semua migration berurutan. */
export async function bootDb({ log = () => {} } = {}) {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  await db.exec(readFileSync(join(here, "mock_supabase.sql"), "utf8"));
  const files = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    log(`migration ${f}`);
    try {
      await db.exec(read("migrations", f));
    } catch (e) {
      e.message = `[${f}] ${e.message}`;
      throw e;
    }
  }
  return { db, files };
}

/** Jalankan fn sebagai role/user tertentu (meniru PostgREST: SET LOCAL ROLE + JWT claims). */
export async function as(db, who, fn) {
  const claims = who?.id ? JSON.stringify({ sub: who.id, role: "authenticated" }) : "";
  const role = who === "anon" ? "anon" : who?.id ? "authenticated" : "postgres";
  await db.exec(`reset role; select set_config('request.jwt.claims', '${claims}', false);`);
  if (role !== "postgres") await db.exec(`set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claims', '', false);");
  }
}
