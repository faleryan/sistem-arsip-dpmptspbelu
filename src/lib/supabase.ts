import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_URL: string = url || "http://localhost:54321";
export const SUPABASE_ANON_KEY: string = anonKey || "anon-key-belum-diisi";

/** True bila variabel lingkungan Supabase sudah diisi. */
export const isSupabaseConfigured = Boolean(url && anonKey);

const REMEMBER_KEY = "sipar:remember";

/** Atur apakah sesi diingat setelah browser ditutup (true) atau hanya selama tab terbuka (false). */
export function setRememberSession(remember: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  } catch {
    /* penyimpanan diblokir — abaikan */
  }
}

function pickStorage(): Storage {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "0" ? sessionStorage : localStorage;
  } catch {
    return sessionStorage;
  }
}

// Penyimpanan sesi Supabase mengikuti pilihan "Ingat sesi saya" pada halaman login.
const sessionStorageAdapter = {
  getItem: (key: string) => pickStorage().getItem(key),
  setItem: (key: string, value: string) => pickStorage().setItem(key, value),
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      /* abaikan */
    }
  },
};

// Bila belum dikonfigurasi, gunakan nilai placeholder agar aplikasi tetap bisa
// dirender dan menampilkan layar "konfigurasi belum lengkap" (bukan blank page).
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: sessionStorageAdapter,
    },
  },
);
