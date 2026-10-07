import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { fetchSettings, SETTING_DEFAULTS } from "@/services/settings";

export const SETTINGS_KEY = ["settings"] as const;

export function useSettings() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: fetchSettings,
    enabled: !!profile,
    staleTime: 5 * 60_000,
  });
}

/** Nama instansi untuk kop laporan, label QR, dsb. Jatuh ke nilai bawaan bila belum termuat. */
export function useAgency() {
  const s = useSettings();
  const v = s.data?.values ?? SETTING_DEFAULTS;
  return { name: v.agency_name, shortName: v.agency_short_name };
}
