import { useQuery } from "@tanstack/react-query";
import {
  listArchiveClasses,
  listDistricts,
  listDocumentTypes,
  listLicenseTypes,
  listUnitsRef,
  listVillages,
} from "@/services/reference";

const STALE = 5 * 60 * 1000;

/** Kunci cache data rujukan; dibatalkan saat Master Data diubah. */
export const REF_KEY = ["ref"] as const;

export const useDistricts = () => useQuery({ queryKey: [...REF_KEY, "districts"], queryFn: listDistricts, staleTime: STALE });

export const useVillages = (districtId?: string | null) =>
  useQuery({
    queryKey: [...REF_KEY, "villages", districtId ?? "all"],
    queryFn: () => listVillages(districtId),
    staleTime: STALE,
    enabled: districtId !== undefined,
  });

export const useLicenseTypes = (activeOnly = false) =>
  useQuery({ queryKey: [...REF_KEY, "license_types", activeOnly], queryFn: () => listLicenseTypes(activeOnly), staleTime: STALE });

export const useDocumentTypes = (activeOnly = false) =>
  useQuery({ queryKey: [...REF_KEY, "document_types", activeOnly], queryFn: () => listDocumentTypes(activeOnly), staleTime: STALE });

export const useUnitsRef = () => useQuery({ queryKey: [...REF_KEY, "units"], queryFn: listUnitsRef, staleTime: STALE });

export const useArchiveClasses = () =>
  useQuery({ queryKey: [...REF_KEY, "archive_classes"], queryFn: listArchiveClasses, staleTime: STALE });
