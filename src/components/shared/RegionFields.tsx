import { Field } from "@/components/shared/Field";
import { Select } from "@/components/ui/select";
import { useDistricts, useVillages } from "@/hooks/useReference";

/** Pilihan kecamatan → desa/kelurahan bertingkat. Mengganti kecamatan mengosongkan desa. */
export function RegionFields({
  districtId,
  villageId,
  onChange,
  errors,
}: {
  districtId: string;
  villageId: string;
  onChange: (next: { district_id: string; village_id: string }) => void;
  errors?: { district_id?: string; village_id?: string };
}) {
  const districts = useDistricts();
  const villages = useVillages(districtId || undefined);

  return (
    <>
      <Field label="Kecamatan" error={errors?.district_id}>
        <Select value={districtId} onChange={(e) => onChange({ district_id: e.target.value, village_id: "" })}>
          <option value="">{districts.isLoading ? "Memuat…" : "— Pilih kecamatan —"}</option>
          {(districts.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Desa/Kelurahan" error={errors?.village_id}>
        <Select
          value={villageId}
          disabled={!districtId}
          onChange={(e) => onChange({ district_id: districtId, village_id: e.target.value })}
        >
          <option value="">
            {!districtId ? "Pilih kecamatan dahulu" : villages.isLoading ? "Memuat…" : "— Pilih desa/kelurahan —"}
          </option>
          {(villages.data ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.type === "kelurahan" ? "Kel. " : "Desa "}
              {v.name}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
