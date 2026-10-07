import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Minus } from "lucide-react";
import { fetchRoleMatrix } from "@/services/users";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Matriks hak akses (baca saja). Penegakan sebenarnya ada di RLS database; matriks ini dokumentasi. */
export function RoleMatrix() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["role-matrix"], queryFn: fetchRoleMatrix });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Matriks hak akses belum dapat dimuat.
      </p>
    );
  }

  let lastModule = "";
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
            <th className="px-4 py-3 font-medium">Hak akses</th>
            {data.roles.map((r) => (
              <th key={r.code} className="px-3 py-3 text-center font-medium">
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.permissions.map((p) => {
            const header = p.module !== lastModule;
            lastModule = p.module;
            return (
              <Fragment key={p.code}>
                {header ? (
                  <tr className="bg-muted/30">
                    <td colSpan={data.roles.length + 1} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {p.module}
                    </td>
                  </tr>
                ) : null}
                <tr className="border-b last:border-0">
                  <td className="px-4 py-2">{p.label}</td>
                  {data.roles.map((r) => (
                    <td key={r.code} className="px-3 py-2 text-center">
                      {data.granted.has(`${r.code}|${p.code}`) ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="Diizinkan" />
                      ) : (
                        <Minus className="mx-auto h-4 w-4 text-slate-300" aria-label="Tidak diizinkan" />
                      )}
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
