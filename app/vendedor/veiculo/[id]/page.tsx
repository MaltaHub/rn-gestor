import { VehicleDetail } from "@/components/vendedor/vehicle-detail";

export const dynamic = "force-dynamic";

export default async function VendedorVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VehicleDetail carroId={id} />;
}
