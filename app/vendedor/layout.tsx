import "@/styles/vendedor.css";
import { VendedorShell } from "@/components/vendedor/vendedor-shell";

export const dynamic = "force-dynamic";

export default function VendedorLayout({ children }: { children: React.ReactNode }) {
  return <VendedorShell>{children}</VendedorShell>;
}
