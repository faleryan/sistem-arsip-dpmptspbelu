import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFoundPage({ forbidden = false }: { forbidden?: boolean }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl font-bold text-navy-200">{forbidden ? "403" : "404"}</p>
      <h1 className="mt-3 text-lg font-semibold text-navy-900">
        {forbidden ? "Anda tidak berwenang membuka halaman ini" : "Halaman tidak ditemukan"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {forbidden
          ? "Hubungi Super Admin bila Anda memerlukan akses."
          : "Alamat yang Anda tuju tidak tersedia."}
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Kembali ke Dashboard</Link>
      </Button>
    </div>
  );
}
