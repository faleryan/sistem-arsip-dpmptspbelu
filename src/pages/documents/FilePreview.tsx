import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { errorMessage } from "@/lib/errors";
import { signedUrl } from "@/services/storage";

/** Signed URL 5 menit untuk sebuah path; di-cache sedikit di bawah umurnya. */
export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["documents", "signed", path],
    queryFn: () => signedUrl(path!, { expiresIn: 300 }),
    enabled: !!path,
    staleTime: 4 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
  });
}

/**
 * Penampil file arsip: PDF di iframe (penampil bawaan browser), gambar sebagai <img>.
 * Mengisi tinggi kontainer induk.
 */
export function FilePreview({ path, mime, title }: { path: string | null | undefined; mime: string | null | undefined; title: string }) {
  const url = useSignedUrl(path);

  if (!path) return <Centered icon="warn">Dokumen ini belum memiliki file.</Centered>;
  if (url.isLoading) {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Memuat pratinjau" />
      </Centered>
    );
  }
  if (url.isError || !url.data) return <Centered icon="warn">{errorMessage(url.error)}</Centered>;
  if (mime === "application/pdf") {
    return <iframe src={url.data} title={`Pratinjau ${title}`} className="h-full w-full border-0 bg-white" />;
  }
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-4">
      <img src={url.data} alt={title} className="max-h-full max-w-full rounded shadow" />
    </div>
  );
}

function Centered({ children, icon }: { children: React.ReactNode; icon?: "warn" }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
      {icon === "warn" ? <AlertTriangle className="h-8 w-8 text-amber-500" aria-hidden /> : null}
      {typeof children === "string" ? <p className="max-w-sm">{children}</p> : children}
    </div>
  );
}
