import { useCallback, useState } from "react";
import type { ZodType, ZodTypeDef } from "zod";

/**
 * Form kecil berbasis zod: menyimpan nilai, galat per kolom, dan memvalidasi saat submit.
 * Nilai input disimpan sebagai string; skema zod yang mengubahnya ke tipe akhir.
 */
export function useZodForm<V extends Record<string, string | boolean>, Out>(
  schema: ZodType<Out, ZodTypeDef, unknown>,
  initial: V,
) {
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof V, string>>>({});

  const set = useCallback(<K extends keyof V>(key: K, value: V[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  /** Pengikat cepat untuk <Input>/<Select>/<Textarea>. */
  const bind = useCallback(
    <K extends keyof V>(key: K) => ({
      value: values[key] as string,
      onChange: (e: { target: { value: string } }) => set(key, e.target.value as V[K]),
      "aria-invalid": errors[key] ? true : undefined,
    }),
    [values, errors, set],
  );

  /** Kembalikan data hasil parse, atau null dan tampilkan galat per kolom. */
  const validate = useCallback((): Out | null => {
    const res = schema.safeParse(values);
    if (res.success) {
      setErrors({});
      return res.data;
    }
    const next: Partial<Record<keyof V, string>> = {};
    for (const issue of res.error.issues) {
      const k = issue.path[0] as keyof V | undefined;
      if (k !== undefined && !next[k]) next[k] = issue.message;
    }
    setErrors(next);
    return null;
  }, [schema, values]);

  return { values, setValues, set, bind, errors, setErrors, validate };
}
