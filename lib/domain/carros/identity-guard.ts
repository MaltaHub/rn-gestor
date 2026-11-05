import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiHttpError } from "@/lib/api/errors";
import { plateVariants } from "@/lib/domain/ocr/engine";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Trava de identidade: chassi/renavam que JÁ pertence a OUTRO veículo não é
 * gravado (sintoma clássico de documento do carro errado). Exceção: o outro
 * registro tem a mesma placa (mesmo carro físico — ex.: recompra, linha nova).
 * Vale para qualquer caminho de gravação de documento (OCR, CRLV legado).
 */
export async function assertIdentityFreeForVehicle(
  supabase: SupabaseClient<Database>,
  carroId: string,
  values: { chassi?: string | null; renavam?: string | null }
) {
  const { data: self, error: selfError } = await supabase.from("carros").select("placa").eq("id", carroId).maybeSingle();
  if (selfError) {
    console.error("[VEHICLE_IDENTITY_CHECK_FAILED]", { selfError });
    throw new ApiHttpError(500, "VEHICLE_IDENTITY_CHECK_FAILED", "Falha ao conferir a identidade do veículo.");
  }
  const samePlates = new Set(self?.placa ? plateVariants(self.placa) : []);

  const checks: Array<{ column: "chassi" | "renavam"; label: string; candidates: string[]; shown: string }> = [];
  const chassi = values.chassi?.trim().toUpperCase();
  if (chassi) checks.push({ column: "chassi", label: "chassi", candidates: [chassi], shown: chassi });
  const renavam = values.renavam?.replace(/\D/g, "");
  if (renavam) {
    const bare = renavam.replace(/^0+/, "");
    checks.push({ column: "renavam", label: "Renavam", candidates: Array.from(new Set([renavam, bare, bare.padStart(11, "0")])), shown: renavam });
  }

  for (const check of checks) {
    const { data, error } = await supabase.from("carros").select("id, placa").in(check.column, check.candidates).neq("id", carroId).limit(5);
    if (error) {
      console.error("[VEHICLE_IDENTITY_CHECK_FAILED]", { error });
      throw new ApiHttpError(500, "VEHICLE_IDENTITY_CHECK_FAILED", "Falha ao conferir a identidade do veículo.");
    }
    const owner = (data ?? []).find((row) => !row.placa || !plateVariants(row.placa).some((variant) => samePlates.has(variant)));
    if (owner) {
      throw new ApiHttpError(
        409,
        "VEHICLE_IDENTITY_IN_USE",
        `O ${check.label} ${check.shown} já pertence ao veículo ${owner.placa ?? owner.id}. Confira se o documento é deste veículo — nada foi gravado.`
      );
    }
  }
}
