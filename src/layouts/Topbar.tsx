import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, ChevronDown, LogOut, Menu } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { PAGE_TITLES } from "@/routes/navigation";
import { ROLE_LABEL } from "@/types/domain";
import { Button } from "@/components/ui/button";

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { profile, signOut } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const base = "/" + (pathname.split("/")[1] ?? "");
  const title = PAGE_TITLES[pathname] ?? PAGE_TITLES[base] ?? "SIPAR-BELU";

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initials = (profile?.full_name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-white/90 px-4 backdrop-blur lg:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMenu}
        aria-label="Buka menu"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </Button>

      <h1 className="text-base font-semibold text-navy-900">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        {/* Jumlah notifikasi belum dibaca disambungkan ke database di Fase 6. */}
        <Button variant="ghost" size="icon" asChild aria-label="Notifikasi">
          <Link to="/notifikasi">
            <Bell className="h-5 w-5" aria-hidden />
          </Link>
        </Button>

        <div className="relative" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white">
              {initials || "?"}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-medium">{profile?.full_name}</span>
              <span className="block text-[11px] text-muted-foreground">
                {profile ? ROLE_LABEL[profile.role] : ""}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
          </button>

          {open ? (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-48 rounded-lg border bg-white p-1 shadow-lg"
            >
              <button
                role="menuitem"
                type="button"
                onClick={() => void signOut()}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Keluar
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
