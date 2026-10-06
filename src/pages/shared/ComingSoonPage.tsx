import { Hammer } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

/** Penanda modul yang dibangun pada fase berikutnya (bukan data/fitur palsu). */
export default function ComingSoonPage({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={Hammer}
        title="Modul ini dikerjakan pada fase berikutnya"
        description={`Dijadwalkan pada Fase ${phase} sesuai roadmap implementasi.`}
      />
    </>
  );
}
