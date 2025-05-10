
import { supabase } from "@/integrations/supabase/client";

/**
 * Records a change to a field in the vehicle change history
 * @param vehicleId ID of the vehicle being modified
 * @param fieldName Name of the field being changed
 * @param oldValue Previous value of the field
 * @param newValue New value of the field
 * @param changedBy ID of the user making the change
 * @returns Promise representing the completion of the operation
 */
export const recordFieldChange = async (
  vehicleId: string, 
  fieldName: string, 
  oldValue: string, 
  newValue: string, 
  changedBy: string
) => {
  try {
    const { error } = await supabase
      .from('vehicle_change_history')
      .insert({
        vehicle_id: vehicleId,
        field_name: fieldName,
        old_value: oldValue,
        new_value: newValue,
        changed_by: changedBy
      });
      
    if (error) {
      console.error(`Erro ao registrar alteração no campo ${fieldName}:`, error);
    }
  } catch (error) {
    console.error(`Erro ao registrar alteração no campo ${fieldName}:`, error);
  }
};

/**
 * Get change history for a vehicle
 * @param vehicleId ID of the vehicle to get history for
 * @returns Promise with the vehicle history data
 */
export const getVehicleHistory = async (vehicleId: string) => {
  try {
    const { data, error } = await supabase
      .from('vehicle_history_with_user')  // Using our new view that joins with user profiles
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('changed_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching vehicle history:', error);
      throw new Error('Failed to load vehicle history');
    }
    
    return data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

/**
 * Get change history for a collaborator
 * @param collaboratorId ID of the collaborator to get history for
 * @returns Promise with the collaborator history data
 */
export const getCollaboratorHistory = async (collaboratorId: string) => {
  try {
    const { data, error } = await supabase
      .from('vehicle_history_with_user')
      .select('*')
      .eq('changed_by', collaboratorId)
      .order('changed_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching collaborator history:', error);
      throw new Error('Failed to load collaborator history');
    }
    
    return data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};
