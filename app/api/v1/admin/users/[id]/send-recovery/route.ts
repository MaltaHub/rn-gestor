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

    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/login`;
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: user.email,
      options: { redirectTo }
    });

    if (linkError) {
      throw new ApiHttpError(500, "PASSWORD_LINK_FAILED", "Falha ao gerar link de recuperacao.", linkError);
    }

    // Supabase v2: action link está em data.properties.action_link
    const recoveryLink = (linkData?.properties as { action_link?: string } | undefined)?.action_link ?? null;
    return apiOk({ recoveryLink }, { request_id: requestId });
  });
}
