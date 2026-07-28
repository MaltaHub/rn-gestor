import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";
import { resolveAppOrigin } from "@/lib/api/app-origin";
import { PASSWORD_RECOVERY_PATH } from "@/lib/domain/password-policy";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return executeAuthorizedApi(req, "ADMINISTRADOR", async ({ requestId, supabase }) => {
    const { id } = await params;

    const { data: user, error } = await supabase
      .from("usuarios_acesso")
      .select("id, email")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new ApiHttpError(400, "ACCESS_USER_READ_FAILED", "Falha ao carregar usuario.", error);
    if (!user?.email) throw new ApiHttpError(400, "USER_EMAIL_REQUIRED", "Usuario sem email para recuperar senha.");

    // Mesma página única de recuperação usada pelo "Esqueci minha senha".
    // A origem sai de resolveAppOrigin (env quando existe, senão o host do
    // request) — antes dependia só de NEXT_PUBLIC_SITE_URL, que não existe neste
    // projeto, e o redirect saía relativo e era descartado pelo Supabase.
    const redirectTo = `${resolveAppOrigin(req)}${PASSWORD_RECOVERY_PATH}`;

    // ENVIA o email de recuperação direto ao usuário (Supabase dispara o email),
    // em vez de só gerar o link para o admin copiar.
    const { error: sendError } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo });
    if (sendError) {
      throw new ApiHttpError(500, "PASSWORD_RECOVERY_SEND_FAILED", "Falha ao enviar email de recuperacao.", sendError);
    }

    return apiOk({ sent: true, email: user.email }, { request_id: requestId });
  });
}
