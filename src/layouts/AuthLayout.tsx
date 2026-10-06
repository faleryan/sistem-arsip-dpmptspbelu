import type { ReactNode } from "react";
import { Brand } from "@/components/shared/Brand";
import { AGENCY_NAME, APP_FULL_NAME } from "@/types/domain";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between bg-navy-900 p-12 text-white lg:flex">
        <Brand inverted />
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            Arsip perizinan yang tertata, aman, dan mudah ditemukan.
          </h2>
          <p className="mt-4 text-sm text-navy-200">
            {APP_FULL_NAME} untuk seluruh pegawai {AGENCY_NAME}.
          </p>
        </div>
        <p className="text-xs text-navy-200/70">© {new Date().getFullYear()} DPMPTSP Kabupaten Belu</p>
      </div>

      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          <Brand className="mb-8 lg:hidden" />
          {children}
        </div>
      </div>
    </div>
  );
}
