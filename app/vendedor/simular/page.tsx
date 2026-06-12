import { redirect } from "next/navigation";

// "Simular" virou o gerenciador de venda completo em /vendedor/vender
// (Vendas 2.0). Redirect preserva links/favoritos antigos.
export default function VendedorSimularPage() {
  redirect("/vendedor/vender");
}
