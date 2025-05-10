
import { supabase } from "@/integrations/supabase/client";
import { withFeaturePermission } from "@/utils/permission";

/**
 * Deletes a vehicle from the database
 * @param id Vehicle ID
 * @param userId User making the deletion
 * @returns Promise with success/error status
 */
export const deleteVehicle = async (id: string, userId: string) => {
  return withFeaturePermission(
    userId,
    'delete-vehicle',
    async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .delete()
        .eq('id', id)
        .single();

      if (error) {
        console.error("Error deleting vehicle:", error);
        throw new Error("Failed to delete vehicle");
      }

      // Create a record in vehicle_change_history
      await supabase.from('vehicle_change_history').insert({
        vehicle_id: id,
        changed_by: userId,
        field_name: 'status',
        old_value: 'active',
        new_value: 'deleted'
      });

      return { success: true };
    },
    () => {
      throw new Error("Permission denied: You don't have permission to delete vehicles");
    }
  );
};
