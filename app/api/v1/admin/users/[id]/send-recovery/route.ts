import { NextRequest } from "next/server";
import { executeAuthorizedApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { ApiHttpError } from "@/lib/api/errors";

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
    // Remove a barra final do site URL p/ não gerar "//redefinir-senha" (que
    // não casaria com a allow-list de Redirect URLs do Supabase).
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
    const redirectTo = `${siteUrl}/redefinir-senha`;

    // ENVIA o email de recuperação direto ao usuário (Supabase dispara o email),
    // em vez de só gerar o link para o admin copiar.
    const { error: sendError } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo });
    if (sendError) {
      throw new ApiHttpError(500, "PASSWORD_RECOVERY_SEND_FAILED", "Falha ao enviar email de recuperacao.", sendError);
    }

    return apiOk({ sent: true, email: user.email }, { request_id: requestId });
  });
}
