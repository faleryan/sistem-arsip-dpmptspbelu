import { useEffect, useId, useRef, useState } from "react";
import { FileText, ImageIcon, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCEPT_ATTR, extOf, formatBytes } from "@/lib/files";

/** Area pilih/seret file. Validasi isi dilakukan saat unggah (validateArchiveFile). */
export function FileDropzone({
  file,
  onFile,
  maxBytes,
  disabled,
  error,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  maxBytes: number;
  disabled?: boolean;
  error?: string | null;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [thumb, setThumb] = useState<string | null>(null);

  // Pratinjau kecil untuk gambar (blob URL lokal, dibersihkan saat file berganti).
  useEffect(() => {
    if (!file || !/^(jpe?g|png)$/.test(extOf(file.name))) {
      setThumb(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setThumb(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(list: FileList | null) {
    const f = list?.[0];
    if (f) onFile(f);
  }

  if (file) {
    const isImg = /^(jpe?g|png)$/.test(extOf(file.name));
    return (
      <div className={cn("flex items-center gap-3 rounded-lg border p-3", error && "border-red-400")}>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
          {thumb ? (
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : isImg ? (
            <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
          ) : (
            <FileText className="h-6 w-6 text-red-600" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {extOf(file.name).toUpperCase() || "?"} · {formatBytes(file.size)}
          </p>
        </div>
        {!disabled ? (
          <button
            type="button"
            onClick={() => onFile(null)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Ganti file"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) pick(e.dataTransfer.files);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
        over ? "border-navy-500 bg-navy-50" : "border-slate-300 bg-slate-50/50",
        error && "border-red-400",
        disabled && "opacity-50",
      )}
    >
      <UploadCloud className="h-8 w-8 text-navy-500" aria-hidden />
      <p className="text-sm">
        Seret file ke sini, atau{" "}
        <label htmlFor={inputId} className="cursor-pointer font-medium text-accent underline-offset-2 hover:underline">
          pilih dari perangkat
        </label>
      </p>
      <p className="text-xs text-muted-foreground">PDF, JPG, atau PNG · maks. {formatBytes(maxBytes)}</p>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
