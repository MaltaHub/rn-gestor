
import { supabase } from "@/integrations/supabase/client";

/**
 * Deletes a vehicle from the database
 * @param id Vehicle ID
 * @param userId User making the deletion
 * @returns Promise with success/error status
 */
export const deleteVehicle = async (id: string, userId: string) => {
  try {
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
  } catch (error) {
    console.error("Error in deleteVehicle:", error);
    throw error;
  }
};
