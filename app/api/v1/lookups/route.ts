import { NextRequest } from "next/server";
import { executeApi } from "@/lib/api/execute";
import { apiOk } from "@/lib/api/response";
import { getSupabaseAdmin } from "@/lib/api/supabase-admin";
import { ApiHttpError } from "@/lib/api/errors";

export async function GET(req: NextRequest) {
  return executeApi(req, async ({ requestId }) => {
    const supabase = getSupabaseAdmin();

    const [rolesRes, statusesRes, saleStatusesRes, announcementStatusesRes, locationsRes, vehicleStatesRes] =
      await Promise.all([
        supabase.from("lookup_user_roles").select("code, name").eq("is_active", true).order("sort_order"),
        supabase.from("lookup_user_statuses").select("code, name").eq("is_active", true).order("sort_order"),
        supabase.from("lookup_sale_statuses").select("code, name").eq("is_active", true).order("sort_order"),
        supabase
          .from("lookup_announcement_statuses")
          .select("code, name")
          .eq("is_active", true)
          .order("sort_order"),
        supabase.from("lookup_locations").select("code, name").eq("is_active", true).order("sort_order"),
        supabase.from("lookup_vehicle_states").select("code, name").eq("is_active", true).order("sort_order")
      ]);

    const errors = [
      rolesRes.error,
      statusesRes.error,
      saleStatusesRes.error,
      announcementStatusesRes.error,
      locationsRes.error,
      vehicleStatesRes.error
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new ApiHttpError(500, "LOOKUPS_FETCH_FAILED", "Falha ao carregar tabelas de dominio.", errors[0]);
    }

    return apiOk(
      {
        user_roles: rolesRes.data ?? [],
        user_statuses: statusesRes.data ?? [],
        sale_statuses: saleStatusesRes.data ?? [],
        announcement_statuses: announcementStatusesRes.data ?? [],
        locations: locationsRes.data ?? [],
        vehicle_states: vehicleStatesRes.data ?? []
      },
      { request_id: requestId }
    );
  });
}
