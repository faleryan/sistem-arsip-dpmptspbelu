/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Opsional: domain publik untuk URL di QR (default: domain aplikasi saat ini). */
  readonly VITE_PUBLIC_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Diisi vite.config.ts saat build. */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
