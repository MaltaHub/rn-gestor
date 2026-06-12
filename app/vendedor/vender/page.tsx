import { Suspense } from "react";
import { VenderWorkspace } from "@/components/vendedor/vender/vender-workspace";

export const dynamic = "force-dynamic";

export default function VendedorVenderPage() {
  // Suspense: VenderWorkspace lê ?carro= via useSearchParams.
  return (
    <Suspense fallback={null}>
      <VenderWorkspace />
    </Suspense>
  );
}
