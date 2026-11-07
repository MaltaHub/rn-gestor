import { onlyDigits } from "@/lib/domain/vendas/validacao";

/**
 * Fornecedor (remetentes) a partir de um documento lido por OCR (ex.: nota de
 * entrada). Não tem carro_id: o veículo chega nele por documentos.remetente_id.
 * Puro (recebe as linhas), testável.
 */
export type FornecedorRow = { id: string; nome: string; cpf_cnpj: string | null; contato: string | null; endereco: string | null };

export type FornecedorDecision =
  | { kind: "existing"; id: string; fill: Record<string, unknown> }
  | { kind: "create"; row: Record<string, unknown> }
  | { kind: "missing-name" };

function sameText(left: unknown, right: unknown) {
  const norm = (value: unknown) =>
    String(value ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  return norm(left) !== "" && norm(left) === norm(right);
}

/**
 * Com CPF/CNPJ: o fornecedor do mesmo documento; senão um SEM documento e de
 * mesmo nome (ganha o documento). Sem CPF/CNPJ: o já ligado ao veículo; senão
 * pelo nome. Não achou → cadastra (precisa do nome). Fornecedor existente é
 * compartilhado entre veículos: só os campos VAZIOS dele são preenchidos.
 */
export function decideFornecedor(
  fornecedores: FornecedorRow[],
  linkedId: string | null,
  values: Record<string, unknown>
): FornecedorDecision {
  const digits = onlyDigits(String(values.cpf_cnpj ?? ""));
  const linked = fornecedores.find((row) => row.id === linkedId) ?? null;
  const withoutDoc = (row: FornecedorRow) => !onlyDigits(row.cpf_cnpj ?? "");
  const match = digits
    ? fornecedores.find((row) => onlyDigits(row.cpf_cnpj ?? "") === digits) ??
      [linked, ...fornecedores].find((row): row is FornecedorRow => Boolean(row && withoutDoc(row) && sameText(row.nome, values.nome))) ??
      null
    : linked ?? fornecedores.find((row) => sameText(row.nome, values.nome)) ?? null;

  if (match) {
    const fill = Object.fromEntries(
      Object.entries(values).filter(([column, value]) => {
        const current = match[column as keyof FornecedorRow];
        return value !== "" && value != null && (current == null || String(current).trim() === "");
      })
    );
    return { kind: "existing", id: match.id, fill };
  }
  if (!String(values.nome ?? "").trim()) return { kind: "missing-name" };
  return { kind: "create", row: { ...values, is_active: true } };
}
