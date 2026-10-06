import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { NAV_GROUPS } from "@/routes/navigation";
import { Brand } from "@/components/shared/Brand";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { profile } = useAuth();
  const role = profile?.role;

  return (
    <div className="flex h-full flex-col bg-navy-900 text-navy-100">
      <div className="px-5 py-5">
        <Brand inverted subtitle="DPMPTSP Kabupaten Belu" />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6" aria-label="Menu utama">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => (role ? i.roles.includes(role) : false));
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-navy-200/60">
                {group.title}
              </div>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === "/"}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          isActive
                            ? "bg-white/10 font-medium text-white"
                            : "text-navy-100/80 hover:bg-white/5 hover:text-white",
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
